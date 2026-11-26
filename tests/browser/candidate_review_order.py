"""Signed-in review workflow UI regression. Uses TEST_PASSWORD_<ROLE> env vars.
Run from the project root; creates and always removes run-scoped test records.
Screenshots stay under /tmp/browser/review-order.
"""
import asyncio, importlib.util, os
from pathlib import Path
from playwright.async_api import async_playwright, expect
spec=importlib.util.spec_from_file_location('review_order',Path(__file__).resolve().parents[1] / 'security' / 'candidate_review_order.py')
r=importlib.util.module_from_spec(spec); spec.loader.exec_module(r)
OUT=Path('/tmp/browser/review-order')
OUT.mkdir(parents=True, exist_ok=True)
async def signed_page(browser, role, viewport=None):
    opts={'storage_state': {'cookies': [], 'origins': [{'origin': 'http://localhost:8080', 'localStorage': [{'name':'i18nextLng','value':'en'}]}]}}
    if viewport: opts['viewport']=viewport
    context=await browser.new_context(**opts)
    page=await context.new_page()
    await page.goto('http://localhost:8080/auth')
    await page.locator('#si-email').fill(f'test.{role}@itroad.test')
    await page.locator('#si-pw').fill(os.environ['TEST_PASSWORD_'+role.upper()])
    await page.locator('form').first.get_by_role('button',name='Sign in',exact=True).click()
    await page.wait_for_url('**/dashboard')
    if not viewport: await page.get_by_role('link',name='Profile',exact=True).wait_for()
    return context,page
async def demand(page,f):
    await page.goto('http://localhost:8080/demands/'+f.demand)
    await page.get_by_role('link',name=f.name,exact=True).wait_for()
    await page.get_by_role('button',name='List',exact=True).click()
async def stage(page,label):
    # Demand selectors precede the candidate selector. Match the current stage badge.
    selector=page.get_by_role('combobox').filter(has=page.get_by_text(label,exact=True))
    await selector.click()
async def main():
    r.login(); f=r.Fixture()
    try:
      f.create()
      async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        ctx,page=await signed_page(browser,'sourceur')
        await demand(page,f)
        await stage(page,'Identified')
        await expect(page.get_by_role('option',name='For Screening/Approval',exact=True)).to_be_disabled()
        await page.get_by_role('option',name='Contacted',exact=True).click()
        await expect(page.get_by_role('combobox').filter(has=page.get_by_text('Contacted',exact=True))).to_be_visible()
        await page.get_by_role('button',name='Contact / Screening',exact=True).click()
        dlg=page.get_by_role('dialog')
        async def select(label,option):
            await dlg.get_by_label(label,exact=True).click()
            await page.get_by_role('option',name=option,exact=True).click()
        await select('Communication method','Phone')
        await dlg.get_by_label('Communication date and time',exact=True).fill('2026-11-26T13:30')
        await select('Employment status','Employed')
        await dlg.get_by_label('Availability / notice period',exact=True).fill('30 days')
        await dlg.get_by_label('Current contract type',exact=True).fill('CDI')
        await select('Current remuneration type','Salary')
        await dlg.get_by_label('Current salary / TJM',exact=True).fill('18000')
        await dlg.get_by_label('Country',exact=True).fill('Morocco')
        await dlg.get_by_label('City',exact=True).fill('Rabat')
        await dlg.get_by_role('button',name='Save',exact=True).click()
        await expect(page.get_by_text('Saved',exact=True)).to_be_visible()
        await dlg.screenshot(path=str(OUT/'1_contact_saved.png'))
        await dlg.get_by_role('button',name='Close',exact=True).click()
        await stage(page,'Contacted')
        await page.get_by_role('option',name='For Screening/Approval',exact=True).click()
        await expect(page.get_by_role('combobox').filter(has=page.get_by_text('For Screening/Approval',exact=True))).to_be_visible()
        await page.screenshot(path=str(OUT/'2_sourcer_screening.png'))
        assert f.read()['stage']=='screened'
        print('PASS UI: Sourcer completes contact and sends candidate for screening')
        await ctx.close()
        ctx,page=await signed_page(browser,'operations')
        assert await page.get_by_role('link',name=f.name,exact=False).count()==0
        print('PASS UI: candidate absent from Operations task queues before HRBP acceptance')
        await ctx.close()
        ctx,page=await signed_page(browser,'hrbp')
        await demand(page,f)
        await page.get_by_role('button',name='Qualify',exact=True).click()
        await page.get_by_role('dialog').get_by_role('button',name='Confirm',exact=True).click()
        await expect(page.get_by_text('Qualified',exact=True)).to_be_visible()
        assert f.read()['qualification_status']=='qualified'
        await page.screenshot(path=str(OUT/'3_hrbp_qualified.png'))
        print('PASS UI: HRBP qualification saved and read back')
        await ctx.close()
        ctx,page=await signed_page(browser,'operations')
        await page.get_by_role('link',name=f.name,exact=False).wait_for()
        await page.screenshot(path=str(OUT/'4_operations_review_queue.png'))
        await page.get_by_role('link',name=f.name,exact=False).click()
        await page.get_by_role('button',name='Final approve',exact=True).click()
        await page.get_by_role('dialog').get_by_role('button',name='Confirm',exact=True).click()
        await expect(page.get_by_text('Approved',exact=True)).to_be_visible()
        assert f.read()['final_decision']=='approved'
        await page.goto('http://localhost:8080/dashboard')
        await page.get_by_role('link',name=f.name,exact=False).wait_for()
        await page.screenshot(path=str(OUT/'5_operations_tjm_queue.png'))
        link=page.get_by_role('link',name=f.name,exact=False)
        assert await link.get_attribute('href')=='/financials'
        await link.click()
        row=page.get_by_role('row').filter(has_text=f.name)
        await row.get_by_role('button').click()
        dlg=page.get_by_role('dialog')
        await dlg.locator('input[type=number]').nth(0).fill('600')
        await dlg.locator('input[type=number]').nth(1).fill('400')
        await dlg.get_by_role('button',name='Save',exact=True).click()
        await expect(dlg).not_to_be_visible()
        await row.get_by_role('button',name='Approve TJM',exact=True).click()
        await expect(row.get_by_text('TJM approved',exact=True)).to_be_visible()
        await row.screenshot(path=str(OUT/'6_tjm_approved.png'))
        print('PASS UI: Operations review queue → candidate approval → TJM queue → TJM approval')
        await ctx.close()
        ctx,page=await signed_page(browser,'sourceur',{'width':390,'height':844})
        await demand(page,f)
        await stage(page,'For Screening/Approval')
        await expect(page.get_by_role('option',name='Submitted',exact=True)).to_be_enabled()
        await page.get_by_role('option',name='Submitted',exact=True).click()
        assert f.read()['stage']=='submitted'
        await page.screenshot(path=str(OUT/'7_mobile_submitted.png'))
        print('PASS UI: Sourcer proceeds to Submitted after both reviews on mobile')
        await browser.close()
    finally:
      f.cleanup()
asyncio.run(main())
