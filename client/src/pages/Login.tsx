import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { post } from '../api';
import { Field, useToast } from '../components/ui';

export function Login() {
  const { login } = useAuth(); const nav = useNavigate(); const { show } = useToast();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); try { await login(email, password); nav('/'); } catch (err) { show((err as Error).message, true); } finally { setBusy(false); } };
  return <div className="login"><form className="box" onSubmit={submit}>
    <h1 style={{ textAlign: 'center' }}>منصة التحليل المالي</h1><p className="muted" style={{ textAlign: 'center', marginTop: 0 }}>مكتب المحاسبة - دخول المستخدمين المصرح لهم فقط</p>
    <Field label="البريد الإلكتروني"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus dir="ltr" /></Field>
    <Field label="كلمة المرور"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" /></Field>
    <button className="btn lg" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>{busy ? 'جارٍ الدخول…' : 'تسجيل الدخول'}</button>
    <p className="muted" style={{ marginTop: 14 }}>البيانات المالية سرية. كل عمليات الدخول والوصول مسجلة في سجل التدقيق.</p>
  </form></div>;
}

export function ChangePassword() {
  const { refresh } = useAuth(); const nav = useNavigate(); const { show } = useToast();
  const [cur, setCur] = useState(''); const [nw, setNw] = useState(''); const [nw2, setNw2] = useState('');
  const submit = async (e: React.FormEvent) => { e.preventDefault(); if (nw !== nw2) return show('كلمتا المرور غير متطابقتين', true); try { await post('/auth/change-password', { current_password: cur, new_password: nw }); show('تم تغيير كلمة المرور'); await refresh(); nav('/'); } catch (err) { show((err as Error).message, true); } };
  return <div className="login"><form className="box" onSubmit={submit}><h1>تغيير كلمة المرور</h1><p className="muted">يجب تغيير كلمة المرور المؤقتة قبل المتابعة (10 أحرف على الأقل).</p>
    <Field label="كلمة المرور الحالية"><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required dir="ltr" /></Field>
    <Field label="كلمة المرور الجديدة"><input type="password" value={nw} onChange={(e) => setNw(e.target.value)} required minLength={10} dir="ltr" /></Field>
    <Field label="تأكيد كلمة المرور الجديدة"><input type="password" value={nw2} onChange={(e) => setNw2(e.target.value)} required dir="ltr" /></Field>
    <button className="btn lg" style={{ width: '100%', justifyContent: 'center' }}>حفظ</button></form></div>;
}
