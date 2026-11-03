import { Fragment, useState } from 'react';
import { get } from '../api';
import { Page, useLoad, Spinner, Empty, Field } from '../components/ui';
import { fmtDate } from '../format';

type Row = Record<string, string | null | Record<string, unknown>>;
export function Audit() {
  const [action, setAction] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [offset, setOffset] = useState(0); const [openRow, setOpenRow] = useState<string | null>(null);
  const { data, loading } = useLoad(() => get<{ logs: Row[]; total: number }>(`/audit?limit=100&offset=${offset}${action ? `&action=${action}` : ''}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`), [action, from, to, offset]);
  return <Page title="سجل التدقيق" sub="من رفع، عدّل، راجع، اعتمد، صدّر أو حذف كل عنصر، مع الوقت وعنوان IP">
    <div className="card tight row"><Field label="الإجراء يبدأ بـ"><input value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} placeholder="مثل report. أو auth." dir="ltr" /></Field><Field label="من تاريخ"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="إلى تاريخ"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
    <div className="card">{loading ? <Spinner /> : !data?.logs.length ? <Empty /> : <><div className="muted">الإجمالي: {data.total}</div><table className="t"><thead><tr><th>الوقت</th><th>المستخدم</th><th>الإجراء</th><th>الكيان</th><th>العميل</th><th>IP</th></tr></thead><tbody>{data.logs.map((l) => <Fragment key={String(l.id)}><tr className="clickable" onClick={() => setOpenRow(openRow === l.id ? null : String(l.id))}><td>{fmtDate(String(l.created_at), { time: true })}</td><td>{String(l.user_name ?? '—')}</td><td className="mono" style={{ fontSize: 12 }}>{String(l.action)}</td><td className="mono" style={{ fontSize: 11 }}>{String(l.entity_type ?? '')} {String(l.entity_id ?? '').slice(0, 8)}</td><td>{String(l.client_name ?? '—')}</td><td className="mono" style={{ fontSize: 11 }}>{String(l.ip ?? '')}</td></tr>{openRow === l.id && <tr><td colSpan={6}><pre className="mono" style={{ direction: 'ltr', fontSize: 11, background: '#f6f8fb', padding: 8, margin: 0 }}>{JSON.stringify(l.details, null, 2)}</pre></td></tr>}</Fragment>)}</tbody></table>
      <div className="row" style={{ marginTop: 8 }}><button className="btn sec sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>السابق</button><button className="btn sec sm" disabled={offset + 100 >= data.total} onClick={() => setOffset(offset + 100)}>التالي</button></div></>}</div></Page>;
}
