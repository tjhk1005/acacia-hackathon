from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from app.main import create_app


def setup(tmp_path):
    path = tmp_path / 'test.sqlite'
    client = TestClient(create_app(path))
    result = client.post('/api/weddings', json={'brief': {'date': '2027-08-08', 'location': 'Singapore'}}).json()
    wid = result['wedding']['id']
    headers = {'X-Wedding-Token': result['access_token']}
    root = f'/api/weddings/{wid}/coordination'
    return client, path, wid, headers, root


def test_coordination_workflow(tmp_path):
    c, path, wid, h, root = setup(tmp_path)
    assert c.get(root).status_code == 404
    vendor = c.post(root+'/vendors', headers=h, json={'name':'Florist','category':'flowers','channel':'telegram','contact':'group-123'}).json()
    due = (datetime.now(timezone.utc)+timedelta(hours=2)).isoformat()
    task = c.post(root+'/tasks', headers=h, json={'vendor_id':vendor['id'],'title':'Confirm flowers','due_at':due}).json()
    state = c.post(root+'/run', headers=h, json={}).json()
    assert len(state['messages']) == 2
    assert all(m['status']=='draft' for m in state['messages'])
    assert len(c.post(root+'/run', headers=h,json={}).json()['messages']) == 2
    msg = state['messages'][0]['id']
    for _ in range(2):
        assert c.post(root+f'/messages/{msg}/approve',headers=h,json={}).json()['status']=='simulated'
    reply = c.post(root+f"/vendors/{vendor['id']}/replies", headers=h,json={'content':'We are available on 8 August.', 'availability':'available'}).json()
    state = c.get(root,headers=h).json()
    assert state['vendors'][0]['evidence_id']==reply['id']
    assert state['vendors'][0]['availability']=='available'
    assert c.post(root+f"/tasks/{task['id']}/complete",headers=h,json={}).status_code==200
    assert c.get(root,headers=h).json()['messages'][1]['status']=='cancelled'
    assert c.post(root+f"/messages/{state['messages'][1]['id']}/approve", headers=h,json={}).status_code==409
    restored=TestClient(create_app(path)).get(root,headers=h).json()
    assert restored['tasks'][0]['done']
    assert restored['vendors'][0]['evidence_id']==reply['id']
    assert c.get('/coordinator').status_code==200


def test_changed_brief_invalidates_drafts_and_availability(tmp_path):
    c, _, wid, h, root=setup(tmp_path)
    v=c.post(root+'/vendors',headers=h,json={'name':'Host','category':'emcee','channel':'whatsapp','contact':'+6500000000'}).json()
    old=c.post(root+'/run',headers=h,json={}).json()['messages'][0]
    c.post(root+f"/vendors/{v['id']}/replies",headers=h,json={'content':'Available','availability':'available'})
    assert c.patch(f'/api/weddings/{wid}',headers=h,json={'expected_revision':0,'brief':{'date':'2027-09-09'}}).status_code==200
    assert c.post(root+f"/messages/{old['id']}/approve",headers=h,json={}).status_code==409
    state=c.post(root+'/run',headers=h,json={}).json()
    assert state['vendors'][0]['availability']=='unknown'
    assert '2027-09-09' in state['messages'][-1]['content']
    assert len(state['messages'])==3


def test_validation_and_tenant_isolation(tmp_path):
    c, _, _, h, root=setup(tmp_path)
    assert c.post(root+'/tasks',headers=h,json={'vendor_id':'missing','title':'x','due_at':'2027-01-01T10:00:00Z'}).status_code==404
    assert c.post(root+'/tasks',headers=h,json={'vendor_id':'missing','title':'x','due_at':'2027-01-01T10:00:00'}).status_code==422
    assert c.post(root+'/run',headers={'X-Wedding-Token':'wrong'},json={}).status_code==404
    assert c.post(root+'/vendors',headers=h,json={'name':'x','category':'unsupported','channel':'telegram','contact':'x'}).status_code==422


def test_ai_refinement_is_a_draft_only(tmp_path):
    class Agent:
        async def draft_coordination(self, context):
            return 'Hello, could you please confirm availability?'
    path=tmp_path/'ai.sqlite'
    c=TestClient(create_app(path, agent=Agent()))
    w=c.post('/api/weddings',json={'brief':{'date':'2027-08-08'}}).json()
    h={'X-Wedding-Token':w['access_token']}
    root=f"/api/weddings/{w['wedding']['id']}/coordination"
    c.post(root+'/vendors',headers=h,json={'name':'Venue','category':'venue','channel':'telegram','contact':'group'})
    m=c.post(root+'/run',headers=h,json={}).json()['messages'][0]
    result=c.post(root+f"/messages/{m['id']}/refine",headers=h,json={}).json()
    assert result['ai_assisted'] is True
    assert result['status']=='draft'
    assert c.get(root,headers=h).json()['vendors'][0]['availability']=='unknown'
