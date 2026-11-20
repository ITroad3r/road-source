import os
"""Source-only UI regression. All auth/data traffic is mocked; never contacts a database.

Run from project root: python3 tests/browser/new_demand_access.py
Requires the existing preview at localhost:8080 and installed Python Playwright.
"""
import asyncio
import base64
import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

ROOT = Path.cwd()
OUT = Path('/tmp/browser/new-demand')
OUT.mkdir(parents=True, exist_ok=True)


def encoded(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')


async def main():
    # Read only the client URL to derive the storage key; never print configuration.
    config = {}
    for line in (ROOT / '.env').read_text().splitlines():
        if '=' in line:
            key, value = line.split('=', 1)
            config[key] = value.strip().strip('"').strip("'")
    # Prefer the running environment (drafts point the client at their own backend), then .env.
    host = urlparse(os.environ.get('VITE_SUPABASE_URL') or config['VITE_SUPABASE_URL']).hostname
    assert host
    storage_key = 'sb-' + host.split('.')[0] + '-auth-token'
    uid = '11111111-1111-4111-8111-111111111111'
    cid = '22222222-2222-4222-8222-222222222222'
    did = '33333333-3333-4333-8333-333333333333'
    user = {'id': uid, 'email': 'mock@example.invalid', 'aud': 'authenticated',
            'role': 'authenticated', 'app_metadata': {}, 'user_metadata': {},
            'created_at': '2026-01-01T00:00:00Z'}
    expiry = int(time.time()) + 3600
    token = encoded({'alg': 'HS256', 'typ': 'JWT'}) + '.' + encoded(
        {'sub': uid, 'exp': expiry, 'role': 'authenticated', 'aud': 'authenticated'}) + '.mock'
    session = {'access_token': token, 'refresh_token': 'mock-only', 'expires_at': expiry,
               'expires_in': 3600, 'token_type': 'bearer', 'user': user}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for role in ['hrbp', 'sourceur', 'ceo', 'admin', 'none', 'unknown', 'operations']:
            context = await browser.new_context(viewport={'width': 1280, 'height': 1800})
            page = await context.new_page()
            release = asyncio.Event()
            pending = asyncio.Event()
            reads = []
            writes = []
            clients = []

            async def intercept(route):
                request = route.request
                url = request.url
                if '/auth/v1/' in url or '/rest/v1/' in url:
                    endpoint = url.split('/rest/v1/')[-1].split('?')[0]
                    if '/auth/v1/user' in url:
                        data = user
                    elif endpoint == 'user_roles':
                        pending.set()
                        await release.wait()
                        data = [] if role == 'none' else [{'role': role}]
                    elif endpoint == 'rpc/list_team_members':
                        reads.append(endpoint)
                        data = [{'id': uid, 'full_name': 'Mock Operations'}]
                    elif request.method == 'POST':
                        payload = request.post_data_json
                        writes.append((endpoint, payload))
                        if endpoint == 'clients':
                            clients.append({'id': cid, 'name': payload['name'], 'industry': None})
                            data = {'id': cid}
                        elif endpoint == 'demands':
                            data = {'id': did}
                        else:
                            raise AssertionError('Unexpected mocked write: ' + endpoint)
                    elif request.method in ['GET', 'HEAD']:
                        reads.append(endpoint)
                        if endpoint == 'clients':
                            data = clients
                        elif endpoint == 'rpc/list_team_members':
                            data = [{'id': uid, 'full_name': 'Mock Operations'}]
                        elif endpoint == 'demands' and 'id=eq.' in url:
                            demand = {'id': did, 'title': '[mock] Engineer', 'lifecycle': 'open',
                                    'commercial_outcome': 'pending', 'engagement': 'freelance',
                                    'positions_count': 1, 'required_skills': [], 'clients': None}
                            data = demand if 'object' in request.headers.get('accept', '') else [demand]
                        else:
                            data = []
                    else:
                        raise AssertionError('Unexpected request method')
                    await route.fulfill(status=200, json=data)
                    return
                # Block every non-local request, including storage, realtime and assets.
                if urlparse(url).hostname != 'localhost':
                    await route.abort()
                    return
                await route.continue_()

            await context.route('**/*', intercept)
            await page.goto('http://localhost:8080', wait_until='domcontentloaded')
            await page.evaluate('([k,v]) => localStorage.setItem(k,v)', [storage_key, json.dumps(session)])
            await page.goto('http://localhost:8080/demands/new', wait_until='domcontentloaded')
            await asyncio.wait_for(pending.wait(), timeout=15)
            assert await page.get_by_role('heading', name='New Demand', exact=True).count() == 0
            assert 'clients' not in reads and 'rpc/list_team_members' not in reads
            release.set()
            if role != 'operations':
                await page.wait_for_url(re.compile(r'/dashboard(?:\?.*)?$'))
                assert await page.get_by_role('heading', name='New Demand', exact=True).count() == 0
                assert 'clients' not in reads and 'rpc/list_team_members' not in reads
                assert writes == []
            else:
                await page.get_by_role('heading', name='New Demand', exact=True).wait_for()
                await page.get_by_role('button', name='New client', exact=True).click()
                dialog = page.get_by_role('dialog')
                await dialog.locator('input').first.fill('[mock] Client')
                await dialog.get_by_role('button', name='Create client', exact=True).click()
                await dialog.wait_for(state='hidden')
                await page.get_by_role('combobox').first.click()
                await page.get_by_role('option', name='[mock] Client', exact=True).click()
                await page.get_by_placeholder('e.g. Senior React Engineer — 6 months').fill('[mock] Engineer')
                await page.screenshot(path=str(OUT / 'operations-form.png'))
                await page.get_by_role('button', name='Create demand', exact=True).click()
                await page.wait_for_url('**/demands/' + did)
                assert len(writes) == 2
                assert writes[0][0] == 'clients' and writes[0][1]['name'] == '[mock] Client'
                assert writes[1][0] == 'demands'
                assert writes[1][1]['client_id'] == cid
                assert writes[1][1]['title'] == '[mock] Engineer'
                assert writes[1][1]['created_by'] == uid
                assert 'clients' in reads and 'rpc/list_team_members' in reads
                await page.get_by_text('[mock] Engineer', exact=True).wait_for()
            await page.screenshot(path=str(OUT / (role + '-result.png')))
            print(role + ': PASS (loading gate, access, query isolation' +
                  (', mocked client + demand creation)' if role == 'operations' else ')'))
            await context.close()
        await browser.close()
    print('7 scenarios passed; no live auth/data requests or database writes.')


if __name__ == '__main__':
    asyncio.run(main())