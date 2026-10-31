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
    task = c.post(root+'/tasks', headers=h, json={'vendor_id':vendor['id'],'title':'Confirm flowers','automatic_reminders':False,'due_at':due}).json()
    state = c.post(root+'/run', headers=h, json={}).json()
    assert len(state['messages']) == 2
    assert all(m['status']=='draft' for m in state['messages'])
    assert len(c.post(root+'/run', headers=h,json={}).json()['messages']) == 2
    enquiry = next(m for m in state['messages'] if m['key'].startswith('availability:'))
    msg = enquiry['id']
    for _ in range(2):
        assert c.post(root+f'/messages/{msg}/approve',headers=h,json={'review_token':enquiry['review_token']}).json()['status']=='simulated'
    reply = c.post(root+f"/vendors/{vendor['id']}/replies", headers=h,json={'content':'We are available on 8 August.', 'availability':'available'}).json()
    state = c.get(root,headers=h).json()
    assert state['vendors'][0]['evidence_id']==reply['id']
    assert state['vendors'][0]['availability']=='available'
    assert c.post(root+f"/tasks/{task['id']}/complete",headers=h,json={}).status_code==200
    reminder = next(m for m in c.get(root,headers=h).json()['messages'] if m['key'].startswith('reminder:'))
    assert reminder['status']=='cancelled'
    assert c.post(root+f"/messages/{reminder['id']}/approve", headers=h,json={'review_token':reminder['review_token']}).status_code==409
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
    assert c.post(root+f"/messages/{old['id']}/approve",headers=h,json={'review_token':old['review_token']}).status_code==409
    state=c.post(root+'/run',headers=h,json={}).json()
    assert state['vendors'][0]['availability']=='unknown'
    assert '2027-09-09' in state['messages'][-1]['content']
    assert len(state['messages'])==3


def test_validation_and_tenant_isolation(tmp_path):
    c, _, _, h, root=setup(tmp_path)
    assert c.post(root+'/tasks',headers=h,json={'vendor_id':'missing','title':'x','automatic_reminders':False,'due_at':'2027-01-01T10:00:00Z'}).status_code==404
    assert c.post(root+'/tasks',headers=h,json={'vendor_id':'missing','title':'x','automatic_reminders':False,'due_at':'2027-01-01T10:00:00'}).status_code==422
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


def test_reviewed_wording_is_required(tmp_path):
    from app.scheduling import review_token
    from app.store import Store
    import json
    c, path, _, h, root = setup(tmp_path)
    c.post(root+'/vendors',headers=h,json={'name':'Flowers','category':'flowers','channel':'telegram','contact':'demo'})
    m=c.post(root+'/run',headers=h,json={}).json()['messages'][0]
    assert c.post(root+f"/messages/{m['id']}/approve",headers=h,json={}).status_code==422
    with Store(path).connection() as db:
        row=db.execute('SELECT wedding_id,state FROM coordination').fetchone()
        state=json.loads(row['state']);state['messages'][0]['content']='Changed in another tab'
        db.execute('UPDATE coordination SET state=? WHERE wedding_id=?',(json.dumps(state),row['wedding_id']))
    assert c.post(root+f"/messages/{m['id']}/approve",headers=h,json={'review_token':m['review_token']}).status_code==409
    current=c.get(root,headers=h).json()['messages'][0]
    assert c.post(root+f"/messages/{m['id']}/approve",headers=h,json={'review_token':current['review_token']}).status_code==200


def test_reply_cancels_unneeded_enquiry(tmp_path):
    c, _, _, h, root=setup(tmp_path)
    v=c.post(root+'/vendors',headers=h,json={'name':'Venue','category':'venue','channel':'telegram','contact':'demo'}).json()
    m=c.post(root+'/run',headers=h,json={}).json()['messages'][0]
    c.post(root+f"/vendors/{v['id']}/replies",headers=h,json={'content':'Unavailable','availability':'unavailable'})
    assert c.post(root+f"/messages/{m['id']}/approve",headers=h,json={'review_token':m['review_token']}).status_code==409


def test_scheduler_never_delivers_unapproved_and_survives_restart(tmp_path):
    from app.scheduling import scheduler_tick
    from app.store import Store
    c,path,_,h,root=setup(tmp_path)
    v=c.post(root+'/vendors',headers=h,json={'name':'Caterer','category':'catering','channel':'whatsapp','contact':'demo'}).json()
    due=datetime.now(timezone.utc)+timedelta(days=10)
    task=c.post(root+'/tasks',headers=h,json={'vendor_id':v['id'],'title':'Final menu','automatic_reminders':False,'due_at':due.isoformat(),'reminder_hours':24}).json()
    m=c.get(root,headers=h).json()['messages'][0]
    assert datetime.fromisoformat(m['scheduled_at'])==due-timedelta(hours=24)
    scheduler_tick(Store(path),due)
    assert c.get(root,headers=h).json()['messages'][0]['status']=='draft'
    assert c.post(root+f"/messages/{m['id']}/approve",headers=h,json={'review_token':m['review_token']}).json()['status']=='scheduled'
    scheduler_tick(Store(path),due-timedelta(days=2))
    assert c.get(root,headers=h).json()['messages'][0]['status']=='scheduled'
    scheduler_tick(Store(path),due)
    scheduler_tick(Store(path),due)
    restored=TestClient(create_app(path)).get(root,headers=h).json()
    assert len(restored['messages'])==1
    assert restored['messages'][0]['status']=='simulated'
    assert restored['messages'][0]['delivered_at']==due.isoformat()


