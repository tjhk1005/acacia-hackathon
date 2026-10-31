from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.schedule as schedule
from app.main import create_app


@pytest.fixture
def env(tmp_path):
    path=tmp_path/'schedule.sqlite'
    with TestClient(create_app(path,agent=object())) as client:
        created=client.post('/api/weddings',json={'brief':{'names':'Demo couple','date':'2027-08-08'}}).json()
        root='/api/weddings/'+created['wedding']['id']
        headers={'X-Wedding-Token':created['access_token']}
        vendor=client.post(root+'/coordination/vendors',headers=headers,json={'name':'Test caterer','category':'catering','channel':'whatsapp','contact':'+6581234567'}).json()
        task=client.post(root+'/coordination/tasks',headers=headers,json={'vendor_id':vendor['id'],'title':'Menu confirmation','due_at':'2027-08-01T09:00:00Z'}).json()
        yield dict(client=client,root=root,headers=headers,vendor=vendor,task=task,path=path)


def updates(env):
    response=env['client'].get(env['root']+'/schedule',headers=env['headers'])
    assert response.status_code==200
    return response.json()


def propose(env,**changes):
    payload=dict(task_id=env['task']['id'],expected_task_revision=0,brief_revision=0,title='Menu confirmation',due_at='2027-08-02T10:00:00+00:00',reason='Vendor needs another day.',request_id=str(uuid4()))
    return env['client'].post(env['root']+'/schedule/changes',headers=env['headers'],json={**payload,**changes})


def decide(env,identifier,decision='approve',**changes):
    return env['client'].post(env['root']+f'/schedule/changes/{identifier}/{decision}',headers=env['headers'],json={'brief_revision':0,'expected_task_revision':0,**changes})


def tasks(env):
    return env['client'].get(env['root']+'/coordination',headers=env['headers']).json()['tasks']


def test_updates_survive_reopening_and_get_does_not_mark_read(env):
    first=updates(env)
    assert first['unread_count']==1
    assert updates(env)==first
    with TestClient(create_app(env['path'],agent=object())) as reopened:
        assert reopened.get(env['root']+'/schedule',headers=env['headers']).json()==first


def test_reading_is_not_approval_and_approval_applies_exactly_once(env):
    change=propose(env).json()
    before=tasks(env)[0]
    inbox=updates(env)
    assert inbox['pending_count']==1 and tasks(env)[0]==before
    marked=env['client'].post(env['root']+'/schedule/read',headers=env['headers'],json={'ids':[item['id'] for item in inbox['notifications']]}).json()
    assert marked['unread_count']==0 and marked['pending_count']==1
    assert tasks(env)[0]==before
    assert decide(env,change['change_id']).status_code==200
    applied=tasks(env)[0]
    assert applied['due_at']=='2027-08-02T10:00:00+00:00'
    assert applied['revision']==1
    assert decide(env,change['change_id']).status_code==200
    assert tasks(env)[0]==applied
    assert updates(env)['pending_count']==0


def test_rejection_preserves_schedule_and_cannot_later_approve(env):
    change=propose(env).json()
    original=tasks(env)[0]
    assert decide(env,change['change_id'],'reject').status_code==200
    assert decide(env,change['change_id'],'reject').status_code==200
    assert tasks(env)[0]==original
    assert decide(env,change['change_id']).status_code==409


def test_brief_change_blocks_old_approval_and_keeps_current_schedule(env):
    change=propose(env).json()
    original=tasks(env)[0]
    env['client'].patch(env['root'],headers=env['headers'],json={'expected_revision':0,'brief':{'date':'2027-09-09'}})
    assert decide(env,change['change_id']).status_code==409
    assert tasks(env)[0]==original
    inbox=updates(env)
    assert inbox['pending_count']==0
    assert any(item.get('change',{}).get('status')=='stale' for item in inbox['notifications'])


