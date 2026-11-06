import { chromium } from 'playwright'; import fs from 'fs';
// يفتح كل نظام من قائمة الهيئة ويجمع روابط ملفاته (PDF/Word) ونص الصفحة
const list = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const base = process.argv[3]; const out = [];
const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } }); const p = await b.newPage({ ignoreHTTPSErrors: true });
for (const it of list) {
  const u = base + it.LinkFilename;
  try { await p.goto(u, { timeout: 90000, waitUntil: 'networkidle' }); } catch (e) { out.push({ ...it, url: u, err: String(e.message).slice(0, 80), docs: [] }); console.log('ERR', it.Title); continue; }
  await p.waitForTimeout(1200);
  const docs = await p.$$eval('a[href]', (as) => [...new Map(as.filter((a) => /\.(pdf|docx?|xlsx?)(\?|#|$)/i.test(a.href) && !/Glossary|%D9%85%D8%B9%D8%AC%D9%85|Portal%20Guide/i.test(a.href)).map((a) => [a.href, { t: (a.innerText || a.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 200), h: a.href }])).values()]);
  const text = await p.evaluate(() => (document.querySelector('.page-content, #DeltaPlaceHolderMain, main') || document.body).innerText.slice(0, 6000));
  out.push({ cat: it.Category, title: it.Title, url: u, docs, text });
  console.log('OK', it.Category, '|', it.Title, '| files', docs.length);
}
fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 1)); await b.close();
