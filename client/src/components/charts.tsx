/** رسوم هندسية متناظرة خفيفة (SVG/CSS) بلا مكتبات خارجية */
import { fmtMoney } from '../format';

const compact = (v: number) => Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}K` : String(Math.round(v));

/** عداد نصف دائري بتدرج الهوية */
export function Gauge({ ratio, label, sub, size = 190 }: { ratio: number; label: string; sub: string; size?: number }) {
  const p = Math.max(0, Math.min(1, ratio)); const r = size / 2 - 14; const cx = size / 2; const cy = size / 2;
  const a0 = Math.PI * 0.75; const a1 = Math.PI * 2.25; const ap = a0 + (a1 - a0) * p;
  const pt = (a: number, rr = r) => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  const arc = (s: number, e: number) => { const [x0, y0] = pt(s); const [x1, y1] = pt(e); return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${e - s > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const id = `gg${size}`;
  return <svg width={size} height={Math.round(size * 0.86)} viewBox={`0 0 ${size} ${Math.round(size * 0.86)}`} className="gauge" role="img" aria-label={`${sub}: ${label}`}>
    <defs><linearGradient id={id} x1="0" x2="1"><stop offset="0" stopColor="#1f5fae" /><stop offset="1" stopColor="#c9a24b" /></linearGradient></defs>
    {Array.from({ length: 11 }, (_, k) => { const a = a0 + (a1 - a0) * k / 10; const [x1, y1] = pt(a, r + 9); const [x2, y2] = pt(a, r + 4); return <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />; })}
    <path d={arc(a0, a1)} stroke="currentColor" strokeOpacity=".12" strokeWidth="12" fill="none" strokeLinecap="round" />
    {p > 0.002 && <path d={arc(a0, ap)} stroke={`url(#${id})`} strokeWidth="12" fill="none" strokeLinecap="round" />}
    <text x="50%" y={cy + 4} textAnchor="middle" className="gv">{label}</text><text x="50%" y={cy + 24} textAnchor="middle" className="gl">{sub}</text></svg>;
}

/** فراشة متناظرة حول محور الأشهر: المفوتر (يسار) مقابل المحصّل (يمين) */
export function Butterfly({ rows, leftLabel, rightLabel }: { rows: { label: string; left: number; right: number }[]; leftLabel: string; rightLabel: string }) {
  const mx = Math.max(1, ...rows.flatMap((r) => [r.left, r.right]));
  return <div><div className="bfh"><span><i className="sw" style={{ background: 'var(--gold)' }} />{rightLabel}</span><span>ريال</span><span><i className="sw" style={{ background: 'var(--primary)' }} />{leftLabel}</span></div>
    {rows.map((r) => <div className="bf" key={r.label} title={`${r.label}: ${leftLabel} ${fmtMoney(r.left)} | ${rightLabel} ${fmtMoney(r.right)}`}>
      <div className="bfl"><i style={{ width: `${(r.right / mx) * 82}%` }} />{r.right > 0 && <span className="v">{compact(r.right)}</span>}</div><div className="bfm">{r.label}</div>
      <div className="bfr">{r.left > 0 && <span className="v">{compact(r.left)}</span>}<i style={{ width: `${(r.left / mx) * 82}%` }} /></div></div>)}</div>;
}

/** قمع متناظر للمراحل */
export function Funnel({ steps }: { steps: { label: string; n: number }[] }) {
  const mx = Math.max(1, ...steps.map((s) => s.n));
  return <div className="fnw">{steps.map((s, i) => <div className="fn" key={s.label}><div className="fnb" style={{ width: `${44 + 56 * s.n / mx}%`, opacity: 1 - i * 0.1 }}><b>{s.n}</b><span>{s.label}</span></div></div>)}</div>;
}

/** حلقة نسب (مع فجوات) + مفتاح */
const MIX_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#6250d6'];
export function Donut({ items, center, centerSub }: { items: { label: string; value: number }[]; center: string; centerSub: string }) {
  const tot = items.reduce((t, x) => t + x.value, 0) || 1; let s = 0; const cx = 80; const r = 62;
  return <div className="mixw"><svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={centerSub}>
    <circle cx={cx} cy={cx} r={r} stroke="currentColor" strokeOpacity=".08" strokeWidth="20" fill="none" />
    {items.map((it, i) => { const a0 = (s / tot) * 2 * Math.PI - Math.PI / 2; s += it.value; const a1 = (s / tot) * 2 * Math.PI - Math.PI / 2 - (items.length > 1 ? 0.04 : 0);
      if (items.length === 1) return <circle key={i} cx={cx} cy={cx} r={r} stroke={MIX_COLORS[0]} strokeWidth="20" fill="none" />;
      const [x0, y0, x1, y1] = [cx + r * Math.cos(a0), cx + r * Math.sin(a0), cx + r * Math.cos(a1), cx + r * Math.sin(a1)];
      return <path key={i} d={`M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`} stroke={MIX_COLORS[i % MIX_COLORS.length]} strokeWidth="20" fill="none"><title>{`${it.label}: ${fmtMoney(it.value)}`}</title></path>; })}
    <text x="80" y="78" textAnchor="middle" style={{ font: '700 20px var(--font)' }}>{center}</text><text x="80" y="98" textAnchor="middle" style={{ font: '500 11px var(--font)', opacity: .65 }}>{centerSub}</text></svg>
    <div className="mxl">{items.map((it, i) => <div className="mx" key={it.label}><span className="sw" style={{ background: MIX_COLORS[i % MIX_COLORS.length] }} /><span>{it.label}</span><b>{Math.round(it.value / tot * 100)}%</b></div>)}</div></div>;
}

/** شريط أعمار متدرج (لون واحد من الفاتح للداكن) */
const AGE_COLORS = ['#9ec5f4', '#5598e7', '#2a78d6', '#1c5cab', '#0d366b'];
export function AgingBar({ buckets }: { buckets: { label: string; v: number }[] }) {
  const tot = buckets.reduce((t, b) => t + b.v, 0);
  return <><div className="stack">{tot > 0 && buckets.map((b, i) => b.v > 0 && <i key={b.label} style={{ flex: b.v, background: AGE_COLORS[i] }} title={`${b.label}: ${fmtMoney(b.v)}`} />)}</div>
    <div className="agl">{buckets.map((b, i) => <div className="ag" key={b.label}><span className="sw" style={{ background: AGE_COLORS[i] }} /><span>{b.label}</span><b>{fmtMoney(b.v)}</b><small>{tot ? Math.round(b.v / tot * 100) : 0}%</small></div>)}</div></>;
}
