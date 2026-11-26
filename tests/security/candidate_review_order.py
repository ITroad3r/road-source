"""Real authenticated workflow regression; no roles or existing rows are changed.

Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and TEST_PASSWORD_<ROLE>
for the existing single-role test.<role>@itroad.test accounts. All fixtures are
run-scoped and deleted, including via cascading compensation audit cleanup.
"""
import os
import uuid
import requests

URL = os.environ['SUPABASE_URL'].rstrip('/')
KEY = os.environ['SUPABASE_PUBLISHABLE_KEY']
ROLES = ['sourceur', 'hrbp', 'operations', 'ceo', 'admin']
tokens = {}
identities = {}
passed = 0


def call(role, method, resource, body=None):
    headers = {'apikey': KEY, 'Authorization': 'Bearer ' + tokens[role],
               'Prefer': 'return=representation'}
    return requests.request(method, URL + '/rest/v1/' + resource,
                            headers=headers, json=body, timeout=30)


def require(response, label):
    assert response.ok, f'{label}: HTTP {response.status_code}'
    return response.json() if response.content else None


def check(value, label):
    global passed
    assert value, label
    passed += 1
    print('PASS', label)


def login():
    for role in ROLES:
        response = requests.post(URL + '/auth/v1/token?grant_type=password',
                                 headers={'apikey': KEY}, json={
                                     'email': f'test.{role}@itroad.test',
                                     'password': os.environ['TEST_PASSWORD_' + role.upper()]}, timeout=30)
        payload = require(response, role + ' sign-in')
        tokens[role] = payload['access_token']
        identities[role] = payload['user']['id']
        membership = require(call(role, 'GET', 'user_roles?user_id=eq.' + identities[role] + '&select=role'), 'membership')
        check(membership == [{'role': role}], role + ' has exactly its own role')


class Fixture:
    def __init__(self):
        self.client, self.demand, self.cv, self.dc = [str(uuid.uuid4()) for _ in range(4)]
        self.name = '[TEST] review order ' + self.dc[:8]

    def create(self):
        require(call('hrbp', 'POST', 'clients', {'id': self.client, 'name': self.name}), 'create client')
        require(call('hrbp', 'POST', 'demands', {
            'id': self.demand, 'client_id': self.client, 'title': self.name,
            'engagement': 'freelance', 'assigned_to': identities['sourceur']}), 'create demand')
        require(call('sourceur', 'POST', 'talent_hub_cvs', {'id': self.cv, 'full_name': self.name}), 'create Hub candidate')
        require(call('sourceur', 'POST', 'demand_candidates', {
            'id': self.dc, 'demand_id': self.demand, 'cv_id': self.cv}), 'create candidature')

    def read(self):
        return require(call('operations', 'GET', 'demand_candidates?id=eq.' + self.dc), 'read candidature')[0]

    def patch(self, role, **values):
        return call(role, 'PATCH', 'demand_candidates?id=eq.' + self.dc, values)

    def cleanup(self):
        for table, value in [('demands', self.demand), ('talent_hub_cvs', self.cv), ('clients', self.client)]:
            require(call('operations', 'DELETE', table + '?id=eq.' + value), 'remove fixture ' + table)
            check(require(call('operations', 'GET', table + '?id=eq.' + value), 'cleanup read') == [], table + ' fixture removed')


