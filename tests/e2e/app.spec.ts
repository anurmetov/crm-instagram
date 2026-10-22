import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/#pipeline'); await expect(page.getByRole('heading', { name: 'От диалога к сделке' })).toBeVisible(); });

test('creates and edits a contact, keeps it across sections and resets after reload', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: isMobile ? 'Добавить контакт' : 'Новый лид', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Имя', exact: true }).fill('Тестовый контакт');
  await dialog.getByRole('textbox', { name: 'Ник в Instagram' }).fill('test.contact');
  await dialog.getByRole('button', { name: 'Добавить контакт' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('searchbox').fill('test.contact');
  await page.getByRole('button', { name: 'Открыть контакт Тестовый контакт', exact: true }).filter({ visible: true }).click();
  await dialog.getByRole('combobox', { name: 'Этап сделки' }).click();
  await page.getByRole('option', { name: 'Переписка', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Заметки', exact: true }).fill('Важный контекст');
  await dialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(dialog).not.toBeVisible();
  await page.locator('a[href="#overview"]').filter({ visible: true }).first().click();
  await expect(page.locator('.leads-metric')).toContainText('21 контактов');
  await page.locator('a[href="#leads"]').filter({ visible: true }).first().click();
  await page.getByRole('searchbox').fill('test.contact');
  await expect(page.getByText('Важный контекст').filter({ visible: true })).toBeVisible();
  await page.reload();
  await page.getByRole('searchbox').fill('test.contact');
  await expect(page.getByRole('heading', { name: 'Никого не нашли' })).toBeVisible();
  await page.getByRole('searchbox').clear();
  await expect(page.locator('.lead-card').filter({ visible: true })).toHaveCount(20);
});

test('search, filters and cards work without a table view', async ({ page }) => {
  await page.getByRole('searchbox').fill('нет-такого-контакта'); await expect(page.getByRole('heading', { name: 'Никого не нашли' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть фильтры', exact: true }).click();
  await page.getByRole('switch', { name: 'Только горячие лиды' }).check();
  await page.getByRole('button', { name: /Показать/ }).click();
  await expect(page.getByText('Найдено контактов: 5')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Таблица', exact: true })).toHaveCount(0);
  await expect(page.locator('.lead-card').filter({ visible: true })).toHaveCount(5);
  await page.goto('/#leads');
  await expect(page.getByRole('heading', { name: 'База контактов' })).toBeVisible();
  await expect(page.locator('.lead-card').filter({ visible: true })).toHaveCount(20);
  await expect(page.locator('.leads-table, .view-toggle')).toHaveCount(0);
});

test('prevents duplicate handles and protects unsaved edits', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: isMobile ? 'Добавить контакт' : 'Новый лид', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Имя', exact: true }).fill('Дубликат'); await dialog.getByRole('textbox', { name: 'Ник в Instagram' }).fill('ALINA.SMM');
  await dialog.getByRole('button', { name: 'Добавить контакт' }).click();
  await expect(dialog.getByRole('alert')).toContainText('уже есть');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(dialog.getByText('Есть несохранённые изменения')).toBeVisible();
  await dialog.getByRole('button', { name: 'Не сохранять' }).click(); await expect(dialog).not.toBeVisible();
});

test('moves a deal with drag and drop or the mobile next-step button', async ({ page, isMobile }) => {
  if (isMobile) {
    await page.getByRole('button', { name: 'Перевести Алина Смирнова в Переписка', exact: true }).click();
    await page.getByRole('searchbox').fill('alina.smm');
    await expect(page.locator('.mobile-card-list .lead-card').getByText('Переписка', { exact: true })).toBeVisible();
    await page.getByRole('searchbox').clear();
    await page.evaluate(() => window.scrollTo(0, 1000));
    await expect(page.getByRole('searchbox')).toBeVisible();
    const searchPosition = await page.getByRole('searchbox').boundingBox();
    expect(searchPosition!.y).toBeLessThan(80);
    await page.getByRole('button', { name: 'Быстро добавить контакт' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  } else {
    await page.locator('.kanban .lead-card').filter({ hasText: 'Алина Смирнова' }).dragTo(page.locator('.kanban-column').nth(1), {
      sourcePosition: { x: 60, y: 25 }, targetPosition: { x: 100, y: 25 },
    });
    await expect(page.locator('.kanban-column').nth(1).getByRole('button', { name: 'Открыть контакт Алина Смирнова' })).toBeVisible();
  }
});

test('all sections fit narrow phones, tablets and desktop without page overflow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ['pipeline', 'leads', 'analytics', 'overview']) {
      await page.goto('/#' + section); await expect(page.locator('h1')).toBeVisible(); await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${section} at ${width}px`).toBe(true);
      await expect(page.locator('a[href="#tasks"], a[href="#integrations"], .card-next-action, .task-cell, .due-badge')).toHaveCount(0);
      await expect(page.locator('.view-toggle, .leads-table, .top-add, .owner-avatar')).toHaveCount(0);
    }
  }
  expect(errors).toEqual([]);
});

test('screenshots', async ({ page, isMobile }) => {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.preview/${isMobile ? 'mobile' : 'desktop'}-pipeline.png`, fullPage: !isMobile, animations: 'disabled', scale: 'css' });
  await page.goto('/#leads'); await page.getByRole('searchbox').fill('али');
  await page.screenshot({ path: `.preview/${isMobile ? 'mobile' : 'desktop'}-contacts.png`, fullPage: false, animations: 'disabled', scale: 'css' });
  if (isMobile) {
    await page.getByRole('button', { name: 'Добавить контакт', exact: true }).click();
    await page.screenshot({ path: '.preview/mobile-editor.png', fullPage: false, animations: 'disabled', scale: 'css' });
  }
});