def test_completed_task_and_changed_brief_cancel_schedule(tmp_path):
    from app.scheduling import scheduler_tick
    from app.store import Store
    c,path,wid,h,root=setup(tmp_path)
    v=c.post(root+'/vendors',headers=h,json={'name':'Dress','category':'dress','channel':'telegram','contact':'demo'}).json()
    due=datetime.now(timezone.utc)+timedelta(days=4)
    for i in range(2):
        c.post(root+'/tasks',headers=h,json={'vendor_id':v['id'],'title':f'Fitting {i}','automatic_reminders':False,'due_at':due.isoformat()})
    state=c.get(root,headers=h).json()
    for m in state['messages']:
        assert c.post(root+f"/messages/{m['id']}/approve",headers=h,json={'review_token':m['review_token']}).status_code==200
    c.post(root+f"/tasks/{state['tasks'][0]['id']}/complete",headers=h,json={})
    c.patch(f'/api/weddings/{wid}',headers=h,json={'expected_revision':0,'brief':{'date':'2028-01-01'}})
    scheduler_tick(Store(path),due)
    messages=c.get(root,headers=h).json()['messages']
    assert not any(m['status'] in ('scheduled','simulated') for m in messages)


def test_existing_tasks_migrate_and_schedule_can_be_cancelled(tmp_path):
    import json
    from app.scheduling import scheduler_tick
    from app.store import Store
    c,path,_,h,root=setup(tmp_path)
    v=c.post(root+'/vendors',headers=h,json={'name':'Venue','category':'venue','channel':'telegram','contact':'demo'}).json()
    due=datetime.now(timezone.utc)+timedelta(days=5)
    task=c.post(root+'/tasks',headers=h,json={'vendor_id':v['id'],'title':'Final layout','automatic_reminders':False,'due_at':due.isoformat()}).json()
    store=Store(path)
    with store.connection() as db:
        row=db.execute('SELECT wedding_id,state FROM coordination').fetchone()
        state=json.loads(row['state'])
        state['tasks'][0].pop('remind_at')
        state['messages']=[]
        db.execute('UPDATE coordination SET state=? WHERE wedding_id=?',(json.dumps(state),row['wedding_id']))
    scheduler_tick(store)
    message=c.get(root,headers=h).json()['messages'][0]
    assert datetime.fromisoformat(message['scheduled_at'])==due-timedelta(hours=24)
    c.post(root+f"/messages/{message['id']}/approve",headers=h,json={'review_token':message['review_token']})
    assert c.post(root+f"/messages/{message['id']}/cancel",headers=h,json={}).json()['status']=='cancelled'
    scheduler_tick(store,due)
    assert c.get(root,headers=h).json()['messages'][0]['status']=='cancelled'


def test_whatsapp_group_handoff_never_claims_automatic_delivery(tmp_path):
    from app.scheduling import scheduler_tick
    from app.store import Store
    c,path,_,h,root=setup(tmp_path)
    vendor=c.post(root+'/vendors',headers=h,json={'name':'Florist','category':'flowers','channel':'whatsapp','contact':'Group reference'}).json()
    route=root+f"/vendors/{vendor['id']}/whatsapp-group"
    assert c.post(route,headers=h,json={'group_name':'Wedding flowers','participants_informed':False}).status_code==422
    assert c.post(route,headers=h,json={'group_name':'Wedding flowers','participants_informed':True}).json()['transport']=='manual_whatsapp'
    task=c.post(root+'/tasks',headers=h,json={'vendor_id':vendor['id'],'title':'Confirm flowers','automatic_reminders':False,'due_at':datetime.now(timezone.utc).isoformat()}).json()
    message=c.get(root,headers=h).json()['messages'][0]
    assert message['transport']=='manual_whatsapp'
    assert message['group_name']=='Wedding flowers'
    assert c.post(root+f"/messages/{message['id']}/record-handoff",headers=h,json={'review_token':message['review_token'],'sent_by_user':True}).status_code==409
    c.post(root+f"/messages/{message['id']}/approve",headers=h,json={'review_token':message['review_token']})
    scheduler_tick(Store(path))
    message=c.get(root,headers=h).json()['messages'][0]
    assert message['status']=='ready_to_share'
    assert 'delivered_at' not in message
    endpoint=root+f"/messages/{message['id']}/record-handoff"
    assert c.post(endpoint,headers=h,json={'review_token':message['review_token'],'sent_by_user':False}).status_code==409
    assert c.post(endpoint,headers=h,json={'review_token':message['review_token'],'sent_by_user':True}).json()['status']=='manually_sent'


