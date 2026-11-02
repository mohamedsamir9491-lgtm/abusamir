import type { ZodType } from 'zod';
import { config } from '../../config.js';
import { one } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';

export interface AiRequest<T> { purpose: string; system: string; user: string; schema: ZodType<T>; maxTokens?: number }
export type AiResult<T> = { ok: true; data: T; model: string; inputTokens: number; outputTokens: number } | { ok: false; error: string; code: 'disabled' | 'not_authorized' | 'provider_error' | 'schema_rejected' | 'refusal'; raw?: unknown };

export interface AiProvider { name: string; available(): boolean; run<T>(req: AiRequest<T>): Promise<AiResult<T>> }

/** مزوّد معطل: يضمن استمرار عمل كل الوظائف الحتمية بدون ذكاء اصطناعي */
export const noneProvider: AiProvider = {
  name: 'none',
  available: () => false,
  async run() { return { ok: false, code: 'disabled', error: 'خدمة الذكاء الاصطناعي غير مفعّلة (AI_PROVIDER=none). الوظائف المحاسبية الحتمية تعمل بشكل كامل.' }; },
};

/** مزوّد Anthropic Claude عبر SDK الرسمي مع مخرجات منظمة محكومة بمخطط */
export const anthropicProvider: AiProvider = {
  name: 'anthropic',
  available: () => config.ai.provider === 'anthropic' && !!config.ai.anthropicApiKey,
  async run<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
      const client = new Anthropic({ apiKey: config.ai.anthropicApiKey, timeout: 10 * 60 * 1000 });
      const response = await client.messages.parse({
        model: config.ai.model,
        max_tokens: req.maxTokens ?? 16000,
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: req.user }],
        output_config: { format: zodOutputFormat(req.schema as never), effort: 'high' },
      });
      if (response.stop_reason === 'refusal') return { ok: false, code: 'refusal', error: `رفض المزوّد الطلب: ${response.stop_details?.explanation ?? ''}` };
      if (response.stop_reason === 'max_tokens') return { ok: false, code: 'provider_error', error: 'تم قطع المخرجات لتجاوز الحد الأقصى للرموز' };
      const parsed = (response as { parsed_output?: unknown }).parsed_output;
      const check = req.schema.safeParse(parsed);
      if (!check.success) return { ok: false, code: 'schema_rejected', error: 'مخرجات المزوّد لا تطابق المخطط المطلوب', raw: check.error.issues.slice(0, 10) };
      return { ok: true, data: check.data, model: response.model, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
    } catch (e) {
      logger.error({ err: e }, 'anthropic provider error');
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, code: 'provider_error', error: `تعذر الاتصال بمزوّد الذكاء الاصطناعي: ${msg}` };
    }
  },
};

export function getProvider(): AiProvider {
  return config.ai.provider === 'anthropic' ? anthropicProvider : noneProvider;
}

/** التحقق من التفويض قبل إرسال أي بيانات عميل لمزوّد خارجي */
export async function checkAuthorization(): Promise<{ allowed: boolean; reason?: string; shareClientNames: boolean }> {
  const provider = getProvider();
  if (!provider.available()) return { allowed: false, reason: provider.name === 'none' ? 'الذكاء الاصطناعي غير مفعّل في إعدادات الخادم (AI_PROVIDER).' : 'مفتاح المزوّد غير مضبوط (ANTHROPIC_API_KEY).', shareClientNames: false };
  if (!config.ai.allowExternal) return { allowed: false, reason: 'إرسال البيانات لمزوّد خارجي غير مصرّح به في إعدادات الخادم (AI_ALLOW_EXTERNAL=false).', shareClientNames: false };
  const policy = await one<{ value: { allow_external?: boolean; share_client_names?: boolean } }>(`SELECT value FROM system_settings WHERE key = 'ai_policy'`);
  if (!policy?.value?.allow_external) return { allowed: false, reason: 'سياسة النظام لا تسمح بإرسال بيانات العملاء لمزوّد خارجي. يمكن لمدير النظام تفعيلها من إعدادات النظام بعد الحصول على تفويض مناسب.', shareClientNames: false };
  return { allowed: true, shareClientNames: !!policy.value.share_client_names };
}
