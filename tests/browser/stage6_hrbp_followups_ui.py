"""Stage 6 final rules: real-browser acceptance of HRBP rejection follow-ups (EN/FR, desktop/mobile) and Operations-only reopen."""
import asyncio, contextlib, os, re, sys, uuid, requests
from pathlib import Path
from playwright.async_api import async_playwright, expect
U = os.environ['SUPABASE_URL'].rstrip('/'); PK = os.environ['SUPABASE_PUBLISHABLE_KEY']
assert '127.0.0.1' in U or 'localhost' in U, 'STOP: backend is not local'
APP = 'http://localhost:8080'; PW = 'Synth!Test2026'; DEMAND = '33333333-0000-4000-8000-000000000001'
SHOTS = Path(os.environ.get('SHOTS', '/tmp/browser/s6_hrbp')); SHOTS.mkdir(parents=True, exist_ok=True)
tok = {r: requests.post(f'{U}/auth/v1/token?grant_type=password', headers={'apikey': PK}, json={'email': f'{r}@test.local', 'password': PW}).json()['access_token'] for r in ['ops', 'sourceur', 'hrbp']}
H = lambda r: {'apikey': PK, 'Authorization': 'Bearer ' + tok[r], 'Content-Type': 'application/json', 'Prefer': 'return=representation'}
R = []; CVS = []; DCS = []
def check(n, c, d=''): R.append(('PASS' if c else 'FAIL', n, str(d)[:150])); print(('PASS' if c else 'FAIL'), n, flush=True)
def fixture(label):
    name = f'[TEST] S6 UI {label} {uuid.uuid4().hex[:4]}'
    cv = requests.post(f'{U}/rest/v1/talent_hub_cvs', headers=H('sourceur'), json={'full_name': name}).json()[0]['id']; CVS.append(cv)
    dc = requests.post(f'{U}/rest/v1/demand_candidates', headers=H('sourceur'), json={'demand_id': DEMAND, 'cv_id': cv, 'stage': 'screened'}).json()[0]['id']; DCS.append(dc)
    return name, dc
def prop(dc):
    x = requests.get(f'{U}/rest/v1/compensation_proposals?demand_candidate_id=eq.{dc}&select=*', headers=H('ops')).json(); return x[0] if x else None

async def to_draft_db(route):
    try:
        if not route.request.frame.url.startswith(APP + '/'): return await route.abort()
        url = 'http://127.0.0.1:8001' + route.request.url.split('/_port_8001', 1)[1]
        await route.fulfill(response=await route.fetch(url=url, max_redirects=0, timeout=0))
    except Exception:
        with contextlib.suppress(Exception): await route.abort()

async def session(browser, role, lang='en', mobile=False):
    ctx = await browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 1800}, is_mobile=mobile, has_touch=mobile)
    await ctx.route(re.compile(r'^https?://[^/]+/_port_8001/'), to_draft_db)
    await ctx.add_init_script(r"""(() => { if (location.origin !== "http://localhost:8080") return;
      const W = WebSocket; WebSocket = new Proxy(W, { construct(t, a) {
        a[0] = String(a[0]).replace(/^wss?:[/][/][^/]+[/]_port_8001(?=[/])/, "ws://127.0.0.1:8001"); return Reflect.construct(t, a); } }); })()""")
    page = await ctx.new_page()
    errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
    reqs = []; page.on('request', lambda r: reqs.append(r.url))
    await page.goto(APP + '/auth'); await page.evaluate('l => localStorage.setItem("roadsource-lang", l)', lang)
    await page.goto(APP + '/auth')
    await page.fill('#si-email', f'{role}@test.local'); await page.fill('#si-pw', PW)
    await page.locator('form button[type=submit]').first.click()
    await page.wait_for_url(re.compile(r'/dashboard'), timeout=20000)
    page._errs = errors; page._reqs = reqs
    return ctx, page

T = {'en': {'open': 'Open compensation', 'confirm': 'Confirm', 'ct': 'Contract type', 'submit': 'Submit to manager', 'forward': 'Approve & forward to Operations',
            'approve': 'Approve compensation', 'ret_s': 'Return to Sourceur', 'reject': 'Reject', 'comment': 'Comment / justification', 'amend': 'Start amendment',
            'q_hrbp': 'Manager review queue', 'q_ops': 'Final approval queue', 'q_src': 'My proposals to complete'},
     'fr': {'open': 'Ouvrir la rémunération', 'confirm': 'Confirmer', 'ct': 'Type de contrat', 'submit': 'Soumettre au manager', 'forward': 'Valider & transmettre aux Opérations',
            'approve': 'Approuver la rémunération', 'ret_s': 'Renvoyer au sourceur', 'reject': 'Refuser', 'comment': 'Commentaire / justification', 'amend': 'Lancer un avenant',
            'q_hrbp': 'File de revue manager', 'q_ops': "File d'approbation finale", 'q_src': 'Mes propositions à compléter'}}

async def open_row(page, name, tab, lang):
    await page.goto(APP + '/compensation')
    await page.get_by_role('tab', name=re.compile(re.escape(T[lang][tab]))).click()
    row = page.locator('li', has_text=name)
    await expect(row).to_be_visible(timeout=15000)
    await row.get_by_role('button', name=T[lang]['open']).click()
    dlg = page.get_by_role('dialog'); await expect(dlg).to_be_visible(); return dlg