def test_changing_whatsapp_group_revokes_old_approval(tmp_path):
    c,_,_,h,root=setup(tmp_path)
    vendor=c.post(root+'/vendors',headers=h,json={'name':'Venue','category':'venue','channel':'whatsapp','contact':'Group'}).json()
    endpoint=root+f"/vendors/{vendor['id']}/whatsapp-group"
    c.post(endpoint,headers=h,json={'group_name':'Group A','participants_informed':True})
    m=c.post(root+'/run',headers=h,json={}).json()['messages'][0]
    c.post(root+f"/messages/{m['id']}/approve",headers=h,json={'review_token':m['review_token']})
    c.post(endpoint,headers=h,json={'group_name':'Group B','participants_informed':True})
    current=c.get(root,headers=h).json()['messages'][0]
    assert current['status']=='draft'
    assert current['review_token']!=m['review_token']
    assert c.post(root+f"/messages/{m['id']}/approve",headers=h,json={'review_token':m['review_token']}).status_code==409
    assert c.post(endpoint,json={'group_name':'Another','participants_informed':True}).status_code==404


def test_automatic_reminder_defaults_to_one_day_but_enquiry_needs_review(tmp_path):
    from app.scheduling import scheduler_tick
    from app.store import Store
    c,path,_,h,root=setup(tmp_path)
    vendor=c.post(root+'/vendors',headers=h,json={'name':'Caterer','category':'catering','channel':'whatsapp','contact':'demo'}).json()
    due=datetime.now(timezone.utc)+timedelta(days=3)
    task=c.post(root+'/tasks',headers=h,json={'vendor_id':vendor['id'],'title':'Final menu','due_at':due.isoformat()}).json()
    assert task['reminder_hours']==24
    state=c.post(root+'/run',headers=h,json={}).json()
    reminder=next(m for m in state['messages'] if m.get('task_id')==task['id'])
    enquiry=next(m for m in state['messages'] if m['key'].startswith('availability:'))
    assert reminder['status']=='scheduled'
    assert reminder['automation']=='task_reminder'
    assert 'approved_at' not in reminder
    assert datetime.fromisoformat(reminder['scheduled_at'])==due-timedelta(days=1)
    assert enquiry['status']=='draft'
    scheduler_tick(Store(path),due-timedelta(days=1,seconds=1))
    assert c.get(root,headers=h).json()['messages'][0]['status']=='scheduled'
    scheduler_tick(Store(path),due-timedelta(days=1))
    state=c.get(root,headers=h).json()
    assert next(m for m in state['messages'] if m['id']==reminder['id'])['status']=='simulated'
    assert next(m for m in state['messages'] if m['id']==enquiry['id'])['status']=='draft'


def test_checklist_completion_reopening_and_automatic_cancellation(tmp_path):
    from app.scheduling import scheduler_tick
    from app.store import Store
    c,path,_,h,root=setup(tmp_path)
    v=c.post(root+'/vendors',headers=h,json={'name':'Dress','category':'dress','channel':'whatsapp','contact':'demo'}).json()
    due=datetime.now(timezone.utc)+timedelta(days=2)
    task=c.post(root+'/tasks',headers=h,json={'vendor_id':v['id'],'title':'Fitting','due_at':due.isoformat()}).json()
    endpoint=root+f"/tasks/{task['id']}"
    assert c.patch(endpoint,json={'done':True}).status_code==404
    assert c.patch(endpoint,headers=h,json={'done':True}).json()['done'] is True
    state=c.get(root,headers=h).json()
    assert state['checklist']=={'total':1,'completed':1,'remaining':0}
    assert state['messages'][0]['status']=='cancelled'
    scheduler_tick(Store(path),due)
    assert c.get(root,headers=h).json()['messages'][0]['status']=='cancelled'
    assert c.patch(endpoint,headers=h,json={'done':False}).json()['done'] is False
    c.patch(endpoint,headers=h,json={'done':False})
    state=c.get(root,headers=h).json()
    assert state['checklist']=={'total':1,'completed':0,'remaining':1}
    assert len(state['messages'])==2
    assert state['messages'][1]['status']=='scheduled'
    restored=TestClient(create_app(path)).get(root,headers=h).json()
    assert restored['checklist']==state['checklist']


def test_automatic_whatsapp_reminder_waits_for_manual_handoff(tmp_path):
    from app.scheduling import scheduler_tick
    from app.store import Store
    c,path,_,h,root=setup(tmp_path)
    v=c.post(root+'/vendors',headers=h,json={'name':'Venue','category':'venue','channel':'whatsapp','contact':'demo'}).json()
    c.post(root+f"/vendors/{v['id']}/whatsapp-group",headers=h,json={'group_name':'Venue group','participants_informed':True})
    c.post(root+'/tasks',headers=h,json={'vendor_id':v['id'],'title':'Floor plan','due_at':datetime.now(timezone.utc).isoformat()})
    scheduler_tick(Store(path))
    message=c.get(root,headers=h).json()['messages'][0]
    assert message['status']=='ready_to_share'
    assert message['automation']=='task_reminder'
    assert 'approved_at' not in message
    assert 'delivered_at' not in message
