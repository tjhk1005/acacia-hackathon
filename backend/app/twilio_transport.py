"""Twilio WhatsApp Sandbox transport and canonical signed-webhook validation."""
import base64
import hashlib
import hmac
import os
import re
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit

import httpx

from .whatsapp_transport import TransportError


@dataclass
class TwilioSettings:
    enabled: bool = False
    account_sid: str = ''
    auth_token: str = field(default='', repr=False)
    from_number: str = ''
    public_base_url: str = ''
    provider: str = 'twilio'
    template_name: str = ''
    app_secret: str = ''
    verify_token: str = ''

    @classmethod
    def from_env(cls):
        return cls(enabled=os.getenv('WHATSAPP_ENABLED', '').lower() in {'1', 'true'},
                   account_sid=os.getenv('TWILIO_ACCOUNT_SID', '').strip(),
                   auth_token=os.getenv('TWILIO_AUTH_TOKEN', '').strip(),
                   from_number=os.getenv('TWILIO_WHATSAPP_FROM', '').strip().removeprefix('whatsapp:'),
                   public_base_url=os.getenv('TWILIO_PUBLIC_BASE_URL', '').strip().rstrip('/'))

    @property
    def phone_number_id(self):
        return 'twilio:' + self.account_sid + ':' + self.from_number

    @property
    def business_account_id(self):
        return self.account_sid

    def missing(self):
        return ['TWILIO_' + name for name, value in [('ACCOUNT_SID', self.account_sid), ('AUTH_TOKEN', self.auth_token),
                ('WHATSAPP_FROM', self.from_number), ('PUBLIC_BASE_URL', self.public_base_url)] if not value]

    @property
    def configured(self):
        url = urlsplit(self.public_base_url)
        return not self.missing() and bool(re.fullmatch(r'AC[0-9a-fA-F]{32}', self.account_sid)) and bool(re.fullmatch(r'\+[1-9][0-9]{7,14}', self.from_number)) and url.scheme == 'https' and bool(url.hostname) and url.path in {'', '/'} and not url.query and not url.fragment and not url.username


def valid_signature(token, url, parameters, signature):
    # Twilio signs the exact configured public URL and every form field, sorted by name.
    # Duplicate parameters are rejected by the route, avoiding ambiguous parsing.
    value = url + ''.join(key + parameters[key] for key in sorted(parameters))
    expected = base64.b64encode(hmac.new(token.encode(), value.encode(), hashlib.sha1).digest()).decode()
    return bool(token and signature) and hmac.compare_digest(expected, signature)


class TwilioTransport:
    def __init__(self, settings, client=None):
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=20, follow_redirects=False)
        self.base = 'https://api.twilio.com/2010-04-01/Accounts/' + settings.account_sid

    async def request(self, method, path, data=None):
        try:
            response = await self.client.request(method, self.base + path, data=data,
                                                 auth=httpx.BasicAuth(self.settings.account_sid, self.settings.auth_token), timeout=5 if method == 'GET' else 20)
        except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError):
            raise TransportError('Twilio did not confirm the result. Check the conversation before retrying.', uncertain=method == 'POST') from None
        try:
            result = response.json()
        except ValueError:
            raise TransportError('Twilio returned an unreadable response.', uncertain=method == 'POST') from None
        if response.status_code == 429:
            raise TransportError('Twilio rate limit. Delivery will wait before retrying.', retry_after=10)
        if response.status_code >= 500:
            raise TransportError('Twilio could not confirm the result.', uncertain=method == 'POST')
        if response.status_code >= 400:
            code = result.get('code')
            suffix = f' (code {code})' if isinstance(code, int) else ''
            raise TransportError('Twilio rejected the request' + suffix + '. Check legacy Sandbox access, participant membership, account, sender and recipient.', window_closed=code == 63016)
        return result

    async def verify(self):
        account = await self.request('GET', '.json')
        if account.get('sid') != self.settings.account_sid or account.get('status') != 'active':
            raise TransportError('Twilio did not confirm an active account.')
        # Sandbox templates are generic; they must not be repurposed as wedding enquiries.
        return {'display_phone': self.settings.from_number, 'template_verified': False}

    async def incoming_details(self, sid):
        if not re.fullmatch(r'(SM|MM)[0-9a-fA-F]{32}', sid):
            raise TransportError('Invalid Twilio message identifier.')
        message = await self.request('GET', '/Messages/' + sid + '.json')
        if message.get('sid') != sid or message.get('account_sid') != self.settings.account_sid or message.get('direction') != 'inbound':
            raise TransportError('Twilio did not confirm an inbound message.')
        try:
            timestamp = parsedate_to_datetime(message.get('date_created', ''))
            if timestamp.tzinfo is None:
                raise ValueError('Missing timezone')
        except (ValueError, TypeError):
            raise TransportError('Twilio did not return the original message time.') from None
        return message, str(int(timestamp.timestamp()))

    async def send(self, recipient, content, template_parameters=None):
        if template_parameters is not None:
            raise TransportError('Sandbox enquiries need an open 24-hour conversation. Ask the participant to send a fresh message.', window_closed=True)
        result = await self.request('POST', '/Messages.json', {
            'To': 'whatsapp:+' + recipient, 'From': 'whatsapp:' + self.settings.from_number, 'Body': content,
            'StatusCallback': self.settings.public_base_url + '/webhooks/twilio/status',
        })
        if not isinstance(result.get('sid'), str):
            raise TransportError('Twilio did not return a message receipt.', uncertain=True)
        return result['sid']

    async def close(self):
        await self.client.aclose()
