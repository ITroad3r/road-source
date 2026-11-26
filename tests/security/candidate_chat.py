"""Real-session candidate chat access matrix; no user/role changes.

Requires SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and either CHAT_TEST_SESSIONS
(a private temporary JSON file of Auth responses) or TEST_PASSWORD_<ROLE>.
KEEP_CHAT_FIXTURES=1 retains synthetic rows for browser verification; the caller
must then remove the recorded demand, candidate and client after verification.
"""
import json
import os
import uuid
from pathlib import Path
import requests

URL = os.environ['SUPABASE_URL'].rstrip('/')
KEY = os.environ['SUPABASE_PUBLISHABLE_KEY']
roles = ['sourceur', 'hrbp', 'operations', 'ceo', 'admin']
sessions = {}
if os.environ.get('CHAT_TEST_SESSIONS'):
    sessions = json.loads(Path(os.environ['CHAT_TEST_SESSIONS']).read_text())
else:
    for role in roles:
        response = requests.post(URL + '/auth/v1/token?grant_type=password',
                                 headers={'apikey': KEY}, json={
                                     'email': f'test.{role}@itroad.test',
                                     'password': os.environ[f'TEST_PASSWORD_{role.upper()}']}, timeout=30)
        assert response.ok, f'{role} sign-in failed: HTTP {response.status_code}'
        sessions[role] = response.json()

fixture = {key: str(uuid.uuid4()) for key in ['client', 'cv', 'demand', 'dc']}
passed = 0
completed = False

def call(role, method, path, **kwargs):
    headers = {'apikey': KEY}
    if role != 'anon':
        headers['Authorization'] = 'Bearer ' + sessions[role]['access_token']
    headers.update(kwargs.pop('headers', {}))
    return requests.request(method, URL + '/rest/v1/' + path, headers=headers, timeout=30, **kwargs)

def require(response, operation):
    assert response.ok, f'{operation}: HTTP {response.status_code}'
    return response

def check(condition, description):
    global passed
    assert condition, description
    passed += 1
    print('PASS ' + description)

def send(role, room, **extra):
    body = {'demand_candidate_id': fixture['dc'], 'room': room,
            'sender_id': sessions[role]['user']['id'], 'body': '[TEST] chat ' + role}
    body.update(extra)
    return call(role, 'POST', 'candidate_chat_messages', json=body, headers={'Prefer': 'return=representation'})

def cleanup():
    for table, key in [('demands', 'demand'), ('talent_hub_cvs', 'cv'), ('clients', 'client')]:
        require(call('operations', 'DELETE', table + '?id=eq.' + fixture[key]), 'cleanup ' + table)

