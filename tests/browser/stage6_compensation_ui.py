"""Stage 6 real-browser acceptance (isolated draft only): CDI (EN desktop), CDD with return/resubmit (FR desktop),
Freelance (EN mobile), plus CEO read-only and Admin/no-role denial. Real password sign-in through the app UI.
Synthetic candidatures are created and removed automatically."""
import asyncio, contextlib, os, re, sys, uuid, requests
from pathlib import Path
from playwright.async_api import async_playwright, expect
U = os.environ['SUPABASE_URL'].rstrip('/'); PK = os.environ['SUPABASE_PUBLISHABLE_KEY']
assert '127.0.0.1' in U or 'localhost' in U, 'STOP: backend is not local'
APP = 'http://localhost:8080'; PW = 'Synth!Test2026'; DEMAND = '33333333-0000-4000-8000-000000000001'
SHOTS = Path(os.environ.get('SHOTS', '/tmp/browser/s6')); SHOTS.mkdir(parents=True, exist_ok=True)
tok = {r: requests.post(f'{U}/auth/v1/token?grant_type=password', headers={'apikey': PK}, json={'email': f'{r}@test.local', 'password': PW}).json()['access_token'] for r in ['ops', 'sourceur']}
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

async def set_values(page, dlg, ctype, amount, lang):
    await dlg.get_by_role('combobox', name=re.compile(T[lang]['ct'])).click()
    await page.get_by_role('option', name=ctype, exact=True).click()
    if amount is not None: await dlg.locator('input[type=number]').fill(str(amount))