async def act(page, dlg, label, lang, comment=None):
    await dlg.get_by_role('button', name=label, exact=True).click()
    alert = page.get_by_role('alertdialog'); await expect(alert).to_be_visible()
    if comment: await alert.get_by_label(re.compile(re.escape(T[lang]['comment']))).fill(comment)
    await alert.get_by_role('button', name=T[lang]['confirm']).click()
    await expect(alert).to_be_hidden(timeout=15000)

L = {'en': {'recon': 'Request reconsideration', 'alt': 'Request alternative candidates', 'reopen': 'Reopen for renegotiation'},
     'fr': {'recon': 'Demander un réexamen', 'alt': 'Demander d’autres candidats', 'reopen': 'Rouvrir pour renégociation'}}
def rpc(r, dc, a, **kw):
    b = {'_demand_candidate_id': dc, '_action': a, **kw}
    x = requests.post(f'{U}/rest/v1/rpc/compensation_action', headers=H(r), json=b); assert x.ok, x.text; return x.json()[0]['version']
def rejected_fixture(label):
    name, dc = fixture(label)
    v = rpc('sourceur', dc, 'submit', _contract_type='cdi', _amount=5000, _currency='MAD')
    v = rpc('hrbp', dc, 'forward', _expected_version=v); rpc('ops', dc, 'reject', _expected_version=v, _comment='Over budget')
    return name, dc
def notes(r, dc, title): return requests.get(f'{U}/rest/v1/notifications?demand_candidate_id=eq.{dc}&title=eq.{title}&select=id', headers=H(r)).json()

async def hrbp_case(browser, lang, mobile):
    tag = f'{lang}_{"mobile" if mobile else "desktop"}'
    name, dc = rejected_fixture(tag)
    ctx, page = await session(browser, 'hrbp', lang, mobile)
    dlg = await open_row(page, name, 'q_hrbp', lang)
    await expect(dlg.get_by_role('button', name=L[lang]['recon'], exact=True)).to_be_visible()
    await expect(dlg.get_by_role('button', name=L[lang]['alt'], exact=True)).to_be_visible()
    check(f'{tag} HRBP has no reopen button', await dlg.get_by_role('button', name=L[lang]['reopen'], exact=True).count() == 0)
    check(f'{tag} actual currency shown (MAD)', 'MAD' in (await dlg.inner_text()))
    await page.screenshot(path=str(SHOTS / f'{tag}_1_hrbp_rejected.png'))
    await act(page, dlg, L[lang]['recon'], lang, 'Candidate is unique')
    check(f'{tag} reconsideration sent; still rejected', prop(dc)['status'] == 'rejected')
    check(f'{tag} Operations notified', len(notes('ops', dc, 'Compensation reconsideration requested')) >= 1)
    await act(page, dlg, L[lang]['alt'], lang, 'Please find other profiles')
    check(f'{tag} alternatives requested; still rejected', prop(dc)['status'] == 'rejected')
    check(f'{tag} Sourceur notified', len(notes('sourceur', dc, 'Alternative candidates requested')) >= 1)
    await page.screenshot(path=str(SHOTS / f'{tag}_2_hrbp_after.png'))
    check(f'{tag} no page errors', not page._errs, page._errs); await ctx.close()
    ctx, page = await session(browser, 'ops', lang, mobile)
    await page.goto(APP + '/compensation')
    for tab in await page.get_by_role('tab').all():
        await tab.click()
        with contextlib.suppress(Exception):
            await page.locator('li', has_text=name).first.wait_for(timeout=4000)
        if await page.locator('li', has_text=name).count(): break
    row = page.locator('li', has_text=name)
    if await row.count():
        await row.get_by_role('button', name=T[lang]['open']).click(); dlg = page.get_by_role('dialog')
    else:
        dlg = None
    if dlg is None:
        check(f'{tag} Operations can reach the rejected proposal', False, 'row not found'); await ctx.close(); return
    await act(page, dlg, L[lang]['reopen'], lang, 'Budget reviewed')
    check(f'{tag} Operations reopen -> back to HRBP', prop(dc)['status'] == 'returned_to_manager')
    await page.screenshot(path=str(SHOTS / f'{tag}_3_ops_reopened.png')); await ctx.close()

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            for lang, mobile in [('en', False), ('fr', False), ('en', True), ('fr', True)]:
                try: await hrbp_case(browser, lang, mobile)
                except Exception as e: check(f'{lang} {mobile} case crashed', False, e)
        finally:
            await browser.close()
            for dc in DCS: requests.delete(f'{U}/rest/v1/demand_candidates?id=eq.{dc}', headers=H('ops'))
            for cv in CVS: requests.delete(f'{U}/rest/v1/talent_hub_cvs?id=eq.{cv}', headers=H('ops'))
    fl = [r for r in R if r[0] == 'FAIL']
    for r in fl: print(r)
    print(f'{len(R)-len(fl)}/{len(R)} PASS'); sys.exit(1 if fl else 0)
asyncio.run(main())
