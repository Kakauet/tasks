// Focused visual regression checks for the design system. Playwright may be
// provided through NODE_PATH by the Codex workspace runtime.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const url = process.env.QA_URL || 'http://127.0.0.1:3000';
const output = path.resolve('artifacts/design-qa');
fs.mkdirSync(output, { recursive: true });

const timestamp = new Date().toISOString();
const fixture = {
  tasks: [
    {
      id: 'overdue',
      title: 'Preparar presentación de resultados',
      description: 'Primera línea de contexto.\nSegunda línea con decisiones pendientes.\nTercera línea con el siguiente paso.\nCuarta línea visible sin recortes.',
      status: 'todo',
      priority: 'high',
      dueDate: '2026-09-10',
      tags: ['work'],
      steps: [{ id: 'step-1', text: 'Revisar métricas', completed: false }],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: 'normal', title: 'Enviar resumen al equipo', description: 'Una tarea breve.', status: 'todo', priority: 'medium',
      tags: [], steps: [], createdAt: timestamp, updatedAt: timestamp,
    },
  ],
  events: [
    {
      id: 'review', title: 'Revisión semanal', description: 'Repasar métricas y próximos pasos.', date: '2026-09-12',
      startTime: '10:00', endTime: '10:45', isAllDay: false, isGraded: false, tags: ['work'], color: '#8b5cf6',
    },
    {
      id: 'delivery', title: 'Entrega de proyecto', description: 'Ventana completa de entrega.', date: '2026-09-10', endDate: '2026-09-12',
      isMultiDay: true, isAllDay: true, isGraded: true, grade: '9', tags: [], color: '#0ea5e9',
    },
  ],
  tags: [{ id: 'work', name: 'Trabajo', color: '#3b82f6' }],
};

async function prepare(context) {
  await context.addInitScript(({ fixture }) => {
    localStorage.setItem('taskmaster-state', JSON.stringify(fixture));
    localStorage.setItem('taskmaster-visited', 'true');
    localStorage.setItem('theme', 'dark');
  }, { fixture });
  await context.route('**/*.supabase.co/**', route => route.abort());
}

async function assertViewport(page, label) {
  const metrics = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert(metrics.scrollWidth <= metrics.clientWidth, `${label}: horizontal overflow`);
}

