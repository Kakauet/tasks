const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const url = process.env.TEST_URL || 'http://127.0.0.1:3015'
const output = 'artifacts/board-sort-qa'
fs.mkdirSync(output, { recursive: true })

async function run(browser, mobile, width = 390) {
  const context = await browser.newContext({ viewport: mobile ? { width, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile })
  await context.route('**/*.supabase.co/**', route => route.abort())
  await context.addInitScript(() => {
    if (localStorage.getItem('sort-qa-seeded')) return
    localStorage.setItem('sort-qa-seeded', 'true')
    const task = (id, title, status, day) => ({ id, title, status, description: '', priority: 'medium', tags: [], steps: [], createdAt: `2026-09-${day}T12:00:00.000Z`, updatedAt: `2026-09-${day}T12:00:00.000Z` })
    localStorage.setItem('taskmaster-state', JSON.stringify({ tasks: [task('todo-z', 'Zulu', 'todo', 10), task('todo-a', 'Alfa', 'todo', 11), task('progress-b', 'Tramo B', 'inProgress', 12), task('progress-a', 'Tramo A', 'inProgress', 13), task('done-z', 'Zeta', 'done', 14)], tags: [], events: [] }))
    localStorage.setItem('taskmaster-visited', 'true')
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-task-id="todo-z"]').waitFor({ timeout: 60000 })
  const visibleIds = () => page.locator('.task-column-scroll:visible [data-task-id]').evaluateAll(nodes => nodes.map(node => node.dataset.taskId))
  const todoList = page.getByRole('list', { name: 'Lista de tareas Por hacer' })
  const progressList = page.getByRole('list', { name: 'Lista de tareas En progreso' })
  const ids = list => list.locator('[data-task-id]').evaluateAll(nodes => nodes.map(node => node.dataset.taskId))
  if (mobile) {
    assert.equal(await page.getByRole('button', { name: /^Ordenar columna/ }).count(), 0)
    const sort = page.getByRole('button', { name: /^Ordenar todas las columnas/ })
    assert.equal(await sort.count(), 1)
    assert.equal(await sort.innerText(), '', 'Mobile sort only displays its icon')
    const sortBox = await sort.boundingBox()
    const filterBox = await page.getByRole('button', { name: 'Filtros', exact: true }).boundingBox()
    assert(sortBox.x + sortBox.width <= filterBox.x, 'Global sort sits before the filter')
    assert.equal(await page.locator('[aria-label^="Resumen de"]:visible').count(), 0, 'Priority counts are hidden on mobile')
    assert.equal(await page.locator('.task-column:visible [data-column-header]').first().evaluate(el => el.getBoundingClientRect().height), 0, 'Mobile column has no empty toolbar row')
    assert.equal(await page.getByRole('button', { name: 'Nueva', exact: true }).count(), 1)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Toolbar fits the viewport')
    await page.getByRole('button', { name: 'Filtros', exact: true }).click()
    await page.getByRole('button', { name: 'Media', exact: true }).click()
    assert.equal(await page.locator('.task-column-scroll:visible [data-task-id]').count(), 2, 'Filters still work')
    await page.getByRole('button', { name: 'Media', exact: true }).click()
    await page.getByRole('button', { name: 'Filtros', exact: true }).click()
  }
  else assert.equal(await page.getByRole('button', { name: /^Ordenar columna/ }).count(), 3)

  const sortLabel = title => mobile ? 'Ordenar todas las columnas' : `Ordenar columna ${title}`
  const chooseSort = async (title, option) => {
    const label = sortLabel(title)
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).click()
    await page.getByRole('dialog', { name: label, exact: true }).getByRole('button', { name: option, exact: true }).click()
    await page.getByRole('dialog', { name: label, exact: true }).waitFor({ state: 'hidden' })
  }

  await chooseSort('Por hacer', 'Nombre: A a Z')
  assert.deepEqual(mobile ? await visibleIds() : await ids(todoList), ['todo-a', 'todo-z'])
  await page.reload()
  await page.getByRole('button', { name: `${sortLabel('Por hacer')}. Actual: Nombre`, exact: true }).waitFor()
  assert.deepEqual(mobile ? await visibleIds() : await ids(todoList), ['todo-a', 'todo-z'], 'column order survives reload')
  const reopened = await context.newPage()
  await reopened.goto(url)
  await reopened.getByRole('button', { name: `${sortLabel('Por hacer')}. Actual: Nombre`, exact: true }).waitFor()
  await reopened.close()
  if (mobile) await page.getByRole('button', { name: /^En progreso 2$/ }).click()
  assert.deepEqual(mobile ? await visibleIds() : await ids(progressList), mobile ? ['progress-a', 'progress-b'] : ['progress-b', 'progress-a'], 'Mobile sort applies to other columns; desktop sort remains independent')

  assert.equal(await page.getByRole('button', { name: /^Ordenar todas las columnas/ }).count(), mobile ? 1 : 0)
  await chooseSort('En progreso', 'Creación: reciente')
  await page.waitForFunction(mobile => {
    const saved = JSON.parse(localStorage.getItem('taskmaster-column-sorts'))
    return saved.todo === (mobile ? 'newest' : 'name') && saved.inProgress === 'newest' && saved.done === (mobile ? 'newest' : 'manual')
  }, mobile)
  assert.deepEqual(mobile ? await visibleIds() : await ids(progressList), ['progress-a', 'progress-b'])
  await page.reload()
  await page.getByRole('button', { name: `${sortLabel('Por hacer')}. Actual: ${mobile ? 'Recientes' : 'Nombre'}`, exact: true }).waitFor()
  if (mobile) await page.getByRole('button', { name: /^En progreso 2$/ }).click()
  await page.getByRole('button', { name: `${sortLabel('En progreso')}. Actual: Recientes`, exact: true }).waitFor()
  await chooseSort('En progreso', 'Orden manual')
  assert.deepEqual(mobile ? await visibleIds() : await ids(progressList), ['progress-b', 'progress-a'])

  await page.getByRole('button', { name: mobile ? 'Nueva' : 'Nueva tarea', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('textbox', { name: 'Título', exact: true }).fill('Nueva arriba')
  if (!mobile) {
    // The global desktop create action defaults to todo; select the target column.
    await page.getByRole('dialog').getByRole('combobox', { name: /Estado/i }).click()
    await page.getByRole('option', { name: 'En progreso' }).click()
  }
  await page.getByRole('button', { name: 'Crear tarea', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByText('Nueva arriba', { exact: true }).waitFor()
  const first = (mobile ? await visibleIds() : await ids(progressList))[0]
  const newId = await page.getByText('Nueva arriba', { exact: true }).locator('xpath=ancestor::*[@data-task-id]').getAttribute('data-task-id')
  assert.equal(first, newId, 'new task appears first in its target column')
  if (mobile) {
    await page.getByRole('button', { name: /^Por hacer 2$/ }).click()
    assert.deepEqual(await visibleIds(), ['todo-z', 'todo-a'], 'Manual sort is restored across columns')
    const column = page.locator('.task-column:visible').first()
    const fade = await column.locator('.task-column-fade').boundingBox()
    const card = await column.locator('[data-task-id]').first().boundingBox()
    assert(card.y >= fade.y + fade.height + 2, 'First task remains outside the fade at the top')
    await page.setViewportSize({ width: 1440, height: 900 })
    assert.equal(await page.getByRole('button', { name: /^Ordenar todas las columnas/ }).count(), 0)
    assert.equal(await page.getByRole('button', { name: /^Ordenar columna/ }).count(), 3)
    assert.equal(await page.locator('[aria-label^="Resumen de"]:visible').count(), 3, 'Desktop priority counts remain visible')
    await page.setViewportSize({ width, height: 844 })
  }
  await page.screenshot({ path: `${output}/${mobile ? `mobile-${width}` : 'desktop'}.png`, scale: 'css' })
  assert.deepEqual(errors, [])
  await context.close()
  console.log(`${mobile ? `Mobile ${width}px` : 'Desktop'}: sort scope, reload/reopen persistence, toolbar, filters, create at top and runtime OK`)
}

async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
  try { await run(browser, false); await run(browser, true); await run(browser, true, 320) } finally { await browser.close() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
