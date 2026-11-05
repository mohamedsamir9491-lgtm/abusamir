/** عرض أول النتائج لسؤال (للتشخيص): npx tsx scripts/legalDebug.ts "السؤال" ... */
import { pool } from '../src/db/pool.js';
import { searchLegal, queryTerms, termGroups, taxDomain } from '../src/modules/legal/library.js';
for (const q of process.argv.slice(2)) {
  const r = await searchLegal(q, { limit: 5 });
  console.log(`\nQ: ${q} | ${termGroups(queryTerms(q)).map((g) => g.join('/')).join(' + ')} | domain ${taxDomain(q)}`);
  for (const h of r.hits) console.log(`  ${h.score.toFixed(1)} m${h.matched} | ${h.ref} (${(h.heading ?? '').slice(0, 40)}) | ${h.title.slice(0, 45)} | len ${h.body.length}`);
}
await pool.end();
