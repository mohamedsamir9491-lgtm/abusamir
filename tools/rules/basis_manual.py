import json, gzip, re
c = json.load(gzip.open('/home/user/abusamir/server/assets/legal/corpus.json.gz'))
S = c['sources']; BASIS = json.load(open('basis_final.json', encoding='utf-8'))
def q(pref, rx, para=None, en=None, art=None, post=220):
  for s in S:
    t0 = s['title']
    if not t0.startswith(pref) and pref not in t0: continue
    if en is True and 'النص الكامل' not in t0: continue
    if en is False and 'النص الكامل' in t0: continue
    for ch in c['chunks']:
      if ch['s'] != s['code'] or (art and ch['r'] != art): continue
      t = re.sub(r'\s+', ' ', ch['t']); m = re.search(rx, t)
      if m:
        ref = art or (f'الفقرة {para}' if para else f"صفحة {ch.get('p1')}")
        return {'ref': ref, 'source': t0, 'quote': t[m.start():m.end() + post].strip()}
  raise SystemExit(f'MISS {pref} {rx}')
A = {
 'ias1_66': lambda: q('IAS 1 ', 'يجب على المنشأة تصنيف الأصل على أنه متداول', '66', False),
 'ias1_69': lambda: q('IAS 1 ', 'يجب على المنشأة تصنيف الالتزام على أنه متداول', '69', False),
 'ias1_79': lambda: q('IAS 1 ', 'لكل فئة من فئات رأس المال', '79', False),
 'ias1_25': lambda: q('IAS 1 ', 'أساس الاستمرارية ما لم تعتزم', '25', False),
 'ias1_38': lambda: q('IAS 1 ', 'معلومات مقارنة تتعلق بالفترة السابقة', '38', False),
 'ias1_106': lambda: q('IAS 1 ', 'يجب على المنشأة أن تعرض قائمة للتغيرات في حقوق', '106', False),
 'ias1_32': lambda: q('IAS 1 ', 'لايجوزللمنشأة أن تجري مقاصة', '32', False),
 'ifrs18_47': lambda: q('IFRS 18', r'47 An entity shall classify', '47', True),
 'ias7_18': lambda: q('IAS 7 ', r'18 An entity shall report cash flows from operating activities', '18', True),
 'ias7_21': lambda: q('IAS 7 ', r'21 An entity shall report separately major classes of gross cash receipts', '21', True),
 'ias16_30': lambda: q('IAS 16 ', r'30 After recognition as an asset, an item of property', '30', True),
 'ias16_58': lambda: q('IAS 16 ', r'58 Land and buildings are separable assets', '58', True),
 'ias16_50': lambda: q('IAS 16 ', r'50 The depreciable amount of an asset shall be allocated', '50', True),
 'ias38_97': lambda: q('IAS 38 ', r'97 The depreciable amount of an intangible asset with a finite', '97', True),
 'ias38_107': lambda: q('IAS 38 ', r'107 An intangible asset with an indefinite useful life', '107', True),
 'ifrs16_47': lambda: q('IFRS 16 ', r'47 A lessee shall either present in the statement of financial position', '47', True),
 'ifrs16_31': lambda: q('IFRS 16 ', r'31 A lessee shall apply the depreciation requirements', '31', True),
 'ifrs15_47': lambda: q('IFRS 15 ', r'47 An entity shall consider the terms of the contract', '47', True),
 'ifrs15_31': lambda: q('IFRS 15 ', r'31 An entity shall recognise revenue when', '31', True),
 'ifrs9_5515': lambda: q('IFRS 9 ', r'5\.5\.15 Despite paragraphs', '5.5.15', True),
 'ifrs9_551': lambda: q('IFRS 9 ', r'5\.5\.1 An entity shall recognise a loss allowance', '5.5.1', True),
 'ias32_11': lambda: q('IAS 32 ', r'equity instrument is any contract that evidences a residual interest', '11', True),
 'ias37_14': lambda: q('IAS 37 ', r'14 A provision shall be recognised', '14', True),
 'ias8_42': lambda: q('IAS 8 ', r'42 Subject to paragraph 43', '42', True),
 'ias34_4': lambda: q('IAS 34 ', r'Interim period is a financial reporting period shorter', '4', True),
 'ias27_10': lambda: q('IAS 27 ', r'10 When an entity prepares separate financial statements', '10', True),
 'ias36_59': lambda: q('IAS 36 ', r'59 If, and only if, the recoverable amount', '59', True),
 'ifrs10_b86': lambda: q('IFRS 10 ', r'B86 Consolidated financial statements', 'B86', True),
 'ifrs10_b92': lambda: q('IFRS 10 ', r'B92 The financial statements of the parent and its subsidiaries', 'B92', True),
 'isa210_10': lambda: q('معيار المراجعة 210', 'يجب أن تتضمن', '10', False),
 'isa450': lambda: q('معيار المراجعة 450', 'تجميع التحريفات المكتشفة', None, False),
 'isa240_je': lambda: q('معيار المراجعة 240', 'قيود اليومية والتعديلات الأخرى', None, False),
 'isa220_eqr': lambda: q('معيار المراجعة 220', 'فحص جودة الارتباط - تقويم موضوعي', None, False),
 'isa505': lambda: q('معيار المراجعة 505', 'طلب المصادقة', None, False),
 'isa320': lambda: q('معيار المراجعة 320', 'نسبة مئوية على أساس مرجعي', None, False),
 'isa520': lambda: q('معيار المراجعة 520', 'التقلبات أو العلاقات', None, False),
 'isa510': lambda: q('معيار المراجعة 510', 'الأرصدة الافتتاحية', None, False),
 'isa600': lambda: q('معيار المراجعة 600', 'مكونات المجموعة', None, False),
 'co_16': lambda: q('نظام الشركات — النص الموحد', 'تكون السنة المالية', art='المادة السادسة عشرة'),
 'co_4': lambda: q('نظام الشركات — النص الموحد', 'تتخذ الشركة', art='المادة الرابعة'),
 'cpa_5': lambda: q('نظام المحاسبين القانونيين', 'يمنح المحاسب القانوني', art='المادة الخامسة'),
 'endorse_ifrs': lambda: q('وثيقة اعتماد المعايير الدولية للتقرير المالي', 'وثيقة اعتماد', None, None),
}
B = lambda code: ('basis', code)
M = {
 'cls-finance-cost': 'ifrs18_47', 'cls-penalties': 'ifrs18_47', 'cls-finance-income': 'ifrs18_47', 'cls-other-income': 'ifrs18_47', 'cls-selling-expenses': 'ifrs18_47', 'cls-admin-expenses': 'ifrs18_47', 'cls-losses-other': 'ifrs18_47', 'fs-depreciation-own-line': 'ifrs18_47', 'fs-other-income-below-operating': 'ifrs18_47',
 'cls-depreciation-expense': 'ias16_50', 'cls-acc-dep': 'ias16_30', 'cls-ppe': 'ias16_30', 'val-land-not-depreciated': 'ias16_58', 'FA-002-accdep-over-cost': B('FA-002'), 'FA-003-fully-depreciated-charged': B('FA-003'), 'LA-001-no-ppe-dep': B('LA-001'), 'req-owner-valuation': 'ias16_30',
 'cls-lease-liability': 'ifrs16_47', 'cls-rou-asset': 'ifrs16_47', 'LA-003-rou-no-dep': B('LA-003'),
 'cls-retained-earnings': 'ias1_79', 'cls-share-capital': 'ias1_79', 'off-doc001-capital-mismatch': B('DOC-001'),
 'cls-owner-current': 'ias32_11', 'cls-owner-current-bilateral': 'ias1_32', 'req-contributions': 'ias32_11', 'rpt-nav-contributions': 'ias32_11',
 'cls-intangibles': 'ias38_97', 'kb-ias38': 'ias38_107', 'cls-sales-returns': 'ifrs15_47', 'AR-002-opposite-sign': B('AR-002'), 'fin-progress-6-steps': 'ifrs15_31',
 'fs-cf-indirect-operating': 'ias7_18', 'fs-cf-ecl-noncash': 'ias7_18', 'fs-cf-investing': 'ias7_21', 'TB-021-bank-credit': B('TB-021'),
 'prior-period-selection': 'ias1_38', 'prior-length-mismatch': 'ias1_38', 'rpt-comparative-prior': 'ias1_38', 'kb-ias1': 'ias1_25', 'LA-009-going-concern': B('LA-009'), 'FS-012-net-loss': B('FS-012'),
 'FS-014-high-dso': B('FS-014'), 'AR-aging-buckets': 'ifrs9_5515', 'kb-ifrs9': 'ifrs9_5515', 'rpt-aging-section': 'ifrs9_5515', 'AR-003-concentration': B('AR-003'), 'TB-022-allowance-over-ar': B('TB-022'),
 'INV-checks': B('INV-002'), 'TB-025-due-from-shareholder': B('TB-025'), 'LA-005-accrued-salaries': B('LA-005'), 'kb-ias37': 'ias37_14', 'kb-ias8': 'ias8_42', 'ai-partial-period': 'ias34_4',
 'JE-002-out-of-period': 'isa240_je', 'JE-004-duplicate-entries': 'isa240_je', 'ai-review-checklist': 'isa240_je', 'subledger-materiality-default': 'isa320', 'rpt-tb-checks-display': 'isa320', 'req-priority-thresholds': 'isa320',
 'TB-015-new-missing': 'isa520', 'rpt-variance-material': 'isa520', 'adj-workflow': 'isa450', 'rpt-adjustments-not-posted': 'isa450', 'cons-sensitivity': 'ias36_59',
 'cons-at-cost': 'ias27_10', 'rpt-nav-at-cost': 'ias27_10', 'grp-investment-cost-fallback': 'ias27_10', 'ws-E2-intercompany': 'ifrs10_b86', 'val-group-attributable-adjustments': 'ifrs10_b86', 'rpt-consolidation-elim-entries': 'ifrs10_b86', 'rpt-nav-no-sum-separate': 'ifrs10_b86', 'rpt-tpl-group-valuation': 'ifrs10_b86', 'grp-component-inherits': 'ifrs10_b92',
 'rpt-scope-exclusions': 'isa505', 'req-bank-statements': 'isa505', 'rpt-review-segregation': 'isa220_eqr', 'ltr-group-entities-table': 'isa600',
 'ltr-template-selection': 'isa210_10', 'ltr-mgmt-responsibilities': 'isa210_10', 'ltr-change-orders': 'isa210_10', 'ltr-acceptance': 'isa210_10', 'fin-auto-on-signing': 'isa210_10',
 'fy-full-year-definition': 'co_16', 'period-warnings': 'co_16', 'off-doc006-fy-mismatch': 'co_16', 'fy-default-dec31': 'co_16', 'fy-named-by-end-year': 'co_16', 'period-next-year': 'co_16',
 'rpt-entity-labels': 'co_4', 'off-doc007-legal-form': 'co_4', 'rpt-letterhead-license': 'cpa_5', 'ltr-signature-issued-only': 'cpa_5', 'rpt-framework-labels': 'endorse_ifrs', 'rpt-tpl-fs-analysis': 'ias1_106', 'rpt-summary-key-figures': 'ias1_38', 'rpt-cover-kv': 'ias1_38',
}
DESIGN = {'rpt-money-format': 'عرض: فواصل الآلاف والأقواس للسالب عرف محاسبي في العرض', 'period-phrase-reports': 'صياغة عرض للفترة', 'rpt-sfp-unbalanced-note': 'تنبيه عرض مبني على فحص حسابي (FS-001)',
          'rpt-official-data-section': 'عرض بيانات مستخرجة من المستندات الرسمية', 'rpt-nav-shareholder-net': 'حساب تقييمي داخلي (صافي حق المساهم)', 'req-official-docs': 'طلب مستندات (DOC-004 أساسه ISA 500)', 'req-partner-debit': 'طلب مستندات (TB-025 أساسه IAS 24.18)',
          'req-shareholders-register': 'طلب مستندات لتحديد نسب الملكية', 'req-classification': 'طلب توضيح لملاحظة TB-016 (أساسها IAS 1.66)', 'ltr-group-no-share-value': 'شرط تعاقدي في خطاب التقييم', 'ltr-zakat-tax-scope': 'نطاق خدمة استشارية يحدده المكتب',
          'ltr-vat-text': 'صياغة الضريبة في الخطاب (النسبة من جدول النسب)', 'fin-claim-vat': 'حساب حسابي للضريبة على المطالبة', 'fin-claim-not-tax-invoice': 'تنبيه أن الفاتورة الضريبية تصدر من نظام الفوترة الإلكترونية', 'oth-ai-policy': 'سياسة داخلية للمكتب',
          'ltr-confidentiality-data': 'بند تعاقدي (نظام حماية البيانات الشخصية غير موجود في المكتبة)', 'kb-zakat': 'إحالة عامة إلى اللائحة التنفيذية لجباية الزكاة (لا رقم ولا نسبة)', 'kb-vat': 'إحالة عامة لنظام ضريبة القيمة المضافة (لا رقم ولا نسبة)',
          'ltr-aup-isrs4400': 'نص ISRS 4400 في المكتبة مقروء ضوئيًا بجودة لا تسمح بمقتطف موثوق', 'ltr-aup-no-fraud-judgment': 'كسابقه (ISRS 4400)', 'ltr-independence': 'كسابقه (الميثاق الدولي لسلوك وآداب المهنة)', 'ltr-use-distribution': 'كسابقه (ISRS 4400)', 'ltr-compilation-isrs4410': 'نص ISRS 4410 في المكتبة مقروء ضوئيًا بجودة لا تسمح بمقتطف موثوق'}
cache = {}; out = {}
for rid, v in M.items():
  if isinstance(v, tuple):
    b = BASIS[v[1]]; it = b['items'][0]; out[rid] = {'ref': f"{it['source'].split(' — ')[0].split(' (')[0][:20]} {it['ref']}", 'source': it['source'], 'quote': it.get('quote', ''), 'via': v[1]}
  else:
    if v not in cache: cache[v] = A[v]()
    out[rid] = dict(cache[v])
for rid, why in DESIGN.items(): out[rid] = {'design': why}
json.dump(out, open('/tmp/claude-0/-workspace/3f0c9cdb-eb6b-5493-bc6e-a6b73e9bf13f/scratchpad/rules/pins2.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), sum(1 for x in out.values() if 'design' in x))
for k in ['cls-finance-cost', 'fy-full-year-definition', 'rpt-framework-labels', 'JE-004-duplicate-entries']: print(k, '|', out[k]['ref'], '|', out[k]['quote'][:120])
