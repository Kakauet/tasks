const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const url = process.env.TEST_URL || 'http://127.0.0.1:3015'
const output = 'artifacts/mobile-dnd-refined'
fs.mkdirSync(output, { recursive: true })

async function seed(context) {
  await context.route('**/*.supabase.co/**', route => route.abort())
  await context.addInitScript(() => {
    if (localStorage.getItem('mobile-dnd-seeded')) return
    const now = new Date().toISOString()
    const task = (id, status = 'todo') => ({ id, title: `Tarea ${id}`, status, description: 'Preparar el siguiente paso del proyecto', priority: 'medium', tags: [], steps: [], createdAt: now, updatedAt: now })
    localStorage.setItem('taskmaster-state', JSON.stringify({ tasks: [task('Alfa'), task('Beta'), task('Gamma'), ...Array.from({ length: 15 }, (_, i) => task(`Extra ${i}`)), task('Destino', 'inProgress')], events: [], tags: [] }))
    localStorage.setItem('taskmaster-visited', 'true')
    localStorage.setItem('mobile-dnd-seeded', 'true')
  })
}

async function mobile(browser, width, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion })
  await seed(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-task-id="Alfa"]').waitFor()
  const cdp = await context.newCDPSession(page)
  const center = async locator => { const b = await locator.boundingBox(); assert(b); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  const send = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ ...p, id: 1 }] : [] })
  const surface = id => page.locator(`[data-task-id="${id}"] [data-task-card-summary]`)
  const start = async (id, jitter = false, area = 'title') => {
    const locator = area === 'button' ? page.locator(`[data-task-id="${id}"] .task-card-actions button`).first()
      : area === 'description' ? page.locator(`[data-task-id="${id}"] [data-task-card-subtitle]`)
      : surface(id)
    await locator.scrollIntoViewIfNeeded()
    const p = await center(locator)
    await send('touchStart', p)
    if (jitter) { await page.waitForTimeout(100); await send('touchMove', { x: p.x + 3, y: p.y + 2 }) }
    await page.waitForTimeout(430)
    assert.equal(await page.locator('.task-drag-layer').count(), 1, 'hold must start a drag')
    assert.equal(await page.locator('.mobile-dropbar').count(), 0, 'no bottom drop bar')
  }
  const move = async p => { await send('touchMove', p); await page.waitForTimeout(100) }
  const finish = async (type = 'touchEnd') => { await send(type); await page.waitForTimeout(650); assert.equal(await page.locator('.task-drag-layer').count(), 0); assert.equal(await page.locator('[data-drag-landing]').count(), 0) }
  const ids = () => page.locator('.task-column-scroll:visible [data-task-id]').evaluateAll(nodes => nodes.map(node => node.dataset.taskId))
  const saved = () => page.evaluate(() => localStorage.getItem('taskmaster-state'))
  const tab = status => page.locator(`[data-mobile-column-status="${status}"]`)

  await page.waitForTimeout(650)
  let before = await saved()
  await start('Alfa', true)
  const preview = await page.locator('.task-drag-layer').boundingBox()
  assert(preview.x >= 0 && preview.x + preview.width <= width, 'preview must fit viewport')
  await page.screenshot({ path: `${output}/${width}-${reducedMotion}-active.png`, scale: 'css' })
  await finish()
  assert.equal(await saved(), before, 'releasing at origin must be a no-op')

  await start('Alfa', false, 'button')
  const beta = await page.locator('[data-task-id="Beta"]').boundingBox()
  await move({ x: beta.x + 80, y: beta.y + beta.height - 20 })
  assert.equal(await page.locator('[data-task-id="Beta"]').getAttribute('data-drop-placement'), 'after')
  await finish()
  assert.deepEqual((await ids()).slice(0, 3), ['Beta', 'Alfa', 'Gamma'])
  assert.equal(await page.locator('.mobile-dropbar').count(), 0)

  // Open another column and return to the source without ending the gesture.
  await start('Beta')
  await move(await center(tab('inProgress')))
  await page.waitForTimeout(500)
  assert.equal(await tab('inProgress').getAttribute('aria-pressed'), 'true')
  await move(await center(tab('todo')))
  await page.waitForTimeout(500)
  assert.equal(await tab('todo').getAttribute('aria-pressed'), 'true')
  await move(await center(tab('done')))
  await finish()
  assert.deepEqual(await ids(), ['Beta'], 'drop into empty column')
  await page.screenshot({ path: `${output}/${width}-${reducedMotion}-settled.png`, scale: 'css' })

  await tab('todo').tap()
  before = await saved()
  await start('Alfa')
  await move(await center(tab('inProgress')))
  await page.waitForTimeout(500)
  assert.equal(await tab('inProgress').getAttribute('aria-pressed'), 'true')
  await finish('touchCancel')
  assert.equal(await tab('todo').getAttribute('aria-pressed'), 'true', 'cancel restores source column')
  assert.equal(await saved(), before, 'OS cancellation must not commit a move')

  await start('Alfa')
  const scroll = page.locator('.task-column-scroll:visible')
  const rect = await scroll.boundingBox()
  // Finger is outside the list both vertically and horizontally.
  await move({ x: width - 2, y: Math.min(840, rect.y + rect.height + 6) })
  const scrollBefore = await scroll.evaluate(node => node.scrollTop)
  await page.waitForTimeout(750)
  const scrollAfter = await scroll.evaluate(node => node.scrollTop)
  assert(scrollAfter > scrollBefore + 80, `downward auto-scroll outside list: ${scrollBefore} -> ${scrollAfter}`)
  assert.equal(await scroll.getAttribute('data-drag-scroll'), 'down')
  await move({ x: 2, y: rect.y - 8 })
  await page.waitForTimeout(650)
  assert(await scroll.evaluate(node => node.scrollTop) < scrollAfter - 80, 'upward auto-scroll outside list')
  assert.equal(await scroll.getAttribute('data-drag-scroll'), 'up')
  await finish('touchCancel')
  assert.equal(await scroll.getAttribute('data-drag-scroll'), null, 'scroll feedback is cleared')

  await scroll.evaluate(node => node.scrollTop = 0)
  const p = await center(surface('Alfa'))
  await send('touchStart', p)
  for (let i = 1; i <= 8; i++) { await send('touchMove', { x: p.x, y: p.y - i * 18 }); await page.waitForTimeout(20) }
  await finish()
  assert(await scroll.evaluate(node => node.scrollTop) > 0, 'normal swipe must scroll')
  assert.equal(await page.locator('.mobile-dropbar').count(), 0)

  await scroll.evaluate(node => node.scrollTop = 0)
  // Short taps on controls keep their original meaning.
  await page.locator('[data-task-id="Alfa"] .task-card-actions button').first().tap()
  assert.equal(await page.getByRole('dialog').count(), 1, 'short tap opens task editing')
  assert.equal(await page.locator('.mobile-dropbar').count(), 0)
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.waitForTimeout(200)
  await start('Alfa', false, 'description')
  await move(await center(tab('inProgress')))
  await finish()
  assert.equal(await tab('inProgress').getAttribute('aria-pressed'), 'true')
  assert.deepEqual(await ids(), ['Alfa', 'Destino'])
  assert.equal(await page.locator('[data-task-move-handle], .task-move-trigger').count(), 0, 'no drag icon')

  // Rapid successive gestures must not leave a preview or hidden landing card behind.
  await start('Alfa')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  await send('touchEnd')
  assert.equal(await page.locator('.task-drag-layer').count(), 0)
  await start('Alfa')
  await move({ x: 2, y: 4 })
  await finish()
  assert.deepEqual(await ids(), ['Alfa', 'Destino'])
  await tab('todo').tap()
  await page.getByRole('searchbox', { name: 'Buscar tareas' }).fill('Extra')
  await page.getByRole('button', { name: 'Ordenar todas las columnas' }).click()
  await page.getByRole('button', { name: 'Nombre: A a Z', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(650)
  before = await saved()
  await start('Extra 0')
  const sortedTarget = await page.locator('[data-task-id="Extra 1"]').boundingBox()
  await move({ x: sortedTarget.x + 80, y: sortedTarget.y + sortedTarget.height - 20 })
  assert.equal(await page.locator('[data-drop-placement]').count(), 0)
  await finish()
  assert.equal(await saved(), before, 'drag cannot overwrite automatic order')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  assert.deepEqual(errors, [])
  await context.close()
  console.log(`Mobile ${width}px (${reducedMotion}): jitter, no-op, reorder, hold on buttons and description, dwell, empty drop, cancel, outside-edge auto-scroll, native scroll, short tap, Escape, outside drop, viewport and runtime OK`)
}

async function desktop(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await seed(context)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-task-id="Alfa"]').waitFor()
  const column = page.getByRole('list', { name: 'Lista de tareas Por hacer' })
  const bounds = await column.boundingBox()
  const source = await page.locator('[data-task-id="Alfa"] [data-task-card-summary]').boundingBox()
  const origin = { x: source.x + source.width / 2, y: source.y + source.height / 2 }
  await page.mouse.move(origin.x, origin.y)
  await page.mouse.down()
  await page.mouse.move(origin.x, origin.y + 20, { steps: 5 })
  await page.locator('.task-drag-layer').waitFor()
  await page.mouse.move(bounds.x - 8, Math.min(992, bounds.y + bounds.height + 7), { steps: 8 })
  const beforeDown = await column.evaluate(node => node.scrollTop)
  await page.waitForTimeout(700)
  const afterDown = await column.evaluate(node => node.scrollTop)
  assert(afterDown > beforeDown + 70, `desktop downward auto-scroll outside list: ${beforeDown} -> ${afterDown}`)
  await page.mouse.move(bounds.x - 8, bounds.y - 8, { steps: 8 })
  await page.waitForTimeout(650)
  assert(await column.evaluate(node => node.scrollTop) < afterDown - 70, 'desktop upward auto-scroll outside list')
  await page.mouse.up()
  await page.waitForTimeout(250)
  assert.equal(await column.getAttribute('data-drag-scroll'), null)
  await page.locator('[data-task-id="Alfa"]').dragTo(page.locator('[data-task-id="Destino"]'))
  await page.waitForTimeout(500)
  assert.equal(await page.getByRole('list', { name: 'Lista de tareas En progreso' }).locator('[data-task-id="Alfa"]').count(), 1)
  assert.equal(await page.locator('.mobile-dropbar').count(), 0)
  assert.equal(await page.locator('.task-drag-layer').count(), 0)
  await page.screenshot({ path: `${output}/desktop.png`, scale: 'css' })
  assert.deepEqual(errors, [])
  await context.close()
  console.log('Desktop mouse drag, outside-edge auto-scroll and runtime: OK')
}

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
  try {
    if (!process.env.TEST_DESKTOP_ONLY) {
      await mobile(browser, 390)
      await mobile(browser, 320, 'reduce')
    }
    await desktop(browser)
  } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
