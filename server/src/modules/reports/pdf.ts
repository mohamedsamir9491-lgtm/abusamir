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
    const d = lh.letterhead_mode === 'design' ? lh.design : null;
    const pageNo = numbering === 'none' ? '' : numbering === 'page_of_total' ? 'صفحة <span class="pageNumber"></span> من <span class="totalPages"></span>' : 'صفحة <span class="pageNumber"></span>';
    const font = `font-family:'Noto Naskh Arabic','Cairo',Arial,sans-serif;font-size:8pt;direction:rtl`;
    // وضع التصميم: شريطا الرأس والتذييل من التصميم المرفوع يُطبعان داخل هوامش الصفحة فلا يغطيهما أي محتوى، ورقم الصفحة فوق شريط التذييل
    const headerTemplate = d ? `<div style="width:210mm;height:${lh.page_margin_top_mm}mm;margin:0;padding:0;-webkit-print-color-adjust:exact"><img src="data:image/jpeg;base64,${d.top_png}" style="display:block;width:210mm;height:${d.top_mm}mm"></div>` : '<div></div>';
    const footerTemplate = d ? `<div style="position:relative;width:210mm;height:${lh.page_margin_bottom_mm}mm;margin:0;padding:0;-webkit-print-color-adjust:exact"><img src="data:image/jpeg;base64,${d.bottom_png}" style="display:block;width:210mm;height:${297 - d.bottom_mm}mm;position:absolute;bottom:0;left:0"><div style="position:absolute;bottom:2.5mm;left:0;right:0;text-align:center;color:#fff;${font}">${pageNo}</div></div>`
      : numbering === 'none' ? '<div></div>' : `<div style="width:100%;${font};color:#555;text-align:center;padding:0 ${lh.page_margin_right_mm}mm">${pageNo}</div>`;
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate, footerTemplate,
      margin: { top: `${lh.page_margin_top_mm}mm`, bottom: `${lh.page_margin_bottom_mm + (d ? 0 : 7)}mm`, left: `${lh.page_margin_left_mm}mm`, right: `${lh.page_margin_right_mm}mm` } });
    return Buffer.from(pdf);
  } catch (e) { logger.error({ err: e }, 'pdf generation failed'); throw e; } finally { await browser.close(); }
}
