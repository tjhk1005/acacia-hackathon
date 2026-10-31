import asyncio
import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from urllib.parse import urlencode

import httpx
import pytest
from fastapi.testclient import TestClient

import app.live_messaging as live
from app.main import create_app
from app.models import VendorReplyAnalysis
from app.twilio_transport import TwilioSettings, TwilioTransport, valid_signature
from app.whatsapp_transport import TransportError


ACCOUNT = 'AC' + 'a' * 32
NUMBER = '+6581234567'


class Agent:
    calls = 0
    during_analysis = None
    result = {'availability': 'available', 'availability_date': '2027-08-08',
              'next_question': 'itemised_quote', 'needs_user_decision': False, 'reason': 'The vendor reports availability; pricing is missing.'}

    async def analyze_vendor_reply(self, context):
        self.calls += 1
        if self.during_analysis:
            self.during_analysis()
        return VendorReplyAnalysis(**self.result)


class Provider:
    def __init__(self):
        self.sent = []
        self.error = None
        self.early_receipt = None
        self.details_calls = 0
        self.message_time = None

    async def verify(self):
        return {'display_phone': '+14155238886', 'template_verified': False}

    async def incoming_details(self, sid):
        self.details_calls += 1
        return {'from': 'whatsapp:' + NUMBER, 'to': 'whatsapp:+14155238886'}, str(int((self.message_time or live.clock()).timestamp()))

    async def send(self, recipient, text, parameters=None):
        if self.error:
            raise self.error
        provider_id = 'SM' + format(len(self.sent) + 100, '032x')
        self.sent.append((recipient, text, parameters, provider_id))
        if self.early_receipt:
            self.early_receipt(provider_id)
        return provider_id

    async def close(self):
        pass


@pytest.fixture
def context(tmp_path, monkeypatch):
    monkeypatch.setenv('WHATSAPP_PILOTING', 'false')  # Transport remains a fake; never test live delivery.
    now = {'value': datetime(2026, 10, 31, 8, tzinfo=timezone.utc)}
    monkeypatch.setattr(live, 'clock', lambda: now['value'])
    settings = TwilioSettings(account_sid=ACCOUNT, auth_token='test-auth-token', from_number='+14155238886', public_base_url='https://webhook.example.test')
    agent, provider = Agent(), Provider()
    with TestClient(create_app(tmp_path / 'live.sqlite', agent=agent, messaging_settings=settings, messaging_transport=provider)) as client:
        service = client.app.state.messaging
        settings.enabled = True  # Explicitly exercise steps; never start a background/network worker in tests.
        service.identity = asyncio.run(provider.verify())
        created = client.post('/api/weddings', json={'brief': {
            'names': 'Demo couple', 'guests': '80', 'budget': '20000', 'location': 'Singapore', 'date': '2027-08-08',
        }}).json()
        root = '/api/weddings/' + created['wedding']['id']
        headers = {'X-Wedding-Token': created['access_token']}
        client.post(root + '/confirm', headers=headers, json={'expected_revision': 0})
        vendor = client.post(root + '/coordination/vendors', headers=headers, json={
            'name': 'Test vendor', 'category': 'catering', 'channel': 'whatsapp', 'contact': NUMBER,
        }).json()
        env = dict(client=client, service=service, root=root, headers=headers, vendor=vendor, now=now, agent=agent, provider=provider)
        assert connect(env).status_code == 200
        yield env


def state(env):
    response = env['client'].get(env['root'] + '/messaging', headers=env['headers'])
    assert response.status_code == 200
    return response.json()


def connect(env, **changes):
    current = state(env)['bindings']
    binding = current[0] if current else None
    wedding = env['client'].get(env['root'], headers=env['headers']).json()['wedding']
    body = {'expected_revision': binding['revision'] if binding else 0, 'brief_revision': wedding['revision'],
            'recipient': NUMBER, 'mode': 'automatic', 'opt_in': True, 'consent_note': 'Own verified test number, joined Sandbox.'}
    return env['client'].patch(env['root'] + '/messaging/vendors/' + env['vendor']['id'], headers=env['headers'], json={**body, **changes})


