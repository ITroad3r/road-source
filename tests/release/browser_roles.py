"""Stage 5C: real UI sign-in per role (desktop + mobile, EN + FR) against the isolated draft, run-scoped users."""
import asyncio, re, sys, contextlib
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from fixtures import *
from playwright.async_api import async_playwright
OUT = '/tmp/browser/rel'; RES = []
async def main():
    setup()
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True)
        for k in ['sourceur', 'hrbp', 'ops', 'ceo', 'admin', 'multi', 'norole']:
            for vp, lang in [((1280, 1800), 'en'), ((390, 844), 'fr')]:
                ctx = await b.new_context(viewport={'width': vp[0], 'height': vp[1]})
                async def to_draft_db(route):
                    try:
                        if not route.request.frame.url.startswith('http://localhost:8080/'): return await route.abort()
                        url = 'http://127.0.0.1:8001' + route.request.url.split('/_port_8001', 1)[1]
                        await route.fulfill(response=await route.fetch(url=url, max_redirects=0, timeout=0))
                    except Exception:
                        with contextlib.suppress(Exception): await route.abort()
                await ctx.route(re.compile(r'^https?://[^/]+/_port_8001/'), to_draft_db)
                pg = await ctx.new_page(); errs = []
                pg.on('pageerror', lambda e: errs.append(str(e)))
                await pg.goto('http://localhost:8080/auth')
                await pg.evaluate("l => localStorage.setItem('roadsource-lang', l)", lang); await pg.reload()
                await pg.locator('input[type=email]').fill(email(k)); await pg.locator('input[type=password]').fill(PW)
                await pg.locator('button[type=submit]').click()
                await pg.wait_for_url(re.compile(r'/dashboard'), timeout=20000); await pg.wait_for_timeout(3000)
                txt = await pg.inner_text('body')
                raw = re.findall(r'\b[a-z]+(?:\.[a-zA-Z]+){1,}\b', txt); raw = [r for r in raw if not re.search(r'\.(test|com|ma|local)$', r)]
                overflow = await pg.evaluate('document.documentElement.scrollWidth > window.innerWidth + 1')
                fin = await pg.evaluate("performance.getEntriesByType('resource').some(e => e.name.includes('candidate_financials'))")
                await pg.screenshot(path=f'{OUT}/{k}-{lang}.png')
                ok = not errs and not raw and not overflow and (fin == (k in ('ops', 'ceo')) or k == 'ops')
                RES.append((k, lang, ok, dict(errs=errs[:2], rawkeys=raw[:3], overflow=overflow, financial_request=fin)))
                await ctx.close()
        await b.close()
try: asyncio.run(main())
finally: left = cleanup()
for r in RES: print('PASS' if r[2] else 'FAIL', r[0], r[1], r[3])
print('cleanup leftover users:', left); sys.exit(0 if all(r[2] for r in RES) and not left else 1)