def suite(f):
    check(not f.patch('sourceur', stage='screened').ok, 'Sourcer cannot skip Contacted')
    check(not f.patch('hrbp', qualification_status='qualified').ok, 'HRBP cannot qualify Identified')
    check(not f.patch('operations', qualification_status='qualified').ok, 'Operations cannot substitute for HRBP')
    check(not f.patch('operations', final_decision='approved').ok, 'Operations cannot review before HRBP acceptance')
    check(not call('operations', 'POST', 'candidate_financials', {
        'demand_candidate_id': f.dc, 'client_rate': 600, 'candidate_rate': 400, 'tjm_status': 'approved'}).ok,
        'TJM insert approval cannot bypass candidate review')
    for role in ROLES:
        before = f.read()['stage']
        visible = require(call(role, 'GET', 'demand_candidates?id=eq.' + f.dc), 'role visibility')
        check(bool(visible) == (role != 'admin'), role + ' preserves existing candidature visibility')
        if role in ['ceo', 'admin']:
            f.patch(role, stage='contacted')
            check(f.read()['stage'] == before, role + ' cannot change stages')
    require(f.patch('sourceur', stage='contacted'), 'contact candidate')
    check(not f.patch('sourceur', stage='screened').ok, 'screening requires saved contact details')
    contact = {'demand_candidate_id': f.dc, 'communication_method': 'phone',
               'communicated_at': '2026-11-26T12:00:00Z', 'employment_status': 'employed',
               'availability_notes': '30 days notice', 'current_contract_type': 'CDI',
               'current_pay': 18000, 'current_pay_type': 'salary', 'country': 'Morocco', 'city': 'Rabat'}
    require(call('sourceur', 'POST', 'candidate_dossiers', contact), 'save contact')
    for field in ['communication_method', 'communicated_at', 'employment_status', 'availability_notes',
                  'current_contract_type', 'current_pay', 'current_pay_type', 'country', 'city']:
        require(call('sourceur', 'PATCH', 'candidate_dossiers?demand_candidate_id=eq.' + f.dc, {field: None}), 'clear ' + field)
        check(not f.patch('sourceur', stage='screened').ok, 'screening requires ' + field)
        require(call('sourceur', 'PATCH', 'candidate_dossiers?demand_candidate_id=eq.' + f.dc, {field: contact[field]}), 'restore ' + field)
    require(f.patch('sourceur', stage='screened'), 'submit for screening')
    check(f.read()['stage'] == 'screened', 'contact-complete Sourcer reaches screening')
    check(not f.patch('sourceur', stage='submitted').ok, 'Sourcer waits for HRBP review')
    require(f.patch('hrbp', qualification_status='qualified'), 'HRBP qualification')
    check(not f.patch('sourceur', stage='submitted').ok, 'HRBP qualification alone is not enough')
    for role in ['sourceur', 'hrbp', 'ceo', 'admin']:
        f.patch(role, final_decision='approved')
        check(f.read()['final_decision'] == 'pending', role + ' cannot approve Operations decision')
    fin = require(call('operations', 'POST', 'candidate_financials', {
        'demand_candidate_id': f.dc, 'client_rate': 600, 'candidate_rate': 400, 'margin': 200}), 'draft TJM')[0]['id']
    check(not call('operations', 'PATCH', 'candidate_financials?id=eq.' + fin, {'tjm_status': 'approved'}).ok,
          'TJM update approval waits for Operations candidate approval')
    require(f.patch('operations', final_decision='approved'), 'Operations candidate approval before TJM')
    check(f.read()['final_decision'] == 'approved', 'Operations approves candidate while TJM is draft')
    require(call('operations', 'PATCH', 'candidate_financials?id=eq.' + fin, {'tjm_status': 'approved'}), 'approve TJM')
    require(call('operations', 'PATCH', 'candidate_financials?id=eq.' + fin, {'client_rate': 650, 'margin': 250}), 'edit approved TJM')
    financial = require(call('operations', 'GET', 'candidate_financials?id=eq.' + fin), 'read edited TJM')[0]
    check(financial['tjm_status'] == 'draft' and f.read()['final_decision'] == 'approved', 'TJM edit needs re-approval but preserves candidate approval')
    for stage in ['submitted', 'client_interview', 'offer']:
        require(f.patch('sourceur', stage=stage), 'progress to ' + stage)
        check(f.read()['stage'] == stage, 'Sourcer reaches ' + stage + ' after both reviews')
    check(not f.patch('sourceur', stage='placed').ok, 'placement still blocks missing compensation and draft TJM')
    proposal = require(call('sourceur', 'POST', 'rpc/compensation_action', {
        '_demand_candidate_id': f.dc, '_action': 'submit', '_contract_type': 'freelance', '_amount': 400, '_currency': 'EUR'}), 'submit compensation')[0]
    proposal = require(call('hrbp', 'POST', 'rpc/compensation_action', {
        '_demand_candidate_id': f.dc, '_action': 'forward', '_expected_version': proposal['version']}), 'HRBP forward compensation')[0]
    require(call('operations', 'POST', 'rpc/compensation_action', {
        '_demand_candidate_id': f.dc, '_action': 'approve', '_expected_version': proposal['version']}), 'Operations compensation approval')
    check(not f.patch('sourceur', stage='placed').ok, 'Freelance placement still requires TJM re-approval')
    require(call('operations', 'PATCH', 'candidate_financials?id=eq.' + fin, {'tjm_status': 'approved'}), 'reapprove TJM')
    require(f.patch('sourceur', stage='placed'), 'place candidate')
    demand = require(call('operations', 'GET', 'demands?id=eq.' + f.demand), 'read closed demand')[0]
    check(f.read()['stage'] == 'placed' and demand['lifecycle'] == 'filled' and demand['commercial_outcome'] == 'won',
          'full workflow ends with placement and automatic demand closure')


if __name__ == '__main__':
    login()
    fixture = Fixture()
    try:
        fixture.create()
        suite(fixture)
    finally:
        fixture.cleanup()
    print(f'{passed} authenticated checks passed; fixtures removed')