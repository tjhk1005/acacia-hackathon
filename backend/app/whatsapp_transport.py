"""Official WhatsApp Cloud API transport; no credentials in URLs or error bodies."""
import os
import re
from dataclasses import dataclass

import httpx


AVAILABILITY_TEMPLATE = (
    'Hello, we are enquiring about a wedding on {{1}} in {{2}} for {{3}} guests. '
    'Are you available? Please share an itemised quote, inclusions and exclusions. '
    'This is an automated enquiry, not a booking. Reply STOP to stop or HUMAN to reach the couple.'
)


def availability_text(brief):
    values = {'1': brief.date, '2': brief.location, '3': brief.guests}
    return re.sub(r'\{\{([123])\}\}', lambda match: values[match.group(1)], AVAILABILITY_TEMPLATE)


@dataclass
class WhatsAppSettings:
    provider = 'meta'
    enabled: bool = False
    access_token: str = ''
    phone_number_id: str = ''
    business_account_id: str = ''
    app_secret: str = ''
    verify_token: str = ''
    api_version: str = ''
    template_name: str = ''
    template_language: str = 'en_US'

    @classmethod
    def from_env(cls):
        return cls(enabled=os.getenv('WHATSAPP_ENABLED', '').lower() in {'true', '1'}, **{
            field: os.getenv('WHATSAPP_' + field.upper(), '').strip()
            for field in ['access_token', 'phone_number_id', 'business_account_id', 'app_secret',
                          'verify_token', 'api_version', 'template_name']
        }, template_language=os.getenv('WHATSAPP_TEMPLATE_LANGUAGE', 'en_US').strip())

    def missing(self):
        return ['WHATSAPP_' + field.upper() for field in
                ['access_token', 'phone_number_id', 'business_account_id', 'app_secret', 'verify_token', 'api_version']
                if not getattr(self, field)]

    @property
    def configured(self):
        return not self.missing() and bool(re.fullmatch(r'v\d+\.\d+', self.api_version)) and self.phone_number_id.isdigit() and self.business_account_id.isdigit()


class TransportError(Exception):
    def __init__(self, message, uncertain=False, retry_after=None, window_closed=False):
        super().__init__(message)
        self.uncertain, self.retry_after, self.window_closed = uncertain, retry_after, window_closed


class WhatsAppTransport:
    def __init__(self, settings, client=None):
        self.settings = settings
        self.client = client or httpx.AsyncClient(timeout=20, follow_redirects=False)

    async def request(self, method, path, payload=None, params=None):
        try:
            response = await self.client.request(method, 'https://graph.facebook.com/' + self.settings.api_version + '/' + path,
                                                 headers={'Authorization': 'Bearer ' + self.settings.access_token}, json=payload, params=params)
        except (httpx.TimeoutException, httpx.NetworkError, httpx.RemoteProtocolError):
            raise TransportError('WhatsApp did not confirm the result. Check the conversation before retrying.', uncertain=method == 'POST') from None
        try:
            data = response.json()
        except ValueError:
            raise TransportError('WhatsApp returned an unreadable response.', uncertain=method == 'POST') from None
        if response.status_code == 429:
            raise TransportError('WhatsApp rate limit. Delivery will wait before retrying.', retry_after=60)
        if response.status_code >= 500:
            raise TransportError('WhatsApp could not confirm the result.', uncertain=method == 'POST')
        if response.status_code >= 400 or 'error' in data:
            code = data.get('error', {}).get('code')
            raise TransportError('WhatsApp rejected the request. Check account access, recipient and template settings.', window_closed=code == 131047)
        return data

    async def verify(self):
        phone = await self.request('GET', self.settings.phone_number_id, params={'fields': 'id,display_phone_number,verified_name'})
        if phone.get('id') != self.settings.phone_number_id:
            raise TransportError('WhatsApp returned a different business phone identity.')
        template_verified = False
        if self.settings.template_name:
            templates = await self.request('GET', self.settings.business_account_id + '/message_templates', params={
                'name': self.settings.template_name, 'fields': 'name,status,language,components', 'limit': 100,
            })
            template_verified = any(item.get('name') == self.settings.template_name and item.get('status') == 'APPROVED'
                                    and item.get('language') == self.settings.template_language
                                    and any(component.get('type') == 'BODY' and component.get('text', '').strip() == AVAILABILITY_TEMPLATE
                                            for component in item.get('components', []))
                                    for item in templates.get('data', []))
        return {'display_phone': phone.get('display_phone_number', ''), 'template_verified': template_verified}

    async def send(self, recipient, content, template_parameters=None):
        payload = {'messaging_product': 'whatsapp', 'recipient_type': 'individual', 'to': recipient}
        if template_parameters is not None:
            payload.update(type='template', template={'name': self.settings.template_name,
                'language': {'code': self.settings.template_language},
                'components': [{'type': 'body', 'parameters': [{'type': 'text', 'text': value} for value in template_parameters]}]})
        else:
            payload.update(type='text', text={'preview_url': False, 'body': content})
        response = await self.request('POST', self.settings.phone_number_id + '/messages', payload)
        messages = response.get('messages', [])
        if not messages or not isinstance(messages[0].get('id'), str):
            raise TransportError('WhatsApp did not return a message receipt.', uncertain=True)
        return messages[0]['id']

    async def close(self):
        await self.client.aclose()