def sign(env, path, fields):
    text = env['service'].settings.public_base_url + path + ''.join(key + fields[key] for key in sorted(fields))
    return base64.b64encode(hmac.new(env['service'].settings.auth_token.encode(), text.encode(), hashlib.sha1).digest()).decode()


def incoming(env, text, sequence=1, **extra):
    env['now']['value'] += timedelta(seconds=1)
    fields = {'AccountSid': ACCOUNT, 'MessageSid': 'SM' + format(sequence, '032x'),
              'From': 'whatsapp:' + NUMBER, 'To': 'whatsapp:+14155238886', 'Body': text, 'NumMedia': '0', **extra}
    path = '/webhooks/twilio/whatsapp'
    return env['client'].post(path, data=fields, headers={'X-Twilio-Signature': sign(env, path, fields)})


def receipt(env, provider_id, status):
    fields = {'AccountSid': ACCOUNT, 'MessageSid': provider_id, 'MessageStatus': status, 'To': 'whatsapp:' + NUMBER}
    path = '/webhooks/twilio/status'
    return env['client'].post(path, data=fields, headers={'X-Twilio-Signature': sign(env, path, fields)})


def messages(env):
    return env['client'].get(env['root'] + '/coordination', headers=env['headers']).json()['messages']


def test_signature_matches_twilio_official_sdk_vector():
    # Published reference vector: twilio/twilio-python, tests/unit/test_request_validator.py.
    fields = {'CallSid': 'CA1234567890ABCDE', 'Digits': '1234', 'From': '+14158675309',
              'To': '+18005551212', 'Caller': '+14158675309'}
    assert valid_signature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', fields, 'RSOYDt4T1cUTdK1PDd93/VVr8B8=')
    assert not valid_signature('12345', 'https://attacker.example/', fields, 'RSOYDt4T1cUTdK1PDd93/VVr8B8=')


def test_pilot_default_blocks_transport_even_if_live_flag_and_credentials_are_present(tmp_path, monkeypatch):
    monkeypatch.delenv('WHATSAPP_PILOTING', raising=False)
    settings=TwilioSettings(enabled=True,account_sid=ACCOUNT,auth_token='test-auth-token',from_number='+14155238886',public_base_url='https://webhook.example.test')
    provider=Provider()
    with TestClient(create_app(tmp_path/'pilot.sqlite',agent=Agent(),messaging_settings=settings,messaging_transport=provider)) as client:
        service=client.app.state.messaging
        assert service.piloting and not service.live_enabled and service.task is None
        created=client.post('/api/weddings',json={}).json()
        root='/api/weddings/'+created['wedding']['id']
        headers={'X-Wedding-Token':created['access_token']}
        status=client.get(root+'/messaging',headers=headers).json()
        assert status['piloting'] and not status['enabled'] and not status['worker_active']
        assert client.post('/webhooks/twilio/whatsapp',data={'Body':'Hi'}).status_code==503
        service.enqueue_initial()
        asyncio.run(service.analyze_one())
        asyncio.run(service.send_one())
        assert provider.sent==[] and provider.details_calls==0


def test_piloting_rejects_enabling_a_vendor_and_approving_a_live_message(context):
    env,service=context,context['service']
    incoming(env,'Hi')
    service.enqueue_initial()
    service.piloting=True
    assert connect(env,consent_note='Try to re-enable delivery').status_code==503
    draft=env['client'].post(env['root']+'/messaging/vendors/'+env['vendor']['id']+'/drafts',headers=env['headers'],json={'brief_revision':1,'content':'Availability enquiry'}).json()
    approval=env['client'].post(env['root']+'/messaging/messages/'+draft['id']+'/send',headers=env['headers'],json={'brief_revision':1,'binding_revision':1,'expected_content':draft['content']})
    assert approval.status_code==503
    asyncio.run(service.send_one())
    assert env['provider'].sent==[]


