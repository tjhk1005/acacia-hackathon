import httpx
from fastapi.testclient import TestClient

from webhook_proxy import create_proxy


def test_proxy_exposes_only_callbacks_and_preserves_signed_form():
    captured = []
    def handle(request):
        captured.append(request)
        assert str(request.url) == 'http://127.0.0.1:8000/webhooks/twilio/whatsapp'
        assert request.headers['x-twilio-signature'] == 'fake-signature'
        assert 'x-wedding-token' not in request.headers
        assert request.content == b'Body=Hi'
        return httpx.Response(403, text='signature rejected')
    upstream = httpx.AsyncClient(transport=httpx.MockTransport(handle))
    with TestClient(create_proxy(upstream)) as client:
        assert client.post('/api/weddings', json={}).status_code == 404
        assert client.get('/docs').status_code == 404
        assert client.get('/health').status_code == 404
        response = client.post('/webhooks/twilio/whatsapp', content=b'Body=Hi', headers={
            'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': 'fake-signature', 'X-Wedding-Token': 'must-not-forward',
        })
        assert response.status_code == 403
        assert len(captured) == 1
