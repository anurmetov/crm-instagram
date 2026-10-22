import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', { name: 'От диалога к сделке' })).toBeVisible(); });

test('creates, edits and retains a contact after reload', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: isMobile ? 'Добавить контакт' : 'Новый контакт', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Имя', exact: true }).fill('Тестовый контакт');
  await dialog.getByRole('textbox', { name: 'Ник в Instagram' }).fill('test.contact');
  await dialog.getByRole('textbox', { name: 'Что нужно сделать?' }).fill('Отправить предложение');
  await dialog.getByRole('button', { name: 'Добавить контакт' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('searchbox').fill('test.contact');
  await page.getByRole('button', { name: 'Открыть контакт Тестовый контакт', exact: true }).filter({ visible: true }).click();
  await dialog.getByRole('combobox', { name: 'Этап сделки' }).selectOption('dialogue');
  await dialog.getByRole('textbox', { name: 'Заметки', exact: true }).fill('Важный контекст');
  await dialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await page.reload();
  await page.getByRole('searchbox').fill('test.contact');
  await expect(page.getByText('Важный контекст').filter({ visible: true })).toBeVisible();
});

test('search, filters, empty state and responsive table work', async ({ page }) => {
  await page.getByRole('searchbox').fill('нет-такого-контакта'); await expect(page.getByRole('heading', { name: 'Никого не нашли' })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть фильтры', exact: true }).click();
  await page.getByRole('switch', { name: 'Только горячие лиды' }).check();
  await page.getByRole('button', { name: /Показать/ }).click();
  await expect(page.getByText('Найдено контактов: 5')).toBeVisible();
  await page.getByRole('button', { name: 'Таблица', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await page.getByRole('checkbox', { name: 'Выбрать Алина Смирнова' }).check();
  await page.getByRole('combobox', { name: 'Этап для выбранных контактов' }).selectOption('dialogue');
  await expect(page.getByText('Выбрано: 1')).not.toBeVisible();
  await expect(page.locator('tbody tr').filter({ hasText: 'Алина Смирнова' }).getByText('Переписка')).toBeVisible();
});

test('prevents duplicate handles and protects unsaved edits', async ({ page, isMobile }) => {
  await page.getByRole('button', { name: isMobile ? 'Добавить контакт' : 'Новый контакт', exact: true }).click();
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

test('tasks complete with undo, integration demo deduplicates and CSV downloads', async ({ page }) => {
  await page.goto('/#tasks');
  const firstTask = page.getByRole('button', { name: /^Завершить:/ }).first(), taskLabel = await firstTask.getAttribute('aria-label');
  await firstTask.click(); await expect(page.getByRole('button', { name: taskLabel!, exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Отменить', exact: true }).click(); await expect(page.getByRole('button', { name: taskLabel!, exact: true })).toBeVisible();
  await page.goto('/#integrations'); await page.locator('.integration-card').getByRole('button', { name: 'Тестовое входящее', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'В воронку', exact: true }).click();
  await page.locator('.integration-card').getByRole('button', { name: 'Тестовое входящее', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'В воронку', exact: true }).click();
  await expect(page.getByText('Входящее записано. Текущий этап сохранён.')).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Скачать контакты', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^potok-.*\.csv$/);
  await page.goto('/#leads'); await page.getByRole('searchbox').fill('anastasia.new'); await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('all sections fit narrow phones, tablets and desktop without page overflow', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const section of ['pipeline', 'leads', 'tasks', 'analytics', 'integrations']) {
      await page.goto('/#' + section); await expect(page.locator('h1')).toBeVisible(); await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${section} at ${width}px`).toBe(true);
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
