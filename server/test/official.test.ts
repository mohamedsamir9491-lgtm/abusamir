import { describe, it, expect } from 'vitest';
import { parseOfficial, hijriToIso } from '../src/modules/official/parse.js';
const P = (page: number, text: string) => ({ page, method: 'text', text });
describe('official documents parser (MOC templates)', () => {
  it('reads an LLC founding contract with capital and work partners', () => {
    const r = parseOfficial([P(1, 'عقد\nتأسيس شركة\nشركة يونيسكوب سولوشنز\nذات مسؤولية محدودة'),
      P(2, 'رقم الطلب 866527          رقم النسخة الإلكترونية 1\nبعون الله وتوفيقه تم في   19/03/1447هـ الموافق   11/09/2025م تم الاتفاق بين كل من :\nشر يك برأس المال   الر ياض   السعودية   سعودية   7049496883   شركة أسس القابضة   الطرف الأول\nشر يك بالعمل   الر ياض   السعودية   السعودية   شر يك   حمد محمد ابن علي القحطاني   الطرف الثاني\nيكون المركز الرئيس للشركة في مدينة الر ياض\nحدد رأس مال الشركة ب ) (300000.0ر يال سعودي )ثلاثمائة ألف ر يال سعودي( مقسم إلى ) (2حصة   ،متساوية القيمة قيمة كل حصة ) (150000.0ر يال سعودي\nتم توز يعها على الشركاء كالآتي:\n300000.0   150000.0   0.0   2.0   شركة أسس القابضة\n300000.0   150000.0   0   2   الاجمالى'),
      P(3, 'ويقر الشركاء بأنه تم توز يع الحصص فيما بينهم وتم الوفاء بقيمتها كاملة .')], 'articles_of_association');
    expect(r.company_name.value).toBe('شركة يونيسكوب سولوشنز'); expect(r.legal_form.value).toBe('llc');
    expect(r.contract_date.value).toBe('2025-09-11'); expect(r.contract_date_hijri.value).toBe('19/03/1447');
    expect(r.capital.value).toBe(300000); expect(r.shares_count.value).toBe(2); expect(r.share_value.value).toBe(150000); expect(r.fully_paid.value).toBe(true);
    expect(r.head_office.value).toBe('الرياض');
    expect(r.partners.value?.map((p) => [p.name, p.nature, p.pct])).toEqual([['شركة أسس القابضة', 'capital', 100], ['حمد محمد ابن علي القحطاني', 'work', null]]);
  });
  it('reads JSC articles with partly paid capital and draft LLC articles', () => {
    const j = parseOfficial([P(1, 'نظام أساس\nمساهمة'), P(2, 'حدد رأس مال الشركة المصدر بخمسمائة ألف ر يال سعودي ) (500000ر يال مقسم الى ) (50000سهم أسمي متساوية القيمة،قيمة كل منها ) (10ر يال\nسعودي،وجميعها أسهم عادية مقابل حصص نقدية،وقيمة المدفوع منه نقدا مبلغ مئة و خمسة و عشرون ألف ر يال ) (125000ر يال،وقد تم ايداع')], 'articles_of_association');
    expect([j.legal_form.value, j.capital.value, j.shares_count.value, j.share_value.value, j.paid_capital.value, j.fully_paid.value]).toEqual(['jsc', 500000, 50000, 10, 125000, false]);
    const g = parseOfficial([P(1, 'نظام أساس\nشركة جراند إستيتس\nذات مسؤولية محدودة\nشخص واحد'), P(2, 'رقم الطلب 686084          مسودة 1          المركز الرئیسي الر ياض\n)ذات مسؤولية محدودة( مملوكة ل شركة أسس القابضة بموجب سجل تجارى رقم   7049496883عنوانها سعودية'), P(15, 'تبدأ السنة المالية الأولى للشركة من تار يخ قيدها بالسجل التجاري وتنتهي في 1447/07/11 هـ الموافق 2025/12/31 م')], 'articles_of_association');
    expect([g.is_draft.value, g.single_person.value, g.owner_name.value, g.owner_cr.value, g.fy_end_month.value, g.fy_end_day.value]).toEqual([true, true, 'شركة أسس القابضة', '7049496883', 12, 31]);
  });
  it('reads a decoded commercial registration certificate', () => {
    const c = parseOfficial([P(1, 'رمزك التجاري QR Code'), P(2, '7049496883\n1009214245\n1446/09/17 ه\nشركة أسس القابضة\nمساهمة \\ مقفلة سعودى\n500,000 ريال سعودي 125,000 ريال سعودي 50,000 10 ريال سعودي\nبندر مانع خرصان العجمي - رئيس مجلس الادارة حمد محمد ابن علي القحطاني - نائب رئيس مجلس الادارة\nعبدالمجيد عبدالله حمد بن نفيسه - عضومجلس إدارة\n1451/09/17 ه 250314784918 1446/09/17 ه')], 'commercial_registration');
    expect([c.unified_no.value, c.cr_no.value, c.cr_issue_hijri.value, c.cr_expiry_hijri.value, c.capital.value, c.paid_capital.value, c.shares_count.value, c.share_value.value, c.legal_form.value, c.closed_jsc.value]).toEqual(['7049496883', '1009214245', '1446/09/17', '1451/09/17', 500000, 125000, 50000, 10, 'jsc', true]);
    expect(c.board.value?.map((b) => b.name)).toEqual(['بندر مانع خرصان العجمي', 'حمد محمد ابن علي القحطاني', 'عبدالمجيد عبدالله حمد بن نفيسه']);
    expect(hijriToIso('1447/03/19')).toBe('2025-09-11');
  });
});
