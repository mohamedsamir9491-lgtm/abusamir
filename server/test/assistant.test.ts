import { describe, it, expect } from 'vitest';
import { officeAnswer } from '../src/modules/ai/office.js';

const dash = {
  counts: { clients: '1', group_companies: '4', active_engagements: '1', high_findings: '7', high_findings_engs: '3', requests: '22', requests_essential: '13', draft_reports: '0', reports_awaiting: '0', users: '1' },
  finance: { year: 2026, billed: 23000, collected: 11500, collected_gross: 13225, collection_rate: 50, outstanding: 13225, aging: [{ key: 'not_due', label: 'لم يحن موعدها', v: 13225 }, { key: 'd30', label: 'حتى 30 يومًا', v: 0 }], late_clients: 0,
    months: Array.from({ length: 12 }, (_, i) => ({ m: i + 1, billed: i === 10 ? 23000 : 0, collected: i === 10 ? 11500 : 0 })), earned: 30666.67, unbilled: 7666.67, deferred: 0, awaiting_signature: { count: 0, value: 0 }, pipeline: [], mix: [], target: null },
  engagements: [{ client_name: 'شركة أسس القابضة', title: 'تقييم دفتري', fee: 46000, billed: 23000, collected_net: 11500, remaining: 34500, lifecycle: 'signed', progress: { done: 4, total: 6 } }],
  deadlines: [{ date: '2026-11-10', title: 'استحقاق المطالبة CL-2026-0001', client: 'شركة أسس القابضة', tone: 'gold' }], top: [], team: [], activity: [], office_configured: false,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async () => dash as any;

describe('مساعد سهم على مستوى المكتب', () => {
  it('يجيب عن المستحقات من الدورة المالية', async () => { const a = await officeAnswer('كم المستحق على العملاء؟', load); expect(a?.intent).toBe('office.receivables'); expect(a?.text[0]).toContain('13,225.00'); expect(a?.text.join(' ')).toContain('10 نوفمبر 2026'); });
  it('يفهم التحصيل بالأرقام العربية والهمزات', async () => { const a = await officeAnswer('كم حصّلنا هذا العام؟', load); expect(a?.intent).toBe('office.collected'); expect(a?.text.join(' ')).toContain('11,500.00'); expect(a?.text.join(' ')).toContain('50%'); });
  it('يجد العميل بالاسم دون همزة', async () => { const a = await officeAnswer('وضع اسس', load); expect(a?.intent).toBe('office.client'); expect(a?.text[0]).toContain('المتبقي 34,500.00'); });
  it('يصوغ العدد بالعربية الصحيحة', async () => { const a = await officeAnswer('ملخص المكتب', load); expect(a?.text[0]).toContain('عميل نشط واحد'); expect(a?.text[0]).toContain('ارتباط واحد'); expect(a?.text.join(' ')).toContain('22 طلبًا معلقًا'); });
  it('يترك أسئلة القوائم لمحاسب الارتباط', async () => { expect(await officeAnswer('كم إجمالي الأصول؟', load)).toBeNull(); });
});
