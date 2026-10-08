
import type { SchoolSettings, Subject } from './types.ts';
import { v4 as uuidv4 } from 'uuid';

export const SCHOOL_TYPES = ['نهاري', 'مسائي', 'خارجي'];
export const SCHOOL_GENDERS = ['بنين', 'بنات', 'مختلط'];
export const SCHOOL_LEVELS = ['ابتدائية', 'متوسطة', 'اعدادية', 'ثانوية', 'اعدادي علمي', 'اعدادي ادبي', 'ثانوية علمي', 'ثانوية ادبي'];
export const GOVERNORATES = [
    'دهوك', 'نينوى', 'اربيل', 'السليمانية', 'كركوك', 'حلبجة',
    'صلاح الدين', 'ديالى', 'الأنبار', 'بغداد', 'كربلاء',
    'واسط', 'بابل', 'النجف', 'القادسية', 'ميسان',
    'المثنى', 'ذي قار', 'البصرة'
];

export const DEFAULT_SCHOOL_LOGO = 'https://i.imgur.com/jDSB6Ry.png';

export const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
    schoolName: 'متوسطة بطل خيبر',
    principalName: 'حسنين علي هادي',
    academicYear: '2025-2026',
    directorate: '',
    supplementarySubjectsCount: 3,
    decisionPoints: 5,
    // New fields
    principalPhone: '',
    schoolType: 'نهاري',
    schoolGender: 'بنين',
    schoolLevel: 'متوسطة',
    governorateCode: '',
    schoolCode: '',
    governorateName: 'بغداد',
    district: '',
    subdistrict: '',
    // Submission lock defaults
    lockS1Submissions: false,
    lockS2Submissions: false,
    lockAllSubmissions: false,
    // Results notice default
    monthlyResultsNotice: false,
};

export const GRADE_LEVELS: string[] = [
    'الاول ابتدائي', 'الثاني ابتدائي', 'الثالث ابتدائي', 'الرابع ابتدائي', 'الخامس ابتدائي', 'السادس ابتدائي',
    'الاول متوسط', 'الثاني متوسط', 'الثالث متوسط',
    'الرابع العلمي', 'الرابع الادبي',
    'الخامس العلمي', 'الخامس الادبي',
    'السادس العلمي', 'السادس الادبي'
];

const generateSubjects = (names: string[]): Subject[] => names.map(name => ({ id: uuidv4(), name }));

export const DEFAULT_SUBJECT_GRADE_OBJECT = {
    firstTerm: null, midYear: null, secondTerm: null, finalExam1st: null, finalExam2nd: null,
    october: null, november: null, december: null, january: null, february: null, march: null, april: null
};

export const ensureDefaultSportsAndArtSubjects = (subjects: Subject[] = []): Subject[] => {
    let list = [...subjects];

    // Convert old names if present
    list = list.map(s => {
        if (s.name === 'التربية الرياضية') return { ...s, name: 'الرياضة' };
        if (s.name === 'التربية الفنية') return { ...s, name: 'الفنية' };
        return s;
    });

    // Find or create "الرياضة"
    let sportsSub = list.find(s => s.name === 'الرياضة');
    if (!sportsSub) {
        sportsSub = { id: uuidv4(), name: 'الرياضة' };
    }

    // Find or create "الفنية"
    let artSub = list.find(s => s.name === 'الفنية');
    if (!artSub) {
        artSub = { id: uuidv4(), name: 'الفنية' };
    }

    // Keep all academic subjects excluding "الرياضة" and "الفنية"
    const academicSubs = list.filter(s => s.name !== 'الرياضة' && s.name !== 'الفنية');

    // Place "الرياضة" then "الفنية" strictly at the end after the last subject
    return [...academicSubs, sportsSub, artSub];
};

