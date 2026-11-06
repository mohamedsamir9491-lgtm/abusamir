/** عتبات التحليل: قيم يقررها المكتب (حكم مهني)، لا تحددها المعايير. تُضبط من «الإعدادات ← سياسات المكتب»
 *  وتُذكر في كل ملاحظة تستخدمها أنها اجتهاد المكتب. القيم الافتراضية هي ما كان البرنامج يستخدمه. */
export interface AnalysisThresholds {
  variance_pct: number;            // VAR-001: تغير مجاميع القوائم مقابل الفترة السابقة
  material_change_pct: number;     // TB-014: تغير رصيد الحساب
  current_ratio_min: number;       // FS-010
  ocf_to_profit_min: number;       // FS-013: التدفق التشغيلي ÷ الربح
  dso_max_days: number;            // FS-014: فترة التحصيل
  concentration_pct: number;       // AR-003 / AP-003: تركز طرف واحد
  expense_concentration_pct: number; // LA-007
  related_party_pct: number;       // LA-008 (متوسطة)
  related_party_high_pct: number;  // LA-008 (مرتفعة)
  deferred_revenue_pct: number;    // LA-010
  lease_interest_min_pct: number;  // LA-004
  risk_cr_high: number; risk_cr_medium: number; risk_margin_medium_pct: number; risk_de_high: number; risk_de_medium: number; risk_wc_medium_pct: number; // تقييم المخاطر
  request_essential_pct: number; request_supporting_pct: number; // أولوية طلبات المستندات من إجمالي الأصول
}
export const DEFAULT_THRESHOLDS: AnalysisThresholds = {
  variance_pct: 10, material_change_pct: 25, current_ratio_min: 1, ocf_to_profit_min: 0.5, dso_max_days: 120, concentration_pct: 40,
  expense_concentration_pct: 40, related_party_pct: 20, related_party_high_pct: 40, deferred_revenue_pct: 30, lease_interest_min_pct: 0.2,
  risk_cr_high: 1, risk_cr_medium: 1.5, risk_margin_medium_pct: 5, risk_de_high: 2, risk_de_medium: 1, risk_wc_medium_pct: 10,
  request_essential_pct: 5, request_supporting_pct: 1,
};
export function thresholdsOf(v: unknown): AnalysisThresholds {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>; const out = { ...DEFAULT_THRESHOLDS };
  for (const k of Object.keys(out) as (keyof AnalysisThresholds)[]) { const n = Number(o[k]); if (Number.isFinite(n) && n >= 0) out[k] = n; }
  return out;
}