def test_unverified_webhooks_and_wrong_accounts_cannot_write(context):
    env = context
    assert env['client'].get(env['root'] + '/messaging').status_code == 404
    assert env['client'].post('/webhooks/twilio/whatsapp', data={'Body': 'Forged'}).status_code == 403
    assert incoming(env, 'Wrong account', AccountSid='AC' + 'b' * 32).status_code == 403
    assert incoming(env, 'Wrong sender', To='whatsapp:+14150000000').status_code == 403
    assert messages(env) == []


def test_real_pipeline_waits_for_fresh_inbound_then_queues_bounded_followup(context):
    env, service = context, context['service']
    service.enqueue_initial()
    asyncio.run(service.send_one())
    assert state(env)['deliveries'][0]['status'] == 'waiting_window'
    assert env['provider'].sent == []
    assert incoming(env, 'Hi').status_code == 200
    asyncio.run(service.analyze_one())
    assert env['agent'].calls == 0  # No AI spend on a greeting while the first enquiry is pending.
    asyncio.run(service.send_one())
    assert state(env)['deliveries'][0]['status'] == 'accepted'
    assert len(env['provider'].sent) == 1
    assert '2027-08-08' in env['provider'].sent[0][1]
    assert incoming(env, 'We are available on 8 August 2027.', 2).status_code == 200
    asyncio.run(service.analyze_one())
    asyncio.run(service.send_one())
    assert len(env['provider'].sent) == 2
    assert 'itemised quote' in env['provider'].sent[-1][1]
    assert 'no booking authorised' in env['provider'].sent[-1][1]
    assert env['agent'].calls == 1
    assert incoming(env, 'We are available on 8 August 2027.', 2).status_code == 200
    asyncio.run(service.analyze_one())
    assert env['agent'].calls == 1
    assert env['provider'].details_calls == 2
    service.enqueue_initial()
    asyncio.run(service.send_one())
    assert len(env['provider'].sent) == 2


def test_delivery_receipts_do_not_downgrade_and_can_arrive_before_send_returns(context):
    env = context
    service = env['service']
    incoming(env, 'Hi')
    service.enqueue_initial()
    env['provider'].early_receipt = lambda sid: receipt(env, sid, 'read')
    asyncio.run(service.send_one())
    delivery = state(env)['deliveries'][0]
    assert delivery['status'] == 'read'
    assert messages(env)[-1]['status'] == 'read'
    assert receipt(env, delivery['provider_id'], 'sent').status_code == 204
    assert receipt(env, delivery['provider_id'], 'failed').status_code == 204
    assert state(env)['deliveries'][0]['status'] == 'read'


def test_receipt_tracks_original_destination_after_connection_changes(context):
    env, service = context, context['service']
    incoming(env, 'Hi')
    service.enqueue_initial()
    asyncio.run(service.send_one())
    delivery = state(env)['deliveries'][0]
    assert connect(env, recipient='+6581234568').status_code == 200
    assert receipt(env, delivery['provider_id'], 'delivered').status_code == 204
    assert state(env)['deliveries'][0]['status'] == 'delivered'


def test_recipient_change_cancels_queued_dispatch(context):
    env, service = context, context['service']
    incoming(env, 'Hi')
    service.enqueue_initial()
    assert connect(env, recipient='+6581234568').status_code == 200
    asyncio.run(service.send_one())
    assert env['provider'].sent == []
    assert state(env)['deliveries'][0]['status'] == 'cancelled'


