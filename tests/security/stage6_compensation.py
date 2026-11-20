"""Stage 6: compensation workflow with real password sessions, isolated local draft only.
Creates synthetic candidatures on [TEST] demands and deletes them at the end."""
import os, sys, uuid, threading, requests
from urllib.parse import urlparse
U = os.environ['SUPABASE_URL'].rstrip('/')
assert urlparse(U).hostname in ('127.0.0.1', 'localhost'), 'STOP: backend is not local'
PK = os.environ['SUPABASE_PUBLISHABLE_KEY']; PW = 'Synth!Test2026'
ASSIGNED = '33333333-0000-4000-8000-000000000001'   # assigned to sourceur
OTHER = '33333333-0000-4000-8000-000000000003'      # assigned to sourceur2
R = []; T = {}; CVS = []; DCS = []
def check(n, c, d=''): R.append(('PASS' if c else 'FAIL', n, str(d)[:160]))
def h(r): return {'apikey': PK, 'Authorization': 'Bearer ' + (T[r] if r != 'anon' else PK), 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
def rest(r, m, p, b=None): return requests.request(m, f'{U}/rest/v1/{p}', headers=h(r), json=b, timeout=20)
def act(r, dc, action, ver=None, ct=None, amt=None, cur=None, c=None):
    body = {'_demand_candidate_id': dc, '_action': action}
    if ver is not None: body['_expected_version'] = ver
    if ct: body['_contract_type'] = ct
    if amt is not None: body['_amount'] = amt
    if cur: body['_currency'] = cur
    if c: body['_comment'] = c
    return requests.post(f'{U}/rest/v1/rpc/compensation_action', headers=h(r), json=body, timeout=20)
def prop(dc): x = rest('ops', 'GET', f'compensation_proposals?demand_candidate_id=eq.{dc}&select=*').json(); return x[0] if x else None
def audit(dc): return rest('ops', 'GET', f'compensation_audit?demand_candidate_id=eq.{dc}&order=id&select=*').json()
for r in ['sourceur','sourceur2','hrbp','ops','ceo','admin','norole','multi']:
    x = requests.post(U+'/auth/v1/token?grant_type=password', headers={'apikey': PK}, json={'email': r+'@test.local', 'password': PW}, timeout=20)
    assert x.ok, 'login failed '+r; T[r] = x.json()['access_token']
def new_dc(demand=ASSIGNED, who='sourceur'):
    cv = rest(who, 'POST', 'talent_hub_cvs', {'full_name': f'[TEST] S6 {uuid.uuid4().hex[:6]}'}).json()[0]['id']; CVS.append(cv)
    dc = rest(who, 'POST', 'demand_candidates', {'demand_id': demand, 'cv_id': cv, 'stage': 'screened'}).json()[0]['id']; DCS.append(dc)
    return dc
try:
    # --- validation
    a = new_dc()
    x = act('sourceur', a, 'submit'); check('V1 submit without contract type rejected', not x.ok, x.text)
    x = act('sourceur', a, 'save_draft', ct='cdi'); check('V2 draft allowed without amount', x.ok, x.text)
    v = x.json()[0]['version']
    x = act('sourceur', a, 'submit', v); check('V3 submit without amount rejected', not x.ok, x.text)
    x = act('sourceur', a, 'submit', v, amt=-5); check('V4 negative amount rejected', not x.ok, x.text)
    x = act('sourceur', a, 'submit', v, ct='freelance'); check('V5 switching type without new amount rejected', x.ok is False or prop(a)['proposed_amount'] is None, x.text)
    # --- CDI full path
    x = act('sourceur', a, 'submit', v, ct='cdi', amt=4200); p = prop(a)
    check('CDI1 Sourceur submits monthly salary', x.ok and p['status']=='pending_manager_review' and float(p['proposed_amount'])==4200, x.text)
    check('CDI2 original snapshot stored', p['original_contract_type']=='cdi' and float(p['original_amount'])==4200 and p['original_submitted_at'])
    x = act('sourceur', a, 'save_draft', p['version'], amt=9999); check('CDI3 Sourceur cannot edit after submission', not x.ok, x.text)
    x = act('sourceur', a, 'forward', p['version']); check('CDI4 Sourceur cannot forward', not x.ok, x.text)
    x = act('ops', a, 'approve', p['version']); check('CDI5 Operations cannot approve before HRBP', not x.ok, x.text)
    x = act('hrbp', a, 'return_to_sourceur', p['version']); check('CDI6 return requires reason', not x.ok, x.text)
    x = act('hrbp', a, 'return_to_sourceur', p['version'], c='Missing salary breakdown'); p = prop(a)
    check('CDI7 HRBP returns to Sourceur', x.ok and p['status']=='returned_to_sourceur' and p['last_return_reason'], x.text)
    x = act('sourceur', a, 'submit', p['version'], amt=4300); p = prop(a)
    check('CDI8 Sourceur revises and resubmits; original preserved', x.ok and float(p['proposed_amount'])==4300 and float(p['original_amount'])==4200, x.text)
    x = act('hrbp', a, 'forward', p['version'], ct='cdd', amt=4100, c='Six-month CDD agreed'); p = prop(a)
    check('CDI9 HRBP amends (CDD 4100) and forwards', x.ok and p['status']=='pending_operations_review' and p['manager_contract_type']=='cdd' and float(p['manager_amount'])==4100, x.text)
    check('CDI10 original and amended both visible', p['original_contract_type']=='cdi' and p['proposed_contract_type']=='cdi')
    x = act('ops', a, 'approve', p['version'] - 1); check('CDI11 stale version rejected', not x.ok and 'Stale' in x.text, x.text)
    x = act('ops', a, 'return_to_manager', p['version'], c='Check budget'); p = prop(a)
    check('CDI12 Operations returns to HRBP', x.ok and p['status']=='returned_to_manager', x.text)
    x = act('hrbp', a, 'forward', p['version'], c='Budget confirmed'); p = prop(a)
    check('CDI13 HRBP resubmits to Operations', x.ok and p['status']=='pending_operations_review', x.text)
    x = act('ops', a, 'approve', p['version'], amt=4150, c='Final'); p = prop(a)
    check('CDI14 Operations amends + approves; final stored', x.ok and p['status']=='approved' and p['final_contract_type']=='cdd' and float(p['final_amount'])==4150 and p['final_by'] and p['final_at'], x.text)
    au = audit(a)
    need = {'actor_id','actor_role','action','from_status','to_status','old_contract_type','new_contract_type','old_amount','new_amount','currency','frequency','created_at','demand_candidate_id','cv_id'}
    check('AUD1 every transition audited', [e['action'] for e in au] == ['save_draft','submit','return_to_sourceur','submit','forward','return_to_manager','forward','approve'], [e['action'] for e in au])
    check('AUD2 audit fields complete', all(need <= set(e) for e in au) and au[-1]['old_amount'] and float(au[-1]['new_amount'])==4150 and au[-1]['frequency']=='monthly' and au[-1]['actor_role']=='operations')
    for r in ['ops','hrbp','sourceur']:
        x = rest(r, 'PATCH', f'compensation_audit?id=eq.{au[0]["id"]}', {'comment':'x'}); check(f'AUD3 {r} cannot rewrite audit', not x.ok or x.json()==[], x.status_code)
        x = rest(r, 'DELETE', f'compensation_audit?id=eq.{au[0]["id"]}'); check(f'AUD4 {r} cannot delete audit', not x.ok or x.json()==[], x.status_code)
        x = rest(r, 'POST', 'compensation_audit', {'proposal_id': p['id'], 'demand_candidate_id': a, 'cv_id': a, 'demand_id': a, 'actor_id': a, 'actor_role':'operations','action':'fake','to_status':'approved','currency':'EUR'}); check(f'AUD5 {r} cannot forge audit', not x.ok, x.status_code)
    # gates: CDI/CDD placement without TJM
    rest('hrbp', 'PATCH', f'demand_candidates?id=eq.{a}', {'qualification_status': 'qualified'})
    x = rest('ops', 'PATCH', f'demand_candidates?id=eq.{a}', {'final_decision': 'approved'})
    check('GATE1 CDD final approval works without TJM record', x.ok and x.json()[0]['final_decision']=='approved', x.text)
    x = act('ops', a, 'start_amendment', p['version']); check('AMD1 amendment requires justification', not x.ok, x.text)
    x = act('ops', a, 'start_amendment', p['version'], c='Client asked for raise'); p = prop(a)
    d = rest('ops','GET',f'demand_candidates?id=eq.{a}&select=final_decision').json()[0]
    check('AMD2 amendment reopens review and resets final decision', x.ok and p['status']=='pending_operations_review' and d['final_decision']=='pending', x.text)
    x = act('ops', a, 'approve', p['version'], amt=4400, c='Raise'); p = prop(a)
    check('AMD3 reapproval stores new final amount', x.ok and float(p['final_amount'])==4400)
    x = rest('ops', 'PATCH', f'demand_candidates?id=eq.{a}', {'final_decision': 'approved'})
    x = rest('ops', 'PATCH', f'demand_candidates?id=eq.{a}', {'stage': 'placed'})
    check('GATE2 CDD placement without TJM succeeds after approvals', x.ok and x.json()[0]['stage']=='placed', x.text)
    # --- CDD direct
    b = new_dc(); x = act('sourceur', b, 'submit', ct='cdd', amt=3500); p = prop(b)
    check('CDD1 CDD monthly salary submission', x.ok and p['proposed_contract_type']=='cdd', x.text)
    x = act('hrbp', b, 'manager_review', p['version'], c='Looks fine'); p = prop(b)
    check('CDD2 HRBP review without forwarding -> reviewed_by_manager', x.ok and p['status']=='reviewed_by_manager', x.text)
    x = act('hrbp', b, 'forward', p['version']); p = prop(b)
    x = act('ops', b, 'reject', p['version']); check('CDD3 reject requires reason', not x.ok)
    x = act('ops', b, 'reject', p['version'], c='Over budget'); p = prop(b)
    check('CDD4 Operations rejects', x.ok and p['status']=='rejected', x.text)
    x = act('sourceur', b, 'submit', p['version'], amt=3000); check('CDD5 rejected is closed for Sourceur', not x.ok)
    x = act('hrbp', b, 'reopen', p['version'], c='x'); check('CDD6 HRBP cannot reopen', not x.ok)
    x = act('ops', b, 'reopen', p['version'], c='New budget'); p = prop(b)
    check('CDD7 Operations reopens to Sourceur', x.ok and p['status']=='returned_to_sourceur', x.text)
    # --- Freelance
    f = new_dc(); x = act('sourceur', f, 'submit', ct='freelance', amt=550); p = prop(f)
    check('FRL1 Freelance TJM submission', x.ok and p['proposed_contract_type']=='freelance' and float(p['proposed_amount'])==550, x.text)
    act('hrbp', f, 'forward', p['version']); p = prop(f); x = act('ops', f, 'approve', p['version']); p = prop(f)
    check('FRL2 Freelance approved by Operations', x.ok and p['status']=='approved')
    rest('hrbp', 'PATCH', f'demand_candidates?id=eq.{f}', {'qualification_status': 'qualified'})
    x = rest('ops', 'PATCH', f'demand_candidates?id=eq.{f}', {'final_decision': 'approved'})
    check('FRL3 Freelance final approval needs commercial TJM', not x.ok, x.text)
    rest('ops', 'POST', 'candidate_financials', {'demand_candidate_id': f, 'client_rate': 700, 'candidate_rate': 550, 'tjm_status': 'approved'})
    x = rest('ops', 'PATCH', f'demand_candidates?id=eq.{f}', {'final_decision': 'approved'})
    check('FRL4 Freelance final approval after commercial TJM approved', x.ok and x.json()[0]['final_decision']=='approved', x.text)
    # --- unauthorized
    u = new_dc(); x = act('sourceur', u, 'submit', ct='cdi', amt=3000); p = prop(u)
    x = act('sourceur2', u, 'save_draft', ct='cdi', amt=1); check('SEC1 other Sourceur cannot act (unassigned)', not x.ok, x.text)
    for r in ['ceo','admin','norole','anon']:
        x = act(r, u, 'forward', p['version']); check(f'SEC2 {r} cannot forward', not x.ok, x.status_code)
        x = act(r, u, 'approve', p['version']); check(f'SEC3 {r} cannot approve', not x.ok, x.status_code)
    act('hrbp', u, 'forward', p['version']); p = prop(u)
    x = act('hrbp', u, 'approve', p['version']); check('SEC4 HRBP cannot approve', not x.ok, x.text)
    x = act('sourceur', u, 'approve', p['version']); check('SEC5 Sourceur cannot approve', not x.ok, x.text)
    for r in ['sourceur','hrbp','ops','ceo']:
        x = rest(r, 'PATCH', f'compensation_proposals?demand_candidate_id=eq.{u}', {'status': 'approved', 'final_amount': 1, 'final_contract_type':'cdi'})
        check(f'SEC6 {r} direct table UPDATE denied', not x.ok or x.json()==[], x.status_code)
        x = rest(r, 'POST', 'compensation_proposals', {'demand_candidate_id': a, 'status': 'approved'})
        check(f'SEC7 {r} direct table INSERT denied', not x.ok, x.status_code)
        x = rest(r, 'DELETE', f'compensation_proposals?demand_candidate_id=eq.{u}')
        check(f'SEC8 {r} direct table DELETE denied', not x.ok or x.json()==[], x.status_code)
    check('SEC9 proposal unchanged after direct attempts', prop(u)['status']=='pending_operations_review')
    # visibility
    for r, exp in [('admin', 0), ('norole', 0), ('sourceur2', 0)]:
        x = rest(r, 'GET', f'compensation_proposals?demand_candidate_id=eq.{u}&select=id'); check(f'VIS {r} sees no proposal', x.ok and len(x.json())==exp, x.text)
        x = rest(r, 'GET', f'compensation_audit?demand_candidate_id=eq.{u}&select=id'); check(f'VIS {r} sees no audit', x.ok and x.json()==[], x.text)
    for r in ['sourceur','hrbp','ops','ceo','multi']:
        x = rest(r, 'GET', f'compensation_proposals?demand_candidate_id=eq.{u}&select=id'); check(f'VIS {r} sees proposal', x.ok and len(x.json())==1, x.text)
    x = rest('anon', 'GET', 'compensation_proposals?select=id'); check('VIS anon denied', not x.ok or x.json()==[], x.status_code)
    # financial confidentiality preserved
    for r in ['sourceur','hrbp','admin']:
        x = rest(r, 'GET', f'candidate_financials?demand_candidate_id=eq.{f}&select=client_rate,margin'); check(f'FIN {r} cannot read client rate/margin', x.ok and x.json()==[], x.text)
    x = rest('ceo', 'GET', f'candidate_financials?demand_candidate_id=eq.{f}&select=client_rate'); check('FIN CEO reads commercial rates', x.ok and len(x.json())==1)
    x = rest('ceo', 'PATCH', f'candidate_financials?demand_candidate_id=eq.{f}', {'client_rate': 1}); check('FIN CEO cannot write', not x.ok or x.json()==[])
    # multi-role (hrbp+operations+admin)
    m = new_dc(OTHER, 'ops'); x = act('multi', m, 'submit', ct='cdi', amt=3800)
    check('MULTI1 multi-role submits as hrbp (not assigned sourceur)', x.ok and audit(m)[-1]['actor_role']=='hrbp', x.text)
    p = prop(m); act('multi', m, 'forward', p['version']); p = prop(m); x = act('multi', m, 'approve', p['version'])
    check('MULTI2 multi-role uses operations for final approval', x.ok and audit(m)[-1]['actor_role']=='operations', x.text)
    # concurrency: two Operations decisions racing on the same version
    cc = new_dc(); act('sourceur', cc, 'submit', ct='cdi', amt=3900); p = prop(cc); act('hrbp', cc, 'forward', p['version']); p = prop(cc)
    out = []
    def go(a_): out.append(act('ops', cc, a_, p['version'], c='race'))
    ts = [threading.Thread(target=go, args=(x_,)) for x_ in ['approve', 'reject']]; [t.start() for t in ts]; [t.join() for t in ts]
    check('CONC1 exactly one concurrent decision wins', sum(1 for o in out if o.ok)==1, [o.status_code for o in out])
    check('CONC2 single audit entry for race', len([e for e in audit(cc) if e['action'] in ('approve','reject')])==1)
    # legacy placements untouched
    x = rest('ops', 'GET', 'demand_candidates?legacy_placement=eq.true&select=id'); check('LEG legacy query works', x.ok)
    x = rest('ops', 'GET', 'demand_candidates?id=eq.55555555-0000-4000-8000-000000000007&select=stage'); check('LEG existing placement unchanged', x.ok and x.json()[0]['stage']=='placed')
finally:
    for dc in DCS: rest('ops', 'DELETE', f'demand_candidates?id=eq.{dc}')
    for cv in CVS: rest('ops', 'DELETE', f'talent_hub_cvs?id=eq.{cv}')
    left = rest('ops', 'GET', 'talent_hub_cvs?full_name=like.*S6*&select=id').json()
    check('CLEANUP synthetic fixtures removed', left == [], left)
for s, n, d in R: print(f'{s}  {n}  {d if s=="FAIL" else ""}')
fl = sum(1 for s, _, _ in R if s == 'FAIL'); print(f'\n{len(R)-fl}/{len(R)} PASS'); sys.exit(1 if fl else 0)
