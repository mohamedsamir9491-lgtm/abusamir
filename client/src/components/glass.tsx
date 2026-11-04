/** الثيم الزجاجي: أيقونات ممتلئة، حلقة الحركة الموحدة (مع «تخفيف الحركة»)، الخلفية الضوئية، الكوكب، الموجات، الدائرة المركزية، الشعار */
import { useEffect, useRef, useState, type ReactNode } from 'react';

// ---------- الأيقونات الممتلئة (القائمة الجانبية والوحدات) ----------
const SI: Record<string, ReactNode> = {
  home: <path d="M12 2.6L1.8 11.2h3V21h5.4v-6.2h3.6V21h5.4v-9.8h3z" fill="currentColor" />,
  coins: <><ellipse cx="12" cy="5.2" rx="8.2" ry="3.2" fill="currentColor" /><path d="M3.8 7.9c0 1.8 3.7 3.2 8.2 3.2s8.2-1.4 8.2-3.2v2.6c0 1.8-3.7 3.2-8.2 3.2s-8.2-1.4-8.2-3.2z" fill="currentColor" /><path d="M3.8 13c0 1.8 3.7 3.2 8.2 3.2s8.2-1.4 8.2-3.2v2.6c0 1.8-3.7 3.2-8.2 3.2s-8.2-1.4-8.2-3.2z" fill="currentColor" /><path d="M3.8 18.1c0 1.8 3.7 3.2 8.2 3.2s8.2-1.4 8.2-3.2" fill="none" stroke="currentColor" strokeWidth="1.6" /></>,
  users: <><circle cx="9" cy="7.4" r="3.8" fill="currentColor" /><path d="M1.8 20.6c0-4.3 3.2-6.9 7.2-6.9s7.2 2.6 7.2 6.9z" fill="currentColor" /><circle cx="17.2" cy="8.4" r="2.9" fill="currentColor" opacity=".8" /><path d="M15.8 13.6c3.7-.3 6.6 2.1 6.6 6.4h-4.5c0-2.5-.8-4.6-2.1-6.4z" fill="currentColor" opacity=".8" /></>,
  brief: <><path fillRule="evenodd" d="M9 3.5h6a2 2 0 0 1 2 2V7h3a2 2 0 0 1 2 2v3.8H2V9a2 2 0 0 1 2-2h3V5.5a2 2 0 0 1 2-2zM9.2 7h5.6V5.7H9.2z" fill="currentColor" /><path d="M2 14.3h8v1.6h4v-1.6h8V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" fill="currentColor" /></>,
  letter: <><path d="M5 2h9.2L19 6.8v5.4l-7.2 7.2V22H5a1.2 1.2 0 0 1-1.2-1.2V3.2A1.2 1.2 0 0 1 5 2z" fill="currentColor" /><path d="M7.6 8.6h7.2M7.6 12h5" stroke="#081634" strokeWidth="1.7" strokeLinecap="round" /><path d="M20.7 12.6l2 2-6.6 6.6h-2.1v-2z" fill="currentColor" /></>,
  box: <><path d="M21 16.2V7.8L12 2.8 3 7.8v8.4l9 5z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /><path d="M3.4 7.9L12 12.6l8.6-4.7M12 21.2v-8.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /></>,
  bars: <><rect x="2.6" y="13" width="5" height="8.5" rx="1" fill="currentColor" /><rect x="9.5" y="8" width="5" height="13.5" rx="1" fill="currentColor" /><rect x="16.4" y="2.6" width="5" height="18.9" rx="1" fill="currentColor" /></>,
  gbars: <><rect x="2.6" y="13" width="5" height="8.5" rx="1" fill="url(#igold)" /><rect x="9.5" y="8" width="5" height="13.5" rx="1" fill="url(#igold)" /><rect x="16.4" y="2.6" width="5" height="18.9" rx="1" fill="url(#igold)" /></>,
  bbars: <><rect x="2.6" y="13" width="5" height="8.5" rx="1" fill="url(#iblue)" /><rect x="9.5" y="8" width="5" height="13.5" rx="1" fill="url(#iblue)" /><rect x="16.4" y="2.6" width="5" height="18.9" rx="1" fill="url(#iblue)" /></>,
  gear: <><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" fill="none" stroke="currentColor" strokeWidth="2.3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none" stroke="currentColor" strokeWidth="2.1" /></>,
  client: <><rect x="3" y="5.5" width="18" height="15.5" rx="2.6" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M8.8 5.5V3.4h6.4v2.1" fill="none" stroke="currentColor" strokeWidth="2.2" /><circle cx="12" cy="11.2" r="2.7" fill="currentColor" /><path d="M7.4 18.4c.6-2.5 2.4-3.8 4.6-3.8s4 1.3 4.6 3.8z" fill="currentColor" /></>,
  link: <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />,
  folder: <><path d="M3.5 20h17a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 20.5 7H12l-2-3H3.5A1.5 1.5 0 0 0 2 5.5v13A1.5 1.5 0 0 0 3.5 20z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /><path d="M2 10h20" stroke="currentColor" strokeWidth="2" /></>,
  cal: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.6" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M3 9.6h18" stroke="currentColor" strokeWidth="2.2" /><path d="M8 2.4v4M16 2.4v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><g fill="currentColor"><rect x="6.3" y="12" width="2.8" height="2.6" rx=".5" /><rect x="10.6" y="12" width="2.8" height="2.6" rx=".5" /><rect x="14.9" y="12" width="2.8" height="2.6" rx=".5" /><rect x="6.3" y="16" width="2.8" height="2.6" rx=".5" /><rect x="10.6" y="16" width="2.8" height="2.6" rx=".5" /><rect x="14.9" y="16" width="2.8" height="2.6" rx=".5" /></g></>,
  layers: <><path d="M12 2.2L1.4 7.6 12 13l10.6-5.4z" fill="currentColor" /><path d="M4.1 10.9L1.4 12.3 12 17.7l10.6-5.4-2.7-1.4L12 15z" fill="currentColor" opacity=".85" /><path d="M4.1 15.6L1.4 17 12 22.4 22.6 17l-2.7-1.4-7.9 4z" fill="currentColor" opacity=".7" /></>,
};
export const GIcon = ({ n, size = 24 }: { n: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="gicon">{SI[n] ?? SI.box}</svg>;
/** تدرجات الأيقونات (تُضاف مرة واحدة في الهيكل) */
export const IconDefs = () => <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><defs>
  <linearGradient id="igold" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#c0800f" /><stop offset=".55" stopColor="#ffc83f" /><stop offset="1" stopColor="#fff1b5" /></linearGradient>
  <linearGradient id="iblue" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#3d8bff" /><stop offset="1" stopColor="#e6f6ff" /></linearGradient></defs></svg>;

// ---------- الحركة: كاملة أو مخففة ----------
const MKEY = 'motion';
export const motionReduced = () => { try { const v = localStorage.getItem(MKEY); if (v) return v === 'reduced'; } catch { /* ignore */ } return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches; };
// ---------- مقياس الواجهة: تلقائي حسب الشاشة أو يدوي ----------
const SKEY = 'ui-scale';
export const UI_SCALES: [string, string][] = [['auto', 'تلقائي حسب الشاشة'], ['1', 'عادي'], ['1.15', 'كبير'], ['1.3', 'أكبر']];
function applyScale() {
  let mode = 'auto'; try { mode = localStorage.getItem(SKEY) || 'auto'; } catch { /* ignore */ }
  const w = window.innerWidth, h = window.innerHeight;
  const auto = w < 1100 ? 1 : Math.max(1, Math.min(1.6, w / 1680, h / 860));
  const s = mode === 'auto' ? auto : Number(mode) || 1; const html = document.documentElement;
  html.style.setProperty('zoom', s === 1 ? '' : String(+s.toFixed(3))); html.style.setProperty('--app-h', `${Math.floor(h / s)}px`); html.dataset.scale = String(+s.toFixed(3));
}
export function useUiScale() {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem(SKEY) || 'auto'; } catch { return 'auto'; } });
  useEffect(() => { applyScale(); window.addEventListener('resize', applyScale); return () => window.removeEventListener('resize', applyScale); }, [mode]);
  return { mode, set: (m: string) => { try { localStorage.setItem(SKEY, m); } catch { /* ignore */ } setMode(m); } };
}