def test_worker_crash_marks_claimed_delivery_uncertain(context):
    env, service = context, context['service']
    service.enqueue_initial()
    with service.store.connection() as db:
        db.execute("UPDATE live_outbox SET status='sending',claimed_at=?", ((live.clock() - timedelta(minutes=3)).isoformat(),))
    assert service.claim_worker()
    assert state(env)['deliveries'][0]['status'] == 'uncertain'
    assert messages(env)[-1]['status'] == 'uncertain'
    asyncio.run(service.send_one())
    assert env['provider'].sent == []


def test_failed_ai_calls_still_count_towards_daily_spending_limit(context):
    env, service = context, context['service']
    async def fail(context):
        env['agent'].calls += 1
        raise ValueError('Invalid model response')
    env['agent'].analyze_vendor_reply = fail
    for sequence in range(1, 8):
        incoming(env, 'Please review our quote.', sequence)
        asyncio.run(service.analyze_one())
    assert env['agent'].calls == 6
    assert env['provider'].sent == []


def test_automatic_messages_stop_at_three_per_day(context):
    env, service = context, context['service']
    incoming(env, 'Hi')
    service.enqueue_initial()
    asyncio.run(service.analyze_one())
    asyncio.run(service.send_one())
    for sequence, question in enumerate(['itemised_quote', 'menu_options', 'setup_requirements'], 2):
        env['agent'].result = {**env['agent'].result, 'next_question': question}
        incoming(env, 'Available on the requested date. Please ask for details.', sequence)
        asyncio.run(service.analyze_one())
        service.enqueue_initial()
        asyncio.run(service.send_one())
    assert len(env['provider'].sent) == 3
    assert len(state(env)['deliveries']) == 3


@pytest.mark.parametrize('command', ['STOP', 'HUMAN'])
def test_stop_and_human_halt_queued_automation(context, command):
    env, service = context, context['service']
    service.enqueue_initial()
    incoming(env, command)
    asyncio.run(service.send_one())
    assert env['provider'].sent == []
    binding = state(env)['bindings'][0]
    assert binding['mode'] == ('off' if command == 'STOP' else 'review')
    assert all(item['status'] == 'cancelled' for item in state(env)['deliveries'])
    if command == 'STOP':
        assert connect(env).status_code == 409
        incoming(env, 'START', 2)
        assert connect(env).status_code == 200


def test_commitments_raise_a_user_decision_without_sending_model_text(context):
    env, service = context, context['service']
    env['agent'].result = {'availability': 'unknown', 'availability_date': None,
        'next_question': 'none', 'needs_user_decision': True, 'reason': 'Vendor requests a deposit and booking acceptance.'}
    incoming(env, 'Pay the deposit and confirm the booking now.')
    asyncio.run(service.analyze_one())
    service.enqueue_initial()
    asyncio.run(service.send_one())
    assert env['provider'].sent == []
    plan = env['client'].get(env['root'] + '/controller', headers=env['headers']).json()
    assert any(task['key'] == 'vendor-review:' + env['vendor']['id'] for task in plan['tasks'])
    inbox = env['client'].get(env['root'] + '/schedule', headers=env['headers']).json()
    assert any(item['kind'] == 'vendor_review' for item in inbox['notifications'])
    assert env['client'].get(env['root'] + '/schedule', headers=env['headers']).json() == inbox


def test_expired_messages_do_not_reopen_window_or_trigger_ai(context):
    env, service = context, context['service']
    env['provider'].message_time = env['now']['value'] - timedelta(days=2)
    incoming(env, 'Old availability reply')
    service.enqueue_initial()
    asyncio.run(service.analyze_one())
    asyncio.run(service.send_one())
    assert env['provider'].sent == [] and env['agent'].calls == 0
    assert state(env)['bindings'][0]['window_open'] is False


