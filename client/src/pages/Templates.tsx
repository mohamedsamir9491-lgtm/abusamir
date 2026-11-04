import { useState } from 'react';
import { Plus } from 'lucide-react';
import { get, post, put, del } from '../api';
import { Page, useLoad, Spinner, useAction, Modal, Field, DangerButton } from '../components/ui';
import { useAuth } from '../auth';

interface Sec { key: string; type: string; title_ar: string; title_en: string; enabled: boolean; order: number; options?: Record<string, unknown> }
interface Tpl { id: string; code: string; report_type: string; name_ar: string; name_en: string; description: string | null; sections: Sec[]; is_system: boolean; is_active: boolean }

export function Templates() {
  const { can } = useAuth(); const { run, busy } = useAction(); const [edit, setEdit] = useState<Tpl | null>(null); const [isNew, setIsNew] = useState(false);
  const { data, loading, reload } = useLoad(() => get<{ templates: Tpl[]; section_types: Record<string, string> }>('/report-templates'), []);
  if (loading || !data) return <Spinner />;
  const clone = (t: Tpl) => { setEdit({ ...t, id: '', code: `${t.code}_CUSTOM_${Date.now().toString(36).toUpperCase()}`, name_ar: `${t.name_ar} (نسخة)`, is_system: false }); setIsNew(true); };
  const save = async () => { if (!edit) return; const body = { code: edit.code, report_type: edit.report_type, name_ar: edit.name_ar, name_en: edit.name_en, description: edit.description ?? undefined, sections: edit.sections.map((s, i) => ({ ...s, order: i + 1 })) }; const r = await run(() => isNew ? post('/report-templates', body) : put(`/report-templates/${edit.id}`, { name_ar: body.name_ar, name_en: body.name_en, description: body.description, sections: body.sections }), 'تم الحفظ'); if (r) { setEdit(null); reload(); } };
  const upd = (i: number, p: Partial<Sec>) => edit && setEdit({ ...edit, sections: edit.sections.map((s, k) => k === i ? { ...s, ...p } : s) });
  const move = (i: number, d: number) => { if (!edit) return; const s = [...edit.sections]; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; setEdit({ ...edit, sections: s }); };
  return <Page title="قوالب التقارير" sub="القوالب تفصل العرض (الأقسام وترتيبها) عن الحسابات والنتائج. القوالب النظامية تُنسخ وتُعدَّل، ويمكن إنشاء قوالب مخصصة.">
    <div className="card"><table className="t"><thead><tr><th>القالب</th><th>الرمز</th><th>النوع</th><th>الأقسام</th><th>المصدر</th><th></th></tr></thead><tbody>{data.templates.map((t) => <tr key={t.id}><td><b>{t.name_ar}</b><div className="muted">{t.description}</div></td><td className="mono">{t.code}</td><td>{t.report_type}</td><td>{t.sections.filter((s) => s.enabled).length}/{t.sections.length}</td><td>{t.is_system ? <span className="badge neutral">نظامي</span> : <span className="badge ok">مخصص</span>}</td><td className="row">{can('templates.manage') && <><button className="btn sec sm" onClick={() => clone(t)}>نسخ وتعديل</button>{(!t.is_system || can('system.manage')) && <button className="btn sec sm" onClick={() => { setEdit(t); setIsNew(false); }}>تعديل</button>}{!t.is_system && <DangerButton text={`حذف القالب المخصص "${t.name_ar}"؟ التقارير المولَّدة منه تبقى.`} onConfirm={async () => { await run(() => del(`/report-templates/${t.id}`), 'حُذف القالب'); reload(); }} />}</>}</td></tr>)}</tbody></table></div>
    {edit && <Modal title={isNew ? 'قالب جديد' : `تعديل: ${edit.name_ar}`} onClose={() => setEdit(null)} wide>
      <div className="grid c3"><Field label="الرمز"><input value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} disabled={!isNew} dir="ltr" /></Field><Field label="الاسم (عربي)"><input value={edit.name_ar} onChange={(e) => setEdit({ ...edit, name_ar: e.target.value })} /></Field><Field label="الاسم (إنجليزي)"><input value={edit.name_en} onChange={(e) => setEdit({ ...edit, name_en: e.target.value })} dir="ltr" /></Field></div>
      <Field label="الوصف"><input value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
      <h3>الأقسام</h3>{edit.sections.map((s, i) => <div key={s.key} className={`sec-item ${s.enabled ? '' : 'off'}`}><div className="head"><input type="checkbox" checked={s.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} /><input value={s.title_ar} onChange={(e) => upd(i, { title_ar: e.target.value })} style={{ flex: 1 }} /><select value={s.type} onChange={(e) => upd(i, { type: e.target.value })}>{Object.entries(data.section_types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="btn sec sm" onClick={() => move(i, -1)}>↑</button><button className="btn sec sm" onClick={() => move(i, 1)}>↓</button><button className="btn sec sm" onClick={() => setEdit({ ...edit, sections: edit.sections.filter((_, k) => k !== i) })}>حذف</button></div></div>)}
      <div className="row between"><button className="btn sec sm" onClick={() => setEdit({ ...edit, sections: [...edit.sections, { key: `custom_${Date.now().toString(36)}`, type: 'custom_text', title_ar: 'قسم جديد', title_en: 'New section', enabled: true, order: edit.sections.length + 1 }] })}><Plus size={15} /> قسم</button><button className="btn" onClick={save} disabled={busy}>حفظ القالب</button></div></Modal>}
  </Page>;
}
