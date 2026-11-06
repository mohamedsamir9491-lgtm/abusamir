"""يجلب الملخص الرسمي (تبويب About) لكل معيار من موقع مؤسسة IFRS ويبني مصدرًا إضافيًا للمكتبة
python3 -I ifrs_fetch.py ifrs-summaries.json out.extra.json"""
import json, re, sys, html, subprocess, hashlib, time

AR = {
 'Conceptual Framework': 'الإطار المفاهيمي للتقرير المالي', 'IFRS 1': 'تطبيق المعايير الدولية للتقرير المالي لأول مرة', 'IFRS 2': 'الدفع على أساس السهم', 'IFRS 3': 'تجميع الأعمال',
 'IFRS 5': 'الأصول غير المتداولة المحتفظ بها للبيع والعمليات غير المستمرة', 'IFRS 6': 'استكشاف وتقييم الموارد المعدنية', 'IFRS 7': 'الأدوات المالية: الإفصاحات', 'IFRS 8': 'القطاعات التشغيلية',
 'IFRS 9': 'الأدوات المالية', 'IFRS 10': 'القوائم المالية الموحدة', 'IFRS 11': 'الترتيبات المشتركة', 'IFRS 12': 'الإفصاح عن الحصص في المنشآت الأخرى', 'IFRS 13': 'قياس القيمة العادلة',
 'IFRS 14': 'الحسابات التنظيمية المؤجلة', 'IFRS 15': 'الإيراد من العقود مع العملاء', 'IFRS 16': 'عقود الإيجار', 'IFRS 17': 'عقود التأمين', 'IFRS 18': 'العرض والإفصاح في القوائم المالية',
 'IFRS 19': 'المنشآت التابعة غير الخاضعة للمساءلة العامة: الإفصاحات', 'IAS 1': 'عرض القوائم المالية', 'IAS 2': 'المخزون', 'IAS 7': 'قائمة التدفقات النقدية', 'IAS 8': 'أساس إعداد القوائم المالية (السياسات المحاسبية والتغيرات في التقديرات والأخطاء)',
 'IAS 10': 'الأحداث بعد فترة التقرير', 'IAS 12': 'ضرائب الدخل', 'IAS 16': 'الممتلكات والآلات والمعدات', 'IAS 19': 'منافع الموظفين', 'IAS 20': 'المحاسبة عن المنح الحكومية والإفصاح عن المساعدات الحكومية',
 'IAS 21': 'آثار التغيرات في أسعار صرف العملات الأجنبية', 'IAS 23': 'تكاليف الاقتراض', 'IAS 24': 'الإفصاحات عن الأطراف ذات العلاقة', 'IAS 26': 'المحاسبة والتقرير عن برامج منافع التقاعد',
 'IAS 27': 'القوائم المالية المنفصلة', 'IAS 28': 'الاستثمارات في المنشآت الزميلة والمشروعات المشتركة', 'IAS 29': 'التقرير المالي في الاقتصادات ذات التضخم المرتفع', 'IAS 32': 'الأدوات المالية: العرض',
 'IAS 33': 'ربحية السهم', 'IAS 34': 'التقرير المالي الأولي', 'IAS 36': 'الهبوط في قيمة الأصول', 'IAS 37': 'المخصصات والالتزامات المحتملة والأصول المحتملة', 'IAS 38': 'الأصول غير الملموسة',
 'IAS 39': 'الأدوات المالية: الاعتراف والقياس', 'IAS 40': 'العقارات الاستثمارية', 'IAS 41': 'الزراعة', 'IFRIC 1': 'التغيرات في التزامات الإزالة والإعادة', 'IFRIC 2': 'حصص الأعضاء في المنشآت التعاونية',
 'IFRIC 5': 'الحقوق في صناديق الإزالة والإعادة والتأهيل البيئي', 'IFRIC 6': 'الالتزامات الناشئة عن المشاركة في سوق محدد (نفايات المعدات الكهربائية)', 'IFRIC 7': 'تطبيق منهج إعادة العرض وفق IAS 29',
 'IFRIC 10': 'التقرير المالي الأولي والهبوط', 'IFRIC 12': 'ترتيبات امتياز تقديم الخدمات', 'IFRIC 14': 'حد أصل المنافع المحددة ومتطلبات الحد الأدنى للتمويل', 'IFRIC 16': 'تحوطات صافي الاستثمار في عملية أجنبية',
 'IFRIC 17': 'توزيعات الأصول غير النقدية على الملاك', 'IFRIC 19': 'إطفاء الالتزامات المالية بأدوات حقوق الملكية', 'IFRIC 20': 'تكاليف إزالة الطبقة السطحية في مرحلة الإنتاج لمنجم سطحي', 'IFRIC 21': 'الرسوم الحكومية',
 'IFRIC 22': 'المعاملات بالعملة الأجنبية والمقابل المدفوع مقدمًا', 'IFRIC 23': 'عدم التيقن بشأن معالجات ضريبة الدخل', 'SIC-7': 'إدخال اليورو', 'SIC-10': 'المساعدات الحكومية غير المرتبطة بأنشطة تشغيلية محددة',
 'SIC-25': 'ضرائب الدخل: التغيرات في الوضع الضريبي للمنشأة أو مساهميها', 'SIC-29': 'ترتيبات امتياز تقديم الخدمات: الإفصاحات', 'SIC-32': 'الأصول غير الملموسة: تكاليف المواقع الإلكترونية',
 'Practice Statement 1': 'قائمة الممارسة 1: تعليق الإدارة', 'Practice Statement 2': 'قائمة الممارسة 2: إصدار أحكام الأهمية النسبية',
}

