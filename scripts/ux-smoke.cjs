// Run against a local dev server. Uses isolated browser data, never a real profile.
// NODE_PATH may point to a runtime providing Playwright; no production dependency.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.QA_URL || 'http://127.0.0.1:3000';
const out = path.resolve('artifacts/ux-review');
fs.mkdirSync(out, { recursive: true });
const now = new Date().toISOString();
const task = (id, title, status, extra = {}) => ({ id, title, status, description: '', priority: 'medium', tags: [], steps: [], createdAt: now, updatedAt: now, ...extra });
const fixture = {
  tasks: [
    task('research', 'Entender lo que necesitan nuestros usuarios', 'todo', { description: 'Revisar las entrevistas y encontrar oportunidades para simplificar la experiencia.', priority: 'high', dueDate: '2026-09-11', tags: ['product'], steps: [{ id: 's1', text: 'Revisar entrevistas', completed: true }, { id: 's2', text: 'Compartir conclusiones', completed: false }] }),
    task('launch', 'Preparar el próximo lanzamiento', 'todo', { description: 'Documentación en https://example.com y checklist del equipo.', tags: ['design'] }),
    task('prototype', 'Dar forma a la nueva experiencia', 'inProgress', { description: 'Un recorrido más claro desde la primera visita.', tags: ['design', 'product'], steps: [{ id: 's3', text: 'Diseñar', completed: true }, { id: 's4', text: 'Validar', completed: false }] }),
    task('done', 'Definir las prioridades de la semana', 'done', { priority: 'low', tags: ['product'] }),
  ], events: [{ id: 'calendar-edit', title: 'Evento editable', description: 'Edición directa.', date: new Date().toISOString().slice(0, 10), tags: [], isAllDay: true, isGraded: false, color: '#3b82f6' }], tags: [{ id: 'product', name: 'Producto', color: '#60a5fa' }, { id: 'design', name: 'Diseño', color: '#a78bfa' }],
};
async function seed(context) {
  await context.addInitScript(({ fixture }) => {
    if (!localStorage.getItem('qa-seeded')) {
      localStorage.setItem('taskmaster-state', JSON.stringify(fixture));
      localStorage.setItem('taskmaster-visited', 'true');
      localStorage.setItem('theme', 'dark');
      localStorage.setItem('qa-seeded', 'true');
    }
  }, { fixture });
}
async function fit(page, name) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
}
async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await seed(context);
    const page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.getByRole('searchbox', { name: 'Buscar tareas' }).waitFor();
    await page.locator('.task-card').first().waitFor();
    await fit(page, 'desktop-board');
    // A drag beginning on a link/control must never move the surrounding card.
    const originalOrder = await page.evaluate(() => localStorage.getItem('taskmaster-state'));
    const link = page.locator('.task-card a').first();
    const destination = page.locator('.task-card').filter({ hasText: 'Dar forma a la nueva experiencia' });
    await link.dragTo(destination);
    assert.equal(await page.evaluate(() => localStorage.getItem('taskmaster-state')), originalOrder, 'Link drag moved a task');
    await page.locator('.task-card').first().getByRole('button', { name: 'Editar tarea', exact: true }).dragTo(destination);
    assert.equal(await page.evaluate(() => localStorage.getItem('taskmaster-state')), originalOrder, 'Control drag moved a task');
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
    // Dropping outside the board must cancel, even after hovering another card.
    const dragOrigin = await page.locator('.task-card').first().boundingBox();
    const dragTarget = await destination.boundingBox();
    await page.mouse.move(dragOrigin.x + 22, dragOrigin.y + 22);
    await page.mouse.down();
    await page.mouse.move(dragOrigin.x + 45, dragOrigin.y + 22, { steps: 5 });
    await page.mouse.move(dragTarget.x + 22, dragTarget.y + 22, { steps: 15 });
    await page.mouse.move(800, 25, { steps: 15 });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => localStorage.getItem('taskmaster-state')), originalOrder, 'Cancelled drag changed data');
    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    await page.getByRole('button', { name: 'Producto', exact: true }).focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.task-card').count(), 3, 'Keyboard tag filter');
    await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
    await page.getByRole('button', { name: 'Filtros', exact: true }).click();
    await page.getByRole('button', { name: 'Configuración', exact: true }).click();
    await page.getByRole('button', { name: 'Claro', exact: true }).click();
    await page.keyboard.press('Escape');
    await fit(page, 'desktop-light-board');
    await page.getByRole('button', { name: 'Configuración', exact: true }).click();
    await page.getByRole('button', { name: 'Oscuro', exact: true }).click();
    await page.keyboard.press('Escape');
    const search = page.getByRole('searchbox', { name: 'Buscar tareas' });
    await search.fill('imposible-no-existe');
    await page.getByRole('heading', { name: 'No encontramos esas tareas' }).waitFor();
    await fit(page, 'desktop-empty-search');
    await page.getByRole('button', { name: 'Ver todas las tareas' }).click();
    await page.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
    await page.getByLabel('Título', { exact: true }).fill('Tarea de validación');
    await page.getByLabel('Descripción', { exact: true }).fill('Creada desde los controles reales.');
    await page.getByRole('radio', { name: 'Alta', exact: true }).click();
    assert.equal(await page.getByRole('radio', { name: 'Alta', exact: true }).getAttribute('aria-checked'), 'true', 'Priority must be directly selectable');
    await page.getByRole('button', { name: 'Crear tarea', exact: true }).click();
    const created = page.locator('.task-card').filter({ hasText: 'Tarea de validación' });
    await created.waitFor();
    await created.getByRole('button', { name: 'Editar tarea', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('dialog').waitFor();
    await page.getByLabel('Título', { exact: true }).fill('Tarea validada');
    await page.getByLabel('Nuevo paso', { exact: true }).fill('Primer paso');
    await page.getByLabel('Nuevo paso', { exact: true }).press('Enter');
    await page.getByLabel('Nuevo paso', { exact: true }).fill('Segundo paso');
    await page.getByLabel('Descripción', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'Completar paso: Segundo paso', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Editar paso: Primer paso', exact: true }).click();
    await page.getByRole('textbox', { name: 'Texto del paso' }).fill('NO guardar al cancelar');
    await page.getByRole('textbox', { name: 'Texto del paso' }).press('Escape');
    await page.getByRole('button', { name: 'Editar paso: Primer paso', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Editar paso: Primer paso', exact: true }).click();
    await page.getByRole('textbox', { name: 'Texto del paso' }).fill('Paso editado');
    await page.getByRole('textbox', { name: 'Texto del paso' }).press('Enter');
    assert.equal(await page.getByRole('dialog').count(), 1, 'Editing a step must not submit the task');
    await page.getByRole('checkbox', { name: 'Completar paso: Paso editado' }).click();
    await page.getByRole('button', { name: 'Opciones del paso: Segundo paso', exact: true }).click();
    await page.getByRole('button', { name: 'Subir', exact: true }).click();
    assert((await page.getByRole('list', { name: 'Pasos de la tarea' }).getByRole('listitem').first().textContent()).includes('Segundo paso'));
    await fit(page, 'desktop-steps');
    await page.getByLabel('Nuevo paso', { exact: true }).fill('Paso pendiente al guardar');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.getByLabel('Estado de Tarea validada', { exact: true }).selectOption('inProgress');
    await page.getByRole('region', { name: /^En progreso/ }).getByText('Tarea validada', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Deshacer última acción' }).click();
    await page.getByRole('region', { name: /^Por hacer/ }).getByText('Tarea validada', { exact: true }).waitFor();
    const source = page.locator('.task-card').filter({ hasText: 'Tarea validada' });
    const target = page.locator('.task-card').filter({ hasText: 'Dar forma a la nueva experiencia' });
    // Free title area, not a handle. Commit only on drop.
    await source.dragTo(target, { sourcePosition: { x: 25, y: 20 }, targetPosition: { x: 60, y: 20 } });
    await page.getByRole('region', { name: /^En progreso/ }).getByText('Tarea validada', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-sonner-toast]').count(), 0, 'Dragging should be silent');
    await page.reload();
    await page.getByRole('region', { name: /^En progreso/ }).getByText('Tarea validada', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Herramientas', exact: true }).click();
    await page.getByRole('button', { name: 'Exportar Datos', exact: true }).click();
    await page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: /Exportar/ }) }).waitFor();
    await page.keyboard.press('Escape');
    if (await page.getByRole('button', { name: 'Exportar Datos', exact: true }).isVisible()) await page.keyboard.press('Escape');
    const toDelete = page.locator('.task-card').filter({ hasText: 'Tarea validada' });
    await toDelete.getByRole('button', { name: 'Editar tarea', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Completar paso: Paso pendiente al guardar', exact: true }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar tarea', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar tarea', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await toDelete.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Deshacer última acción' }).click();
    await toDelete.waitFor();
    await page.getByRole('tab', { name: 'Calendario', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo Evento', exact: true }).waitFor();
    await page.getByText('Evento editable', { exact: true }).first().click();
    await page.getByRole('dialog').getByRole('heading', { name: 'Editar evento', exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 1, 'Calendar events must open the full editor directly');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Mes siguiente' }).click();
    await fit(page, 'desktop-calendar');
    assert.deepEqual(errors, [], 'Browser runtime errors');
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await seed(mobile);
    const phone = await mobile.newPage();
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(url);
    await phone.getByRole('searchbox', { name: 'Buscar tareas' }).waitFor();
    await fit(phone, 'mobile-board');
    // Hold-to-drag on touch moves a task inside the active column.
    const touchSession = await mobile.newCDPSession(phone);
    const touchBefore = await phone.evaluate(() => JSON.parse(localStorage.getItem('taskmaster-state')).tasks.map(t => t.id));
    const touchSource = await phone.locator('.task-card').first().boundingBox();
    const touchTarget = await phone.locator('.task-card').nth(1).boundingBox();
    const touchDestinationY = touchTarget.y + touchTarget.height * 0.75;
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchSource.x + 20, y: touchSource.y + 20 }] });
    await phone.waitForTimeout(420);
    for (let i = 1; i <= 8; i++) {
      await touchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchSource.x + 20, y: touchSource.y + 20 + (touchDestinationY - touchSource.y - 20) * i / 8 }] });
    }
    await touchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await phone.waitForTimeout(250);
    const touchAfter = await phone.evaluate(() => JSON.parse(localStorage.getItem('taskmaster-state')).tasks.map(t => t.id));
    assert.notDeepEqual(touchAfter, touchBefore, 'Touch long-press must reorder tasks');
    await phone.getByRole('button', { name: /^En progreso 1/ }).click();
    await phone.getByText('Dar forma a la nueva experiencia', { exact: true }).waitFor();
    await phone.getByLabel('Estado de Dar forma a la nueva experiencia').selectOption('done');
    await phone.getByRole('button', { name: /^Completadas 2/ }).click();
    await phone.getByText('Dar forma a la nueva experiencia', { exact: true }).waitFor();
    await phone.getByRole('button', { name: 'Herramientas', exact: true }).tap();
    await phone.getByRole('button', { name: 'Gestionar etiquetas', exact: true }).waitFor();
    await fit(phone, 'mobile-tools');
    await phone.keyboard.press('Escape');
    await phone.getByRole('button', { name: 'Nueva tarea', exact: true }).click();
    await phone.getByRole('dialog').waitFor();
    await phone.getByLabel('Título', { exact: true }).fill('Tarea móvil');
    await phone.getByLabel('Nuevo paso', { exact: true }).fill('Paso desde móvil con un texto largo para comprobar que se distribuye bien en varias líneas.');
    await phone.getByRole('button', { name: 'Añadir paso', exact: true }).tap();
    const checkbox = phone.getByRole('checkbox', { name: /^Completar paso:/ });
    const checkboxRect = await checkbox.boundingBox();
    assert(Math.abs(checkboxRect.width - checkboxRect.height) < 1, 'Touch checkbox must stay square');
    await checkbox.tap();
    await fit(phone, 'mobile-task-dialog');
    await phone.keyboard.press('Escape');
    await phone.getByRole('tab', { name: 'Calendario', exact: true }).click();
    await phone.getByRole('button', { name: 'Nuevo Evento', exact: true }).waitFor();
    await fit(phone, 'mobile-calendar');
    await phone.setViewportSize({ width: 320, height: 740 });
    await fit(phone, 'small-mobile-calendar');
    await phone.getByRole('tab', { name: 'Tablero', exact: true }).click();
    await fit(phone, 'small-mobile-board');
    const denseContext = await browser.newContext({ viewport: { width: 1440, height: 800 } });
    await seed(denseContext);
    const dense = await denseContext.newPage();
    await dense.goto(url);
    await dense.getByRole('searchbox').waitFor().catch(async error => { console.log('Dense page:', await dense.locator('body').innerText()); await dense.screenshot({path:path.join(out,'dense-failure.png')}); throw error });
    await dense.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('taskmaster-state'));
      state.tasks = Array.from({ length: 35 }, (_, index) => ({ ...state.tasks[0], id: `dense-${index}`, title: `Tarea ${index + 1}`, status: 'todo' }));
      localStorage.setItem('taskmaster-state', JSON.stringify(state));
    });
    await dense.reload();
    await dense.locator('.task-card').first().waitFor();
    const scroller = dense.locator('.task-column-scroll').first();
    const bounds = await scroller.boundingBox();
    assert(bounds.y + bounds.height <= 800, 'Columns must fit the viewport');
    assert(await scroller.evaluate(el => el.scrollHeight > el.clientHeight), 'Dense column must scroll internally');
    await scroller.hover();
    await dense.mouse.wheel(0, 850);
    await dense.waitForTimeout(250);
    assert(await scroller.evaluate(el => el.scrollTop > 0), 'Wheel must scroll the column');
    assert.equal(await dense.evaluate(() => scrollY), 0, 'Board must not scroll the page');
    await fit(dense, 'desktop-dense-board');
    await dense.setViewportSize({ width: 390, height: 844 });
    await fit(dense, 'mobile-dense-board');
    const mobileBounds = await scroller.boundingBox();
    assert(mobileBounds.y + mobileBounds.height <= 844, 'Mobile column must fit viewport');
    assert.deepEqual(errors, [], 'Browser runtime errors');
    console.log('PASS: task CRUD/edit, step add/edit/cancel/complete/reorder, status, undo, whole-card drag, interactive drag guards, cancelled drag, persistence, keyboard filters, themes/settings, calendar, mobile controls, 35-task column scrolling, no overflow or runtime errors.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
