import type { ClassData, Student, SchoolSettings } from '../types.ts';
import { compareClasses, compareSections } from '../constants.ts';
import * as XLSX from 'xlsx';

/**
 * Safely extracts a clean, normalized list of students from classData,
 * handling Firebase object structures, arrays, and null/undefined values.
 */
export const getCleanStudentsList = (classData?: ClassData | null): Student[] => {
    if (!classData || !classData.students) return [];
    
    const raw = classData.students;
    const list: any[] = Array.isArray(raw)
        ? raw
        : (raw && typeof raw === 'object')
            ? Object.values(raw)
            : [];

    return list
        .filter((s): s is Student => Boolean(s && typeof s === 'object' && s.name && String(s.name).trim().length > 0))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar-IQ'));
};

/**
 * Helper to determine student status label safely
 */
export const getStudentStatusLabel = (student?: Student | null): { text: string; color: string } => {
    if (!student) {
        return { text: 'مستمر بالدوام', color: '#334155' };
    }
    if (student.enrollmentStatus === 'transferred') {
        return { text: 'منقول', color: '#15803d' };
    }
    if (student.enrollmentStatus === 'dismissed') {
        return { text: 'مفصول / ترقين', color: '#b91c1c' };
    }
    if (student.notes && student.notes.trim()) {
        return { text: student.notes.trim(), color: '#475569' };
    }
    return { text: 'مستمر بالدوام', color: '#334155' };
};

/**
 * Generates the HTML fragment for a single class/section roster table formatted for MS Word / Excel style
 */
export const generateSectionRosterHtml = (
    classData: ClassData,
    settings?: SchoolSettings | null,
    options?: { isSubsequentPage?: boolean }
): string => {
    const students = getCleanStudentsList(classData);
    const studentCount = students.length;
    const safeSettings = settings || {
        schoolName: '',
        principalName: '',
        directorate: 'المديرية العامة للتربية',
        academicYear: '2025-2026'
    };

    return `
        <div class="roster-page-container" style="${options?.isSubsequentPage ? 'page-break-before: always; mso-special-character: line-break;' : ''} margin-bottom: 30px;">
            <!-- Official Header Table -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-family: 'Cairo', 'Traditional Arabic', 'Arial', sans-serif;">
                <tr>
                    <td style="width: 32%; text-align: right; font-size: 10.5pt; font-weight: bold; line-height: 1.4; vertical-align: top;">
                        جمهورية العراق<br/>
                        وزارة التربية<br/>
                        ${safeSettings.directorate || 'المديرية العامة للتربية'}<br/>
                        <span style="color: #0e7490;">مدرسة: ${safeSettings.schoolName || '................'}</span>
                    </td>
                    <td style="width: 36%; text-align: center; vertical-align: middle;">
                        <h2 style="margin: 0; font-size: 16pt; font-weight: bold; color: #0f172a;">قائمة أسماء الطلبة</h2>
                        <div style="margin-top: 6px; font-size: 11pt; font-weight: bold; background-color: #f1f5f9; padding: 4px 10px; border: 1.5px solid #cbd5e1; border-radius: 4px; display: inline-block;">
                            المرحلة: <span style="color: #0369a1;">${classData.stage || ''}</span> &nbsp;|&nbsp; الشعبة: <span style="color: #b91c1c;">(${classData.section || ''})</span>
                        </div>
                    </td>
                    <td style="width: 32%; text-align: left; font-size: 10pt; font-weight: bold; line-height: 1.4; vertical-align: top;">
                        العام الدراسي: ${safeSettings.academicYear || '2025-2026'}<br/>
                        مجموع طلاب الشعبة: <span style="color: #0369a1;">${studentCount}</span> طالب<br/>
                        مدير المدرسة: ${safeSettings.principalName || '................'}
                    </td>
                </tr>
            </table>

            <!-- Students Table Styled Like Excel Sheet -->
            <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 10pt; border: 2px solid #000; font-family: 'Cairo', 'Traditional Arabic', 'Arial', sans-serif;" dir="rtl">
                <thead>
                    <tr style="background-color: #d9e1f2; color: #000; font-weight: bold; height: 32px;">
                        <th style="border: 1px solid #000; width: 35px; text-align: center; padding: 4px;">ت</th>
                        <th style="border: 1px solid #000; text-align: right; padding: 4px 8px; min-width: 190px;">اسم الطالب الرباعي واللقب</th>
                        <th style="border: 1px solid #000; width: 110px; text-align: center; padding: 4px;">الرقم الامتحاني</th>
                        <th style="border: 1px solid #000; width: 90px; text-align: center; padding: 4px;">رقم القيد</th>
                        <th style="border: 1px solid #000; width: 90px; text-align: center; padding: 4px;">التولد</th>
                        <th style="border: 1px solid #000; width: 100px; text-align: center; padding: 4px;">سنوات الرسوب</th>
                        <th style="border: 1px solid #000; width: 110px; text-align: center; padding: 4px;">الحالة / الملاحظات</th>
                    </tr>
                </thead>
                <tbody>
                    ${students.length > 0 ? students.map((student, idx) => {
                        const isEven = idx % 2 === 1;
                        const bg = isEven ? '#f8fafc' : '#ffffff';
                        const statusInfo = getStudentStatusLabel(student);
                        return `
                            <tr style="background-color: ${bg}; height: 26px;">
                                <td style="border: 1px solid #000; text-align: center; font-weight: bold; color: #334155;">${idx + 1}</td>
                                <td style="border: 1px solid #000; text-align: right; padding: 4px 8px; font-weight: bold; color: #0f172a;">${student.name || ''}</td>
                                <td style="border: 1px solid #000; text-align: center; font-weight: bold; color: #0369a1;">${student.examId || '-'}</td>
                                <td style="border: 1px solid #000; text-align: center; color: #334155;">${student.registrationId || '-'}</td>
                                <td style="border: 1px solid #000; text-align: center; color: #334155;">${student.birthDate || '-'}</td>
                                <td style="border: 1px solid #000; text-align: center; color: #334155;">${student.yearsOfFailure || 'لا يوجد رسوب'}</td>
                                <td style="border: 1px solid #000; text-align: center; font-weight: 600; color: ${statusInfo.color};">${statusInfo.text}</td>
                            </tr>
                        `;
                    }).join('') : `
                        <tr>
                            <td colspan="7" style="border: 1px solid #000; text-align: center; padding: 18px; color: #64748b; font-size: 11pt;">لا يوجد طلاب مسجلين في هذه الشعبة</td>
                        </tr>
                    `}
                </tbody>
            </table>

            <!-- Signatures Table -->
            <table style="width: 100%; border-collapse: collapse; margin-top: 15px; text-align: center; font-size: 10.5pt; font-weight: bold; font-family: 'Cairo', 'Traditional Arabic', 'Arial', sans-serif;">
                <tr>
                    <td style="width: 50%; vertical-align: top; padding: 10px;">
                        معاون شؤون الطلبة<br/><br/>
                        التوقيع: .....................
                    </td>
                    <td style="width: 50%; vertical-align: top; padding: 10px;">
                        مدير المدرسة<br/>
                        <span style="color: #0f172a; font-weight: bold;">${safeSettings.principalName || '................................'}</span><br/><br/>
                        التوقيع والختم: .....................
                    </td>
                </tr>
            </table>
        </div>
    `;
};