@pytest.mark.parametrize('change_type',['complete','exclude'])
def test_completed_tasks_and_excluded_vendors_invalidate_pending_approval(env,change_type):
    change=propose(env).json()
    if change_type=='complete':
        env['client'].post(env['root']+f"/coordination/tasks/{env['task']['id']}/complete",headers=env['headers'])
    else:
        env['client'].post(env['root']+f"/coordination/vendors/{env['vendor']['id']}/participation",headers=env['headers'],json={'active':False})
    assert decide(env,change['change_id']).status_code==409
    assert updates(env)['pending_count']==0


def test_competing_changes_require_a_fresh_proposal_after_first_approval(env):
    one=propose(env).json()
    two=propose(env,due_at='2027-08-03T10:00:00Z').json()
    assert decide(env,one['change_id']).status_code==200
    assert decide(env,two['change_id']).status_code==409
    assert tasks(env)[0]['due_at'].startswith('2027-08-02')


def test_retries_and_validation_do_not_duplicate_proposals(env):
    identifier=str(uuid4())
    first=propose(env,request_id=identifier)
    assert first.status_code==201
    assert propose(env,request_id=identifier).json()==first.json()
    assert propose(env,request_id=identifier,reason='Different terms').status_code==409
    assert propose(env,reason=' ').status_code==422
    assert propose(env,due_at='2027-08-03T10:00:00').status_code==422
    assert propose(env,expected_task_revision=12).status_code==409
    assert updates(env)['pending_count']==1


def test_one_wedding_cannot_read_or_decide_another_weddings_updates(env):
    change=propose(env).json()
    other=env['client'].post('/api/weddings',json={}).json()
    other_root='/api/weddings/'+other['wedding']['id']+'/schedule'
    other_headers={'X-Wedding-Token':other['access_token']}
    assert env['client'].get(env['root']+'/schedule',headers=other_headers).status_code==404
    assert env['client'].post(other_root+'/changes/'+change['change_id']+'/approve',headers=other_headers,json={'brief_revision':0,'expected_task_revision':0}).status_code==404
    notification=updates(env)['notifications'][0]
    env['client'].post(other_root+'/read',headers=other_headers,json={'ids':[notification['id']]})
    assert updates(env)['unread_count']==2


def test_due_soon_and_overdue_updates_are_caught_up_without_duplicate_alerts(env,monkeypatch):
    class Clock(datetime):
        value=datetime(2027,7,31,tzinfo=timezone.utc)
        @classmethod
        def now(cls,tz=None):
            return cls.value
    monkeypatch.setattr(schedule,'datetime',Clock)
    assert [item['kind'] for item in updates(env)['notifications']].count('due_soon')==1
    assert [item['kind'] for item in updates(env)['notifications']].count('due_soon')==1
    Clock.value=datetime(2027,8,2,tzinfo=timezone.utc)
    assert [item['kind'] for item in updates(env)['notifications']].count('overdue')==1
    assert [item['kind'] for item in updates(env)['notifications']].count('overdue')==1


def test_approved_change_cancels_old_reminder_and_generates_current_one(env):
    env['client'].post(env['root']+'/coordination/run',headers=env['headers'],json={})
    # Use a past deadline to make both old and revised reminders eligible now.
    with env['client'].app.state.messaging.store.connection() as db:
        import json
        saved=json.loads(db.execute('SELECT state FROM coordination WHERE wedding_id=?',(env['root'].split('/')[-1],)).fetchone()['state'])
        saved['tasks'][0]['due_at']='2020-01-01T09:00:00+00:00'
        db.execute('UPDATE coordination SET state=? WHERE wedding_id=?',(json.dumps(saved),env['root'].split('/')[-1]))
    old=env['client'].post(env['root']+'/coordination/run',headers=env['headers'],json={}).json()
    reminder=next(item for item in old['messages'] if item.get('purpose')=='reminder')
    change=propose(env,due_at='2020-01-02T09:00:00Z').json()
    assert decide(env,change['change_id']).status_code==200
    current=env['client'].post(env['root']+'/coordination/run',headers=env['headers'],json={}).json()
    assert next(item for item in current['messages'] if item['id']==reminder['id'])['status']=='cancelled'
    assert any(item.get('purpose')=='reminder' and item['status']=='draft' and '2020-01-02' in item['content'] for item in current['messages'])
