import React from 'react';
import * as ReactDOM from 'react-dom/client';
import type { User, ClassData, SchoolSettings } from '../../types.ts';
import SubjectCommitteesPDFPage, {
    SubjectCommitteeData,
    CommitteeRow
} from './SubjectCommitteesPDFPage.tsx';

declare const jspdf: any;
declare const html2canvas: any;

const STAGE_ORDER_MAP: Record<string, number> = {
    'الثالث متوسط': 1,
    'الثالث': 1,
    'الثاني متوسط': 2,
    'الثاني': 2,
    'الاول متوسط': 3,
    'الأول متوسط': 3,
    'الاول': 3,
    'الأول': 3,
    'السادس الاعدادي': 10,
    'السادس العلمي': 11,
    'السادس الادبي': 12,
    'الخامس العلمي': 20,
    'الخامس الادبي': 21,
    'الرابع العلمي': 30,
    'الرابع الادبي': 31,
    'السادس ابتدائي': 40,
    'الخامس ابتدائي': 41,
    'الرابع ابتدائي': 42,
    'الثالث ابتدائي': 43,
    'الثاني ابتدائي': 44,
    'الاول ابتدائي': 45,
};

const formatStageShort = (stage: string): string => {
    if (!stage) return '';
    if (stage.includes('الاول') || stage.includes('الأول')) {
        if (stage.includes('متوسط') || stage.includes('ابتدائي')) return 'الأول';
    }
    if (stage.includes('الثاني')) {
        if (stage.includes('متوسط') || stage.includes('ابتدائي')) return 'الثاني';
    }
    if (stage.includes('الثالث')) {
        if (stage.includes('متوسط') || stage.includes('ابتدائي')) return 'الثالث';
    }
    if (stage.includes('الرابع')) {
        if (stage.includes('ابتدائي')) return 'الرابع';
        if (stage.includes('العلمي')) return 'الرابع العلمي';
        if (stage.includes('الادبي') || stage.includes('الأدبي')) return 'الرابع الأدبي';
        return 'الرابع';
    }
    if (stage.includes('الخامس')) {
        if (stage.includes('ابتدائي')) return 'الخامس';
        if (stage.includes('العلمي')) return 'الخامس العلمي';
        if (stage.includes('الادبي') || stage.includes('الأدبي')) return 'الخامس الأدبي';
        return 'الخامس';
    }
    if (stage.includes('السادس')) {
        if (stage.includes('ابتدائي')) return 'السادس';
        if (stage.includes('العلمي')) return 'السادس العلمي';
        if (stage.includes('الادبي') || stage.includes('الأدبي')) return 'السادس الأدبي';
        return 'السادس';
    }
    return stage;
};

const getStageRank = (stage: string): number => {
    if (STAGE_ORDER_MAP[stage]) return STAGE_ORDER_MAP[stage];
    const s = formatStageShort(stage);
    if (STAGE_ORDER_MAP[s]) return STAGE_ORDER_MAP[s];
    return 99;
};