try:
    for role in roles:
        membership = require(call(role, 'GET', 'user_roles', params={
            'user_id': 'eq.' + sessions[role]['user']['id'], 'select': 'role'}), 'verify role').json()
        assert membership == [{'role': role}], 'Requires single-role test accounts'
    require(call('hrbp', 'POST', 'clients', json={'id': fixture['client'], 'name': '[TEST] Private chat'}), 'create client')
    require(call('hrbp', 'POST', 'talent_hub_cvs', json={'id': fixture['cv'], 'full_name': '[TEST] Chat candidate'}), 'create candidate')
    require(call('hrbp', 'POST', 'demands', json={'id': fixture['demand'], 'client_id': fixture['client'],
            'title': '[TEST] Candidate communication', 'engagement': 'freelance',
            'assigned_to': sessions['sourceur']['user']['id']}), 'create demand')
    require(call('hrbp', 'POST', 'demand_candidates', json={'id': fixture['dc'], 'demand_id': fixture['demand'], 'cv_id': fixture['cv']}), 'create candidature')

    for role in roles:
        for room in ['sourcing', 'operations']:
            allowed = role == 'hrbp' or (room == 'sourcing' and role == 'sourceur') or (room == 'operations' and role == 'operations')
            result = send(role, room)
            check(result.ok == allowed, f'{role} send {room}: {"allowed" if allowed else "denied"}')

    for role in roles:
        for room in ['sourcing', 'operations']:
            allowed = role == 'hrbp' or (room == 'sourcing' and role == 'sourceur') or (room == 'operations' and role == 'operations')
            rows = require(call(role, 'GET', 'candidate_chat_messages', params={
                'demand_candidate_id': 'eq.' + fixture['dc'], 'room': 'eq.' + room, 'select': '*'}), 'read messages').json()
            check(bool(rows) == allowed, f'{role} read {room}: {"visible" if allowed else "hidden"}')
            topic = f"candidate-chat:{fixture['dc']}:{room}"
            result = require(call(role, 'POST', 'rpc/candidate_chat_topic_allowed', json={'_topic': topic}), 'topic check').json()
            check(result == allowed, f'{role} private live topic {room}')

    check(not call('anon', 'GET', 'candidate_chat_messages').ok, 'anonymous message access denied')
    check(not send('sourceur', 'operations').ok, 'no Sourcer to Operations conversation')
    check(not send('hrbp', 'sourcing', sender_id=sessions['sourceur']['user']['id']).ok, 'sender impersonation denied')
    check(not send('hrbp', 'sourcing', body='   ').ok, 'blank message denied by database')
    check(not send('hrbp', 'sourcing', body='x' * 5001).ok, 'oversized message denied by database')

    msg = require(send('hrbp', 'sourcing', body='[TEST] Unread instructions', sender_name='FORGED', created_at='2099-01-01T00:00:00Z'), 'send unread instructions').json()[0]
    check(msg['sender_name'] != 'FORGED' and not msg['created_at'].startswith('2099'), 'server owns author label and time')
    before = require(call('sourceur', 'POST', 'rpc/candidate_chat_unread', json={'_dc': fixture['dc']}), 'unread check').json()
    check(any(row['room'] == 'sourcing' and row['unread'] > 0 for row in before), 'new incoming message is unread')
    require(call('sourceur', 'POST', 'rpc/mark_candidate_chat_read', json={'_dc': fixture['dc'], '_room': 'sourcing', '_through': msg['created_at']}), 'mark read')
    after = require(call('sourceur', 'POST', 'rpc/candidate_chat_unread', json={'_dc': fixture['dc']}), 'readback receipt').json()
    check(not any(row['room'] == 'sourcing' and row['unread'] > 0 for row in after), 'opening chat clears own unread count')
    check(not call('operations', 'POST', 'rpc/mark_candidate_chat_read', json={'_dc': fixture['dc'], '_room': 'sourcing', '_through': msg['created_at']}).ok, 'Operations cannot mark sourcing room read')
    check(not call('sourceur', 'POST', 'rpc/mark_candidate_chat_read', json={'_dc': fixture['dc'], '_room': 'operations', '_through': msg['created_at']}).ok, 'Sourcer cannot mark operations room read')
    check(not call('sourceur', 'POST', 'rpc/mark_candidate_chat_read', json={'_dc': fixture['dc'], '_room': 'sourcing', '_through': '2099-01-01T00:00:00Z'}).ok, 'future forged read receipt denied')
    check(not call('sourceur', 'POST', 'candidate_chat_reads', json={'user_id': sessions['hrbp']['user']['id'], 'demand_candidate_id': fixture['dc'], 'room': 'sourcing'}).ok, 'direct receipt impersonation denied')
    check(not call('hrbp', 'PATCH', 'candidate_chat_messages?id=eq.' + msg['id'], json={'room': 'operations'}).ok, 'moving existing message between audiences denied')
    check(not call('hrbp', 'DELETE', 'candidate_chat_messages?id=eq.' + msg['id']).ok, 'direct message deletion denied')
    require(call('hrbp', 'PATCH', 'demands?id=eq.' + fixture['demand'], json={'assigned_to': None}), 'unassign demand')
    check(require(call('sourceur', 'GET', 'candidate_chat_messages', params={'demand_candidate_id': 'eq.' + fixture['dc']}), 'read after reassignment').json() == [], 'Sourcer access revoked after reassignment')
    check(not send('sourceur', 'sourcing').ok, 'unassigned Sourcer cannot send')
    require(call('hrbp', 'PATCH', 'demands?id=eq.' + fixture['demand'], json={'assigned_to': sessions['sourceur']['user']['id']}), 'restore test assignment')
    if os.environ.get('KEEP_CHAT_FIXTURES') == '1':
        target = Path('/tmp/browser/candidate-chat/fixtures.json')
        target.write_text(json.dumps(fixture)); target.chmod(0o600)
    completed = True
finally:
    if not completed or os.environ.get('KEEP_CHAT_FIXTURES') != '1':
        cleanup()

print(f'{passed} candidate chat authorization checks passed')