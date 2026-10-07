/**
 * Arabic runtime translator: translates text, placeholders and aria-labels
 * rendered by the (English) React bundle via a MutationObserver on #root.
 * Paused / reverted by lang-switch.js through window._tcTranslatorPause().
 */
(function tcArabicTranslator() {
  'use strict';

  // ── Translation Dictionary ─────────────────────────────
  // Maps exact English strings → Arabic equivalents
  // Keys are lowercase-trimmed for matching
  const DICT = {
    // ── Navigation ──────────────────────────────────────
    'dashboard':                   'لوحة القيادة',
    'portfolio':                   'المحفظة',
    'projects':                    'المشاريع',
    'new project':                 'مشروع جديد',
    'create project':              'إنشاء مشروع',
    'settings':                    'الإعدادات',
    'profile':                     'الملف الشخصي',
    'logout':                      'تسجيل الخروج',
    'sign in':                     'تسجيل الدخول',
    'sign in to your account':     'تسجيل الدخول إلى حسابك',
    'register':                    'إنشاء حساب',
    'create account':              'إنشاء حساب',
    'create a free account':       'إنشاء حساب مجاني',
    'join a project':              'الانضمام إلى مشروع',
    'join project':                'انضمام للمشروع',
    'join':                        'انضمام',
    'cancel':                      'إلغاء',
    'save':                        'حفظ',
    'delete':                      'حذف',
    'edit':                        'تعديل',
    'close':                       'إغلاق',
    'back':                        'رجوع',
    'next':                        'التالي',
    'previous':                    'السابق',
    'submit':                      'إرسال',
    'update':                      'تحديث',
    'confirm':                     'تأكيد',
    'remove':                      'إزالة',
    'add':                         'إضافة',
    'create':                      'إنشاء',
    'loading...':                  'جارٍ التحميل...',
    'loading':                     'جارٍ التحميل',
    'saving...':                   'جارٍ الحفظ...',
    'error':                       'خطأ',
    'success':                     'تم بنجاح',

    // ── Project Views ────────────────────────────────────
    'overview':                    'نظرة عامة',
    'list':                        'قائمة',
    'wbs':                         'هيكل العمل WBS',
    'wbs planner':                 'مخطط هيكل العمل',
    'gantt':                       'مخطط جانت',
    'kanban board':                'لوحة كانبان',
    'claims':                      'المطالبات',
    'financial claims':            'المطالبات المالية',
    'risks':                       'المخاطر',
    'risk register':               'سجل المخاطر',
    'change requests':             'طلبات التغيير',
    'change request':              'طلب تغيير',
    'baselines':                   'خطوط الأساس',
    'baseline':                    'خط الأساس',
    'team':                        'الفريق',
    'members':                     'الأعضاء',
    'reports':                     'التقارير',

    // ── EVM Labels ───────────────────────────────────────
    'evm engine':                  'محرك القيمة المكتسبة',
    'evm':                         'القيمة المكتسبة',
    'earned value':                'القيمة المكتسبة',
    'cost performance index':      'مؤشر أداء التكلفة',
    'schedule performance index':  'مؤشر أداء الجدول',
    'estimate at completion':      'التقدير عند الاكتمال',
    'planned value':               'القيمة المخططة',
    'actual cost':                 'التكلفة الفعلية',
    'cost variance':               'انحراف التكلفة',
    'schedule variance':           'انحراف الجدول',
    'variance at completion':      'الانحراف عند الاكتمال',
    'to-complete performance index': 'مؤشر الأداء المستهدف',
    'percent complete':            'نسبة الاكتمال',
    'cost overrun':                'تجاوز التكلفة',
    'warning':                     'تحذير',
    'good':                        'جيد',

    // ── Project Fields ───────────────────────────────────
    'project name':                'اسم المشروع',
    'project code':                'رمز المشروع',
    'project owner':               'مالك المشروع',
    'start date':                  'تاريخ البداية',
    'end date':                    'تاريخ الانتهاء',
    'target end date':             'تاريخ الانتهاء المستهدف',
    'budget':                      'الميزانية',
    'currency':                    'العملة',
    'status':                      'الحالة',
    'priority':                    'الأولوية',
    'description':                 'الوصف',
    'department':                  'القسم',
    'methodology':                 'المنهجية',
    'template':                    'القالب',
    'progress':                    'التقدم',
    'health':                      'الصحة',
    'type':                        'النوع',

    // ── Status Values ────────────────────────────────────
    'not started':                 'لم يبدأ',
    'completed':                   'مكتمل',
    'on hold':                     'معلق',
    'cancelled':                   'ملغى',
    'active':                      'نشط',
    'inactive':                    'غير نشط',
    'draft':                       'مسودة',
    'approved':                    'معتمد',
    'pending':                     'قيد الانتظار',
    'rejected':                    'مرفوض',
    'open':                        'مفتوح',
    'closed':                      'مغلق',
    'resolved':                    'تم الحل',

    // ── Priority Values ──────────────────────────────────
    'high':                        'عالي',
    'medium':                      'متوسط',
    'low':                         'منخفض',

    // ── Kanban Columns ───────────────────────────────────
    'backlog':                     'متراكم',
    'to do':                       'للتنفيذ',
    'todo':                        'للتنفيذ',
    'in progress':                 'قيد التنفيذ',
    'review':                      'مراجعة',
    'done':                        'مكتمل',

    // ── WBS Types ────────────────────────────────────────
    'summary':                     'ملخص',
    'work package':                'حزمة عمل',
    'milestone':                   'معلم رئيسي',
    'task':                        'مهمة',
    'subtask':                     'مهمة فرعية',
    'deliverable':                 'مخرج',
    'phase':                       'مرحلة',

    // ── Risk Fields ──────────────────────────────────────
    'probability':                 'الاحتمالية',
    'impact':                      'الأثر',
    'mitigation':                  'التخفيف',
    'contingency':                 'الطوارئ',
    'risk score':                  'درجة المخاطرة',
    'risk level':                  'مستوى المخاطرة',
    'risk owner':                  'مالك المخاطرة',

    // ── Claim Fields ─────────────────────────────────────
    'invoice':                     'فاتورة',
    'purchase order':              'أمر شراء',
    'contract':                    'عقد',
    'vendor':                      'مورد',
    'amount':                      'المبلغ',
    'estimated':                   'تقديري',
    'actual':                      'فعلي',
    'approved amount':             'المبلغ المعتمد',
    'claim type':                  'نوع المطالبة',
    'claim status':                'حالة المطالبة',

    // ── Roles ────────────────────────────────────────────
    'project manager':             'مدير المشروع',
    'pm':                          'مدير مشروع',
    'pmo analyst':                 'محلل PMO',
    'analyst':                     'محلل',
    'executive':                   'مدير تنفيذي',
    'team member':                 'عضو فريق',
    'member':                      'عضو',
    'owner':                       'مالك',
    'admin':                       'مدير النظام',
    'viewer':                      'مشاهد',

    // ── Buttons & Actions ────────────────────────────────
    'new claim':                   'مطالبة جديدة',
    'new risk':                    'مخاطرة جديدة',
    'new change request':          'طلب تغيير جديد',
    'new baseline':                'خط أساس جديد',
    'lock baseline':               'قفل خط الأساس',
    'add task':                    'إضافة مهمة',
    'add subtask':                 'إضافة مهمة فرعية',
    'add item':                    'إضافة بند',
    'add work package':            'إضافة حزمة عمل',
    'expand all':                  'توسيع الكل',
    'collapse all':                'طي الكل',
    'export':                      'تصدير',
    'import':                      'استيراد',
    'print':                       'طباعة',
    'download':                    'تنزيل',
    'upload':                      'رفع',
    'copy':                        'نسخ',
    'paste':                       'لصق',
    'cut':                         'قص',
    'select all':                  'تحديد الكل',
    'deselect':                    'إلغاء التحديد',
    'filter':                      'تصفية',
    'sort':                        'ترتيب',
    'search':                      'بحث',
    'reset':                       'إعادة ضبط',
    'apply':                       'تطبيق',
    'view':                        'عرض',

    // ── Form Labels ──────────────────────────────────────
    'full name':                   'الاسم الكامل',
    'email':                       'البريد الإلكتروني',
    'email address':               'عنوان البريد الإلكتروني',
    'password':                    'كلمة المرور',
    'confirm password':            'تأكيد كلمة المرور',
    'new password':                'كلمة المرور الجديدة',
    'current password':            'كلمة المرور الحالية',
    'role':                        'الدور',
    'name':                        'الاسم',
    'code':                        'الرمز',
    'date':                        'التاريخ',
    'notes':                       'ملاحظات',
    'comments':                    'تعليقات',

    // ── Auth Screen ──────────────────────────────────────
    'welcome back':                'مرحباً بعودتك',
    'create your account':         'أنشئ حسابك',
    'forgot password?':            'نسيت كلمة المرور؟',
    'forgot password':             'نسيت كلمة المرور',
    'reset password':              'إعادة تعيين كلمة المرور',
    'send reset link':             'إرسال رابط الاسترداد',
    "don't have an account?":      'ليس لديك حساب؟',
    'already have an account?':    'لديك حساب بالفعل؟',
    'signing in...':               'جارٍ تسجيل الدخول...',
    'creating account...':         'جارٍ إنشاء الحساب...',
    'invalid email or password.':  'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    'show password':               'إظهار كلمة المرور',
    'hide password':               'إخفاء كلمة المرور',

    // ── Dashboard Sections ───────────────────────────────
    'project performance':         'أداء المشروع',
    'no projects yet':             'لا توجد مشاريع بعد',
    'no projects':                 'لا توجد مشاريع',
    'no data':                     'لا توجد بيانات',
    'no results':                  'لا توجد نتائج',
    'no items':                    'لا توجد بنود',
    'no claims':                   'لا توجد مطالبات',
    'no risks':                    'لا توجد مخاطر',
    'no tasks':                    'لا توجد مهام',
    'total budget':                'إجمالي الميزانية',
    'total cost':                  'إجمالي التكلفة',
    'select project':              'اختر مشروعاً',
    'select a project':            'اختر مشروعاً',
    'all projects':                'جميع المشاريع',

    // ── Table Headers ────────────────────────────────────
    'wbs code':                    'رمز WBS',
    'task name':                   'اسم المهمة',
    'item name':                   'اسم البند',
    'responsible':                 'المسؤول',
    'start':                       'البداية',
    'finish':                      'الانتهاء',
    'duration':                    'المدة',
    'days':                        'أيام',
    'bac':                         'الميزانية الكاملة',
    'ac':                          'التكلفة الفعلية',
    'ev':                          'القيمة المكتسبة',
    'pv':                          'القيمة المخططة',
    'cpi':                         'مؤشر التكلفة',
    'spi':                         'مؤشر الجدول',
    'eac':                         'التقدير النهائي',
    'vac':                         'انحراف الإتمام',
    'cv':                          'انحراف التكلفة',
    'sv':                          'انحراف الجدول',
    'actions':                     'الإجراءات',
    'created':                     'تاريخ الإنشاء',
    'updated':                     'آخر تحديث',
    'dependencies':                'التبعيات',

    // ── Methodology ──────────────────────────────────────
    'waterfall':                   'شلالي',
    'agile':                       'رشيق',
    'hybrid':                      'هجين',
    'scrum':                       'سكرم',
    'kanban':                      'كانبان',
    'lean':                        'رشيق مُبسَّط',
    'prince2':                     'PRINCE2',
    'pmi':                         'PMI',

    // ── Templates ────────────────────────────────────────
    'blank':                       'فارغ',
    'it project':                  'مشروع تقنية معلومات',
    'construction':                'إنشاء وبناء',
    'event':                       'فعالية',
    'pmo setup':                   'إعداد PMO',

    // ── Misc UI ──────────────────────────────────────────
    'tricore':                     'تراي كور',
    'pmo':                         'مكتب إدارة المشاريع',
    'sar':                         'ريال سعودي',
    'today':                       'اليوم',
    'this week':                   'هذا الأسبوع',
    'this month':                  'هذا الشهر',
    'last updated':                'آخر تحديث',
    'created by':                  'أنشئ بواسطة',
    'owned by':                    'مملوك لـ',
    'n/a':                         'غير متاح',
    'none':                        'لا يوجد',
    'yes':                         'نعم',
    'no':                          'لا',
    'or':                          'أو',
    'and':                         'و',
    'show':                        'إظهار',
    'hide':                        'إخفاء',
    'more':                        'المزيد',
    'less':                        'أقل',
    'all':                         'الكل',
    'total':                       'الإجمالي',

    // ── Dashboard & Portfolio ──────────────────────────────────
    'portfolio dashboard':         'لوحة القيادة',
    'total projects':              'إجمالي المشاريع',
    'on track':                    'في المسار',
    'at risk':                     'في خطر',
    'critical':                    'حرج',
    'portfolio cpi':               'مؤشر التكلفة',
    'portfolio spi':               'مؤشر الجدول',
    'total bac':                   'الميزانية الكلية',
    'portfolio eac':               'التقدير عند الإكمال',
    'budget at completion':        'الميزانية عند الاكتمال',
    'insight engine':              'محرك الرؤى',
    'portfolio health':            'صحة المحفظة',
    'portfolio health — evm driven': 'صحة المحفظة — مدفوعة بـ EVM',
    'back to portfolio':           'العودة للمحفظة',
    'executive view':              'عرض تنفيذي',
    'read-only':                   'قراءة فقط',
    'sign out':                    'تسجيل الخروج',
    'ahead of schedule':           'متقدم عن الجدول',
    'behind schedule':             'متأخر عن الجدول',
    'slight delay':                'تأخر طفيف',
    'cost efficient':              'كفاءة في التكلفة',
    'watch cost':                  'مراقبة التكلفة',
    'over budget':                 'تجاوز الميزانية',
    'needs attention':             'يحتاج متابعة',
    'all clear':                   'لا مشكلات',
    'action needed':               'إجراء فوري',
    'no data yet':                 'لا بيانات بعد',
    'navigation':                  'التنقل',
    'active projects':             'مشاريع نشطة',
    'in portfolio':                'في المحفظة',
    'ai-generated performance observations from evm data': 'ملاحظات أداء مولّدة تلقائياً من بيانات EVM',
    'overdue':                     'متأخر',
    'execution board':             'لوحة التنفيذ',
    'gantt chart':                 'مخطط جانت',
    'work breakdown structure':    'هيكل تقسيم العمل',
    'financial claims register':   'سجل المطالبات المالية',
    'interpretation guide':        'دليل التفسير',
    'core evm fundamentals':       'أساسيات EVM',
    'variances & forecast':        'الانحرافات والتنبؤ',
    'project summary':             'ملخص المشروع',
    'evm summary':                 'ملخص EVM',
    'project performance platform': 'منصة أداء المشاريع',
  };

  // ── Translation Engine ─────────────────────────────────
  // Translates a text node if its trimmed lowercase value matches a dictionary key
  function translateNode(node) {
    if (node.nodeType !== Node.TEXT_NODE) return;
    // Respect language mode — do nothing in English mode
    if (_paused) return;
    var parent = node.parentElement;
    if (!parent) return;

    // Skip script, style, code, pre, noscript
    var tag = (parent.tagName || '').toLowerCase();
    if (['script','style','code','pre','noscript'].includes(tag)) return;

    // Skip already-translated nodes
    if (parent.dataset && parent.dataset.arTranslated) return;

    var original = node.textContent;
    var trimmed  = original.trim();
    var key      = trimmed.toLowerCase();

    if (DICT[key]) {
      // Only translate standalone text nodes (not rich mixed content)
      if (parent.childNodes.length <= 3) {
        // Store the original English text so we can revert later
        parent.dataset.arOrig = trimmed;
        node.textContent = original.replace(trimmed, DICT[key]);
        parent.dataset.arTranslated = '1';
      }
    }
  }

  // Walk all text nodes in an element
  function walkElement(el) {
    if (!el || el.id === 'tc-lp' || el.id === 'boot') return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      translateNode(node);
    }
  }

  // ── Placeholder translator ──────────────────────────────
  const PLACEHOLDER_DICT = {
    'search projects, tasks, members…':    'البحث في المشاريع والمهام والأعضاء...',
    'project name':                        'اسم المشروع',
    'project code (e.g. prj-001)':        'رمز المشروع (مثال: PRJ-001)',
    'owner / responsible party':           'المالك / الجهة المسؤولة',
    'e.g. ministry portal':               'مثال: بوابة الوزارة',
    'description (optional)':             'الوصف (اختياري)',
    'notes…':                             'ملاحظات...',
    'full name':                          'الاسم الكامل',
    'email address':                      'البريد الإلكتروني',
    'password':                           'كلمة المرور',
    'confirm password':                   'تأكيد كلمة المرور',
    'new password':                       'كلمة المرور الجديدة',
    'current password':                   'كلمة المرور الحالية',
    'enter project code':                 'أدخل رمز المشروع',
    'e.g. gip26':                         'مثال: GIP26',
    'search…':                            'بحث...',
    'select…':                            'اختر...',
  };

  function translatePlaceholders(root) {
    if (_paused) return; // English mode — skip
    var inputs = (root || document).querySelectorAll('input[placeholder], textarea[placeholder]');
    inputs.forEach(function(inp) {
      if (inp.dataset.arPlaceholder) return;
      var key = (inp.getAttribute('placeholder') || '').toLowerCase().trim();
      if (PLACEHOLDER_DICT[key]) {
        inp.dataset.arPlaceholderOrig = inp.getAttribute('placeholder'); // store original
        inp.setAttribute('placeholder', PLACEHOLDER_DICT[key]);
        inp.dataset.arPlaceholder = '1';
      }
    });
  }

  // ── aria-label translator ───────────────────────────────
  const ARIA_DICT = {
    'close':          'إغلاق',
    'delete':         'حذف',
    'edit':           'تعديل',
    'help':           'المساعدة',
    'notifications':  'الإشعارات',
    'profile':        'الملف الشخصي',
    'menu':           'القائمة',
    'back':           'رجوع',
  };
  function translateAria(root) {
    if (_paused) return; // English mode — skip
    (root || document).querySelectorAll('[aria-label]').forEach(function(el) {
      if (el.dataset.arAria) return;
      var key = (el.getAttribute('aria-label') || '').toLowerCase().trim();
      if (ARIA_DICT[key]) {
        el.dataset.arAriaOrig = el.getAttribute('aria-label'); // store original
        el.setAttribute('aria-label', ARIA_DICT[key]);
        el.dataset.arAria = '1';
      }
    });
  }

  // ── Main run ────────────────────────────────────────────
  function runTranslations(root) {
    var target = root || document.getElementById('root');
    if (!target) return;
    walkElement(target);
    translatePlaceholders(target);
    translateAria(target);
  }

  // ── MutationObserver: translate on every React re-render ─
  var _ticking = false;
  var _pendingRoot = null;
  var _paused = false;  // controlled by tcLangSwitch

  // ── Revert all translated nodes back to English ──────────
  function revertTranslations(root) {
    var target = root || document.getElementById('root');
    if (!target) return;

    // 1. Revert text nodes
    target.querySelectorAll('[data-ar-translated]').forEach(function(el) {
      var orig = el.dataset.arOrig;
      if (orig) {
        for (var i = 0; i < el.childNodes.length; i++) {
          var nd = el.childNodes[i];
          if (nd.nodeType === Node.TEXT_NODE && nd.textContent.trim()) {
            nd.textContent = orig;
            break;
          }
        }
      }
      delete el.dataset.arTranslated;
      delete el.dataset.arOrig;
    });

    // 2. Revert placeholders
    target.querySelectorAll('[data-ar-placeholder]').forEach(function(inp) {
      var orig = inp.dataset.arPlaceholderOrig;
      if (orig) inp.setAttribute('placeholder', orig);
      delete inp.dataset.arPlaceholder;
      delete inp.dataset.arPlaceholderOrig;
    });

    // 3. Revert aria-labels
    target.querySelectorAll('[data-ar-aria]').forEach(function(el) {
      var orig = el.dataset.arAriaOrig;
      if (orig) el.setAttribute('aria-label', orig);
      delete el.dataset.arAria;
      delete el.dataset.arAriaOrig;
    });
  }

  // ── Expose pause/resume to lang system ───────────────────
  window._tcTranslatorPause = function(pause) {
    _paused = pause;
    if (pause) {
      revertTranslations(document.getElementById('root'));
    } else {
      runTranslations(document.getElementById('root'));
    }
  };

  var observer = new MutationObserver(function(mutations) {
    if (_paused) return; // English mode — don't auto-translate new content
    // Collect the highest-level added nodes
    mutations.forEach(function(m) {
      m.addedNodes.forEach(function(n) {
        if (n.nodeType === Node.ELEMENT_NODE) {
          _pendingRoot = _pendingRoot || n;
        }
      });
    });
    if (!_ticking) {
      _ticking = true;
      requestAnimationFrame(function() {
        runTranslations(_pendingRoot || document.getElementById('root'));
        _pendingRoot = null;
        _ticking = false;
      });
    }
  });

  // Observe the root container
  function startObserver() {
    var root = document.getElementById('root') || document.body;
    observer.observe(root, { childList: true, subtree: true, characterData: false });
    // Initial pass
    runTranslations(root);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }

  // Re-run after app fully boots (only if Arabic mode is active)
  setTimeout(function() { if(!_paused) runTranslations(document.getElementById('root')); }, 800);
  setTimeout(function() { if(!_paused) runTranslations(document.getElementById('root')); }, 2000);
  setTimeout(function() { if(!_paused) runTranslations(document.getElementById('root')); }, 4000);

})();
