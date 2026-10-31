"""Run against a disposable PostgreSQL server using TEST_DATABASE_URL."""
import os
from uuid import uuid4
from urllib.parse import urlencode, quote
import pytest
from fastapi.testclient import TestClient

@pytest.fixture
def postgres_url():
    url = os.getenv('TEST_DATABASE_URL')
    if not url:
        pytest.skip('Set TEST_DATABASE_URL to run PostgreSQL integration tests')
    import psycopg
    from psycopg import sql
    schema = 'test_' + uuid4().hex
    with psycopg.connect(url, autocommit=True) as db:
        db.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
    yield url + ('&' if '?' in url else '?') + urlencode({'options':'-c search_path=' + schema}, quote_via=quote)
    with psycopg.connect(url, autocommit=True) as db:
        db.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))


def test_wedding_survives_independent_backend_instances(postgres_url):
    from app.main import create_app
    first=TestClient(create_app(postgres_url))
    created=first.post('/api/weddings',json={'brief':{'names':'Persistence test','date':'2027-08-08'}})
    assert created.status_code==201,created.text
    data=created.json();wid=data['wedding']['id'];headers={'X-Wedding-Token':data['access_token']}
    second=TestClient(create_app(postgres_url))
    response=second.get('/api/weddings/'+wid,headers=headers)
    assert response.status_code==200,response.text
    assert response.json()['wedding']['brief']['names']=='Persistence test'
    update=second.patch('/api/weddings/'+wid,headers=headers,json={'expected_revision':0,'brief':{'notes':'Stored in PostgreSQL'}})
    assert update.status_code==200,update.text
    assert first.get('/api/weddings/'+wid,headers=headers).json()['wedding']['brief']['notes']=='Stored in PostgreSQL'
    assert first.patch('/api/weddings/'+wid,headers=headers,json={'expected_revision':0,'brief':{'notes':'Stale'}}).status_code==409


def test_postgres_coordination_and_idempotent_events(postgres_url):
    from app.main import create_app
    from app.store import Store
    c=TestClient(create_app(postgres_url));created=c.post('/api/weddings',json={}).json()
    h={'X-Wedding-Token':created['access_token']};root=f"/api/weddings/{created['wedding']['id']}/coordination"
    result=c.post(root+'/vendors',headers=h,json={'name':'Florist','category':'flowers','channel':'whatsapp','contact':'demo'})
    assert result.status_code==201,result.text
    assert TestClient(create_app(postgres_url)).get(root,headers=h).json()['vendors'][0]['name']=='Florist'
    with Store(postgres_url).connection() as db:
        assert db.execute('INSERT OR IGNORE INTO live_events VALUES(?,?)',('test-event','now')).rowcount==1
        assert db.execute('INSERT OR IGNORE INTO live_events VALUES(?,?)',('test-event','now')).rowcount==0
        assert db.execute('SELECT COUNT(*) FROM live_events').fetchone()[0]==1


def test_vercel_without_shared_database_returns_actionable_setup_error(monkeypatch):
    from app.main import create_app
    monkeypatch.setenv('VERCEL','1')
    monkeypatch.delenv('DATABASE_URL',raising=False);monkeypatch.delenv('POSTGRES_URL',raising=False)
    c=TestClient(create_app())
    for method,path in [('get','/health'),('post','/api/weddings')]:
        response=getattr(c,method)(path)
        assert response.status_code==503
        assert response.json()['detail']['code']=='database_not_configured'


def test_postgres_controller_checklist_and_revision_race(postgres_url):
    from concurrent.futures import ThreadPoolExecutor
    from app.main import create_app
    c=TestClient(create_app(postgres_url));created=c.post('/api/weddings',json={}).json()
    h={'X-Wedding-Token':created['access_token']};root=f"/api/weddings/{created['wedding']['id']}"
    response=c.get(root+'/controller',headers=h)
    assert response.status_code==200,response.text
    body={'request_id':str(uuid4()),'title':'Choose flowers','detail':'User decision, not a booking'}
    decision=c.post(root+'/controller/decisions',headers=h,json=body)
    assert decision.status_code==201,decision.text
    assert c.post(root+'/controller/decisions',headers=h,json=body).status_code in (200,201)
    def update(note):
        with TestClient(create_app(postgres_url)) as other:
            return other.patch(root,headers=h,json={'expected_revision':0,'brief':{'notes':note}}).status_code
    with ThreadPoolExecutor(max_workers=2) as workers:
        codes=list(workers.map(update,['First edit','Second edit']))
    assert sorted(codes)==[200,409]