export const DEFAULT_SUBJECTS: Record<string, Subject[]> = {
    'الاول ابتدائي': generateSubjects(['التربية الاسلامية', 'القراءة', 'اللغة الانكليزية', 'الرياضيات', 'العلوم', 'الرياضة', 'الفنية']),
    'الثاني ابتدائي': generateSubjects(['التربية الاسلامية', 'القراءة', 'اللغة الانكليزية', 'الرياضيات', 'العلوم', 'الرياضة', 'الفنية']),
    'الثالث ابتدائي': generateSubjects(['التربية الاسلامية', 'القراءة', 'اللغة الانكليزية', 'الرياضيات', 'العلوم', 'الرياضة', 'الفنية']),
    'الرابع ابتدائي': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الانكليزية', 'الرياضيات', 'الاجتماعيات', 'العلوم', 'الرياضة', 'الفنية']),
    'الخامس ابتدائي': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الانكليزية', 'الرياضيات', 'الاجتماعيات', 'العلوم', 'الرياضة', 'الفنية']),
    'السادس ابتدائي': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الانكليزية', 'الرياضيات', 'الاجتماعيات', 'العلوم', 'الرياضة', 'الفنية']),
    'الاول متوسط': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الإنكليزية', 'الاجتماعيات', 'الرياضيات', 'الحاسوب', 'الفيزياء', 'الكيمياء', 'الاحياء', 'الاخلاقية', 'الرياضة', 'الفنية']),
    'الثاني متوسط': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الإنكليزية', 'الاجتماعيات', 'الرياضيات', 'الحاسوب', 'الفيزياء', 'الكيمياء', 'الاحياء', 'الاخلاقية', 'الرياضة', 'الفنية']),
    'الثالث متوسط': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الإنكليزية', 'الاجتماعيات', 'الرياضيات', 'الفيزياء', 'الكيمياء', 'الاحياء', 'الرياضة', 'الفنية']),
    'الرابع العلمي': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الانكليزية', 'الرياضيات', 'الحاسوب', 'الفيزياء', 'الكيمياء', 'الاحياء', 'الرياضة', 'الفنية']),
    'الرابع الادبي': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الانكليزية', 'التاريخ', 'الجغرافية', 'علم الاجتماع', 'الرياضيات', 'الحاسوب', 'الرياضة', 'الفنية']),
    'الخامس العلمي': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الانكليزية', 'الرياضيات', 'الحاسوب', 'الفيزياء', 'الكيمياء', 'الاحياء', 'علم الارض', 'الرياضة', 'الفنية']),
    'الخامس الادبي': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الانكليزية', 'التاريخ', 'الجغرافية', 'الرياضيات', 'الحاسوب', 'الاقتصاد', 'الفلسفة وعلم النفس', 'الرياضة', 'الفنية']),
    'السادس العلمي': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الانكليزية', 'الاجتماعيات', 'الرياضيات', 'الحاسوب', 'الفيزياء', 'الكيمياء', 'الاحياء', 'الرياضة', 'الفنية']),
    'السادس الادبي': generateSubjects(['التربية الاسلامية', 'اللغة العربية', 'اللغة الانكليزية', 'التاريخ', 'الجغرافية', 'الرياضيات', 'الحاسوب', 'الاقتصاد', 'الرياضة', 'الفنية']),
};

// FIX: Add missing BEHAVIORAL_CRITERIA constant.
export const BEHAVIORAL_CRITERIA = [
  { key: 'respect', label: 'الاحترام', description: 'يظهر احترامًا للمعلمين والزملاء.' },
  { key: 'cooperation', label: 'التعاون', description: 'يتعاون مع الآخرين في الأنشطة الصفية.' },
  { key: 'responsibility', label: 'المسؤولية', description: 'يتحمل مسؤولية واجباته وممتلكاته.' },
  { key: 'discipline', label: 'الانضباط', description: 'يلتزم بقوانين المدرسة والنظام داخل الصف.' },
  { key: 'initiative', label: 'المبادرة', description: 'يبادر في المساعدة وتقديم الأفكار الإيجابية.' },
  { key: 'integrity', label: 'النزاهة', description: 'يتمتع بالصدق والأمانة في تعاملاته.' },
];

/**
 * ترتيب الحروف الهجائية/الأبجدية المعتمدة في تسمية وتصنيف الشعب الدراسية في المدارس
 * (أ، ب، ج، د، هـ، و، ز، ح، ط، ي، ك، ل، م، ن، س، ع، ف، ص، ق، ر، ش، ت، ث، خ، ذ، ض، ظ، غ)
 */