async def full_case(browser, label, ctype, lang, mobile, src_amt, hr_amt, ops_amt, exp_type, hr_type=None, with_return=False):
    tag = f'{label}_{lang}_{"mobile" if mobile else "desktop"}'
    name, dc = fixture(label)
    # Sourceur
    ctx, page = await session(browser, 'sourceur', lang, mobile)
    dlg = await open_row(page, name, 'q_src', lang)
    await dlg.get_by_role('button', name=T[lang]['submit'], exact=True).click()
    check(f'{tag}: submission blocked without contract type (UI validation)', await dlg.get_by_role('alert').count() > 0)
    await set_values(page, dlg, ctype, None, lang)
    check(f'{tag}: correct amount field shown for {ctype}', await dlg.get_by_label(re.compile('TJM' if ctype == 'Freelance' else 'DM Salary')).count() == 1)
    await dlg.locator('input[type=number]').fill(str(src_amt))
    await page.screenshot(path=str(SHOTS / f'{tag}_1_sourceur_form.png'))
    await act(page, dlg, T[lang]['submit'], lang)
    p = prop(dc); check(f'{tag}: Sourceur submitted', p and p['status'] == 'pending_manager_review' and float(p['original_amount']) == src_amt, p and p['status'])
    await ctx.close()
    if with_return:
        ctx, page = await session(browser, 'hrbp', lang, mobile)
        dlg = await open_row(page, name, 'q_hrbp', lang)
        await act(page, dlg, T[lang]['ret_s'], lang, comment='Merci de préciser le package' if lang == 'fr' else 'Please detail the package')
        check(f'{tag}: HRBP returned to Sourceur', prop(dc)['status'] == 'returned_to_sourceur'); await ctx.close()
        ctx, page = await session(browser, 'sourceur', lang, mobile)
        dlg = await open_row(page, name, 'q_src', lang)
        await page.screenshot(path=str(SHOTS / f'{tag}_1b_sourceur_returned.png'))
        await dlg.locator('input[type=number]').fill(str(src_amt + 100))
        await act(page, dlg, T[lang]['submit'], lang)
        p = prop(dc); check(f'{tag}: Sourceur resubmitted; original preserved', p['status'] == 'pending_manager_review' and float(p['proposed_amount']) == src_amt + 100 and float(p['original_amount']) == src_amt)
        await ctx.close()
    # HRBP
    ctx, page = await session(browser, 'hrbp', lang, mobile)
    dlg = await open_row(page, name, 'q_hrbp', lang)
    if hr_type: await set_values(page, dlg, hr_type, hr_amt, lang)
    else: await dlg.locator('input[type=number]').fill(str(hr_amt))
    await page.screenshot(path=str(SHOTS / f'{tag}_2_hrbp_review.png'))
    await act(page, dlg, T[lang]['forward'], lang, comment='Revu' if lang == 'fr' else 'Reviewed')
    p = prop(dc); check(f'{tag}: HRBP amended and forwarded', p['status'] == 'pending_operations_review' and float(p['manager_amount']) == hr_amt)
    check(f'{tag}: HRBP issued no commercial financials request', not [u for u in page._reqs if 'candidate_financials' in u])
    await ctx.close()
    # Operations
    ctx, page = await session(browser, 'ops', lang, mobile)
    dlg = await open_row(page, name, 'q_ops', lang)
    await dlg.locator('input[type=number]').fill(str(ops_amt))
    await act(page, dlg, T[lang]['approve'], lang, comment='OK')
    await page.wait_for_timeout(800)
    await page.screenshot(path=str(SHOTS / f'{tag}_3_operations_approved.png'))
    p = prop(dc)
    check(f'{tag}: Operations approved; final recorded', p['status'] == 'approved' and p['final_contract_type'] == exp_type and float(p['final_amount']) == ops_amt and p['final_by'])
    check(f'{tag}: original / amended / final remain distinct', float(p['original_amount']) == src_amt and float(p['manager_amount']) == hr_amt and float(p['final_amount']) == ops_amt)
    check(f'{tag}: no page errors', not page._errs, page._errs)
    await ctx.close()
    return name, dc

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True)
        try:
            await full_case(b, 'CDI', 'CDI', 'en', False, 4200, 4100, 4150, 'cdi')
            n2, d2 = await full_case(b, 'CDD', 'CDD', 'fr', False, 3500, 3400, 3450, 'cdd', with_return=True)
            await full_case(b, 'FRL', 'Freelance', 'en', True, 550, 520, 530, 'freelance')
            # amendment of approved compensation + rejection (Operations, FR)
            ctx, page = await session(b, 'ops', 'fr')
            await page.goto(APP + '/compensation'); await page.get_by_role('tab', name=re.compile('Rémunérations approuvées')).click()
            row = page.locator('li', has_text=n2); await row.get_by_role('button', name=T['fr']['open']).click(); dlg = page.get_by_role('dialog')
            await act(page, dlg, T['fr']['amend'], 'fr', comment='Avenant client')
            check('AMD: approved compensation reopened for reapproval', prop(d2)['status'] == 'pending_operations_review')
            await act(page, dlg, T['fr']['reject'], 'fr', comment='Hors budget')
            check('REJ: Operations rejection recorded', prop(d2)['status'] == 'rejected')
            await page.screenshot(path=str(SHOTS / 'CDD_fr_desktop_4_amend_reject_history.png'))
            await ctx.close()
            # CEO read-only
            ctx, page = await session(b, 'ceo', 'en')
            await page.goto(APP + '/compensation'); await page.get_by_role('tab', name=re.compile('Approved compensation')).click()
            row = page.locator('li').filter(has_text='S6 UI CDI').first; await row.get_by_role('button', name='Open compensation').click()
            dlg = page.get_by_role('dialog'); await expect(dlg.get_by_text('Read-only view')).to_be_visible(timeout=15000)
            check('CEO: read-only (no action buttons, no form)', await dlg.get_by_text('Read-only view').count() == 1 and await dlg.locator('input[type=number]').count() == 0)
            await page.screenshot(path=str(SHOTS / 'ceo_readonly.png')); await ctx.close()
            for role in ['admin', 'norole']:
                ctx, page = await session(b, role, 'en')
                check(f'{role}: no Compensation menu entry', await page.get_by_role('link', name='Compensation').count() == 0)
                await page.goto(APP + '/compensation'); await page.wait_for_timeout(1500)
                check(f'{role}: direct URL shows no-access message', await page.get_by_text('does not include compensation access').count() == 1)
                await ctx.close()
            # dashboards
            for role, q in [('sourceur', 'sourceur'), ('hrbp', 'hrbp'), ('ops', 'operations')]:
                ctx, page = await session(b, role, 'en')
                el = page.get_by_test_id(f'comp-count-{q}'); await expect(el).to_be_visible(timeout=15000)
                check(f'dashboard {role}: pending compensation count shown', bool(re.match(r'^\d+', (await el.inner_text()).strip())))
                if role == 'ops': await page.screenshot(path=str(SHOTS / 'dashboard_operations.png'))
                await ctx.close()
        finally:
            await b.close()
            for dc in DCS: requests.delete(f'{U}/rest/v1/demand_candidates?id=eq.{dc}', headers=H('ops'))
            for cv in CVS: requests.delete(f'{U}/rest/v1/talent_hub_cvs?id=eq.{cv}', headers=H('ops'))
    f = sum(1 for s, _, _ in R if s == 'FAIL'); print(f'\n{len(R)-f}/{len(R)} PASS')
    for s, n, d in R:
        if s == 'FAIL': print('FAIL', n, d)
    sys.exit(1 if f else 0)
asyncio.run(main())
