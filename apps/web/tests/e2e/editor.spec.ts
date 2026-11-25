import {expect, test} from '@playwright/test';

test('create a project and edit it in the studio', async ({page}) => {
  await page.goto('/');
  await expect(page.getByText('Your studio')).toBeVisible();

  await page.getByRole('button', {name: /new project/i}).click();
  await page.getByRole('dialog').locator('input').first().fill('E2E explainer');
  await page.getByRole('dialog').getByRole('button', {name: 'Create'}).click();

  await expect(page.getByText('E2E explainer')).toBeVisible();
  await page.getByText('E2E explainer').click();

  await expect(page.getByTestId('editor')).toBeVisible();
  await expect(page.getByTestId('preview-panel')).toBeVisible();
  await expect(page.getByTestId('code-panel')).toBeVisible();
  await expect(page.getByTestId('timeline-panel')).toBeVisible();
  await expect(page.getByTestId('preview-canvas')).toBeVisible({timeout: 20_000});

  await page.getByRole('button', {name: 'Play preview'}).click();
  await expect(page.getByRole('button', {name: 'Pause preview'})).toBeVisible();

  await page.getByRole('button', {name: /add/i}).click();
  await expect(page.getByTestId('sidebar').getByText('3 scenes')).toBeVisible();
});
