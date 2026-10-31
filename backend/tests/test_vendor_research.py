from fastapi.testclient import TestClient
from app.main import create_app
from app.vendor_research import EvidenceExtract


def setup(tmp_path, agent=None):
    c=TestClient(create_app(tmp_path/'research.sqlite',agent=agent))
    w=c.post('/api/weddings',json={'brief':{'date':'2027-08-08','location':'Singapore'}}).json()
    h={'X-Wedding-Token':w['access_token']};root=f"/api/weddings/{w['wedding']['id']}/coordination"
    vendors=[]
    for name in ['Florist A','Florist B']:
        vendors.append(c.post(root+'/vendors',headers=h,json={'name':name,'category':'flowers','channel':'whatsapp','contact':'demo'}).json())
    return c,h,root,vendors,w['wedding']['id']


def test_evidence_report_and_user_choice_are_not_booking_or_payment(tmp_path):
    c,h,root,vendors,_=setup(tmp_path)
    v=vendors[0]['id']
    r=c.post(root+f'/vendors/{v}/evidence',headers=h,json={'content':'Available 8 August. 12 rose arrangements. SGD 900 excluding delivery. White roses.', 'availability_detail':'Available 8 August.', 'stock_detail':'12 rose arrangements.', 'pricing_detail':'SGD 900 excluding delivery.', 'options_detail':'White roses.'}).json()
    report=c.get(root+'/report',headers=h).json()
    assert report['user_selections']==[]
    assert [row['vendor']['name'] for row in report['vendors']]==['Florist A','Florist B']
    assert report['vendors'][0]['facts']['pricing_detail']['response_id']==r['id']
    assert report['vendors'][1]['facts']['pricing_detail'] is None
    assert 'recommendation' not in report
    choice=c.post(root+'/user-selection',headers=h,json={'vendor_id':v,'response_id':r['id'],'report_token':report['report_token'],'chosen_option':'White roses','chosen_date':'2027-08-08'}).json()
    assert choice['selected_by']=='user'
    assert choice['booking_confirmed'] is False
    assert choice['payment_handled'] is False
    assert choice['status']=='user_choice_only'
    assert not c.get(root+'/report',headers=h).json()['user_selections'][0]['needs_review']
    assert c.get(root+'/report').status_code==404


def test_latest_reply_does_not_silently_mix_old_prices(tmp_path):
    c,h,root,vendors,wid=setup(tmp_path);v=vendors[0]['id']
    first=c.post(root+f'/vendors/{v}/evidence',headers=h,json={'content':'SGD 900','pricing_detail':'SGD 900'}).json()
    old=c.get(root+'/report',headers=h).json()
    c.post(root+f'/vendors/{v}/evidence',headers=h,json={'content':'Updated package, price pending','options_detail':'Updated package'})
    report=c.get(root+'/report',headers=h).json()
    assert report['vendors'][0]['facts']['pricing_detail'] is None
    assert c.post(root+'/user-selection',headers=h,json={'vendor_id':v,'response_id':first['id'],'report_token':old['report_token']}).status_code==409
    c.patch(f'/api/weddings/{wid}',headers=h,json={'expected_revision':0,'brief':{'date':'2028-08-08'}})
    latest=c.get(root+'/report',headers=h).json()
    assert latest['vendors'][0]['outdated_response_count']==2
    assert latest['vendors'][0]['responses']==[]
    assert c.post(root+'/user-selection',headers=h,json={'vendor_id':v,'response_id':first['id'],'report_token':latest['report_token']}).status_code==409


def test_no_invented_excerpts_or_cross_vendor_selection(tmp_path):
    c,h,root,vendors,_=setup(tmp_path);a,b=[v['id'] for v in vendors]
    assert c.post(root+f'/vendors/{a}/evidence',headers=h,json={'content':'Price to follow','pricing_detail':'SGD 500'}).status_code==422
    r=c.post(root+f'/vendors/{a}/evidence',headers=h,json={'content':'Price to follow'}).json()
    report=c.get(root+'/report',headers=h).json()
    assert c.post(root+'/user-selection',headers=h,json={'vendor_id':b,'response_id':r['id'],'report_token':report['report_token']}).status_code==409
    c.post(root+f'/vendors/{a}/enquiry',headers=h,json={'requirements':'Need 12 centrepieces'})
    state=c.get(root,headers=h).json()
    draft=next(m for m in state['messages'] if m.get('key','').startswith('research:'))
    assert draft['status']=='draft'
    assert 'stock' in draft['content'] and 'prices' in draft['content']
    assert 'not a reservation' in draft['content']
    assert c.get(root+'/report',headers=h).json()['user_selections']==[]


def test_ai_extracts_only_evidenced_facts_without_choosing(tmp_path):
    class Agent:
        async def summarize_vendor(self, content):
            return EvidenceExtract(pricing_detail='SGD 800',stock_detail='10 bouquets')
    c,h,root,vendors,_=setup(tmp_path,Agent());v=vendors[0]['id']
    r=c.post(root+f'/vendors/{v}/evidence',headers=h,json={'content':'10 bouquets for SGD 800'}).json()
    assert c.post(root+f"/vendors/{v}/evidence/{r['id']}/summarize",headers=h,json={}).status_code==200
    report=c.get(root+'/report',headers=h).json()
    assert report['vendors'][0]['facts']['stock_detail']['text']=='10 bouquets'
    assert report['user_selections']==[]
    r=c.post(root+f'/vendors/{v}/evidence',headers=h,json={'content':'Quote pending'}).json()
    assert c.post(root+f"/vendors/{v}/evidence/{r['id']}/summarize",headers=h,json={}).status_code==502
    assert c.get(root+'/report',headers=h).json()['vendors'][0]['facts']['pricing_detail'] is None
