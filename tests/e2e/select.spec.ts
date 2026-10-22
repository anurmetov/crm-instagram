import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, isMobile }) => {
  await page.goto('/#pipeline');
  await page.getByRole('button', { name: isMobile ? 'Добавить контакт' : 'Новый лид', exact: true }).click();
});

test('chooses a stage and source, preserves form values and warns about unsaved selection', async ({ page, isMobile }) => {
  const dialog = page.getByRole('dialog'), stage = dialog.getByRole('combobox', { name: 'Этап сделки', exact: true });
  await stage.click();
  await expect(page.getByRole('listbox', { name: 'Этап сделки' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Новые лиды', exact: true })).toHaveAttribute('aria-selected', 'true');
  const booked = page.getByRole('option', { name: 'Созвон назначен', exact: true });
  if (isMobile) await booked.tap(); else await booked.click();
  await expect(stage).toContainText('Созвон назначен');
  await expect(stage).toHaveAttribute('aria-expanded', 'false');
  await expect(stage).toBeFocused();
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(dialog.getByText('Есть несохранённые изменения')).toBeVisible();
  await dialog.getByRole('button', { name: 'Продолжить', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Источник', exact: true }).click();
  const instagram = page.getByRole('option', { name: 'Instagram', exact: true });
  if (isMobile) await instagram.tap(); else await instagram.click();
  await dialog.getByRole('textbox', { name: 'Имя', exact: true }).fill('Выбор из меню');
  await dialog.getByRole('textbox', { name: 'Ник в Instagram' }).fill('menu.selection');
  await dialog.getByRole('button', { name: 'Добавить контакт', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('searchbox').fill('menu.selection');
  await page.getByRole('button', { name: 'Открыть контакт Выбор из меню', exact: true }).filter({ visible: true }).click();
  await expect(stage).toContainText('Созвон назначен');
  await expect(dialog.getByRole('combobox', { name: 'Источник', exact: true })).toContainText('Instagram');
});

test('keyboard navigation, typeahead, Escape and Tab keep the editor usable', async ({ page }) => {
  const dialog = page.getByRole('dialog'), stage = dialog.getByRole('combobox', { name: 'Этап сделки', exact: true });
  await stage.focus();
  await stage.press('ArrowDown');
  await stage.press('ArrowDown');
  await stage.press('Enter');
  await expect(stage).toContainText('Переписка');
  await stage.press('Space');
  await stage.press('End');
  await stage.press('Escape');
  await expect(stage).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Есть несохранённые изменения')).not.toBeVisible();
  await expect(stage).toContainText('Переписка');
  await stage.dispatchEvent('keydown', { key: 'о', code: 'KeyJ', bubbles: true });
  await stage.press('Enter');
  await expect(stage).toContainText('Оплачено');
  await stage.press('Enter');
  await stage.press('Tab');
  await expect(stage).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.getByRole('spinbutton', { name: 'Сумма, $' })).toBeFocused();
});

test('menus fit the viewport, dismiss outside and adapt between desktop and phone', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const stage = page.getByRole('combobox', { name: 'Этап сделки', exact: true });
  await stage.click();
  const list = page.getByRole('listbox', { name: 'Этап сделки' });
  const selected = page.getByRole('option', { name: 'Новые лиды', exact: true });
  await expect(list).toBeVisible();
  const selectedBox = await selected.boundingBox();
  expect(selectedBox!.height).toBeGreaterThanOrEqual(isMobile ? 54 : 44);
  await page.screenshot({ path: `.preview/${isMobile ? 'mobile' : 'desktop'}-stage-menu.png`, animations: 'disabled', scale: 'css' });
  if (isMobile) {
    await page.getByRole('button', { name: 'Закрыть выбор', exact: true }).click();
    await expect(list).not.toBeVisible();
    await stage.click();
  }
  await page.mouse.click(4, 4);
  await expect(list).not.toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 680 });
    await stage.click();
    await expect(list).toBeVisible();
    const menu = await page.locator('.select-popover:popover-open .select-menu').boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.y).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(width);
    expect(menu!.y + menu!.height).toBeLessThanOrEqual(681);
    await stage.press('Escape');
  }
});

test('filter selections update results and the phone close button works with Enter', async ({ page }) => {
  await page.getByRole('dialog').getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.getByRole('button', { name: 'Открыть фильтры', exact: true }).click();
  const source = page.getByRole('dialog').getByRole('combobox', { name: 'Источник', exact: true });
  await source.click();
  await page.getByRole('option', { name: 'ManyChat', exact: true }).click();
  const stage = page.getByRole('combobox', { name: 'Этап сделки', exact: true });
  await stage.click();
  await page.getByRole('option', { name: 'Переписка', exact: true }).click();
  await page.getByRole('button', { name: /Показать/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByText('Найдено контактов:')).toBeVisible();
  await page.getByRole('button', { name: /Открыть фильтры/ }).click();
  await expect(page.getByRole('combobox', { name: 'Источник', exact: true }).filter({ visible: true })).toContainText('ManyChat');
  await page.setViewportSize({ width: 390, height: 700 });
  await stage.click();
  const close = page.getByRole('button', { name: 'Закрыть выбор', exact: true });
  await close.focus();
  await close.press('Enter');
  await expect(stage).toHaveAttribute('aria-expanded', 'false');
  await expect(stage).toContainText('Переписка');
});
