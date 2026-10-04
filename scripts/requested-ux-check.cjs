const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

async function run(browser, mobile) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile })
  await context.route('**/*.supabase.co/**', route => route.abort())
  await context.addInitScript(() => {
    const base = { status: 'todo', description: '', tags: [], createdAt: '2026-09-30T12:00:00Z', updatedAt: '2026-09-30T12:00:00Z' }
    localStorage.setItem('taskmaster-visited', 'true')
    localStorage.setItem('taskmaster-state', JSON.stringify({ tags: [{ id: 'personal', name: 'Personal', color: '#10b981' }], events: [], tasks: [
      { ...base, id: 'z', title: 'Zulu', priority: 'high', dueDate: '2026-10-02', description: 'Descripción visible sin recortar información.', tags: ['personal'], steps: [{ id: 's1', text: 'Primero', completed: true }, { id: 's2', text: 'Segundo', completed: false }] },
      { ...base, id: 'a', title: 'Alfa', priority: 'low', steps: [] },
      { ...base, id: 'p', title: 'Tarea en progreso', status: 'inProgress', priority: 'medium', steps: [] },
    ] }))
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:3015')
  await page.locator('[data-task-id="z"]').waitFor({ timeout: 60000 })
  const summary = page.locator('[aria-label="Resumen de Por hacer"]:visible')
  assert.equal(await summary.getByLabel('1 de prioridad alta', { exact: true }).innerText(), '1')
  assert.equal(await summary.getByLabel('1 de prioridad baja', { exact: true }).innerText(), '1')
  assert.doesNotMatch(await summary.innerText(), /Alta|Media|Baja/)
  const header = await page.locator('[data-column-header]:visible').first().boundingBox()
  const counts = await summary.boundingBox()
  if (mobile) {
    const columnSort = await page.getByRole('button', { name: /^Ordenar columna Por hacer/ }).boundingBox()
    assert(counts.x + counts.width <= columnSort.x && Math.abs(counts.y + counts.height / 2 - columnSort.y - columnSort.height / 2) < 2, 'Mobile counts sit at the left of the column sort row')
    assert.equal(await page.locator('[data-column-header]:visible [aria-label^="Resumen de"]:visible').count(), 1, 'Mobile counts appear in the column header')
    await page.getByRole('button', { name: /^En progreso 1$/ }).click()
    await page.locator('[aria-label="Resumen de En progreso"]:visible').getByLabel('1 de prioridad media', { exact: true }).waitFor()
    await page.getByRole('button', { name: /^Por hacer 2$/ }).click()
  } else {
    assert(counts.y >= header.y && counts.y + counts.height <= header.y + header.height, 'Desktop counts live in column header')
  }
  assert.equal(await page.getByRole('button', { name: 'Ordenar todas las columnas' }).count(), 0)
  const card = page.locator('[data-task-id="z"]')
  const date = await card.locator('[data-task-card-due-date]').boundingBox()
  const tags = await card.locator('[data-task-card-tags]').boundingBox()
  assert(date.x + date.width <= tags.x, 'Due date sits to the left of tags')
  assert.equal(await card.locator('[data-task-card-summary] [data-task-card-due-date]').count(), 1, 'Due date is in the first row before tags')
  assert.equal(await card.locator('[data-task-card-due-date]').innerText(), '2 días')
  assert.doesNotMatch(await summary.innerText(), /Pasos/)
  assert.equal(await card.locator('[data-task-card-due-date] svg').count(), 0)
  await page.getByRole('searchbox').fill('Alfa')
  assert.equal(await summary.getByLabel('1 de prioridad alta', { exact: true }).count(), 0)
  assert.doesNotMatch(await summary.innerText(), /Pasos/)
  await page.getByRole('searchbox').fill('')
  await page.locator('[data-task-id="z"]').getByRole('button', { name: 'Editar tarea', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await page.waitForTimeout(250)
  assert.equal(await dialog.evaluate(el => el === document.activeElement), true, 'Existing task focuses the dialog')
  assert.equal(await page.getByLabel('Título', { exact: true }).evaluate(el => el.selectionEnd - el.selectionStart), 0, 'Title is not selected')
  await page.getByRole('checkbox', { name: 'Completar paso: Segundo', exact: true }).click()
  if (mobile) {
    await page.getByLabel('Descripción', { exact: true }).focus()
    // Simulate a keyboard shrinking/panning only the visual viewport.
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, 'height', { configurable: true, value: 380 })
      Object.defineProperty(visualViewport, 'offsetTop', { configurable: true, value: 70 })
      visualViewport.dispatchEvent(new Event('resize'))
    })
    await page.waitForTimeout(150)
    const bounds = await dialog.boundingBox()
    const save = await page.getByRole('button', { name: 'Guardar cambios', exact: true }).boundingBox()
    assert(bounds.y >= 70 && bounds.y + bounds.height <= 450, 'Dialog fits above keyboard')
    assert(save.y >= 70 && save.y + save.height <= 450, 'Save action stays visible')
    assert(await dialog.locator('form > div').nth(1).evaluate(el => el.scrollHeight > el.clientHeight), 'Form body remains scrollable')
    await page.screenshot({ path: 'artifacts/requested-ux/mobile-keyboard.png' })
    await page.evaluate(() => {
      delete visualViewport.height
      delete visualViewport.offsetTop
      visualViewport.dispatchEvent(new Event('resize'))
    })
  }
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  assert.match(await card.locator('[data-task-card-progress]').innerText(), /2\/2 pasos/)
  if (mobile) await page.setViewportSize({ width: 320, height: 740 })
  await page.locator('[data-task-id="z"]').getByRole('heading').evaluate(el => { el.textContent = 'Título largo de tarea que conserva toda la información visible' })
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow')
  await page.screenshot({ path: `artifacts/requested-ux/${mobile ? 'mobile' : 'desktop'}.png` })
  await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click()
  await dialog.waitFor()
  await page.waitForTimeout(250)
  assert.equal(await page.getByLabel('Título', { exact: true }).evaluate(el => el === document.activeElement), true, 'New tasks retain title focus')
  assert.deepEqual(errors, [])
  await context.close()
  console.log(`${mobile ? 'Mobile' : 'Desktop'}: counters, filters, edit/create focus, layout and runtime OK`)
}

async function main() {
  fs.mkdirSync('artifacts/requested-ux', { recursive: true })
  const browser = await chromium.launch({ headless: true, channel: 'msedge' })
  try { await run(browser, false); await run(browser, true) } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