/**
 * Downloads a Word document (.doc) from HTML content with reliable browser and iframe handling
 */
export const downloadWordDoc = (htmlContent: string, fileName: string, docTitle: string) => {
    try {
        const fullDocument = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset="utf-8">
                <title>${docTitle}</title>
                <!--[if gte mso 9]>
                <xml>
                    <w:WordDocument>
                        <w:View>Print</w:View>
                        <w:Zoom>100</w:Zoom>
                        <w:DoNotOptimizeForBrowser/>
                    </w:WordDocument>
                </xml>
                <![endif]-->
                <style>
                    @page Section1 {
                        size: 595.3pt 841.9pt; /* A4 Portrait */
                        margin: 25pt 25pt 25pt 25pt;
                        mso-header-margin: 15pt;
                        mso-footer-margin: 15pt;
                    }
                    div.Section1 { page: Section1; }
                    body {
                        font-family: 'Cairo', 'Traditional Arabic', 'Arial', sans-serif;
                        direction: rtl;
                        text-align: right;
                        color: #000;
                    }
                    table {
                        border-collapse: collapse;
                    }
                </style>
            </head>
            <body lang="AR-IQ">
                <div class="Section1">
                    ${htmlContent}
                </div>
            </body>
            </html>
        `;

        const cleanFileName = (fileName.endsWith('.doc') ? fileName : `${fileName}.doc`).replace(/[/\\?%*:|"<>]/g, '_');
        const blob = new Blob(['\ufeff' + fullDocument], { type: 'application/msword;charset=utf-8' });

        // Microsoft Edge / legacy IE save
        if (typeof window !== 'undefined' && (window.navigator as any)?.msSaveOrOpenBlob) {
            (window.navigator as any).msSaveOrOpenBlob(blob, cleanFileName);
            return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.position = 'fixed';
        a.style.left = '-9999px';
        a.style.top = '-9999px';
        a.href = url;
        a.setAttribute('download', cleanFileName);
        a.download = cleanFileName;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);

        // Dispatches event cleanly
        try {
            a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        } catch {
            a.click();
        }

        // CRITICAL: Do NOT revoke URL immediately; allow browser download manager sufficient time to read the stream
        setTimeout(() => {
            if (document.body.contains(a)) {
                document.body.removeChild(a);
            }
            URL.revokeObjectURL(url);
        }, 60000);
    } catch (err) {
        console.error("Error in downloadWordDoc:", err);
        alert("حدث خطأ أثناء تنزيل الملف، يرجى إعادة المحاولة.");
    }
};

/**
 * Export a single section student roster to Word
 */
export const exportSingleSectionWord = (classData: ClassData, settings?: SchoolSettings | null) => {
    try {
        const html = generateSectionRosterHtml(classData, settings);
        const cleanStage = (classData.stage || '').replace(/\s+/g, '_');
        const cleanSection = (classData.section || '').replace(/\s+/g, '_');
        const fileName = `قائمة_اسماء_طلبة_${cleanStage}_شعبة_${cleanSection}.doc`;
        downloadWordDoc(html, fileName, `قائمة أسماء طلبة ${classData.stage} - ${classData.section}`);
    } catch (err) {
        console.error("Error in exportSingleSectionWord:", err);
        alert("تعذر تصدير الشعبة، يرجى التأكد من البيانات.");
    }
};

/**
 * Export all sections of a given stage to a single multi-section Word document
 */
export const exportStageRostersWord = (stage: string, classes: ClassData[], settings?: SchoolSettings | null) => {
    try {
        const targetStage = (stage || '').trim();
        const stageClasses = (classes || [])
            .filter(c => (c.stage || '').trim() === targetStage)
            .sort((a, b) => compareSections(a.section || '', b.section || ''));

        if (stageClasses.length === 0) {
            alert(`لا توجد شعب دراسية مسجلة لمرحلة: ${stage}`);
            return;
        }

        let combinedHtml = '';
        stageClasses.forEach((cls, idx) => {
            combinedHtml += generateSectionRosterHtml(cls, settings, { isSubsequentPage: idx > 0 });
        });

        const cleanStage = targetStage.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_') || 'المرحلة';
        const fileName = `قوائم_طلبة_مرحلة_${cleanStage}_كافة_الشعب.doc`;
        downloadWordDoc(combinedHtml, fileName, `قوائم طلبة مرحلة ${stage} - كافة الشعب`);
    } catch (err) {
        console.error("Error in exportStageRostersWord:", err);
        alert("حدث خطأ أثناء تصدير قوائم المرحلة إلى Word. يرجى المحاولة مرة أخرى.");
    }
};

/**
 * Export all stages and sections to a single comprehensive Word document
 */
export const exportAllClassesWord = (classes: ClassData[], settings?: SchoolSettings | null) => {
    try {
        if (!classes || classes.length === 0) {
            alert('لا توجد شعب دراسية للتصدير.');
            return;
        }

        const sortedClasses = [...classes].sort(compareClasses);

        let combinedHtml = '';
        sortedClasses.forEach((cls, idx) => {
            combinedHtml += generateSectionRosterHtml(cls, settings, { isSubsequentPage: idx > 0 });
        });

        const fileName = `قوائم_كافة_الشعب_والمراحل_الدراسية.doc`;
        downloadWordDoc(combinedHtml, fileName, `قوائم كافة الشعب والمراحل الدراسية`);
    } catch (err) {
        console.error("Error in exportAllClassesWord:", err);
        alert("حدث خطأ أثناء تصدير كافة القوائم. يرجى المحاولة مرة أخرى.");
    }
};

/**
 * Export a single section student roster to Excel (.xlsx)
 */
export const exportSingleSectionExcel = (classData: ClassData) => {
    try {
        const students = getCleanStudentsList(classData);
        const rows = students.map((s, idx) => ({
            'ت': idx + 1,
            'اسم الطالب الرباعي واللقب': s.name || '',
            'المرحلة': classData.stage || '',
            'الشعبة': classData.section || '',
            'الرقم الامتحاني': s.examId || '-',
            'رقم القيد': s.registrationId || '-',
            'سنة التولد': s.birthDate || '-',
            'سنوات الرسوب': s.yearsOfFailure || 'لا يوجد',
            'الحالة': getStudentStatusLabel(s).text,
            'الملاحظات': s.notes || ''
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'تنبيه': 'لا يوجد طلاب مسجلين' }]);
        XLSX.utils.book_append_sheet(wb, ws, `شعبة ${classData.section}`.substring(0, 31));

        const cleanStage = (classData.stage || '').replace(/\s+/g, '_');
        const cleanSection = (classData.section || '').replace(/\s+/g, '_');
        const fileName = `قائمة_طلبة_${cleanStage}_شعبة_${cleanSection}.xlsx`;
        XLSX.writeFile(wb, fileName);
    } catch (err) {
        console.error("Error in exportSingleSectionExcel:", err);
        alert("تعذر تصدير الشعبة إلى Excel.");
    }
};

/**
 * Export all sections of a stage to an Excel workbook with sheets per section
 */
export const exportStageRostersExcel = (stage: string, classes: ClassData[]) => {
    try {
        const targetStage = (stage || '').trim();
        const stageClasses = (classes || [])
            .filter(c => (c.stage || '').trim() === targetStage)
            .sort((a, b) => compareSections(a.section || '', b.section || ''));

        if (stageClasses.length === 0) {
            alert(`لا توجد شعب دراسية مسجلة لمرحلة: ${stage}`);
            return;
        }

        const wb = XLSX.utils.book_new();

        // 1. Master Sheet with all students in this stage
        const masterRows: any[] = [];
        stageClasses.forEach(cls => {
            const students = getCleanStudentsList(cls);
            students.forEach((s, idx) => {
                masterRows.push({
                    'ت': masterRows.length + 1,
                    'المرحلة': cls.stage,
                    'الشعبة': cls.section,
                    'اسم الطالب الرباعي واللقب': s.name || '',
                    'الرقم الامتحاني': s.examId || '-',
                    'رقم القيد': s.registrationId || '-',
                    'سنة التولد': s.birthDate || '-',
                    'سنوات الرسوب': s.yearsOfFailure || 'لا يوجد',
                    'الحالة': getStudentStatusLabel(s).text,
                    'الملاحظات': s.notes || ''
                });
            });
        });

        const masterWs = XLSX.utils.json_to_sheet(masterRows.length > 0 ? masterRows : [{ 'تنبيه': 'لا يوجد طلاب' }]);
        XLSX.utils.book_append_sheet(wb, masterWs, `كافة شعب ${targetStage}`.substring(0, 31));

        // 2. Individual Sheet per Section
        stageClasses.forEach(cls => {
            const students = getCleanStudentsList(cls);
            const sectionRows = students.map((s, idx) => ({
                'ت': idx + 1,
                'اسم الطالب الرباعي واللقب': s.name || '',
                'الشعبة': cls.section,
                'الرقم الامتحاني': s.examId || '-',
                'رقم القيد': s.registrationId || '-',
                'سنة التولد': s.birthDate || '-',
                'سنوات الرسوب': s.yearsOfFailure || 'لا يوجد',
                'الحالة': getStudentStatusLabel(s).text,
                'الملاحظات': s.notes || ''
            }));
            const ws = XLSX.utils.json_to_sheet(sectionRows.length > 0 ? sectionRows : [{ 'تنبيه': 'لا يوجد طلاب' }]);
            const sheetTitle = `شعبة ${cls.section}`.substring(0, 31);
            XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
        });

        const cleanStage = targetStage.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_') || 'المرحلة';
        const fileName = `قوائم_طلبة_مرحلة_${cleanStage}_Excel.xlsx`;
        XLSX.writeFile(wb, fileName);
    } catch (err) {
        console.error("Error in exportStageRostersExcel:", err);
        alert("حدث خطأ أثناء تصدير قوائم المرحلة إلى Excel.");
    }
};

/**
 * Export all classes to Excel workbook
 */
export const exportAllClassesExcel = (classes: ClassData[]) => {
    try {
        if (!classes || classes.length === 0) {
            alert('لا توجد شعب دراسية للتصدير.');
            return;
        }

        const sortedClasses = [...classes].sort(compareClasses);
        const wb = XLSX.utils.book_new();

        const masterRows: any[] = [];
        sortedClasses.forEach(cls => {
            const students = getCleanStudentsList(cls);
            students.forEach(s => {
                masterRows.push({
                    'ت': masterRows.length + 1,
                    'المرحلة': cls.stage,
                    'الشعبة': cls.section,
                    'اسم الطالب الرباعي واللقب': s.name || '',
                    'الرقم الامتحاني': s.examId || '-',
                    'رقم القيد': s.registrationId || '-',
                    'سنة التولد': s.birthDate || '-',
                    'سنوات الرسوب': s.yearsOfFailure || 'لا يوجد',
                    'الحالة': getStudentStatusLabel(s).text,
                    'الملاحظات': s.notes || ''
                });
            });
        });

        const masterWs = XLSX.utils.json_to_sheet(masterRows.length > 0 ? masterRows : [{ 'تنبيه': 'لا يوجد طلاب' }]);
        XLSX.utils.book_append_sheet(wb, masterWs, 'كافة المراحل والشعب');

        const fileName = `قوائم_كافة_الشعب_والمراحل_Excel.xlsx`;
        XLSX.writeFile(wb, fileName);
    } catch (err) {
        console.error("Error in exportAllClassesExcel:", err);
        alert("حدث خطأ أثناء تصدير كافة القوائم إلى Excel.");
    }
};