export function useMotion() {
  const [reduced, setReduced] = useState(motionReduced);
  useEffect(() => { document.documentElement.classList.toggle('calm', reduced); }, [reduced]);
  useEffect(() => { const h = () => setReduced(motionReduced()); window.addEventListener('motion-changed', h); return () => window.removeEventListener('motion-changed', h); }, []);
  return { reduced, toggle: () => { const v = !reduced; try { localStorage.setItem(MKEY, v ? 'reduced' : 'full'); } catch { /* ignore */ } window.dispatchEvent(new Event('motion-changed')); } };
}

/** رسم متحرك على Canvas بعدد إطارات محدد؛ يتوقف عند إخفاء الصفحة، ويرسم إطارًا ثابتًا عند «تخفيف الحركة» */
export function useCanvas(draw: (c: CanvasRenderingContext2D, t: number, w: number, h: number) => void, w: number, h: number, fps = 30, scale = 1) {
  const ref = useRef<HTMLCanvasElement>(null); const d = useRef(draw); d.current = draw;
  const { reduced } = useMotion();
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const dpr = Math.min(2, window.devicePixelRatio || 1) * scale;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const c = cv.getContext('2d'); if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduced) { c.clearRect(0, 0, w, h); d.current(c, 8, w, h); return; }
    let raf = 0; let last = -1e9; const iv = 1000 / fps;
    const loop = (ts: number) => { raf = requestAnimationFrame(loop); if (ts - last < iv - 2) return; last = ts; c.clearRect(0, 0, w, h); d.current(c, ts / 1000, w, h); };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [w, h, fps, reduced, scale]);
  return ref;
}
const mk = (w: number, h: number, fn: (c: CanvasRenderingContext2D) => void) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); if (c) fn(c); return cv; };
const useSize = <T extends HTMLElement>() => { const ref = useRef<T>(null); const [s, setS] = useState({ w: 0, h: 0 }); useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setS({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) })); ro.observe(el); return () => ro.disconnect(); }, []); return [ref, s] as const; };

