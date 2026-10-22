import { expect, test } from '@playwright/test';

test('edits and deletes offline without browser storage or API, then restores the demo on reload', async ({ page, context }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => {
    if (['fetch', 'xhr', 'websocket'].includes(request.resourceType())) requests.push(request.url());
  });
  page.on('websocket', socket => requests.push(socket.url()));
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(() => {
    for (const key of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(window, key, { get() { throw new Error('Browser storage is disabled'); } });
    }
  });
  await page.goto('/#leads');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.lead-card').filter({ visible: true })).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Подключение Instagram' })).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByRole('status')).toContainText('Можно продолжать работу');

  await page.getByRole('searchbox').fill('alina.smm');
  await page.getByRole('button', { name: 'Открыть контакт Алина Смирнова', exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Этап сделки' }).click();
  await page.getByRole('option', { name: 'Оплачено', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Заметки', exact: true }).fill('Изменено без сети');
  await dialog.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(dialog).not.toBeVisible();
  await page.locator('a[href="#overview"]').filter({ visible: true }).first().click();
  await expect(page.locator('.metric-big')).toHaveText('14');
  await expect(page.locator('.won-metric')).toContainText(/830\s€/);

  await page.locator('a[href="#leads"]').filter({ visible: true }).first().click();
  await page.getByRole('searchbox').fill('alina.smm');
  await expect(page.getByText('Изменено без сети').filter({ visible: true })).toBeVisible();
  await page.getByRole('button', { name: 'Открыть контакт Алина Смирнова', exact: true }).filter({ visible: true }).click();
  await dialog.getByRole('button', { name: 'Удалить контакт', exact: true }).click();
  await dialog.getByRole('button', { name: 'Да, удалить', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Никого не нашли' })).toBeVisible();
  await page.locator('a[href="#overview"]').filter({ visible: true }).first().click();
  await expect(page.locator('.leads-metric')).toContainText('19 контактов');
  await expect(page.locator('.won-metric')).toContainText(/630\s€/);

  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('.leads-metric')).toContainText('20 контактов');
  await expect(page.locator('.metric-big')).toHaveText('15');
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('ignores previous browser data and keeps tabs independent', async ({ page, context }) => {
  await context.addInitScript(() => {
    localStorage.setItem('potok-crm-v2', 'old unsupported data');
    localStorage.setItem('potok-crm-demo-v1', '[]');
  });
  await page.goto('/#leads');
  await expect(page.locator('.lead-card').filter({ visible: true })).toHaveCount(20);
  await page.getByRole('searchbox').fill('alina.smm');
  await page.getByRole('button', { name: 'Открыть контакт Алина Смирнова', exact: true }).filter({ visible: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Удалить контакт', exact: true }).click();
  await dialog.getByRole('button', { name: 'Да, удалить', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Никого не нашли' })).toBeVisible();

  const second = await context.newPage();
  await second.goto('/#leads');
  await expect(second.locator('.lead-card').filter({ visible: true })).toHaveCount(20);
  await expect(page.getByRole('heading', { name: 'Никого не нашли' })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem('potok-crm-v2'), localStorage.getItem('potok-crm-demo-v1')])).toEqual(['old unsupported data', '[]']);
  await second.close();
});