def test_stale_brief_and_changes_during_analysis_cannot_dispatch(context):
    env, service = context, context['service']
    incoming(env, 'Available on 8 August 2027')
    def edit():
        assert env['client'].patch(env['root'], headers=env['headers'], json={'expected_revision': 1, 'brief': {'date': '2027-09-09'}}).status_code == 200
    env['agent'].during_analysis = edit
    asyncio.run(service.analyze_one())
    service.enqueue_initial()
    asyncio.run(service.send_one())
    assert env['provider'].sent == []
    assert state(env)['bindings'][0]['needs_reapproval'] is True
    assert not any(message.get('purpose') == 'itemised_quote' for message in messages(env))


def test_uncertain_delivery_is_not_blindly_retried(context):
    env, service = context, context['service']
    incoming(env, 'Hi')
    service.enqueue_initial()
    env['provider'].error = TransportError('No provider acknowledgement.', uncertain=True)
    asyncio.run(service.send_one())
    assert state(env)['deliveries'][0]['status'] == 'uncertain'
    env['provider'].error = None
    for _ in range(3):
        service.enqueue_initial()
        asyncio.run(service.send_one())
    assert env['provider'].sent == []
    assert len(state(env)['deliveries']) == 1


def test_connection_is_idempotent_and_cannot_share_replies_across_weddings(context):
    env = context
    initial = state(env)['bindings'][0]
    assert connect(env).json()['bindings'][0]['revision'] == initial['revision']
    other = env['client'].post('/api/weddings', json={}).json()
    foreign_headers = {'X-Wedding-Token': other['access_token']}
    assert env['client'].get(env['root'] + '/messaging', headers=foreign_headers).status_code == 404
    assert connect(env, opt_in=False).status_code == 422


def test_manual_send_requires_exact_current_text_and_does_not_become_simulated(context):
    env, service = context, context['service']
    assert connect(env, mode='review').status_code == 200
    binding = state(env)['bindings'][0]
    incoming(env, 'Hi')
    draft = env['client'].post(env['root'] + '/messaging/vendors/' + env['vendor']['id'] + '/drafts', headers=env['headers'], json={'brief_revision': 1, 'content': 'Please clarify the quoted setup fee.'}).json()
    path = env['root'] + '/messaging/messages/' + draft['id'] + '/send'
    approval = {'brief_revision': 1, 'binding_revision': binding['revision'], 'expected_content': draft['content']}
    assert env['client'].post(path, headers=env['headers'], json={**approval, 'expected_content': 'Changed message'}).status_code == 409
    assert env['client'].post(path, headers=env['headers'], json=approval).status_code == 200
    assert env['client'].post(path, headers=env['headers'], json=approval).status_code == 200
    assert env['client'].post(env['root'] + '/coordination/messages/' + draft['id'] + '/approve', headers=env['headers'], json={}).status_code == 409
    asyncio.run(service.send_one())
    assert len(env['provider'].sent) == 1
    assert env['provider'].sent[0][1] == draft['content']


def test_twilio_http_boundary_uses_basic_auth_form_payload_and_safe_errors():
    async def exercise():
        settings = TwilioSettings(account_sid=ACCOUNT, auth_token='not-a-real-token', from_number='+14155238886', public_base_url='https://webhook.example.test')
        captured = []
        def handle(request):
            captured.append(request)
            assert 'not-a-real-token' not in str(request.url)
            assert request.headers['authorization'].startswith('Basic ')
            if request.method == 'GET':
                return httpx.Response(200, json={'sid': ACCOUNT, 'status': 'active'})
            assert request.headers['content-type'] == 'application/x-www-form-urlencoded'
            assert b'To=whatsapp%3A%2B6581234567' in request.content
            return httpx.Response(201, json={'sid': 'SM' + 'd' * 32, 'status': 'queued'})
        transport = TwilioTransport(settings, httpx.AsyncClient(transport=httpx.MockTransport(handle)))
        assert (await transport.verify())['template_verified'] is False
        assert await transport.send(NUMBER[1:], 'Enquiry only.') == 'SM' + 'd' * 32
        assert 'StatusCallback' in captured[-1].content.decode()
        await transport.close()
    asyncio.run(exercise())
