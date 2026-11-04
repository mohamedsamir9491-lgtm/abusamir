"""تصحيح سياقي للرموز المتشابهة في ناتج التعرف الضوئي (OCR):
- داخل رقم: الحرف ا/أ/إ/آ أو l/I/| يُقرأ 1، و O/o يُقرأ 0 (مثل 1009ا14245 -> 1009114245)
- داخل كلمة عربية: الرقم ١ بين حرفين عربيين يُقرأ ا (مثل م١جد -> ماجد)
كل تصحيح يُحصى ليظهر تنبيه «للمراجعة»؛ النص الأصلي في الملف لا يتغير."""
import re

DIG = set('0123456789٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹')
AS_DIGIT = {'ا': '1', 'أ': '1', 'إ': '1', 'آ': '1', 'l': '1', 'I': '1', '|': '1', 'O': '0', 'o': '0'}
NUM_TOKEN = re.compile(r'[0-9٠-٩۰-۹اأإآlI|Oo][0-9٠-٩۰-۹اأإآlI|Oo,٬.٫/]*')
WORD_DIGIT = re.compile(r'(?<=[ء-ي])[١1](?=[ء-ي])')


def fix_numeric_token(t):
    """يعيد (النص بعد التصحيح، عدد التصحيحات) لرمز واحد."""
    digits = sum(ch in DIG for ch in t)
    sus = [ch for ch in t if ch in AS_DIGIT]
    # رقم حقيقي فيه رقمان على الأقل، والرموز المشتبهة قليلة ولا تشكل كلمة
    if digits >= 2 and sus and len(sus) <= max(1, digits // 3) and not re.search(r'[اأإآ]{2,}|[A-Za-z]{2,}', t):
        return ''.join(AS_DIGIT.get(ch, ch) for ch in t), len(sus)
    return t, 0


def fix_text(text):
    """تصحيح نص كامل: الأرقام داخل الكلمات والحروف داخل الأرقام."""
    count = 0

    def rep(m):
        nonlocal count
        s, n = fix_numeric_token(m.group(0)); count += n; return s
    out = NUM_TOKEN.sub(rep, text)
    out, n2 = WORD_DIGIT.subn('ا', out)
    return out, count + n2
