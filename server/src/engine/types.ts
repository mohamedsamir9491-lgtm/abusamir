import type { Num } from './money.js';
import type { AccountType, NormalBalance } from './classification.js';

export interface TbEntry {
  account_code: string;
  account_name: string | null;
  opening_debit: Num; opening_credit: Num;
  period_debit: Num; period_credit: Num;
  closing_debit: Num; closing_credit: Num;
  source_row?: number | null;
  currency?: string;
}

export interface AccountMeta {
  code: string;
  name_ar: string;
  account_type: AccountType;
  sub_type: string;
  normal_balance: NormalBalance;
  fs_line_code: string;
  is_suspense: boolean;
  is_bank: boolean;
  confidence?: number;
}

export type FindingCategory = 'math_error' | 'data_quality' | 'accounting_issue' | 'documents_required' | 'judgment' | 'ai_observation';
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface EngineFinding {
  rule_code: string;
  category: FindingCategory;
  severity: Severity;
  title: string;
  description: string;
  account_code?: string | null;
  account_name?: string | null;
  fs_line_code?: string | null;
  amount?: string | null;
  source_row_ref?: string | null;
  evidence: Record<string, unknown>;
  calculation?: string | null;
  impact?: string | null;
  recommendation?: string | null;
  dedupe_key: string;
}

export const SEVERITY_RANK: Record<Severity, number> = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
export const SEVERITY_LABELS: Record<Severity, string> = { critical: 'حرج', high: 'مرتفع', medium: 'متوسط', low: 'منخفض', info: 'للعلم' };
export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  math_error: 'خطأ حسابي مؤكد', data_quality: 'جودة البيانات', accounting_issue: 'مسألة محاسبية محتملة',
  documents_required: 'يتطلب مستندات مؤيدة', judgment: 'يتطلب حكمًا مهنيًا', ai_observation: 'ملاحظة المساعد الذكي',
};
