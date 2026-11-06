import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, ShieldCheck, BarChart3, BookOpenCheck, Building2 } from 'lucide-react';
import { useAuth } from '../auth';
import { post } from '../api';
import { useToast } from '../components/ui';
import { AmbientBg, SahmLogo } from '../components/glass';

/** واجهة الدخول بهوية سهم: خلفية الثيم الليلي المتحركة، لوحة الهوية، وبطاقة زجاجية للدخول */
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="lg"><AmbientBg />
    <div className="lg-wrap">
      <aside className="lg-brand">
        <div className="lg-logo"><SahmLogo size={78} /><div dir="ltr"><b>SAHM ERP</b><i dir="rtl">ســــهــــم</i><span>Enterprise Resource Planning</span></div></div>
        <h2>منصة المحاسبة والتحليل المالي والتقييم</h2>
        <ul>
          <li><BarChart3 size={18} /><span>تحليل الموازين والقوائم المالية، وكل ملاحظة بأساسها النظامي</span></li>
          <li><BookOpenCheck size={18} /><span>المكتبة النظامية: الزكاة والضرائب والجمارك والمعايير المعتمدة في المملكة</span></li>
          <li><Building2 size={18} /><span>التقييم وتوحيد المجموعات وخطابات الارتباط والأتعاب</span></li>
        </ul>
      </aside>
      <div className="lg-card">{children}</div>
    </div>
    <footer className="lg-foot"><ShieldCheck size={14} /> البيانات المالية سرية، وكل عمليات الدخول والوصول مسجلة في سجل التدقيق</footer>
  </div>;
}

function Input({ icon, label, type, value, onChange, autoFocus, minLength, autoComplete }: { icon: React.ReactNode; label: string; type: string; value: string; onChange: (v: string) => void; autoFocus?: boolean; minLength?: number; autoComplete?: string }) {
  const [show, setShow] = useState(false); const pwd = type === 'password';
  return <label className="lg-field"><span className="lg-label">{label}</span>
    <span className="lg-in">{icon}<input type={pwd && show ? 'text' : type} value={value} onChange={(e) => onChange(e.target.value)} required autoFocus={autoFocus} minLength={minLength} autoComplete={autoComplete} dir="ltr" />
      {pwd && <button type="button" className="lg-eye" onClick={() => setShow((s) => !s)} aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} title={show ? 'إخفاء' : 'إظهار'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>}</span></label>;
}

export function Login() {
  const { login } = useAuth(); const nav = useNavigate();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); try { await login(email, password); nav('/'); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } };
  return <Shell><form onSubmit={submit}>
    <h1>تسجيل الدخول</h1><p className="lg-sub">للمستخدمين المصرح لهم في المكتب</p>
    <Input icon={<Mail size={17} />} label="البريد الإلكتروني" type="email" value={email} onChange={setEmail} autoFocus autoComplete="username" />
    <Input icon={<Lock size={17} />} label="كلمة المرور" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
    {err && <div className="lg-err" role="alert">{err}</div>}
    <button className="lg-btn" disabled={busy}>{busy ? 'جارٍ الدخول…' : <>دخول <ArrowLeft size={18} /></>}</button>
    <p className="lg-hint">نسيت كلمة المرور؟ يعيد مدير النظام تعيينها من شاشة المستخدمين.</p>
  </form></Shell>;
}

export function ChangePassword() {
  const { refresh } = useAuth(); const nav = useNavigate(); const { show } = useToast();
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [nw2, setNw2] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setErr(''); if (nw !== nw2) { setErr('كلمتا المرور غير متطابقتين'); return; } setBusy(true); try { await post('/auth/change-password', { current_password: cur, new_password: nw }); show('تم تغيير كلمة المرور'); await refresh(); nav('/'); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } };
  return <Shell><form onSubmit={submit}>
    <h1>تغيير كلمة المرور</h1><p className="lg-sub">يجب تغيير كلمة المرور المؤقتة قبل المتابعة (10 أحرف على الأقل).</p>
    <Input icon={<Lock size={17} />} label="كلمة المرور الحالية" type="password" value={cur} onChange={setCur} autoFocus autoComplete="current-password" />
    <Input icon={<Lock size={17} />} label="كلمة المرور الجديدة" type="password" value={nw} onChange={setNw} minLength={10} autoComplete="new-password" />
    <Input icon={<Lock size={17} />} label="تأكيد كلمة المرور الجديدة" type="password" value={nw2} onChange={setNw2} minLength={10} autoComplete="new-password" />
    {err && <div className="lg-err" role="alert">{err}</div>}
    <button className="lg-btn" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ والمتابعة'}</button>
  </form></Shell>;
}
