import { chromium } from 'playwright'; import fs from 'fs';
// يعرض صفحة (تُحمَّل محتوياتها بالجافاسكربت) ويطبع روابط المستندات فيها
const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } }); const p = await b.newPage({ ignoreHTTPSErrors: true });
const urls = process.argv.slice(2); const all = [];
for (const u of urls) {
  await p.goto(u, { timeout: 90000, waitUntil: 'networkidle' }).catch((e) => console.log('ERR', u, e.message.slice(0, 80)));
  await p.waitForTimeout(3500);
  for (const sel of ['[role=tab]', '.accordion button', '.panel-heading a', 'button[aria-expanded="false"]']) { for (const el of await p.$$(sel)) { try { await el.click({ timeout: 700 }); await p.waitForTimeout(150); } catch { /* ignore */ } } }
  await p.waitForTimeout(1200);
  const links = await p.$$eval('a[href]', (as) => [...new Set(as.map((a) => (a.innerText.trim().replace(/\s+/g, ' ').slice(0, 140) || a.getAttribute('title') || '') + ' | ' + a.href))]);
  const docs = links.filter((l) => /\.pdf|\/Documents\//i.test(l));
  const pages = links.filter((l) => /zatca\.gov\.sa\/ar\/.*\.aspx/i.test(l) && !/share|mailto/i.test(l));
  console.log('==', u, 'links', links.length, 'docs', docs.length); docs.forEach((l) => console.log('DOC', l));
  if (process.env.SHOWPAGES) pages.forEach((l) => console.log('PAGE', l));
  all.push({ u, docs, pages, text: await p.evaluate(() => document.body.innerText.slice(0, 20000)) });
}
fs.writeFileSync('render-out.json', JSON.stringify(all, null, 1));
await b.close();
