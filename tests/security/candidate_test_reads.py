"""Real Storage API regression test; credentials come from environment only.

Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and TEST_PASSWORD_<ROLE>
for sourceur, hrbp, operations, ceo and admin. Uses existing test.<role>@itroad.test
accounts without modifying their roles. All synthetic data/files are removed.
"""
import os
import uuid
import requests

URL = os.environ['SUPABASE_URL'].rstrip('/')
KEY = os.environ['SUPABASE_PUBLISHABLE_KEY']
tokens = {}
identities = {}
client = str(uuid.uuid4())
cv = str(uuid.uuid4())
demands = [str(uuid.uuid4()), str(uuid.uuid4())]
candidatures = [str(uuid.uuid4()), str(uuid.uuid4())]
paths = [f'{dc}/{uuid.uuid4()}.pdf' for dc in candidatures]
passed = 0


def call(role, method, path, **kwargs):
    headers = {'apikey': KEY}
    if role != 'anon':
        headers['Authorization'] = 'Bearer ' + tokens[role]
    headers.update(kwargs.pop('headers', {}))
    return requests.request(method, URL + path, headers=headers, timeout=30, **kwargs)


def require(response, operation):
    assert response.ok, f'{operation} failed: HTTP {response.status_code}'
    return response


try:
    for role in ['sourceur', 'hrbp', 'operations', 'ceo', 'admin']:
        login = requests.post(URL + '/auth/v1/token?grant_type=password', headers={'apikey': KEY},
                              json={'email': f'test.{role}@itroad.test',
                                    'password': os.environ[f'TEST_PASSWORD_{role.upper()}']}, timeout=30)
        payload = require(login, f'{role} sign-in').json()
        tokens[role] = payload['access_token']
        identities[role] = payload['user']['id']
        membership = require(call(role, 'GET', '/rest/v1/user_roles',
                                  params={'user_id': 'eq.' + identities[role], 'select': 'role'}), 'role check').json()
        assert membership == [{'role': role}], f'{role} must be single-role'

    require(call('hrbp', 'POST', '/rest/v1/clients', json={'id': client, 'name': '[TEST] storage access'}), 'create client')
    require(call('hrbp', 'POST', '/rest/v1/talent_hub_cvs', json={'id': cv, 'full_name': '[TEST] storage access'}), 'create candidate')
    for index in range(2):
        require(call('hrbp', 'POST', '/rest/v1/demands', json={
            'id': demands[index], 'client_id': client, 'title': '[TEST] storage access',
            'engagement': 'freelance', 'assigned_to': identities['sourceur'] if index == 0 else None}), 'create demand')
        require(call('hrbp', 'POST', '/rest/v1/demand_candidates', json={
            'id': candidatures[index], 'demand_id': demands[index], 'cv_id': cv}), 'create candidature')
        require(call('hrbp', 'POST', '/storage/v1/object/candidate-tests/' + paths[index],
                     headers={'Content-Type': 'application/pdf'}, data=b'%PDF-1.4\n% storage access regression\n%%EOF'), 'upload test PDF')

    for role, expected in [('sourceur', [True, False]), ('hrbp', [True, True]),
                           ('operations', [True, True]), ('ceo', [True, True]),
                           ('admin', [False, False]), ('anon', [False, False])]:
        for index, allowed in enumerate(expected):
            response = call(role, 'POST', '/storage/v1/object/sign/candidate-tests/' + paths[index], json={'expiresIn': 60})
            assert response.ok == allowed, f'{role} signed link for file {index}: unexpected HTTP {response.status_code}'
            download = call(role, 'GET', '/storage/v1/object/authenticated/candidate-tests/' + paths[index])
            assert download.ok == allowed, f'{role} download for file {index}: unexpected HTTP {download.status_code}'
            if allowed:
                assert download.content.startswith(b'%PDF-'), 'PDF bytes did not read back'
            passed += 1
            print(f'PASS {role}: file {index} {"allowed" if allowed else "denied"} (signed link and download)')

    # Losing assignment must revoke access even though the file still exists.
    require(call('hrbp', 'PATCH', '/rest/v1/demands?id=eq.' + demands[0], json={'assigned_to': None}), 'unassign demand')
    response = call('sourceur', 'POST', '/storage/v1/object/sign/candidate-tests/' + paths[0], json={'expiresIn': 60})
    assert not response.ok, 'Sourcer retained access after unassignment'
    passed += 1
    print('PASS sourceur: access revoked after unassignment')
finally:
    if 'hrbp' in tokens:
        removed = require(call('hrbp', 'DELETE', '/storage/v1/object/candidate-tests', json={'prefixes': paths}), 'remove test PDFs').json()
        if passed:
            assert {item['name'] for item in removed} == set(paths), 'Not all synthetic PDFs were removed'
    if 'operations' in tokens:
        for demand in demands:
            require(call('operations', 'DELETE', '/rest/v1/demands?id=eq.' + demand), 'remove test demand')
        require(call('operations', 'DELETE', '/rest/v1/talent_hub_cvs?id=eq.' + cv), 'remove test candidate')
        require(call('operations', 'DELETE', '/rest/v1/clients?id=eq.' + client), 'remove test client')

print(f'{passed}/13 storage authorization scenarios passed; synthetic data removed')