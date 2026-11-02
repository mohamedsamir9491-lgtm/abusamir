import { z } from 'zod';

/** مخطط المخرجات المنظمة للمساعد الذكي - يُتحقق منه قبل الحفظ */
export const AiObservationSchema = z.object({
  title: z.string().min(3).max(200),
  category: z.enum(['accounting_issue', 'data_quality', 'documents_required', 'judgment', 'ai_observation']),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
  fs_line_or_account: z.string().max(120).nullable(),
  amount_quoted: z.string().max(40).nullable().describe('رقم منقول حرفيًا من البيانات المدخلة أو null'),
  evidence_refs: z.array(z.string().max(200)).max(10).describe('مراجع للبيانات المدخلة مثل: key_figures.revenue أو finding:F-0003 أو ratio:current_ratio'),
  explanation: z.string().min(10).max(2000),
  potential_impact: z.string().max(1000).nullable(),
  recommendation: z.string().max(1000).nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export const AiAnalysisSchema = z.object({
  executive_summary_ar: z.string().min(20).max(4000),
  financial_commentary_ar: z.string().min(20).max(8000),
  risk_assessment: z.object({
    liquidity: z.object({ level: z.enum(['low', 'medium', 'high', 'unknown']), rationale: z.string().max(1000) }),
    profitability: z.object({ level: z.enum(['low', 'medium', 'high', 'unknown']), rationale: z.string().max(1000) }),
    leverage: z.object({ level: z.enum(['low', 'medium', 'high', 'unknown']), rationale: z.string().max(1000) }),
    working_capital: z.object({ level: z.enum(['low', 'medium', 'high', 'unknown']), rationale: z.string().max(1000) }),
  }),
  observations: z.array(AiObservationSchema).max(40),
  management_questions: z.array(z.string().max(500)).max(30),
  documents_needed: z.array(z.string().max(300)).max(30),
  review_checklist: z.array(z.string().max(300)).max(40),
  limitations: z.array(z.string().max(500)).max(15).describe('حدود التحليل وما لم يُفحص'),
});
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;

export const AiSectionDraftSchema = z.object({
  text_ar: z.string().min(10).max(12000),
  figures_used: z.array(z.string().max(60)).max(60).describe('كل الأرقام المذكورة في النص حرفيًا'),
});
export type AiSectionDraft = z.infer<typeof AiSectionDraftSchema>;
