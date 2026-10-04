const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const url = process.env.TEST_URL || 'http://127.0.0.1:3210';
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? {width:390,height:844} : {width:1440,height:1000}, isMobile:mobile, hasTouch:mobile });
      await context.addInitScript(() => {
        localStorage.setItem('taskmaster-visited','true');
        localStorage.setItem('theme','dark');
        localStorage.setItem('taskmaster-accent-id','rose');
        localStorage.setItem('taskmaster-dark-mode-id','gray-dark');
      });
      // Keep QA local even when the workspace has Supabase credentials.
      await context.route('**/*.supabase.co/**', route => route.abort());
      let holdScripts = true;
      const releaseScripts = [];
      await context.route('**/_next/**', async route => {
        if (holdScripts && route.request().resourceType() === 'script') await new Promise(resolve => releaseScripts.push(resolve));
        await route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(url, {waitUntil:'commit'});
      await page.getByRole('tab', {name:'Tablero', exact:true}).waitFor();
      const firstPaint = await page.evaluate(() => ({primary:document.documentElement.style.getPropertyValue('--primary-light'), background:document.documentElement.style.getPropertyValue('--dark-background')}));
      holdScripts = false;
      releaseScripts.forEach(resolve => resolve());
      await page.getByRole('button', {name:/Nueva tarea/i}).first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'horizontal overflow');
      const before = await page.evaluate(() => ({primary:document.documentElement.style.getPropertyValue('--primary-light'), background:document.documentElement.style.getPropertyValue('--dark-background')}));
      assert.equal(before.background, '220 8% 7%');
      assert.deepEqual(firstPaint, before, 'appearance changed during hydration');
      await page.getByRole('tab', {name:'Calendario', exact:true}).click();
      await page.getByRole('button', {name:/Nuevo evento/i}).first().waitFor();
      await page.getByRole('tab', {name:'Tablero', exact:true}).click();
      await page.getByRole('button', {name:/Nueva tarea/i}).first().click();
      await page.getByRole('dialog').waitFor();
      await page.getByLabel('Título', {exact:true}).fill('Prueba de persistencia');
      await page.screenshot({path:`artifacts/${mobile?'mobile':'desktop'}-task-dialog.png`,fullPage:true});
      await page.getByRole('button', {name:'Crear tarea',exact:true}).click();
      await page.getByText('Prueba de persistencia', {exact:true}).waitFor();
      await page.getByRole('button', {name:'Configuración', exact:true}).click();
      await page.getByRole('button', {name:/Personalizar/i}).click();
      await page.getByRole('dialog', {name:'Personalizar'}).waitFor();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({state:'hidden'});
      await page.keyboard.press('Control+z');
      await page.getByText('Prueba de persistencia', {exact:true}).waitFor({state:'hidden'});
      await page.keyboard.press('Control+Shift+z');
      await page.getByText('Prueba de persistencia', {exact:true}).waitFor();
      await page.reload();
      await page.getByRole('button', {name:/Nueva tarea/i}).first().waitFor();
      await page.getByText('Prueba de persistencia', {exact:true}).waitFor();
      assert.deepEqual(await page.evaluate(() => ({primary:document.documentElement.style.getPropertyValue('--primary-light'), background:document.documentElement.style.getPropertyValue('--dark-background')})), before);
      await page.screenshot({path:`artifacts/${mobile?'mobile':'desktop'}-board.png`,fullPage:true});
      assert.deepEqual(errors, []);
      console.log(`${mobile?'Mobile':'Desktop'}: pre-hydration appearance, tabs, create task, undo/redo, appearance dialog, persistence, viewport and runtime errors OK`);
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