def code_of(title):
    m = re.match(r'(IFRS \d+|IAS \d+|IFRIC \d+|SIC-\d+)', title)
    if m: return m.group(1)
    if 'Conceptual' in title: return 'Conceptual Framework'
    m = re.search(r'Practice Statement (\d)', title)
    return f'Practice Statement {m.group(1)}' if m else title

def fetch(url):
    m = re.search(r'list-of-standards/([a-z0-9\-]+)', url)
    tab = f'https://www.ifrs.org/content/ifrs/home/issued-standards/list-of-standards/{m.group(1)}/jcr:content/root/responsivegrid/tabs/abouttab.nocache.html'
    r = subprocess.run(['curl', '-s', '-m', '40', '-A', 'Mozilla/5.0', tab], capture_output=True)
    s = r.stdout.decode('utf-8', 'ignore')
    t = re.sub(r'<script.*?</script>|<style.*?</style>', '', s, flags=re.S)
    t = re.sub(r'<(br|/p|/li|/h\d|/div)[^>]*>', '\n', t); t = re.sub(r'<[^>]+>', ' ', t); t = html.unescape(t)
    t = re.sub(r'[ \t\xa0]+', ' ', t); t = re.sub(r'\n\s*\n+', '\n', t).strip()
    t = re.split(r'\n\s*(Related active projects|Related completed projects|Related information|Video:)', t)[0]
    return tab, re.sub(r'^\s*About\s*\n', '', t).strip()

def main():
    src = json.load(open(sys.argv[1], encoding='utf-8')); out = sys.argv[2]
    code = 'ifrs-about'
    chunks = []
    for x in src:
        if re.search(r'Glossary|Issued Standards', x['title']): continue
        tab, text = fetch(x['url'])
        if len(text) < 120 or "couldn't find" in text: print('EMPTY', x['title'], tab); continue
        c = code_of(x['title']); ar = AR.get(c, '')
        name = re.sub(r'^(IFRS \d+|IAS \d+|IFRIC \d+|SIC-\d+)\s*', '', x['title']).strip(' :')
        chunks.append({'s': code, 'k': 'article', 'r': c, 'n': int(re.search(r'\d+', c).group()) if re.search(r'\d+', c) else 0,
                       'h': f'{ar} ({name})' if ar else name, 't': text, 'p1': 1, 'p2': 1})
        print('OK', c, len(text)); time.sleep(0.4)
    source = {'code': code, 'title': 'المعايير الدولية للتقرير المالي IFRS: الملخصات الرسمية', 'item': 'ملخص كل معيار وتاريخه من موقع مؤسسة IFRS (النص الكامل يتطلب تسجيلًا مجانيًا)',
              'cat': 'المعايير الدولية IFRS', 'type': 'standard', 'status': 'active', 'url': 'https://www.ifrs.org/issued-standards/list-of-standards/', 'page_url': 'https://www.ifrs.org/issued-standards/list-of-standards/',
              'sha256': hashlib.sha256(json.dumps(chunks, ensure_ascii=False).encode()).hexdigest(), 'pages': len(chunks), 'method': 'web', 'lang': 'en'}
    json.dump({'sources': [source], 'chunks': chunks}, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print('chunks', len(chunks))

if __name__ == '__main__':
    main()
