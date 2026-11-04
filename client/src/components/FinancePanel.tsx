import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FilePenLine, Send, PenTool, ReceiptText, HandCoins, BadgeCheck, Plus, Trash2, Wand2, Ban, RotateCcw, Pencil } from 'lucide-react';
import { get, post, put, patch, del, upload } from '../api';
import { useAuth } from '../auth';
import { Spinner, Modal, Field, Money, useLoad, useAction, FileInput } from './ui';
import { Gauge } from './charts';
import { fmtMoney, fmtDate } from '../format';

type Inst = { id: string; seq: number; label: string; pct: string | null; amount: number; vat_rate: number; vat: number; total: number; trigger: string; due_date: string | null; billed: number; paid: number; claim_nos: string[]; state: string };
type Claim = { id: string; claim_no: string; installment_id: string | null; issue_date: string; due_date: string | null; description: string | null; amount: number; vat_rate: number; vat_amount: number; total: number; external_invoice_no: string | null; paid: number; balance: number; state: string; age_days: number | null };
type Pay = { id: string; payment_no: string; pay_date: string; amount: string; method: string; reference: string | null; claim_no: string };
type Fin = { engagement_id: string; letter: { letter_no: string | null; letter_date: string; lifecycle: string; sent_at: string | null; signed_at: string | null; signed_document_id: string | null; signed_title: string | null; valid_until: string | null; closed_at: string | null; fee_net: number; vat_rate: number } | null;
  installments: Inst[]; claims: Claim[]; payments: Pay[]; summary: { fee_net: number; billed: number; billed_gross: number; collected_gross: number; collected_net: number; outstanding: number; earned: number; unbilled: number; deferred: number; progress: { done: number; total: number; ratio: number }; remaining_to_bill: number } };
export const TRIGGER: Record<string, string> = { signing: 'عند التوقيع', delivery: 'عند تسليم التقرير', date: 'في تاريخ محدد', manual: 'يدوي' };
export const CLAIM_STATE: Record<string, [string, string]> = { paid: ['محصّلة', 'ok'], partial: ['محصّلة جزئيًا', 'warn'], unpaid: ['غير محصّلة', 'neutral'], overdue: ['متأخرة', 'danger'], cancelled: ['ملغاة', 'neutral'] };
const METHOD: Record<string, string> = { bank: 'تحويل بنكي', cash: 'نقدًا', cheque: 'شيك', card: 'بطاقة', other: 'أخرى' };
const todayIso = () => new Date().toISOString().slice(0, 10);