export const SECTION_LETTER_ORDER: Record<string, number> = {
    // 1. أ / ألف
    'أ': 1, 'ا': 1, 'إ': 1, 'آ': 1, 'ء': 1, 'الف': 1, 'ألف': 1,
    // 2. ب / باء
    'ب': 2, 'باء': 2,
    // 3. ج / جيم
    'ج': 3, 'جيم': 3,
    // 4. د / دال
    'د': 4, 'دال': 4,
    // 5. هـ / ه / هاء
    'ه': 5, 'هـ': 5, 'هاء': 5, 'ة': 5,
    // 6. و / واو
    'و': 6, 'ؤ': 6, 'واو': 6,
    // 7. ز / زاي / زين
    'ز': 7, 'زاي': 7, 'زين': 7,
    // 8. ح / حاء
    'ح': 8, 'حاء': 8,
    // 9. ط / طاء
    'ط': 9, 'طاء': 9,
    // 10. ي / ياء
    'ي': 10, 'ى': 10, 'ئ': 10, 'ياء': 10,
    // 11. ك / كاف
    'ك': 11, 'كاف': 11,
    // 12. ل / لام
    'ل': 12, 'لام': 12,
    // 13. م / ميم
    'م': 13, 'ميم': 13,
    // 14. ن / نون
    'ن': 14, 'نون': 14,
    // 15. س / سين
    'س': 15, 'سين': 15,
    // 16. ع / عين
    'ع': 16, 'عين': 16,
    // 17. ف / فاء
    'ف': 17, 'فاء': 17,
    // 18. ص / صاد
    'ص': 18, 'صاد': 18,
    // 19. ق / قاف
    'ق': 19, 'قاف': 19,
    // 20. ر / راء
    'ر': 20, 'راء': 20,
    // 21. ش / شين
    'ش': 21, 'شين': 21,
    // 22. ت / تاء
    'ت': 22, 'تاء': 22,
    // 23. ث / ثاء
    'ث': 23, 'ثاء': 23,
    // 24. خ / خاء
    'خ': 24, 'خاء': 24,
    // 25. ذ / ذال
    'ذ': 25, 'ذال': 25,
    // 26. ض / ضاد
    'ض': 26, 'ضاد': 26,
    // 27. ظ / ظاء
    'ظ': 27, 'ظاء': 27,
    // 28. غ / غين
    'غ': 28, 'غين': 28,

    // الأرقام اللفظية
    'الاولى': 1, 'الأولى': 1, 'الاول': 1, 'الأول': 1, 'واحد': 1,
    'الثانية': 2, 'الثاني': 2, 'اثنين': 2, 'إثنين': 2,
    'الثالثة': 3, 'الثالث': 3, 'ثلاثة': 3,
    'الرابعة': 4, 'الرابع': 4, 'اربعة': 4, 'أربعة': 4,
    'الخامسة': 5, 'الخامس': 5, 'خمسة': 5,
    'السادسة': 6, 'السادس': 6, 'ستة': 6,
    'السابعة': 7, 'السابع': 7, 'سبعة': 7,
    'الثامنة': 8, 'الثامن': 8, 'ثمانية': 8,
    'التاسعة': 9, 'التاسع': 9, 'تسعة': 9,
    'العاشرة': 10, 'العاشر': 10, 'عشرة': 10,
};

/**
 * الحصول على الرتبة الترتيبية للشعبة المدرسية
 */
export const getSectionSortRank = (sectionStr: string = ''): number => {
    if (!sectionStr) return 999;

    let clean = sectionStr
        .replace(/^(شعبة|الشعبة|ش|قسم)\s*/i, '')
        .replace(/[()\[\]{}،,.\-_/\\:]/g, '')
        .trim();

    if (!clean) clean = sectionStr.trim();

    if (SECTION_LETTER_ORDER[clean]) {
        return SECTION_LETTER_ORDER[clean];
    }

    // الأرقام المشرقية (٠-٩)
    const westernDigits = clean.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
    const num = parseInt(westernDigits, 10);
    if (!isNaN(num)) {
        return num;
    }

    // الحروف الإنجليزية A, B, C...
    if (/^[A-Za-z]$/.test(clean)) {
        return clean.toUpperCase().charCodeAt(0) - 64;
    }

    // البحث عن أول حرف أبجدي معرف
    for (const char of clean) {
        if (SECTION_LETTER_ORDER[char]) {
            return SECTION_LETTER_ORDER[char];
        }
    }

    return 999;
};

/**
 * مقارنة اسمين لشعبتين وفق الترتيب الأبجدي المدرسي المعتمد (أ، ب، ج، د، هـ، و، ز، ح، ط، ي...)
 */
export const compareSections = (a: string = '', b: string = ''): number => {
    const rankA = getSectionSortRank(a);
    const rankB = getSectionSortRank(b);

    if (rankA !== 999 && rankB !== 999) {
        if (rankA !== rankB) {
            return rankA - rankB;
        }
    } else if (rankA !== 999 && rankB === 999) {
        return -1;
    } else if (rankA === 999 && rankB !== 999) {
        return 1;
    }

    return (a || '').localeCompare(b || '', 'ar', { numeric: true });
};

/**
 * مقارنة صفين/شعبتين بالترتيب: المرحلة الدراسية أولاً ثم تسلسل الشعبة الأبجدي الصحيح
 */
