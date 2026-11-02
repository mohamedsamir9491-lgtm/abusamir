import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';
import type { OfficeLetterhead } from './render.js';

/** توليد PDF عبر Chromium (Playwright): A4، ترقيم صفحات، خطوط عربية مضمنة في HTML */
export async function htmlToPdf(html: string, lh: OfficeLetterhead, opts: { pageNumbering?: string } = {}): Promise<Buffer> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: config.chromiumPath || undefined, args: ['--no-sandbox', '--font-render-hinting=none'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const numbering = opts.pageNumbering ?? lh.page_numbering;
    const footerTemplate = numbering === 'none' ? '<div></div>' : `<div style="width:100%;font-family:'Noto Naskh Arabic','Cairo',Arial,sans-serif;font-size:8pt;color:#555;text-align:center;direction:rtl;padding:0 ${lh.page_margin_right_mm}mm">${numbering === 'page_of_total' ? 'صفحة <span class="pageNumber"></span> من <span class="totalPages"></span>' : 'صفحة <span class="pageNumber"></span>'}</div>`;
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate,
      margin: { top: `${lh.page_margin_top_mm}mm`, bottom: `${lh.page_margin_bottom_mm + 7}mm`, left: `${lh.page_margin_left_mm}mm`, right: `${lh.page_margin_right_mm}mm` } });
    return Buffer.from(pdf);
  } catch (e) { logger.error({ err: e }, 'pdf generation failed'); throw e; } finally { await browser.close(); }
}
