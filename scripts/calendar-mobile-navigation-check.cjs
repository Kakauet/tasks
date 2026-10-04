const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const url = process.env.TEST_URL || 'http://127.0.0.1:3015'
const output = 'artifacts/calendar-mobile-navigation'
fs.mkdirSync(output, { recursive: true })
const event = {
  id: 'review', title: 'Revisión semanal', description: 'Repasar los próximos pasos.',
  date: '2026-09-12', isAllDay: true, isGraded: false, tags: [],
}

async function run(browser, mobile, width = 390) {
  const context = await browser.newContext({
    viewport: mobile ? { width, height: 844 } : { width: 1440, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
  })
  await context.route('**/*.supabase.co/**', route => route.abort())
  await context.addInitScript(({ event }) => {
    localStorage.setItem('taskmaster-visited', 'true')
    localStorage.setItem('taskmaster-state', JSON.stringify({ tasks: [], events: [event], tags: [] }))
    localStorage.setItem('taskmaster-calendar-state', JSON.stringify({
      savedAt: Date.now(), currentDate: '2026-09-15T12:00:00.000Z', selectedDate: '2026-09-15T12:00:00.000Z', view: 'month',
    }))
  }, { event })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const taskButton = mobile ? await page.getByRole('button', { name: 'Nueva', exact: true }).evaluate(el => {
    const style = getComputedStyle(el)
    return { height: style.height, padding: style.padding, background: style.backgroundColor, radius: style.borderRadius }
  }) : null
  await page.getByRole('tab', { name: 'Calendario', exact: true }).click()
  const createButton = page.getByRole('button', { name: mobile ? 'Nuevo' : 'Nuevo evento', exact: true })
  await createButton.waitFor()
  if (mobile) {
    assert.equal(await page.locator('.calendar-grid button[aria-label^="Crear evento el"]').count(), 0, 'Month cells have no create buttons on mobile')
    assert.deepEqual(await createButton.evaluate(el => {
      const style = getComputedStyle(el)
      return { height: style.height, padding: style.padding, background: style.backgroundColor, radius: style.borderRadius }
    }), taskButton, 'The mobile calendar create button matches the task create button')
    assert.equal(await page.locator('.calendar-grid').first().evaluate(el => getComputedStyle(el).borderRadius), '0px')
    assert(parseFloat(await page.locator('#calendar-panel .glass-card').first().evaluate(el => getComputedStyle(el).borderRadius)) > 0, 'The lower event section has rounded corners')
    const period = await page.locator('#calendar-panel span[title]').first().boundingBox()
    const create = await createButton.boundingBox()
    const monthTab = await page.getByRole('tab', { name: 'Mes', exact: true }).boundingBox()
    assert(Math.abs(period.y - create.y) < 12 && monthTab.y >= create.y + create.height, 'The mobile toolbar has two rows')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'The mobile toolbar fits the viewport')
    await page.screenshot({ path: `${output}/month-top-${width}.png`, scale: 'css' })
  }
  else assert(await page.locator('.calendar-grid button[aria-label^="Crear evento el"]').count() > 0, 'Desktop month cells keep their create buttons')

  const pill = () => page.locator('[data-calendar-drop-date="2026-09-12"] [data-calendar-event-id="review"]').first()
  await pill().waitFor()

  if (mobile) {
    for (const view of ['month', 'week']) {
      if (view === 'week') {
        await page.getByRole('tab', { name: 'Semana', exact: true }).click()
        await page.locator('[data-calendar-drop-date="2026-09-12"] [data-calendar-event-id="review"]').waitFor()
        assert.equal(await page.locator('[data-calendar-drop-date="2026-09-12"]').first().evaluate(el => getComputedStyle(el).borderRadius), '0px')
        await page.locator('#main-content').evaluate(el => { el.scrollTop = 0 })
        await page.waitForTimeout(350)
        const weekTitle = await page.locator('#calendar-panel span[title]').first().boundingBox()
        const weekCreate = await createButton.boundingBox()
        assert(weekCreate.x + weekCreate.width <= width && Math.abs(weekTitle.y - weekCreate.y) < 12, 'Week title and create button fit on the first row')
        await page.screenshot({ path: `${output}/week-top-${width}.png`, scale: 'css' })
      }
      await pill().click()
      const detail = page.locator('[data-calendar-detail-event-id="review"]')
      await detail.waitFor()
      await page.waitForFunction(() => {
        const detail = document.querySelector('[data-calendar-detail-event-id="review"]')
        const main = document.querySelector('#main-content')
        if (!detail || !main) return false
        const box = detail.getBoundingClientRect()
        const viewport = main.getBoundingClientRect()
        return box.top >= viewport.top && box.bottom <= viewport.bottom && main.scrollTop > 0
      })
      assert.equal(await page.getByRole('dialog', { name: 'Editar evento' }).count(), 0, `${view}: day pill must not open the edit dialog`)
      assert(await detail.locator('[role="button"]').evaluate(el => el === document.activeElement), `${view}: detail receives focus`)
      await page.screenshot({ path: `${output}/${view}-${width}.png`, scale: 'css' })
    }
    await page.locator('[data-calendar-detail-event-id="review"] [role="button"]').click()
    await page.getByRole('dialog', { name: 'Editar evento' }).waitFor()
  } else {
    await pill().click()
    await page.getByRole('dialog', { name: 'Editar evento' }).waitFor()
  }

  assert.deepEqual(errors, [])
  await context.close()
  console.log(`${mobile ? `Mobile ${width}px month/week navigation and layout` : 'Desktop direct event opening'} OK`)
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  try { await run(browser, true); await run(browser, true, 320); await run(browser, false) } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