// ---------- الخلفية الضوئية خلف الزجاج ----------
export function AmbientBg() {
  const [sz, setSz] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => { const h = () => setSz({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  const dust = useRef([...Array(110)].map(() => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + .3, p: Math.random() * 6.28, s: Math.random() * .6 + .2 })));
  const ref = useCanvas((c, t, w, h) => {
    c.globalCompositeOperation = 'lighter';
    ([[.86, .1, .17, '40,140,255', .16], [.6, .5, .2, '40,150,255', .09], [.2, .8, .16, '30,120,255', .1], [.55, 1, .3, '30,130,255', .2]] as const).forEach(([x, y, r, col, a], i) => { const R = r * w * (1 + .06 * Math.sin(t * .4 + i)); const g = c.createRadialGradient(x * w, y * h, 0, x * w, y * h, R); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x * w - R, y * h - R, R * 2, R * 2); });
    ([[.96, 16, .0042, .25, 2.2, '90,190,255', .85], [.985, 10, .006, -.18, 1.4, '255,200,90', .5], [.3, 14, .005, .3, 1.4, '110,200,255', .45], [.16, 16, .006, .35, 1.6, '110,200,255', .6]] as const).forEach(([y, amp, k, sp, lw, col, a], ri) => {
      for (let pass = 0; pass < 2; pass++) { c.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y * h + Math.sin(x * k + t * sp + ri) * amp + Math.sin(x * k * 2.3 - t * sp * .7) * amp * .35; x === 0 ? c.moveTo(x, yy) : c.lineTo(x, yy); }
        const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(.3, `rgba(${col},${a})`); g.addColorStop(.75, `rgba(${col},${a * .8})`); g.addColorStop(1, `rgba(${col},0)`); c.strokeStyle = g; c.lineWidth = pass ? lw : lw * 5; c.globalAlpha = pass ? 1 : .16; c.stroke(); }
      c.globalAlpha = 1; });
    dust.current.forEach((p) => { const a = .2 + .45 * Math.abs(Math.sin(t * p.s + p.p)); c.fillStyle = `rgba(160,210,255,${a.toFixed(2)})`; c.fillRect(p.x * w, ((p.y * h - t * 6 * p.s) % h + h) % h, p.r, p.r); });
    c.globalCompositeOperation = 'source-over';
  }, sz.w, sz.h, 15, .5);
  return <canvas ref={ref} className="ambient" aria-hidden="true" />;
}