const ARABIC_ALPHABET = ['أ', 'ب', 'ج', 'د', 'هـ', 'ه', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل', 'م', 'ن'];

const sortSections = (a: string, b: string) => {
    const cleanA = a === 'ه' ? 'هـ' : a;
    const cleanB = b === 'ه' ? 'هـ' : b;
    const idxA = ARABIC_ALPHABET.indexOf(cleanA);
    const idxB = ARABIC_ALPHABET.indexOf(cleanB);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    return a.localeCompare(b, 'ar');
};

const CANONICAL_SUBJECT_ORDER: string[] = [
    'التربية الاسلامية',
    'الاسلامية',
    'اللغة العربية',
    'القراءة',
    'الاخلاقية',
    'الفيزياء',
    'الكيمياء',
    'الاحياء',
    'الأحياء',
    'الرياضيات',
    'اللغة الانكليزية',
    'اللغة الإنكليزية',
    'الاجتماعيات',
    'التاريخ',
    'الجغرافية',
    'علم الاجتماع',
    'الحاسوب',
    'العلوم',
    'الرياضة',
    'التربية الرياضية',
    'الفنية',
    'التربية الفنية'
];

const getSubjectOrderIndex = (name: string): number => {
    const idx = CANONICAL_SUBJECT_ORDER.findIndex(
        s => s === name || name.includes(s) || s.includes(name)
    );
    return idx === -1 ? 999 : idx;
};

/**
 * Builds structured data for subject committees based on teachers and classes assignments.
 */
export function buildSubjectCommitteesData(
    teachers: User[],
    classes: ClassData[]
): {
    committees: SubjectCommitteeData[];
    sectionColumns: string[];
} {
    // 1. Gather all unique section names present in the school
    const sectionsSet = new Set<string>();
    classes.forEach(c => {
        if (c.section) {
            const sec = c.section === 'ه' ? 'هـ' : c.section;
            sectionsSet.add(sec);
        }
    });

    // Ensure standard minimum sections 'أ' to 'ز'
    const defaultSections = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز'];
    defaultSections.forEach(s => sectionsSet.add(s));

    const sortedSectionCols = Array.from(sectionsSet).sort(sortSections);

    // 2. Map all subjects present in the school
    const subjectNamesMap = new Map<string, string>(); // canonicalName -> displayName
    classes.forEach(cls => {
        cls.subjects.forEach(subj => {
            if (!subjectNamesMap.has(subj.name)) {
                subjectNamesMap.set(subj.name, subj.name);
            }
        });
    });

    // 3. For each subject, collect assignments for all teachers
    const committeesMap = new Map<string, Map<string, Map<string, Set<string>>>>();
    // subjectName -> (teacherId -> (stage -> Set<section>))
    const teacherNameMap = new Map<string, string>();

    teachers.forEach(teacher => {
        teacherNameMap.set(teacher.id, teacher.name);
        if (!teacher.assignments || !Array.isArray(teacher.assignments)) return;

        teacher.assignments.forEach(assignment => {
            const cls = classes.find(c => c.id === assignment.classId);
            if (!cls) return;

            const subj = cls.subjects.find(s => s.id === assignment.subjectId);
            if (!subj) return;

            const subjectName = subj.name;
            if (!committeesMap.has(subjectName)) {
                committeesMap.set(subjectName, new Map());
            }

            const teachersInSubject = committeesMap.get(subjectName)!;
            if (!teachersInSubject.has(teacher.id)) {
                teachersInSubject.set(teacher.id, new Map());
            }

            const teacherStages = teachersInSubject.get(teacher.id)!;
            if (!teacherStages.has(cls.stage)) {
                teacherStages.set(cls.stage, new Set());
            }

            const sec = cls.section === 'ه' ? 'هـ' : cls.section;
            teacherStages.get(cls.stage)!.add(sec);
        });
    });

    // 4. Transform into structured committee rows
    const committees: SubjectCommitteeData[] = [];

    // Collect all subjects that have assignments or are in the school curriculum
    const allSubjectNames = Array.from(
        new Set([...Array.from(committeesMap.keys()), ...Array.from(subjectNamesMap.keys())])
    ).sort((a, b) => {
        const orderA = getSubjectOrderIndex(a);
        const orderB = getSubjectOrderIndex(b);
        if (orderA !== orderB) return orderA - orderB;
        return a.localeCompare(b, 'ar');
    });

    for (const subjName of allSubjectNames) {
        const teacherMap = committeesMap.get(subjName);
        const rows: CommitteeRow[] = [];

        if (teacherMap && teacherMap.size > 0) {
            // Sort teachers by order of highest stage taught
            const teacherEntries = Array.from(teacherMap.entries()).sort(([idA, stagesA], [idB, stagesB]) => {
                const minRankA = Math.min(...Array.from(stagesA.keys()).map(getStageRank));
                const minRankB = Math.min(...Array.from(stagesB.keys()).map(getStageRank));
                if (minRankA !== minRankB) return minRankA - minRankB;
                const nameA = teacherNameMap.get(idA) || '';
                const nameB = teacherNameMap.get(idB) || '';
                return nameA.localeCompare(nameB, 'ar');
            });

            for (const [teacherId, stages] of teacherEntries) {
                const teacherName = teacherNameMap.get(teacherId) || 'مدرس';

                // Sort stages for this teacher in descending grade order (الثالث ثم الثاني ثم الأول)
                const sortedStages = Array.from(stages.keys()).sort((s1, s2) => getStageRank(s1) - getStageRank(s2));

                for (const stage of sortedStages) {
                    const sections = Array.from(stages.get(stage)!).sort(sortSections);
                    rows.push({
                        teacherId,
                        teacherName,
                        stage,
                        stageShort: formatStageShort(stage),
                        sections
                    });
                }
            }
        }

        // Only include committees that have assigned teachers or are main academic subjects
        if (rows.length > 0) {
            committees.push({
                subjectName: subjName,
                rows
            });
        }
    }

    return {
        committees,
        sectionColumns: sortedSectionCols
    };
}

/**
 * Paginates committees cleanly to avoid page cutoffs and overflows.
 */
function paginateCommittees(committees: SubjectCommitteeData[]): SubjectCommitteeData[][] {
    const pages: SubjectCommitteeData[][] = [];
    let currentPage: SubjectCommitteeData[] = [];
    let currentPageWeight = 0;
    const MAX_PAGE_WEIGHT = 20; // 1 committee header ≈ 2 weight, 1 row ≈ 1 weight

    for (const comm of committees) {
        const commWeight = 2.5 + Math.max(comm.rows.length, 1);

        if (currentPage.length > 0 && currentPageWeight + commWeight > MAX_PAGE_WEIGHT) {
            pages.push(currentPage);
            currentPage = [comm];
            currentPageWeight = commWeight;
        } else {
            currentPage.push(comm);
            currentPageWeight += commWeight;
        }
    }

    if (currentPage.length > 0) {
        pages.push(currentPage);
    }

    return pages;
}

/**
 * Exports all subject committees as a high quality ready-to-download single PDF file.
 */
export async function exportSubjectCommitteesPDF(
    teachers: User[],
    classes: ClassData[],
    settings?: SchoolSettings,
    onProgress?: (msg: string) => void
): Promise<void> {
    if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
        alert('مكتبة تصدير PDF قيد التحميل، يرجى المحاولة بعد لحظات.');
        return;
    }

    const { committees, sectionColumns } = buildSubjectCommitteesData(teachers, classes);

    if (committees.length === 0) {
        alert('لا توجد لجان أو مواد مسندة لتصديرها. يرجى إسناد المواد للشعب أولاً.');
        return;
    }

    const paginatedPages = paginateCommittees(committees);
    const totalPages = paginatedPages.length;

    onProgress?.('جاري تحضير صفحات نصاب اللجان...');

    // Container for offscreen rendering
    const tempContainer = document.createElement('div');
    Object.assign(tempContainer.style, {
        position: 'absolute',
        left: '-9999px',
        top: '0',
        width: '794px',
        background: '#ffffff',
        zIndex: '-1000'
    });
    document.body.appendChild(tempContainer);
    const root = ReactDOM.createRoot(tempContainer);

    const renderComponent = (component: React.ReactElement) =>
        new Promise<void>(resolve => {
            root.render(component);
            setTimeout(resolve, 350);
        });

    try {
        await (document as any).fonts?.ready;
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4',
            compress: true
        });

        for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
            onProgress?.(`جاري معالجة وتصدير الصفحة ${pageIdx + 1} من ${totalPages}...`);

            const pageCommittees = paginatedPages[pageIdx];

            await renderComponent(
                <SubjectCommitteesPDFPage
                    settings={settings}
                    committees={pageCommittees}
                    sectionColumns={sectionColumns}
                    pageNumber={pageIdx + 1}
                    totalPages={totalPages}
                />
            );

            const pageElement = tempContainer.children[0] as HTMLElement;
            if (!pageElement) continue;

            const canvas = await html2canvas(pageElement, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();

            if (pageIdx > 0) {
                pdf.addPage();
            }

            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        }

        const safeSchoolName = (settings?.schoolName || 'المدرسة').replace(/[/\\?%*:|"<>]/g, '_');
        const fileName = `نصاب_الحصص_حسب_اللجان_${safeSchoolName}.pdf`;

        onProgress?.('جاري تحميل الملف...');
        pdf.save(fileName);
    } catch (error) {
        console.error('Error exporting subject committees PDF:', error);
        alert('حدث خطأ أثناء تصدير ملف PDF لنصاب اللجان.');
    } finally {
        root.unmount();
        if (document.body.contains(tempContainer)) {
            document.body.removeChild(tempContainer);
        }
    }
}