async function assertConcentric(outer, inner, label) {
  const geometry = await outer.evaluate((outerElement, innerElement) => {
    const outerBox = outerElement.getBoundingClientRect();
    const innerBox = innerElement.getBoundingClientRect();
    return {
      outerRadius: parseFloat(getComputedStyle(outerElement).borderTopLeftRadius),
      innerRadius: parseFloat(getComputedStyle(innerElement).borderTopLeftRadius),
      inset: innerBox.top - outerBox.top,
    };
  }, await inner.elementHandle());
  assert(Math.abs(geometry.outerRadius - geometry.innerRadius - geometry.inset) <= 1, `${label}: nested radii are not concentric`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await prepare(desktop);
    const page = await desktop.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const overdue = page.locator('.task-card-overdue');
    await overdue.waitFor();

    assert.equal(await page.getByText('Taskmaster', { exact: true }).count(), 0, 'header brand must be removed');
    const cloudButton = page.getByRole('button', { name: 'Abrir sincronización en la nube' });
    await cloudButton.click();
    const cloudMenu = page.getByRole('dialog', { name: 'Configuración del espacio' });
    await cloudMenu.getByText('Sincronización', { exact: true }).waitFor();
    await cloudMenu.getByText('No disponible', { exact: true }).waitFor();
    await cloudMenu.getByRole('button', { name: 'Reintentar conexión' }).waitFor();
    await cloudMenu.screenshot({ path: path.join(output, 'desktop-cloud-status.png') });
    await page.keyboard.press('Escape');

    const search = page.getByRole('searchbox', { name: 'Buscar tareas' });
    await assertConcentric(search.locator('xpath=../..'), search, 'board toolbar');
    const viewTabs = page.getByRole('tablist', { name: 'Vistas del espacio de trabajo' });
    await assertConcentric(viewTabs, viewTabs.getByRole('tab', { name: 'Tablero' }), 'main view tabs');

    const cardCheck = await overdue.evaluate(card => {
      const cardBox = card.getBoundingClientRect();
      const scrollBox = card.closest('.task-column-scroll').getBoundingClientRect();
      const style = getComputedStyle(card);
      const description = card.querySelector('.text-card-body');
      const descriptionStyle = getComputedStyle(description);
      return {
        cardTop: cardBox.top,
        scrollTop: scrollBox.top,
        borderTopWidth: style.borderTopWidth,
        borderTopColor: style.borderTopColor,
        lineClamp: descriptionStyle.webkitLineClamp,
        descriptionHeight: description.getBoundingClientRect().height,
        descriptionScrollHeight: description.scrollHeight,
      };
    });
    assert(cardCheck.cardTop >= cardCheck.scrollTop + 10, 'overdue card needs visible top breathing room');
    assert.equal(cardCheck.borderTopWidth, '1px', 'overdue top border must be painted');
    assert.notEqual(cardCheck.borderTopColor, 'rgba(0, 0, 0, 0)', 'overdue top border must be visible');
    assert(['none', ''].includes(cardCheck.lineClamp), 'task description must not be line-clamped');
    assert(cardCheck.descriptionHeight >= cardCheck.descriptionScrollHeight - 1, 'task description must use natural height');
    await assertViewport(page, 'desktop board');
    await page.screenshot({ path: path.join(output, 'desktop-board.png'), fullPage: true });

    await overdue.getByRole('button', { name: 'Editar tarea', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const description = dialog.getByLabel('Descripción', { exact: true });
    await description.waitFor();
    await description.fill('Breve');
    const shortHeight = await description.evaluate(element => element.getBoundingClientRect().height);
    await description.fill('Línea 1\nLínea 2\nLínea 3\nLínea 4\nLínea 5\nLínea 6\nLínea 7');
    const longHeight = await description.evaluate(element => element.getBoundingClientRect().height);
    assert(longHeight > shortHeight + 50, 'description editor must grow with its content');
    await description.fill('Vuelve a ser breve');
    const reducedHeight = await description.evaluate(element => element.getBoundingClientRect().height);
    assert(reducedHeight < longHeight, 'description editor must shrink when content is removed');
    await dialog.screenshot({ path: path.join(output, 'desktop-task-dialog.png') });
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: 'Calendario', exact: true }).click();
    await page.getByRole('button', { name: 'Nuevo Evento', exact: true }).waitFor();

    // Moving from the final segment of a multi-day event preserves the grabbed
    // segment under the pointer and therefore keeps the original duration.
    const deliveryEnd = page.locator('[data-date="2026-09-12"]').getByRole('button', { name: /Ver detalle de Entrega de proyecto/ });
    await deliveryEnd.dragTo(page.locator('[data-date="2026-09-14"]'));
    await page.waitForFunction(() => {
      const moved = JSON.parse(localStorage.getItem('taskmaster-state')).events.find(event => event.id === 'delivery');
      return moved?.date === '2026-09-12' && moved?.endDate === '2026-09-14';
    });

    const reviewEvent = page.getByRole('button', { name: /Ver detalle de Revisión semanal/ });
    await reviewEvent.click();
    const details = page.getByRole('dialog', { name: 'Revisión semanal' });
    await details.waitFor();
    await details.getByText('Repasar métricas y próximos pasos.', { exact: true }).waitFor();
    assert.equal(await details.getByRole('button', { name: 'Mover a otra fecha' }).count(), 1, 'event detail exposes touch-friendly move control');
    await details.getByRole('button', { name: 'Mover a otra fecha' }).click();
    await page.locator('[data-slot="calendar"] button').filter({ hasText: /^15$/ }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('taskmaster-state')).events.find(event => event.id === 'review')?.date === '2026-09-15');
    await details.screenshot({ path: path.join(output, 'desktop-event-details.png') });
    await details.getByRole('button', { name: 'Editar evento' }).click();
    await page.getByRole('dialog', { name: 'Editar evento' }).waitFor();
    await page.keyboard.press('Escape');

    await page.getByRole('tab', { name: 'Semana', exact: true }).click();
    const sunday = page.locator('[data-date="2026-09-20"]');
    await sunday.waitFor();
    const sundayBackground = await sunday.evaluate(element => getComputedStyle(element).backgroundColor);
    const alphaMatch = sundayBackground.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
    if (alphaMatch) assert(Number(alphaMatch[1]) <= 0.2, 'Sunday tint must remain subtle');
    await sunday.scrollIntoViewIfNeeded();
    await sunday.screenshot({ path: path.join(output, 'desktop-calendar-sunday.png') });
    await page.screenshot({ path: path.join(output, 'desktop-calendar-week.png'), fullPage: true });
    assert.deepEqual(errors, [], 'desktop runtime errors');
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await prepare(mobile);
    const phone = await mobile.newPage();
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(url, { waitUntil: 'domcontentloaded' });
    await phone.getByRole('searchbox', { name: 'Buscar tareas' }).waitFor();
    await phone.locator('.task-card-overdue').waitFor();
    assert.equal(await phone.getByText('Taskmaster', { exact: true }).count(), 0, 'mobile header brand must be removed');
    await phone.getByRole('button', { name: 'Abrir sincronización en la nube' }).tap();
    const mobileCloudMenu = phone.getByRole('dialog', { name: 'Configuración del espacio' });
    await mobileCloudMenu.getByText('Sincronización', { exact: true }).waitFor();
    await mobileCloudMenu.screenshot({ path: path.join(output, 'mobile-cloud-status.png') });
    await phone.keyboard.press('Escape');
    await assertViewport(phone, 'mobile board');
    await phone.screenshot({ path: path.join(output, 'mobile-board.png'), fullPage: true });
    await phone.locator('.task-card-overdue').getByRole('button', { name: 'Editar tarea', exact: true }).tap();
    await phone.getByRole('dialog').waitFor();
    await phone.screenshot({ path: path.join(output, 'mobile-task-dialog.png'), fullPage: true });
    await assertViewport(phone, 'mobile dialog');
    await phone.keyboard.press('Escape');
    await phone.getByRole('tab', { name: 'Calendario', exact: true }).tap();
    await phone.getByRole('button', { name: 'Nuevo', exact: true }).waitFor();
    await phone.getByRole('button', { name: /^Ir a Revisión semanal en eventos del día/ }).tap();
    const mobileEventDetails = phone.locator('[data-calendar-detail-event-id="review"]');
    await mobileEventDetails.waitFor();
    assert.equal(await phone.getByRole('dialog', { name: 'Editar evento' }).count(), 0, 'mobile calendar opens the lower event section');
    await phone.waitForTimeout(250);
    await mobileEventDetails.screenshot({ path: path.join(output, 'mobile-event-details.png') });
    assert.deepEqual(errors, [], 'browser runtime errors');
    await mobile.close();

    console.log('Design QA: cloud status/control, brand removal, concentric radii, event detail/move/drag, overdue border, natural descriptions, Sunday tint and desktop/mobile viewport checks OK');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