// ---------- الكوكب أسفل الشريط الجانبي ----------
export function Globe() {
  const W = 232, H = 290, CX = 115, CY = 306, R = 200, TILT = .16, YAW = .5;
  const st = useRef<{ a: HTMLCanvasElement; b: HTMLCanvasElement; cities: { la: number; lo: number; b: number }[] } | null>(null);
  const sph = (la: number, lo: number, r: number) => { const x0 = Math.cos(la) * Math.sin(lo), y0 = Math.sin(la), z0 = Math.cos(la) * Math.cos(lo); const y1 = y0 * Math.cos(TILT) - z0 * Math.sin(TILT), z1 = y0 * Math.sin(TILT) + z0 * Math.cos(TILT); return [CX + r * (x0 * Math.cos(YAW) - y1 * Math.sin(YAW)), CY - r * (x0 * Math.sin(YAW) + y1 * Math.cos(YAW)), z1]; };
  if (!st.current) st.current = {
    cities: [...Array(110)].map(() => ({ la: (30 + Math.random() * 40) * Math.PI / 180, lo: (-70 + Math.random() * 60) * Math.PI / 180, b: Math.random() })),
    a: mk(W, H, (g) => { g.globalCompositeOperation = 'lighter'; let gr = g.createRadialGradient(CX, CY, R * .9, CX, CY, R * 1.25); gr.addColorStop(0, 'rgba(40,150,255,0)'); gr.addColorStop(.25, 'rgba(40,153,255,.22)'); gr.addColorStop(1, 'rgba(40,153,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let k = 1; k <= 9; k++) { const r = R + k * 7; for (let a = Math.PI * 1.02; a < Math.PI * 1.98; a += .9 / r * 3.2) { const x = CX + r * Math.cos(a), y = CY + r * Math.sin(a); if (x < 0 || x > W || y < 0) continue; g.fillStyle = `rgba(90,180,255,${((1 - k / 10) * .55 * Math.min(1, Math.max(.15, (x + 40) / 200))).toFixed(3)})`; g.fillRect(x, y, 1.1, 1.1); } }
      g.globalCompositeOperation = 'source-over'; gr = g.createRadialGradient(CX + 30, CY - R * .85, 10, CX, CY, R); gr.addColorStop(0, 'rgba(20,95,170,.55)'); gr.addColorStop(.5, 'rgba(8,48,90,.5)'); gr.addColorStop(1, 'rgba(4,23,44,.2)'); g.fillStyle = gr; g.beginPath(); g.arc(CX, CY, R, 0, 6.29); g.fill(); }),
    b: mk(W, H, (g) => { g.globalCompositeOperation = 'lighter'; const rg = g.createLinearGradient(0, 0, W, 0); rg.addColorStop(0, 'rgba(255,160,40,1)'); rg.addColorStop(.3, 'rgba(255,200,110,1)'); rg.addColorStop(.5, 'rgba(170,220,255,1)'); rg.addColorStop(.75, 'rgba(90,180,255,1)'); rg.addColorStop(1, 'rgba(60,165,255,1)');
      g.strokeStyle = rg; g.shadowColor = '#7cc8ff'; g.shadowBlur = 14; g.lineWidth = 2.4; g.beginPath(); g.arc(CX, CY, R, Math.PI * 1.08, Math.PI * 1.95); g.stroke(); g.shadowBlur = 24; g.lineWidth = 1.2; g.stroke();
      g.globalCompositeOperation = 'source-over'; g.shadowColor = '#ffa424'; g.shadowBlur = 18; g.lineWidth = 3; const gg = g.createLinearGradient(0, 0, 140, 0); gg.addColorStop(0, 'rgba(255,150,30,1)'); gg.addColorStop(.55, 'rgba(255,190,80,.95)'); gg.addColorStop(1, 'rgba(255,220,150,0)'); g.strokeStyle = gg; g.beginPath(); g.arc(CX, CY, R, Math.PI * 1.08, Math.PI * 1.52); g.stroke(); g.lineWidth = 1.5; g.stroke(); g.shadowBlur = 0;
      g.globalCompositeOperation = 'lighter'; g.save(); g.translate(14, 130); g.rotate(-.16); g.scale(1, .06); let r2 = g.createRadialGradient(0, 0, 0, 0, 0, 110); r2.addColorStop(0, 'rgba(255,215,130,.9)'); r2.addColorStop(.35, 'rgba(255,160,40,.5)'); r2.addColorStop(1, 'rgba(255,140,30,0)'); g.fillStyle = r2; g.beginPath(); g.arc(0, 0, 110, 0, 6.29); g.fill(); g.restore();
      r2 = g.createRadialGradient(185, 124, 0, 185, 124, 50); r2.addColorStop(0, 'rgba(190,235,255,.9)'); r2.addColorStop(.3, 'rgba(80,170,255,.45)'); r2.addColorStop(1, 'rgba(40,153,255,0)'); g.fillStyle = r2; g.fillRect(130, 70, 102, 100); }),
  };
  const ref = useCanvas((c, t) => {
    const S = st.current!; const rot = t * .05; c.drawImage(S.a, 0, 0); c.globalCompositeOperation = 'lighter';
    for (let la = -60; la <= 84; la += 3.6) for (let lo = -180; lo < 180; lo += 1.3) { const p = sph(la * Math.PI / 180, lo * Math.PI / 180 + rot, R); if (p[2] < 0 || p[1] < 0 || p[1] > H) continue; const dd = Math.min(1, (p[1] - CY + R) / 150); const a = (.08 + .5 * p[2]) * (1 - dd * .85); if (a < .03) continue; c.fillStyle = `rgba(100,184,255,${a.toFixed(3)})`; c.fillRect(p[0], p[1], 1, 1); }
    for (let lo = -180; lo < 180; lo += 4.5) for (let la = -80; la <= 88; la += 1) { const p = sph(la * Math.PI / 180, lo * Math.PI / 180 + rot, R); if (p[2] < 0 || p[1] < 0 || p[1] > H) continue; const dd = Math.min(1, (p[1] - CY + R) / 150); const a = (.07 + .45 * p[2]) * (1 - dd * .85); if (a < .03) continue; c.fillStyle = `rgba(90,178,255,${a.toFixed(3)})`; c.fillRect(p[0], p[1], 1, 1); }
    S.cities.forEach((ct) => { const p = sph(ct.la, ct.lo + rot, R); if (p[2] < .1) return; const dd = Math.min(1, (p[1] - CY + R) / 150); const a = Math.min(1, 1.3 * p[2] * (1 - dd * .7) * (.6 + .4 * Math.sin(t * 2 + ct.b * 9)) * (.5 + .5 * ct.b)); c.fillStyle = `rgba(255,${180 + Math.round(50 * ct.b)},90,${a.toFixed(3)})`; c.fillRect(p[0], p[1], 1.8, 1.8); });
    c.globalCompositeOperation = 'source-over'; c.drawImage(S.b, 0, 0); c.globalCompositeOperation = 'lighter';
    const sa = Math.PI * 1.1 + ((t * .07) % 1) * Math.PI * .8; const sx = CX + R * Math.cos(sa), sy = CY + R * Math.sin(sa); const g = c.createRadialGradient(sx, sy, 0, sx, sy, 14); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(sx - 14, sy - 14, 28, 28);
    c.globalCompositeOperation = 'destination-out'; const fd = c.createLinearGradient(0, 170, 0, H); fd.addColorStop(0, 'rgba(0,0,0,0)'); fd.addColorStop(1, 'rgba(0,0,0,1)'); c.fillStyle = fd; c.fillRect(0, 170, W, H - 170); c.globalCompositeOperation = 'source-over';
  }, W, H, 20);
  return <canvas ref={ref} className="globe" style={{ width: W, height: H }} aria-hidden="true" />;
}

// ---------- موجات الشريط الرئيسي ----------
export function HeroWaves() {
  const [box, s] = useSize<HTMLDivElement>();
  const ref = useCanvas((c, t, w, h) => {
    if (!w || !h) return; c.globalCompositeOperation = 'lighter'; const k = w / 1427; const bot = h;
    let gl = c.createRadialGradient(560 * k, bot, 0, 560 * k, bot, 420 * k); gl.addColorStop(0, 'rgba(30,140,255,.16)'); gl.addColorStop(1, 'rgba(30,140,255,0)'); c.fillStyle = gl; c.fillRect(0, 0, w, h);
    const WV = [{ mu: 300, sg: 170, h: 38, a: .45 }, { mu: 420, sg: 118, h: 76, a: 1 }, { mu: 578, sg: 96, h: 66, a: .95 }, { mu: 742, sg: 86, h: 46, a: .85 }, { mu: 900, sg: 120, h: 24, a: .45 }];
    WV.forEach((wv, wi) => {
      const mu = (wv.mu + Math.sin(t * .35 + wi * 1.7) * 14) * k, hh0 = wv.h * (h / 137) * (1 + .07 * Math.sin(t * .6 + wi)), sg = wv.sg * k; const x0 = Math.max(190 * k, mu - sg * 2.4), x1 = Math.min(1080 * k, mu + sg * 2.4);
      const crest = (x: number) => { const s2 = x < mu ? sg * 1.3 : sg * .85; return bot - hh0 * Math.exp(-Math.pow((x - mu) / s2, 2)) * (1 + .05 * Math.sin(x * .02 + t * .8)); };
      for (let f = 0; f <= 16; f++) { const ff = f / 16; c.beginPath(); let first = true;
        for (let x = x0; x <= x1; x += 3) { const cr = crest(x); const y = cr + Math.pow(ff, 1.6) * (bot - cr) + Math.sin(x * .035 + f * .6 + t * 1.1) * 1.6 * ff; const edge = Math.min(1, (x - x0) / 60, (x1 - x) / 60);
          if (f % 2 === 0 && (x / 3) % 2 < 1) { const q = (bot - cr) / hh0; const al = wv.a * edge * (.12 + .6 * (1 - ff)) * (.35 + .65 * q); if (al > .03) { c.fillStyle = `rgba(${Math.round(70 + 120 * q * (1 - ff))},${Math.round(160 + 80 * q)},255,${al.toFixed(3)})`; c.fillRect(x, y, 1.3, 1.3); } }
          if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y); }
        if (ff < .6) { c.strokeStyle = `rgba(80,170,255,${(wv.a * .07 * (1 - ff / .6)).toFixed(3)})`; c.lineWidth = .7; c.stroke(); } }
      for (let x = x0; x < x1; x += 6) { const c1 = crest(x), c2 = crest(x + 6); const q = (bot - c1) / hh0; const edge = Math.min(1, (x - x0) / 60, (x1 - x) / 60); const al = Math.min(1, wv.a * edge * Math.pow(q, 1.3) * 1.15); if (al < .03) continue;
        c.beginPath(); c.moveTo(x, c1); c.lineTo(x + 6, c2); c.strokeStyle = `rgba(90,195,255,${(al * .22).toFixed(3)})`; c.lineWidth = 7; c.stroke(); c.strokeStyle = `rgba(180,232,255,${al.toFixed(3)})`; c.lineWidth = 1.7; c.stroke(); }
      const px = mu + sg * .35, pk = crest(px); const sp = .6 + .4 * Math.sin(t * 1.5 + wi); gl = c.createRadialGradient(px, pk, 0, px, pk, 16); gl.addColorStop(0, `rgba(220,245,255,${(.7 * wv.a * sp).toFixed(3)})`); gl.addColorStop(1, 'rgba(120,200,255,0)'); c.fillStyle = gl; c.fillRect(px - 16, pk - 16, 32, 32);
    });
    c.globalCompositeOperation = 'source-over';
  }, s.w, s.h, 30);
  return <div ref={box} className="hero-waves" aria-hidden="true">{s.w > 0 && <canvas ref={ref} style={{ width: s.w, height: s.h }} />}</div>;
}

