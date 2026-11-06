import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { post } from '../api';

/** تقييم رد المساعد (حلقة التعلم): 👍 / 👎 مع سبب اختياري؛ تُراجع الردود السلبية من «الإعدادات ← أسئلة المساعد» */
export function Feedback({ logId }: { logId?: string | null }) {
  const [rated, setRated] = useState<1 | -1 | 0>(0); const [why, setWhy] = useState(''); const [ask, setAsk] = useState(false); const [sent, setSent] = useState(false);
  if (!logId) return null;
  const send = async (rating: 1 | -1, note?: string) => { setRated(rating); try { await post('/ai/feedback', { log_id: logId, rating, note: note || undefined }); } catch { /* التقييم لا يعطل المحادثة */ } };
  if (sent || (rated === 1)) return <div className="fb-done">شكرًا، سُجل تقييمك.</div>;
  return <div className="fb">
    {!ask ? <>
      <span>هل أفادك الرد؟</span>
      <button type="button" title="مفيد" onClick={() => send(1)}><ThumbsUp size={14} /></button>
      <button type="button" title="غير صحيح أو غير مفيد" onClick={() => { void send(-1); setAsk(true); }}><ThumbsDown size={14} /></button>
    </> : <form onSubmit={async (e) => { e.preventDefault(); await send(-1, why.trim()); setSent(true); }}>
      <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="ما الخطأ أو ما الذي كنت تتوقعه؟ (اختياري)" maxLength={500} />
      <button type="submit">إرسال</button>
    </form>}
  </div>;
}
