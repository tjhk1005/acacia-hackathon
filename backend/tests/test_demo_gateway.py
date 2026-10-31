import httpx
from fastapi.testclient import TestClient

from demo_gateway import create_gateway


WEDDING='/api/weddings/00000000-0000-0000-0000-000000000000'


def test_gateway_only_exposes_planning_routes_and_preserves_wedding_tokens():
    seen=[]
    def upstream(request):
        seen.append(request)
        assert request.headers.get('x-wedding-token')=='test-token'
        assert 'cookie' not in request.headers and 'authorization' not in request.headers
        return httpx.Response(200,json={'wedding':{'id':'demo'}})
    with TestClient(create_gateway(httpx.AsyncClient(transport=httpx.MockTransport(upstream)))) as c:
        for path in ['/docs','/openapi.json','/coordinator','/webhooks/twilio/whatsapp','/api/users']:
            assert c.get(path).status_code==404
        response=c.get(WEDDING,headers={'X-Wedding-Token':'test-token','Cookie':'private','Authorization':'must-not-forward'})
        assert response.status_code==200 and response.headers['cache-control']=='no-store'
        assert len(seen)==1 and str(seen[0].url)=='http://127.0.0.1:8000'+WEDDING


def test_gateway_limits_ai_calls_and_expired_demo_requests():
    clock={'value':0}
    def upstream(request):
        return httpx.Response(200,json={'status':'ok','ai_configured':True})
    with TestClient(create_gateway(httpx.AsyncClient(transport=httpx.MockTransport(upstream)),clock=lambda:clock['value'],lifetime=100,chat_limit=1,create_limit=1)) as c:
        assert c.post('/api/weddings',json={}).status_code==200
        assert c.post('/api/weddings',json={}).status_code==429
        assert c.post(WEDDING+'/chat',json={}).status_code==200
        assert c.post(WEDDING+'/chat',json={}).status_code==429
        clock['value']=101
        assert c.get('/health').status_code==503


def test_gateway_preserves_backend_access_failures_without_model_spend():
    seen=[]
    def upstream(request):
        seen.append(request)
        return httpx.Response(404,json={'detail':'Wedding not found'})
    with TestClient(create_gateway(httpx.AsyncClient(transport=httpx.MockTransport(upstream)),chat_limit=0)) as c:
        assert c.post(WEDDING+'/chat',json={}).status_code==404
        assert c.post(WEDDING+'/chat',json={}).status_code==404
        assert all(request.method=='GET' for request in seen)


def test_gateway_health_marks_temporary_hosting_and_rejects_large_bodies():
    def upstream(request):return httpx.Response(200,json={'status':'ok','ai_configured':False})
    with TestClient(create_gateway(httpx.AsyncClient(transport=httpx.MockTransport(upstream)))) as c:
        health=c.get('/health').json()
        assert health['status']=='ok' and health['backend_hosting']=='temporary_demo'
        assert 'demo_expires_at' in health
        assert c.post('/api/weddings',content=b'x'*1_000_001).status_code==413
