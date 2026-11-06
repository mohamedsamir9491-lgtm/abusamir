import { chromium } from 'playwright'; import fs from 'fs';
// عنوان كل ملف من النص المجاور للرابط في صفحات الأمانة العامة للجان
const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } }); const p = await b.newPage({ ignoreHTTPSErrors: true });
const out = [];
for (const [u, cat] of [['https://gstc.gov.sa/ar/DocumentsLb/DecisionsRules/Pages/default.aspx', 'اللجان - مدونة القرارات والمبادئ'], ['https://gstc.gov.sa/ar/committees/law/Pages/default.aspx', 'اللجان - قواعد العمل'], ['https://gstc.gov.sa/ar/guidelines/Pages/default.aspx', 'اللجان - الأدلة التوضيحية للأنظمة'], ['https://gstc.gov.sa/ar/DocumentsLb/Publications/Pages/default.aspx', 'اللجان - الأدلة الإرشادية']]) {
  await p.goto(u, { timeout: 90000, waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  const items = await p.$$eval('a[href]', (as) => as.filter((a) => /\.pdf/i.test(a.href)).map((a) => {
    let el = a; let t = '';
    for (let i = 0; i < 6 && el; i++) { el = el.parentElement; const txt = (el?.innerText || '').replace(/\s+/g, ' ').trim(); if (txt.length > 12 && txt.replace(/تحميل|دليل المستخدم/g, '').trim().length > 8) { t = txt; break; } }
    return { h: a.href, t: t.replace(/تحميل/g, '').trim().slice(0, 200) };
  }));
  const seen = new Set();
  for (const it of items) { if (seen.has(it.h) || /E-service-guideline/.test(it.h)) continue; seen.add(it.h); out.push({ cat, title: it.t, url: u, docs: [{ t: it.t, h: it.h }] }); console.log(cat.slice(7, 20), '|', it.t.slice(0, 90)); }
}
fs.writeFileSync('gstc-items.json', JSON.stringify(out, null, 1)); await b.close();