export const compareClasses = (
    a: { stage?: string; section?: string },
    b: { stage?: string; section?: string }
): number => {
    const stageA = (a.stage || '').trim();
    const stageB = (b.stage || '').trim();

    const idxA = GRADE_LEVELS.indexOf(stageA);
    const idxB = GRADE_LEVELS.indexOf(stageB);

    if (idxA !== -1 && idxB !== -1) {
        if (idxA !== idxB) return idxA - idxB;
    } else if (idxA !== -1 && idxB === -1) {
        return -1;
    } else if (idxA === -1 && idxB !== -1) {
        return 1;
    } else if (stageA !== stageB) {
        const stageCmp = stageA.localeCompare(stageB, 'ar-IQ');
        if (stageCmp !== 0) return stageCmp;
    }

    return compareSections(a.section || '', b.section || '');
};

export const DEFAULT_DISCIPLINE_CRITERIA: import('./types.ts').DisciplineCriterion[] = [
    {
        id: 'crit_uniform',
        title: 'الالتزام بالزي الموحد (مخالفة الزي المدرسي)',
        description: 'عدم ارتداء الزي المدرسي الرسمي المعتمد أو ارتداء ملابس غير لائقة',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'التزام ونظام'
    },
    {
        id: 'crit_class_disruption',
        title: 'مشاغبة داخل الصف',
        description: 'إثارة الفوضى، مقاطعة المدرس، أو التحدث الجانبي أثناء الشرح',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'سلوكي'
    },
    {
        id: 'crit_tardiness',
        title: 'تأخر عن الدرس',
        description: 'التأخر عن موعد الحصة أو الاصطفاف دون عذر مشروع',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'التزام ونظام'
    },
    {
        id: 'crit_unprepared',
        title: 'عدم التحضير اليومي والواجبات',
        description: 'إهمال الواجبات المدرسية أو عدم الاستعداد للدرس اليومي',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'أكاديمي'
    },
    {
        id: 'crit_yard_disruption',
        title: 'مشاغبة في ساحة المدرسة والممرات',
        description: 'الركض العشوائي، الصراخ، أو مضايقة الزملاء في الساحة أو الممرات',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'سلوكي'
    },
    {
        id: 'crit_bad_language',
        title: 'التلفظ بألفاظ نابية وغير لائقة',
        description: 'استخدام عبارات مسيئة أو بذيئة تجاه الزملاء أو الكادر',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'أخلاقي'
    },
    {
        id: 'crit_missing_supplies',
        title: 'عدم إحضار مستلزمات المادة والكتب',
        description: 'نسيان أو عدم إحضار الكتب، الدفاتر، أو الأدوات المدرسية المطلوبة',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'أكاديمي'
    },
    {
        id: 'crit_bullying',
        title: 'التنمر أو الاعتداء على الزملاء',
        description: 'أي سلوك عدواني، استهزاء، سخرية، أو اعتداء بدني/لفظي على الطلاب',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'أخلاقي'
    },
    {
        id: 'crit_phone_use',
        title: 'استخدام الهاتف النقال داخل المدرسة',
        description: 'إحضار أو تشغيل الهاتف الذكي دون تصريح رسمي من إدارة المدرسة',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'التزام ونظام'
    },
    {
        id: 'crit_property_damage',
        title: 'الإضرار بالممتلكات والأثاث المدرسي',
        description: 'الكتابة على الجدران/المقاعد أو تخريب مقتنيات الصف والمدرسة',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'سلوكي'
    },
    {
        id: 'crit_skipping_class',
        title: 'الهروب من الحصة أو المدرسة',
        description: 'مغادرة قاعة الدرس أو الخروج من المدرسة دون إذن رسمي مسبق',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'التزام ونظام'
    },
    {
        id: 'crit_sleeping_inattentive',
        title: 'النوم أو التراخي أثناء الدرس',
        description: 'النوم على المقعد أو عدم متابعة المادة والتشتت المستمر',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'أكاديمي'
    },
    {
        id: 'crit_lineup_disruption',
        title: 'إثارة الفوضى في الاصطفاف والنشيد الوطني',
        description: 'عدم الالتزام بالنظام أثناء التجمع الصباحي والتحية الرسمية للعلم',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'التزام ونظام'
    },
    {
        id: 'crit_disrespect_staff',
        title: 'عدم احترام الهيئة التعليمية والإدارية',
        description: 'الرد غير اللائق أو مخالفة تعليمات المدرسين والإداريين',
        deductionPoints: 1,
        isDefault: true,
        isActive: true,
        category: 'أخلاقي'
    }
];

export const DEFAULT_DISCIPLINE_MAX_POINTS = 10;