// ---------- الدائرة المركزية ----------
export interface HubNode { label: string; icon: string; info: string; to: string; big?: boolean }
const NODE_POS: [number, number][] = [[152, -2], [268, 20], [56, 22], [16, 90], [308, 92], [30, 160], [294, 160], [162, 196]];
export function Hub({ nodes, onOpen }: { nodes: HubNode[]; onOpen: (to: string) => void }) {
  const [sel, setSel] = useState<number | null>(null);
  const O = 30, W = 455, H = 323; const ox = 200 + O, oy = 140 + O, orx = 190, ory = 124, pcx = 200 + O, pcy = 163 + O;
  const L = useRef<{ a: HTMLCanvasElement; b: HTMLCanvasElement } | null>(null);
  const el = (c: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number) => { c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, a0, a1); };
  if (!L.current) L.current = {
    a: mk(W, H, (c) => { c.globalCompositeOperation = 'lighter'; c.lineWidth = 1; c.strokeStyle = 'rgba(80,171,255,.35)'; el(c, ox, oy, orx - 16, ory - 12, 0, 6.29); c.stroke(); c.strokeStyle = 'rgba(80,171,255,.22)'; el(c, ox, oy, orx + 10, ory + 8, 0, 6.29); c.stroke();
      for (let k = 0; k < 180; k++) { const a0 = k / 180 * 6.283, a1 = a0 + 6.283 / 180 + .004; const w = Math.pow(Math.max(0, Math.cos(a0 - 2.6)), 3) + Math.pow(Math.max(0, Math.cos(a0 - 5.75)), 3) * .9; c.shadowColor = '#ffb53a'; c.shadowBlur = 10 + 12 * w; c.strokeStyle = `rgba(255,${Math.round(190 + 40 * w)},${Math.round(80 + 60 * w)},${(.18 + .82 * Math.min(1, w * .85)).toFixed(3)})`; c.lineWidth = 1.6 + 2.4 * w; el(c, ox, oy, orx, ory, a0, a1); c.stroke(); }
      c.shadowBlur = 0; c.save(); c.translate(pcx, pcy); c.scale(1, .3); const g = c.createRadialGradient(0, 0, 0, 0, 0, 100); g.addColorStop(0, 'rgba(190,235,255,.9)'); g.addColorStop(.14, 'rgba(80,180,255,.8)'); g.addColorStop(.42, 'rgba(25,143,255,.55)'); g.addColorStop(.75, 'rgba(20,122,230,.2)'); g.addColorStop(1, 'rgba(30,141,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 100, 0, 6.29); c.fill(); c.restore();
      const pg = c.createLinearGradient(0, pcy - 150, 0, pcy); pg.addColorStop(0, 'rgba(120,200,255,0)'); pg.addColorStop(1, 'rgba(140,215,255,.35)'); c.fillStyle = pg; c.beginPath(); c.moveTo(pcx - 50, pcy); c.lineTo(pcx - 34, pcy - 150); c.lineTo(pcx + 34, pcy - 150); c.lineTo(pcx + 50, pcy); c.fill();
      c.shadowColor = '#4fc0ff'; c.shadowBlur = 14; c.globalCompositeOperation = 'source-over'; ([[26, 7.5, 1.2, .8], [38, 11, 1.6, .9], [50, 14.5, 2.2, .95], [64, 19, 1.2, .7], [72, 21, 1, .55], [82, 24, 1.4, .7]] as const).forEach(([rx, ry, lw, al]) => { c.lineWidth = lw; c.strokeStyle = `rgba(70,175,255,${al})`; el(c, pcx, pcy, rx, ry, 0, 6.29); c.stroke(); }); c.shadowBlur = 0; }),
    b: mk(W, H, (c) => { c.globalCompositeOperation = 'lighter'; c.shadowColor = '#ffa21f'; c.shadowBlur = 26; c.lineWidth = 5; c.strokeStyle = 'rgba(255,170,40,.8)'; el(c, pcx, pcy, 96, 28, 0, 6.29); c.stroke(); c.shadowBlur = 12; c.lineWidth = 2.4; c.strokeStyle = 'rgba(255,212,110,1)'; el(c, pcx, pcy, 96, 28, 0, 6.29); c.stroke(); c.shadowBlur = 8; c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,200,90,.5)'; el(c, pcx, pcy, 112, 33, 0, 6.29); c.stroke(); c.shadowBlur = 0; }),
  };
  const ref = useCanvas((c, t) => {
    c.drawImage(L.current!.a, 0, 0); const sa = (t * .8) % 6.283; c.globalCompositeOperation = 'lighter'; el(c, ox, oy, orx, ory, sa, sa + .5); c.strokeStyle = 'rgba(255,200,90,.22)'; c.lineWidth = 8; c.stroke(); c.strokeStyle = 'rgba(255,236,180,.85)'; c.lineWidth = 2.2; c.stroke();
    c.globalCompositeOperation = 'source-over'; c.setLineDash([2, 4.5]); c.lineDashOffset = -t * 26; c.lineWidth = 3; c.strokeStyle = 'rgba(110,200,255,.85)'; el(c, pcx, pcy, 58, 17, 0, 6.29); c.stroke();
    c.setLineDash([10, 7]); c.lineDashOffset = t * 18; c.lineWidth = 1.6; c.strokeStyle = 'rgba(90,180,255,.8)'; el(c, pcx, pcy, 78, 23, 0, 6.29); c.stroke(); c.setLineDash([]);
    c.globalCompositeOperation = 'lighter'; c.drawImage(L.current!.b, 0, 0); const a = (t * 1.2) % 6.283; [[a, a + .55], [a + 3.14, a + 3.5]].forEach(([b0, b1]) => { el(c, pcx, pcy, 96, 28, b0, b1); c.strokeStyle = 'rgba(255,210,110,.3)'; c.lineWidth = 10; c.stroke(); c.strokeStyle = 'rgba(255,240,190,1)'; c.lineWidth = 3.5; c.stroke(); });
    for (let k = 0; k < 3; k++) { const ph = (t * .42 + k / 3) % 1; el(c, pcx, pcy, 30 + ph * 100, 9 + ph * 30, 0, 6.29); c.strokeStyle = `rgba(120,200,255,${((1 - ph) * .22).toFixed(3)})`; c.lineWidth = 5; c.stroke(); c.strokeStyle = `rgba(160,225,255,${((1 - ph) * .75).toFixed(3)})`; c.lineWidth = 1.4; c.stroke(); }
    c.globalCompositeOperation = 'source-over';
  }, W, H, 30);
  useEffect(() => { if (sel == null) return; const t = setTimeout(() => setSel(null), 4000); return () => clearTimeout(t); }, [sel]);
  return <div className="hub" role="group" aria-label="الوحدات الرئيسية">
    <div className="hub-disc" /><div className="hub-r1" /><div className="hub-r3" />
    <div className="hub-halo" /><canvas ref={ref} className="hub-cv" style={{ width: W, height: H }} aria-hidden="true" /><div className="hub-beam" />
    <svg className="hub-cube" viewBox="0 0 104 110" aria-hidden="true"><defs>
      <filter id="cglw" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      <filter id="cglw2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      <linearGradient id="cfT" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4aa6ff" stopOpacity=".75" /><stop offset="1" stopColor="#1650e6" stopOpacity=".7" /></linearGradient>
      <linearGradient id="cfL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1e6cff" stopOpacity=".78" /><stop offset=".55" stopColor="#0b3ccc" stopOpacity=".72" /><stop offset="1" stopColor="#2b90ff" stopOpacity=".85" /></linearGradient>
      <linearGradient id="cfR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1450e0" stopOpacity=".8" /><stop offset=".55" stopColor="#072ea8" stopOpacity=".75" /><stop offset="1" stopColor="#2486ff" stopOpacity=".85" /></linearGradient>
      <radialGradient id="cfIn" cx=".5" cy=".85" r=".6"><stop offset="0" stopColor="#8fd6ff" stopOpacity=".85" /><stop offset=".35" stopColor="#3f9cff" stopOpacity=".5" /><stop offset="1" stopColor="#0a2a90" stopOpacity="0" /></radialGradient>
      <linearGradient id="cgB" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#b87510" /><stop offset=".5" stopColor="#ffc940" /><stop offset="1" stopColor="#fff5cc" /></linearGradient>
      <linearGradient id="cgS" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#d08410" /><stop offset=".55" stopColor="#ffcc48" /><stop offset="1" stopColor="#fff2bf" /></linearGradient></defs>
      <path d="M52 62 L52 4 M52 62 L4 84 M52 62 L100 84" stroke="#8fd0ff" strokeWidth=".9" opacity=".55" />
      <path d="M4 26 L52 48 L52 106 L4 84Z" fill="url(#cfL)" /><path d="M100 26 L52 48 L52 106 L100 84Z" fill="url(#cfR)" /><ellipse cx="52" cy="88" rx="46" ry="24" fill="url(#cfIn)" />
      <g filter="url(#cglw2)"><rect x="32" y="66" width="9" height="16" rx="1.2" fill="url(#cgB)" /><rect x="46" y="56" width="9" height="26" rx="1.2" fill="url(#cgB)" /><rect x="60" y="44" width="9" height="38" rx="1.2" fill="url(#cgB)" />
        <path d="M22 76 C19 89 44 93 63 85 C73 81 79 72 82 57" fill="none" stroke="url(#cgS)" strokeWidth="4.4" strokeLinecap="round" /><path d="M75 58 L84 46 L88 61Z" fill="#ffeaa0" /></g>
      <path d="M52 4 L100 26 L52 48 L4 26Z" fill="url(#cfT)" /><path d="M8 30 L48 48 L48 58 L8 40Z" fill="#fff" opacity=".07" />
      <g filter="url(#cglw)" fill="none" stroke="#9fe0ff" strokeWidth="1.5" strokeLinejoin="round"><path d="M52 4 L100 26 L52 48 L4 26Z" /><path d="M4 26 L4 84 L52 106 L100 84 L100 26" /><path d="M52 48 L52 106" /></g>
      <circle cx="52" cy="4" r="1.8" fill="#fff" filter="url(#cglw)" /><circle cx="52" cy="106" r="2" fill="#fff" filter="url(#cglw)" /></svg>
    {nodes.slice(0, 8).map((n, i) => <button key={n.label} type="button" className={`hub-node${n.big ? ' big' : ''}${sel === i ? ' on' : ''}`} style={{ left: NODE_POS[i][0], top: NODE_POS[i][1], animationDelay: `${i * .4}s` }}
      onClick={() => (sel === i ? onOpen(n.to) : setSel(i))} title={`${n.label}: ${n.info}`}><GIcon n={n.icon} size={n.big ? 32 : 26} /><span>{n.label}</span></button>)}
    {sel != null && <div className="hub-info"><b>{nodes[sel].label}</b> · {nodes[sel].info} <button type="button" onClick={() => onOpen(nodes[sel].to)}>فتح</button></div>}
  </div>;
}

// ---------- الشعار الافتراضي ----------
export const SahmLogo = ({ size = 56 }: { size?: number }) => <svg width={size} height={size} viewBox="0 0 62 62" aria-hidden="true" className="sahm-logo"><defs>
  <linearGradient id="lgF" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#a86a0a" /><stop offset=".45" stopColor="#f5b935" /><stop offset="1" stopColor="#fff4c4" /></linearGradient>
  <linearGradient id="lgS" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#6e4406" /><stop offset="1" stopColor="#c88a1c" /></linearGradient>
  <linearGradient id="lgR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#e09a22" /><stop offset=".5" stopColor="#ffd567" /><stop offset="1" stopColor="#b8770f" /></linearGradient>
  <linearGradient id="lgA" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#e8e8ee" /><stop offset="1" stopColor="#ffffff" /></linearGradient></defs>
  <path d="M30 50 C14 49 4 45 5 41 C6 38 14 36 24 35.6" fill="none" stroke="url(#lgR)" strokeWidth="2" opacity=".75" />
  <path d="M12 44 L12 33 L17 31 L17 46Z" fill="url(#lgF)" /><path d="M17 31 L19.5 32 L19.5 46.6 L17 46Z" fill="url(#lgS)" />
  <path d="M22 47 L22 26 L27 24 L27 48Z" fill="url(#lgF)" /><path d="M27 24 L29.5 25 L29.5 48.4 L27 48Z" fill="url(#lgS)" />
  <path d="M32 48 L32 18 L37 16 L37 48.6Z" fill="url(#lgF)" /><path d="M37 16 L39.5 17 L39.5 48.4 L37 48.6Z" fill="url(#lgS)" />
  <path d="M42 47 L42 12 L47 10 L47 47.2Z" fill="url(#lgA)" /><path d="M47 10 L49.5 11 L49.5 46.4 L47 47.2Z" fill="#bfc3cf" />
  <path d="M39.5 13.5 L46 2 L53 12.5 L49.5 11.4 L47 10 L42 12Z" fill="#ffffff" />
  <path d="M4.5 46 C10 54 34 56 48 48 C54 44.5 57 40 55 37" fill="none" stroke="url(#lgR)" strokeWidth="3.6" strokeLinecap="round" /></svg>;

/** عدّاد يبدأ من الصفر عند الظهور */
export function CountUp({ value, dec = 0, dur = 1500 }: { value: number; dec?: number; dur?: number }) {
  const [v, setV] = useState(() => (motionReduced() ? value : 0));
  useEffect(() => { if (motionReduced()) { setV(value); return; } let raf = 0; const t0 = performance.now(); const step = (ts: number) => { const p = Math.min(1, (ts - t0) / dur); setV(value * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [value, dur]);
  return <>{v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}</>;
}