/** الدورة المالية للارتباط: الخطاب ← التوقيع ← جدول الأتعاب ← المطالبات ← التحصيلات */
export function FinancePanel({ engagementId, compact }: { engagementId: string; compact?: boolean }) {
  const { can } = useAuth(); const { run, busy } = useAction();
  const { data, loading, reload } = useLoad(() => get<Fin>(`/finance/engagement/${engagementId}`), [engagementId]);
  const [modal, setModal] = useState<null | { kind: 'sign' | 'sent' | 'claim' | 'pay' | 'inst'; inst?: Inst; claim?: Claim }>(null);
  if (!can('finance.view')) return null;
  if (loading || !data) return <div className="card"><Spinner /></div>;
  const L = data.letter; const S = data.summary; const lc = L?.lifecycle ?? 'none'; const manage = can('finance.manage');
  const act = async (action: string, body: Record<string, unknown> = {}) => { const r = await run(() => post(`/finance/engagement/${engagementId}/lifecycle`, { action, ...body }), 'تم'); if (r) reload(); };
  const billedN = data.installments.filter((i) => i.billed > 0).length; const paidN = data.installments.filter((i) => i.state === 'paid').length;
  const steps: [typeof FilePenLine, string, string, 'done' | 'cur' | ''][] = [
    [FilePenLine, 'مسودة الخطاب', L ? fmtDate(L.letter_date) : 'لم يُنشأ', L ? 'done' : 'cur'],
    [Send, 'صدر وأُرسل', L?.sent_at ? fmtDate(L.sent_at) : lc === 'issued' ? 'صدر ولم يُرسل' : '', ['sent', 'signed', 'closed'].includes(lc) ? 'done' : ['draft', 'issued'].includes(lc) ? 'cur' : ''],
    [PenTool, 'وقّعه العميل', L?.signed_at ? `${fmtDate(L.signed_at)} | النسخة الموقعة مرفوعة` : L?.valid_until ? `العرض صالح حتى ${fmtDate(L.valid_until)}` : '', ['signed', 'closed'].includes(lc) ? 'done' : lc === 'sent' ? 'cur' : ''],
    [ReceiptText, 'المطالبات', data.installments.length ? `${billedN} من ${data.installments.length} دفعات | ${fmtMoney(S.billed_gross)}` : 'بعد التوقيع', data.installments.length && billedN === data.installments.length ? 'done' : lc === 'signed' ? 'cur' : ''],
    [HandCoins, 'التحصيل', S.billed_gross ? `${fmtMoney(S.collected_gross)} من ${fmtMoney(S.billed_gross)}` : '', data.installments.length && paidN === data.installments.length ? 'done' : S.collected_gross > 0 ? 'cur' : ''],
    [BadgeCheck, 'إقفال الارتباط', L?.closed_at ? fmtDate(L.closed_at) : `تقدم التنفيذ ${S.progress.done}/${S.progress.total}`, lc === 'closed' ? 'done' : ''],
  ];
  return <div className="card">
    <div className="ch"><ReceiptText size={17} /><span>الدورة المالية للارتباط</span>{L?.letter_no && <span className="muted" style={{ fontSize: 12 }}>خطاب {L.letter_no}</span>}
      <span className="end row" style={{ gap: 6 }}>{!L ? <Link className="btn sm" to={`/engagements/${engagementId}/letter`}><FilePenLine size={15} /> إنشاء خطاب الارتباط</Link> : manage && <>
        {['draft', 'issued'].includes(lc) && <button className="btn sec sm" disabled={busy} onClick={() => setModal({ kind: 'sent' })}><Send size={15} /> تعليم كمرسل للعميل</button>}
        {['draft', 'issued', 'sent'].includes(lc) && <button className="btn sm" disabled={busy} onClick={() => setModal({ kind: 'sign' })}><PenTool size={15} /> رفع النسخة الموقعة</button>}
        {lc === 'signed' && <button className="btn sec sm" disabled={busy} onClick={() => confirm('إقفال الارتباط بعد التسليم والتحصيل؟') && act('close')}><BadgeCheck size={15} /> إقفال</button>}
        {['closed', 'cancelled'].includes(lc) && <button className="btn sec sm" onClick={() => act('reopen')}><RotateCcw size={15} /> إعادة فتح</button>}
        {!['closed', 'cancelled'].includes(lc) && <button className="btn danger-outline sm" onClick={() => confirm('إلغاء الخطاب؟ لن يُحتسب في الإيرادات') && act('cancel')}><Ban size={15} /></button>}</>}</span></div>
    <div className="life">{steps.map(([I, l, d, st]) => <div key={l} className={`lf ${st}`}><span className="lfi"><I size={18} /></span><b>{l}</b><small>{d}</small></div>)}</div>
    <div className="dgrid" style={{ marginTop: 16 }}>
      <div className="s8"><div className="phk" style={{ marginTop: 0 }}>
        <div><small>الأتعاب (بدون الضريبة)</small><b>{fmtMoney(S.fee_net)}</b></div><div><small>المفوتر</small><b>{fmtMoney(S.billed)}</b></div><div><small>المحصّل (بدون الضريبة)</small><b className="okt">{fmtMoney(S.collected_net)}</b></div><div><small>المستحق على العميل</small><b className={S.outstanding > 0 ? 'warnt' : ''}>{fmtMoney(S.outstanding)}</b></div></div>
        <div className="kvs" style={{ marginTop: 10 }}><div><small>الإيراد المكتسب حسب مرحلة التنفيذ ({S.progress.done}/{S.progress.total})</small><b>{fmtMoney(S.earned)}</b></div><div><small>أعمال منفذة لم يُطالب بها</small><b>{fmtMoney(S.unbilled)}</b></div><div><small>مفوتر لم يُكتسب بعد (مقدّم)</small><b>{fmtMoney(S.deferred)}</b></div></div></div>
      <div className="s4" style={{ display: 'flex', justifyContent: 'center' }}><Gauge ratio={S.fee_net ? S.collected_net / S.fee_net : 0} label={S.fee_net ? `${Math.round(S.collected_net / S.fee_net * 100)}%` : '—'} sub="محصّل من الأتعاب" size={compact ? 160 : 190} /></div></div>
    {L && <><div className="ch" style={{ marginTop: 18 }}><span>جدول الأتعاب (الدفعات)</span><span className="end row" style={{ gap: 6 }}>{manage && <><button className="btn sec sm" onClick={async () => { const r = await run(() => post(`/finance/engagement/${engagementId}/installments/generate`), 'أُنشئ الجدول من الخطاب'); if (r) reload(); }}><Wand2 size={15} /> من الخطاب</button><button className="btn sec sm" onClick={() => setModal({ kind: 'inst' })}><Plus size={15} /> دفعة</button></>}</span></div>
      {!data.installments.length ? <div className="muted">يُنشأ جدول الدفعات تلقائيًا من الخطاب عند رفع النسخة الموقعة، أو بزر «من الخطاب». مبلغ الأتعاب في الخطاب: {fmtMoney(L.fee_net)}.</div> :
      <div className="tscroll" style={{ maxHeight: 'none' }}><table className="t ruled"><thead><tr><th>الدفعة</th><th>الاستحقاق</th><th className="num">الأتعاب</th><th className="num">الضريبة</th><th className="num">الإجمالي</th><th className="num">المحصّل</th><th>المطالبة</th><th>الحالة</th><th></th></tr></thead><tbody>
        {data.installments.map((i) => <tr key={i.id}><td><b>{i.label}</b>{i.pct && <small className="muted"> ({Number(i.pct)}%)</small>}</td><td>{TRIGGER[i.trigger]}{i.due_date ? ` | ${fmtDate(i.due_date)}` : ''}</td><td className="num"><Money v={i.amount} /></td><td className="num"><Money v={i.vat} /></td><td className="num"><b><Money v={i.total} /></b></td><td className="num"><Money v={i.paid} /></td><td>{i.claim_nos.join('، ') || '—'}</td>
          <td><span className={`badge ${i.state === 'paid' ? 'ok' : i.state === 'partial' ? 'warn' : i.state === 'billed' ? 'info' : 'neutral'}`}>{({ paid: 'محصّلة', partial: 'جزئيًا', billed: 'صدرت مطالبة', unbilled: 'لم يُطالب بها' } as Record<string, string>)[i.state]}</span></td>
          <td className="row" style={{ minWidth: 0 }}>{manage && i.billed < i.amount - 0.009 && lc !== 'cancelled' && <button className="btn sm" onClick={() => setModal({ kind: 'claim', inst: i })}><ReceiptText size={14} /> مطالبة</button>}{manage && !i.billed && <><button className="iconbtn sm" title="تعديل" onClick={() => setModal({ kind: 'inst', inst: i })}><Pencil size={14} /></button><button className="iconbtn sm" title="حذف" onClick={async () => { if (confirm('حذف الدفعة؟')) { const r = await run(() => del(`/finance/installments/${i.id}`)); if (r) reload(); } }}><Trash2 size={14} /></button></>}</td></tr>)}</tbody>
        <tfoot><tr className="total"><td>الإجمالي</td><td></td><td className="num"><Money v={data.installments.reduce((t, i) => t + i.amount, 0)} /></td><td className="num"><Money v={data.installments.reduce((t, i) => t + i.vat, 0)} /></td><td className="num"><Money v={data.installments.reduce((t, i) => t + i.total, 0)} /></td><td className="num"><Money v={data.installments.reduce((t, i) => t + i.paid, 0)} /></td><td colSpan={3}></td></tr></tfoot></table></div>}</>}
    {data.claims.length > 0 && <><div className="ch" style={{ marginTop: 18 }}><span>المطالبات</span></div><div className="tscroll" style={{ maxHeight: 'none' }}><table className="t ruled"><thead><tr><th>رقم المطالبة</th><th>رقم الفاتورة (نظامك)</th><th>التاريخ</th><th>الاستحقاق</th><th className="num">الإجمالي</th><th className="num">المحصّل</th><th className="num">المتبقي</th><th>الحالة</th><th></th></tr></thead><tbody>
      {data.claims.map((c) => <tr key={c.id}><td className="mono">{c.claim_no}</td><td>{manage && c.state !== 'cancelled' ? <input defaultValue={c.external_invoice_no ?? ''} placeholder="أدخل الرقم" onBlur={async (e) => { if (e.target.value !== (c.external_invoice_no ?? '')) { await run(() => patch(`/finance/claims/${c.id}`, { external_invoice_no: e.target.value }), 'حُفظ رقم الفاتورة'); reload(); } }} style={{ width: 140 }} /> : c.external_invoice_no ?? '—'}</td>
        <td>{fmtDate(c.issue_date)}</td><td>{c.due_date ? fmtDate(c.due_date) : '—'}{c.state === 'overdue' && <small className="dant"> ({c.age_days} يومًا)</small>}</td><td className="num"><Money v={c.total} /></td><td className="num"><Money v={c.paid} /></td><td className="num"><b><Money v={c.balance} /></b></td>
        <td><span className={`badge ${CLAIM_STATE[c.state][1]}`}>{CLAIM_STATE[c.state][0]}</span></td>
        <td className="row" style={{ minWidth: 0 }}>{manage && c.balance > 0.009 && c.state !== 'cancelled' && <button className="btn sm" onClick={() => setModal({ kind: 'pay', claim: c })}><HandCoins size={14} /> تحصيل</button>}{manage && c.paid === 0 && c.state !== 'cancelled' && <button className="iconbtn sm" title="إلغاء المطالبة" onClick={async () => { if (confirm(`إلغاء ${c.claim_no}؟`)) { await run(() => patch(`/finance/claims/${c.id}`, { cancel: true }), 'أُلغيت'); reload(); } }}><Ban size={14} /></button>}</td></tr>)}</tbody></table></div>
      <p className="muted" style={{ fontSize: 12 }}>المطالبة هنا داخلية مرتبطة بالخطاب. الفاتورة الضريبية الرسمية تصدر من نظام الفوترة الخاص بك، وتُسجَّل رقمها هنا للمطابقة.</p></>}
    {data.payments.length > 0 && <><div className="ch" style={{ marginTop: 10 }}><span>التحصيلات</span></div><table className="t ruled compact"><thead><tr><th>رقم السند</th><th>التاريخ</th><th>المطالبة</th><th>الطريقة</th><th>المرجع</th><th className="num">المبلغ</th><th></th></tr></thead><tbody>
      {data.payments.map((p) => <tr key={p.id}><td className="mono">{p.payment_no}</td><td>{fmtDate(p.pay_date)}</td><td className="mono">{p.claim_no}</td><td>{METHOD[p.method]}</td><td>{p.reference ?? '—'}</td><td className="num"><b><Money v={p.amount} /></b></td><td>{manage && <button className="iconbtn sm" title="حذف" onClick={async () => { if (confirm(`حذف التحصيل ${p.payment_no}؟`)) { await run(() => del(`/finance/payments/${p.id}`), 'حُذف'); reload(); } }}><Trash2 size={14} /></button>}</td></tr>)}</tbody></table></>}
    {modal?.kind === 'sign' && <SignModal engagementId={engagementId} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
    {modal?.kind === 'sent' && <SentModal onClose={() => setModal(null)} onSave={async (date, vu) => { setModal(null); await act('sent', { date, valid_until: vu || null }); }} />}
    {modal?.kind === 'claim' && modal.inst && <ClaimModal engagementId={engagementId} inst={modal.inst} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
    {modal?.kind === 'pay' && modal.claim && <PayModal claim={modal.claim} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
    {modal?.kind === 'inst' && <InstModal engagementId={engagementId} inst={modal.inst} vat={L?.vat_rate ?? 15} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
  </div>;
}

function SentModal({ onClose, onSave }: { onClose: () => void; onSave: (d: string, vu: string) => void }) {
  const [d, setD] = useState(todayIso()); const [vu, setVu] = useState('');
  return <Modal title="تعليم الخطاب كمرسل للعميل" onClose={onClose}><div className="grid c2"><Field label="تاريخ الإرسال"><input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field><Field label="العرض صالح حتى (اختياري)" hint="يظهر تنبيه عند انتهائه دون توقيع"><input type="date" value={vu} onChange={(e) => setVu(e.target.value)} /></Field></div>
    <div className="row end"><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" onClick={() => onSave(d, vu)}>حفظ</button></div></Modal>;
}
function SignModal({ engagementId, onClose, onDone }: { engagementId: string; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction(); const ref = useRef<HTMLInputElement>(null); const [d, setD] = useState(todayIso());
  const go = async () => { const f = ref.current?.files?.[0]; if (!f) return; const fd = new FormData(); fd.append('engagement_id', engagementId); fd.append('document_type', 'contract'); fd.append('title', `خطاب الارتباط الموقع - ${f.name}`.slice(0, 300)); fd.append('files', f);
    const r = await run(() => upload<{ documents: { id: string }[] }>('/documents/upload', fd)); const id = r?.documents?.[0]?.id; if (!id) return;
    const ok = await run(() => post(`/finance/engagement/${engagementId}/lifecycle`, { action: 'signed', date: d, signed_document_id: id }), 'سُجل توقيع العميل وأُنشئ جدول الأتعاب'); if (ok) onDone(); };
  return <Modal title="رفع النسخة الموقعة من العميل" onClose={onClose}><Field label="تاريخ توقيع العميل"><input type="date" value={d} onChange={(e) => setD(e.target.value)} /></Field><Field label="الخطاب الموقع (PDF أو صورة)"><FileInput inputRef={ref} label="اختر الخطاب الموقع" /></Field>
    <p className="muted">بعد الحفظ يصبح الخطاب «موقّعًا وساريًا»، ويُنشأ جدول الدفعات من نسب الأتعاب في الخطاب.</p><div className="row end"><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy} onClick={go}>{busy ? <Spinner /> : 'حفظ التوقيع'}</button></div></Modal>;
}
function ClaimModal({ engagementId, inst, onClose, onDone }: { engagementId: string; inst: Inst; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction(); const rem = Math.round((inst.amount - inst.billed) * 100) / 100;
  const [f, setF] = useState({ issue_date: todayIso(), due_date: '', amount: rem, vat_rate: inst.vat_rate, external_invoice_no: '', description: inst.label });
  const vat = Math.round(f.amount * f.vat_rate) / 100;
  return <Modal title={`مطالبة: ${inst.label}`} onClose={onClose}><div className="grid c2">
    <Field label="تاريخ المطالبة"><input type="date" value={f.issue_date} onChange={(e) => setF({ ...f, issue_date: e.target.value })} /></Field><Field label="تاريخ الاستحقاق"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>
    <Field label={`المبلغ بدون الضريبة (المتبقي ${fmtMoney(rem)})`}><input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field><Field label="نسبة الضريبة %"><input type="number" step="0.01" value={f.vat_rate} onChange={(e) => setF({ ...f, vat_rate: Number(e.target.value) })} /></Field>
    <Field label="رقم الفاتورة من نظام الفوترة (اختياري)"><input value={f.external_invoice_no} onChange={(e) => setF({ ...f, external_invoice_no: e.target.value })} /></Field><Field label="البيان"><input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field></div>
    <div className="kvs"><div><small>الضريبة</small><b>{fmtMoney(vat)}</b></div><div><small>الإجمالي المستحق على العميل</small><b>{fmtMoney(f.amount + vat)}</b></div></div>
    <div className="row end" style={{ marginTop: 12 }}><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy || f.amount <= 0} onClick={async () => { const r = await run(() => post('/finance/claims', { engagement_id: engagementId, installment_id: inst.id, ...f, due_date: f.due_date || null, external_invoice_no: f.external_invoice_no || null }), 'صدرت المطالبة'); if (r) onDone(); }}>إصدار المطالبة</button></div></Modal>;
}
function PayModal({ claim, onClose, onDone }: { claim: Claim; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction(); const [f, setF] = useState({ pay_date: todayIso(), amount: claim.balance, method: 'bank', reference: '' });
  return <Modal title={`تسجيل تحصيل على ${claim.claim_no}`} onClose={onClose}><div className="grid c2">
    <Field label="تاريخ التحصيل"><input type="date" value={f.pay_date} onChange={(e) => setF({ ...f, pay_date: e.target.value })} /></Field><Field label={`المبلغ (المتبقي ${fmtMoney(claim.balance)})`} hint="يمكن تسجيل تحصيل جزئي"><input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
    <Field label="الطريقة"><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field><Field label="المرجع (رقم الحوالة/الشيك)"><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field></div>
    <div className="row end"><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy || f.amount <= 0} onClick={async () => { const r = await run(() => post('/finance/payments', { claim_id: claim.id, ...f, reference: f.reference || null }), 'سُجل التحصيل'); if (r) onDone(); }}>تسجيل التحصيل</button></div></Modal>;
}
function InstModal({ engagementId, inst, vat, onClose, onDone }: { engagementId: string; inst?: Inst; vat: number; onClose: () => void; onDone: () => void }) {
  const { run, busy } = useAction(); const [f, setF] = useState({ label: inst?.label ?? '', amount: inst?.amount ?? 0, vat_rate: inst?.vat_rate ?? vat, trigger: inst?.trigger ?? 'manual', due_date: inst?.due_date ?? '', pct: inst?.pct ? Number(inst.pct) : null as number | null });
  return <Modal title={inst ? 'تعديل الدفعة' : 'دفعة جديدة'} onClose={onClose}><div className="grid c2">
    <Field label="البيان"><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></Field><Field label="المبلغ بدون الضريبة"><input type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></Field>
    <Field label="نسبة الضريبة %"><input type="number" step="0.01" value={f.vat_rate} onChange={(e) => setF({ ...f, vat_rate: Number(e.target.value) })} /></Field><Field label="الاستحقاق"><select value={f.trigger} onChange={(e) => setF({ ...f, trigger: e.target.value })}>{Object.entries(TRIGGER).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
    {f.trigger === 'date' && <Field label="التاريخ"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></Field>}</div>
    <div className="row end"><button className="btn sec" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy || f.label.trim().length < 2} onClick={async () => { const body = { ...f, due_date: f.due_date || null }; const r = await run(() => inst ? put(`/finance/installments/${inst.id}`, body) : post(`/finance/engagement/${engagementId}/installments`, body), 'حُفظت الدفعة'); if (r) onDone(); }}>حفظ</button></div></Modal>;
}
