/** تقييم دقة البحث النظامي: لكل سؤال المرجع المتوقع (المصدر + رقم المادة)، ويحسب الدقة في المرتبة الأولى وضمن أول 3
 *  npx tsx scripts/legalEval.ts [eval.json] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';
import { searchLegal } from '../src/modules/legal/library.js';

const here = path.dirname(fileURLToPath(import.meta.url));
type Case = { q: string; src: string; art?: number | number[]; ref?: string };
const file = process.argv[2] ?? path.resolve(here, '../assets/legal/eval.json');
const cases = JSON.parse(fs.readFileSync(file, 'utf8')) as Case[];
const ok = (h: { title: string; num: number | null; ref: string }, c: Case) => h.title.includes(c.src) && (c.ref ? h.ref === c.ref : c.art == null ? true : [c.art].flat().includes(Number(h.num)));
let top1 = 0; let top3 = 0; const miss: string[] = [];
for (const c of cases) {
  const r = await searchLegal(c.q, { limit: 3 });
  const i = r.hits.findIndex((h) => ok(h, c));
  if (i === 0) top1++; if (i >= 0 && i < 3) top3++;
  if (i !== 0) miss.push(`${i < 0 ? '✗' : `#${i + 1}`} ${c.q} → المتوقع ${c.ref ?? (c.art == null ? 'أي جزء' : `م ${c.art}`)} من ${c.src}؛ الأول: ${r.hits[0] ? `${r.hits[0].ref} من ${r.hits[0].title.slice(0, 40)}` : 'لا شيء'}`);
}
console.log(`الأسئلة ${cases.length} | الأولى صحيحة ${top1} (${Math.round((top1 / cases.length) * 100)}%) | ضمن أول 3: ${top3} (${Math.round((top3 / cases.length) * 100)}%)`);
for (const m of miss) console.log('  ' + m);
await pool.end();
