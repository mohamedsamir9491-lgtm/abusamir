import { useState } from 'react';
import { get, post } from '../api';
import { Page, useLoad, Spinner, useAction, Field } from '../components/ui';
import { fmtDate } from '../format';

type Item = Record<string, string | null>;
interface Cats { [k: string]: { label: string; count: number; items: Item[] } }

/** تنظيف البيانات لمالك النظام: عرض المرشحين بالعدد والعينة أولًا، ثم حذف جماعي بتأكيد صريح مسجل في التدقيق */
export function Cleanup() {
  const [days, setDays] = useState(0); const [sel, setSel] = useState<Record<string, boolean>>({}); const [openCat, setOpenCat] = useState<string | null>(null); const { run, busy } = useAction();
  const { data, loading, reload } = useLoad(() => get<{ categories: Cats }>(`/system/cleanup/candidates?older_than_days=${days}`), [days]);
  const chosen = Object.entries(sel).filter(([, v]) => v).map(([k]) => k);
  const total = chosen.reduce((a, k) => a + (data?.categories[k]?.count ?? 0), 0);
  const execute = async () => {
    const txt = `سيُحذف ${total} عنصرًا من: ${chosen.map((k) => data?.categories[k].label).join('، ')}.\nاكتب DELETE للتأكيد:`;
    const v = prompt(txt); if (v !== 'DELETE') return;
    const r = await run(() => post<{ deleted: Record<string, number> }>('/system/cleanup/run', { categories: chosen, older_than_days: days, confirm: 'DELETE' }), 'اكتمل التنظيف');
    if (r) { setSel({}); reload(); }
  };
  return <Page title="تنظيف البيانات" sub="للمالك: حذف المسودات والاستيرادات الفاشلة والمستندات اليتيمة والتشغيلات المتجاوزة والعملاء التجريبيين أو المؤرشفين. لا يُحذف شيء قبل أن تراه وتؤكده، وكل عملية تُسجَّل في سجل التدقيق."
    actions={<button className="btn danger" disabled={busy || !chosen.length} onClick={execute}>حذف المحدد ({total})</button>}>
    <div className="card tight row"><Field label="أقدم من (أيام)" hint="0 = كل العناصر المرشحة"><input type="number" min={0} value={days} onChange={(e) => setDays(Math.max(0, Number(e.target.value) || 0))} style={{ width: 120 }} /></Field><span className="muted">تُعرض أول 50 عنصرًا من كل فئة؛ العدد الكلي بجانب العنوان.</span></div>
    {loading || !data ? <Spinner /> : <div className="grid c2">{Object.entries(data.categories).map(([k, c]) => <div key={k} className={`card clean ${c.count ? '' : 'off'}`}>
      <label className="row between" style={{ cursor: c.count ? 'pointer' : 'default' }}><span className="row"><input type="checkbox" disabled={!c.count} checked={!!sel[k]} onChange={(e) => setSel({ ...sel, [k]: e.target.checked })} /><b>{c.label}</b></span><span className={`badge ${c.count ? 'warn' : 'neutral'}`}>{c.count}</span></label>
      {c.count > 0 && <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => setOpenCat(openCat === k ? null : k)}>{openCat === k ? 'إخفاء' : 'عرض العينة'}</button>}
      {openCat === k && <table className="t" style={{ marginTop: 8 }}><thead><tr><th>العنصر</th><th>التفصيل</th><th>العميل</th><th>التاريخ</th></tr></thead><tbody>{c.items.map((it, i) => <tr key={i}><td className="mono">{it.name}</td><td>{it.detail}</td><td>{it.client}</td><td>{fmtDate(it.at, { time: true })}</td></tr>)}</tbody></table>}
    </div>)}</div>}
    <div className="alert info">ما لا يُحذف من هنا: المستندات الأصلية التي اعتُمدت بياناتها (تتبع)، التقارير المعتمدة أو الصادرة، وسجل التدقيق. لحذف عنصر بعينه استخدم زر "حذف" في صفحته.</div>
  </Page>;
}
