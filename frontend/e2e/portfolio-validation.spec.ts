import { test, expect } from '@playwright/test';

const PORTFOLIO_URL = 'http://127.0.0.1:8080/';

test.describe('OpsPilot Portfolio Integration Validation', () => {
  test('DESKTOP 1440x900: Both flagship cards render cleanly and OpsPilot case study opens', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(PORTFOLIO_URL);
    await page.waitForLoadState('domcontentloaded');

    // Hero section check
    await expect(page.locator('.hero-section')).toBeVisible();

    // Flagship Projects section check
    const projectsSection = page.locator('#projects');
    await expect(projectsSection).toBeVisible();

    // Check project cards count
    const cards = projectsSection.locator('.project-card');
    await expect(cards).toHaveCount(2);

    // Card 1: DataQual
    const card1 = cards.nth(0);
    await expect(card1.getByRole('heading', { name: 'DataQual' })).toBeVisible();

    // Card 2: OpsPilot
    const card2 = cards.nth(1);
    await expect(card2.getByRole('heading', { name: 'OpsPilot' })).toBeVisible();
    await expect(card2.getByText('Human Data Campaign Operations & Delivery Control')).toBeVisible();

    // Verify OpsPilot card thumbnail image loads cleanly
    const thumbnail = card2.locator('img.project-card-thumbnail');
    await expect(thumbnail).toBeVisible();
    const isThumbLoaded = await thumbnail.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(isThumbLoaded).toBe(true);

    // Verify CTAs on OpsPilot card
    const demoLink = card2.locator('a.project-demo-link');
    await expect(demoLink).toHaveAttribute('href', 'https://kveigas.github.io/opspilot/');

    const githubLink = card2.locator('a.project-github-link');
    await expect(githubLink).toHaveAttribute('href', 'https://github.com/kveigas/opspilot');

    // Click "View Case Study" on OpsPilot
    const caseStudyBtn = card2.locator('.project-case-study-button');
    await caseStudyBtn.click();

    // Verify Case Study dialog opens
    const dialog = page.locator('.case-study-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'OpsPilot', exact: true })).toBeVisible();

    // Verify 8 sections in OpsPilot case study
    await expect(dialog.getByRole('heading', { name: 'Problem / Operational Context' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'What OpsPilot Does' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Core Workflow' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Selected Product Screenshots' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Operational Logic' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Technical Architecture' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Validation & Release' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Key Takeaway' })).toBeVisible();

    // Verify all 5 screenshots load inside modal
    const galleryImgs = dialog.locator('.case-study-gallery img');
    await expect(galleryImgs).toHaveCount(5);

    for (let i = 0; i < 5; i++) {
      const img = galleryImgs.nth(i);
      await expect(img).toBeVisible();
      const isLoaded = await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0);
      expect(isLoaded).toBe(true);
    }

    // Close case study modal
    await dialog.locator('.case-study-close').click();
    await expect(dialog).not.toBeVisible();
  });

  test('MOBILE 375x667: Cards stack cleanly without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(PORTFOLIO_URL);
    await page.waitForLoadState('domcontentloaded');

    // Check no horizontal page overflow
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // Cards visible
    const cards = page.locator('#projects .project-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toBeVisible();
    await expect(cards.nth(1)).toBeVisible();
  });
});
