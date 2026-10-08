import type { ClassData, User, SchoolSettings } from '../../types.ts';
import {
    MasterScheduleData,
    DAYS_ARABIC,
    GeneralScheduleConfig,
    TeacherConstraint,
    getPeriodsForDay,
    getMaxDailyPeriods,
    isTeacherUnavailableAt
} from './schedulerAlgorithm.ts';
import { compareSections } from '../../constants.ts';

/**
 * Downloads a string as a file (.doc or .csv)
 */
function downloadBlob(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Helper to resolve maximum periods across active days or from config/number.
 */
function resolveMaxPeriods(activeDays: string[], periodsPerDayOrConfig?: number | GeneralScheduleConfig): number {
    if (!periodsPerDayOrConfig) return 6;
    if (typeof periodsPerDayOrConfig === 'number') return periodsPerDayOrConfig;
    return getMaxDailyPeriods(periodsPerDayOrConfig);
}

function resolvePeriodsForDay(day: string, periodsPerDayOrConfig?: number | GeneralScheduleConfig): number {
    if (!periodsPerDayOrConfig) return 6;
    if (typeof periodsPerDayOrConfig === 'number') return periodsPerDayOrConfig;
    return getPeriodsForDay(day, periodsPerDayOrConfig);
}

/**
 * Exports single or multiple class schedules to a beautifully styled Word (.doc) document.
 */
export function exportClassScheduleWord(
    classesToExport: ClassData[],
    schedule: MasterScheduleData,
    settings: SchoolSettings,
    activeDays: string[],
    periodsPerDayOrConfig: number | GeneralScheduleConfig
) {
    const schoolName = settings.schoolName || 'المدرسة';
    const directorate = settings.directorate || 'المديرية العامة للتربية';
    const academicYear = settings.academicYear || '2025 - 2026';
    const principalName = settings.principalName || 'مدير المدرسة';
    const maxPeriods = resolveMaxPeriods(activeDays, periodsPerDayOrConfig);

    let pagesHtml = '';

    classesToExport.forEach((cls, classIdx) => {
        const isLast = classIdx === classesToExport.length - 1;
        const pageBreak = isLast ? '' : 'page-break-after: always;';

        let tableRowsHtml = '';

        for (let p = 1; p <= maxPeriods; p++) {
            let cellsHtml = `<td style="border: 1px solid #1e3a8a; padding: 10px 6px; font-weight: bold; background-color: #f1f5f9; text-align: center; width: 80px;">الحصة ${p}</td>`;

            activeDays.forEach(day => {
                const dayPeriodsCount = resolvePeriodsForDay(day, periodsPerDayOrConfig);
                if (p > dayPeriodsCount) {
                    cellsHtml += `
                        <td style="border: 1px solid #e2e8f0; padding: 8px 6px; text-align: center; color: #cbd5e1; font-size: 11px; background-color: #f8fafc;">
                            -
                        </td>
                    `;
                    return;
                }

                const dayPeriods = schedule[day] || [];
                const pData = dayPeriods.find(dp => dp.period === p);
                const assignment = pData?.assignments?.[cls.id];

                if (assignment && assignment.subjectId) {
                    cellsHtml += `
                        <td style="border: 1px solid #94a3b8; padding: 8px 6px; text-align: center; vertical-align: middle; background-color: #ffffff;">
                            <div style="font-weight: bold; color: #1e3a8a; font-size: 15px; margin-bottom: 3px;">${assignment.subject}</div>
                            <div style="color: #475569; font-size: 12px;">${assignment.teacher}</div>
                        </td>
                    `;
                } else {
                    cellsHtml += `
                        <td style="border: 1px solid #cbd5e1; padding: 8px 6px; text-align: center; color: #94a3b8; font-size: 12px; background-color: #f8fafc;">
                            -
                        </td>
                    `;
                }
            });

            tableRowsHtml += `<tr>${cellsHtml}</tr>`;
        }

        pagesHtml += `
            <div style="${pageBreak} padding: 20px; font-family: 'Simplified Arabic', 'Arial', sans-serif;">
                <!-- Header -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr>
                        <td style="text-align: right; width: 35%; font-size: 14px; line-height: 1.5; vertical-align: top;">
                            <strong>جمهورية العراق</strong><br/>
                            <strong>وزارة التربية</strong><br/>
                            <strong>${directorate}</strong><br/>
                            <strong>${schoolName}</strong>
                        </td>
                        <td style="text-align: center; width: 30%; vertical-align: middle;">
                            <div style="font-size: 20px; font-weight: bold; color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 4px; display: inline-block;">
                                جدول الدروس الأسبوعي
                            </div>
                            <div style="font-size: 14px; margin-top: 5px; color: #475569;">
                                العام الدراسي: ${academicYear}
                            </div>
                        </td>
                        <td style="text-align: left; width: 35%; font-size: 14px; line-height: 1.5; vertical-align: top;">
                            <div style="background-color: #e0f2fe; border: 1px solid #0284c7; padding: 6px 12px; border-radius: 6px; display: inline-block;">
                                <strong>المرحلة:</strong> ${cls.stage}<br/>
                                <strong>الشعبة:</strong> ${cls.section}
                            </div>
                        </td>
                    </tr>
                </table>

                <!-- Schedule Table -->
                <table style="width: 100%; border-collapse: collapse; text-align: center; margin-bottom: 30px;">
                    <thead>
                        <tr style="background-color: #1e3a8a; color: #ffffff;">
                            <th style="border: 1px solid #1e3a8a; padding: 12px 6px; font-size: 15px; width: 90px;">الحصة / اليوم</th>
                            ${activeDays.map(day => `
                                <th style="border: 1px solid #1e3a8a; padding: 12px 6px; font-size: 15px;">
                                    ${DAYS_ARABIC[day] || day}
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>

                <!-- Footer Signatures -->
                <table style="width: 100%; margin-top: 30px; border-collapse: collapse;">
                    <tr>
                        <td style="text-align: center; width: 50%; font-size: 14px;">
                            <strong>معاون شؤون الطلبة والجدول</strong><br/><br/><br/>
                            التوقيع: ...........................
                        </td>
                        <td style="text-align: center; width: 50%; font-size: 14px;">
                            <strong>مدير المدرسة: ${principalName}</strong><br/><br/><br/>
                            الختم والتوقيع: ...........................
                        </td>
                    </tr>
                </table>
            </div>
        `;
    });

    const fullHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" 
              xmlns:w="urn:schemas-microsoft-com:office:word" 
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <title>جدول الحصص الأسبوعي</title>
            <style>
                @page {
                    size: A4 landscape;
                    margin: 1.5cm 1.5cm 1.5cm 1.5cm;
                }
                body {
                    direction: rtl;
                    font-family: 'Segoe UI', Tahoma, 'Arial', sans-serif;
                }
            </style>
        </head>
        <body>
            ${pagesHtml}
        </body>
        </html>
    `;

    const fileName = classesToExport.length === 1 
        ? `جدول_شعبة_${classesToExport[0].stage}_${classesToExport[0].section}.doc`
        : `جداول_الدروس_الأسبوعية_${schoolName}.doc`;

    downloadBlob(fullHtml, fileName, 'application/msword;charset=utf-8');
}

/**
 * Exports teacher schedule(s) to Word (.doc)
 */
export function exportTeacherScheduleWord(
    teachersToExport: User[],
    classes: ClassData[],
    schedule: MasterScheduleData,
    settings: SchoolSettings,
    activeDays: string[],
    periodsPerDayOrConfig: number | GeneralScheduleConfig,
    teacherConstraints?: Record<string, TeacherConstraint>
) {
    const schoolName = settings.schoolName || 'المدرسة';
    const directorate = settings.directorate || 'المديرية العامة للتربية';
    const academicYear = settings.academicYear || '2025 - 2026';
    const principalName = settings.principalName || 'مدير المدرسة';
    const maxPeriods = resolveMaxPeriods(activeDays, periodsPerDayOrConfig);
    const safeConstraints = teacherConstraints || {};

    let pagesHtml = '';

    teachersToExport.forEach((teacher, tIdx) => {
        const isLast = tIdx === teachersToExport.length - 1;
        const pageBreak = isLast ? '' : 'page-break-after: always;';
        const tConstraint = safeConstraints[teacher.id];
        const offDays = Array.isArray(tConstraint?.offDays) ? tConstraint.offDays : [];

        let tableRowsHtml = '';
        let totalWeeklyPeriods = 0;

        for (let p = 1; p <= maxPeriods; p++) {
            let cellsHtml = `<td style="border: 1px solid #1e3a8a; padding: 10px 6px; font-weight: bold; background-color: #f1f5f9; text-align: center; width: 80px;">الحصة ${p}</td>`;

            activeDays.forEach(day => {
                const dayPeriodsCount = resolvePeriodsForDay(day, periodsPerDayOrConfig);
                if (p > dayPeriodsCount) {
                    cellsHtml += `
                        <td style="border: 1px solid #e2e8f0; padding: 8px 6px; text-align: center; color: #cbd5e1; font-size: 11px; background-color: #f8fafc;">
                            -
                        </td>
                    `;
                    return;
                }

                const dayPeriods = schedule[day] || [];
                const pData = dayPeriods.find(dp => dp.period === p);
                
                // Find if teacher has any class in this period
                let teacherAssignment: { classId: string; subject: string; stage: string; section: string } | null = null;

                if (pData?.assignments) {
                    for (const [clsId, assign] of Object.entries(pData.assignments)) {
                        if (assign.teacherId === teacher.id || assign.teacher === teacher.name) {
                            const cls = classes.find(c => c.id === clsId);
                            teacherAssignment = {
                                classId: clsId,
                                subject: assign.subject,
                                stage: cls ? cls.stage : assign.stage,
                                section: cls ? cls.section : assign.section
                            };
                            totalWeeklyPeriods++;
                            break;
                        }
                    }
                }

                if (teacherAssignment) {
                    cellsHtml += `
                        <td style="border: 1px solid #0284c7; padding: 8px 6px; text-align: center; vertical-align: middle; background-color: #f0fdf4;">
                            <div style="font-weight: bold; color: #166534; font-size: 14px; margin-bottom: 2px;">${teacherAssignment.stage} (${teacherAssignment.section})</div>
                            <div style="color: #1e3a8a; font-size: 13px; font-weight: 600;">${teacherAssignment.subject}</div>
                        </td>
                    `;
                } else {
                    const isOffDay = offDays.includes(day);
                    const isPartialOff = !isOffDay && isTeacherUnavailableAt(tConstraint, day, p);

                    if (isOffDay) {
                        cellsHtml += `
                            <td style="border: 1px solid #fed7aa; padding: 8px 6px; text-align: center; color: #9a3412; font-size: 12px; font-weight: bold; background-color: #fff7ed;">
                                تفرغ كامل
                            </td>
                        `;
                    } else if (isPartialOff) {
                        cellsHtml += `
                            <td style="border: 1px solid #fed7aa; padding: 8px 6px; text-align: center; color: #c2410c; font-size: 11px; font-weight: bold; background-color: #fffaf0;">
                                تفريغ جزئي
                            </td>
                        `;
                    } else {
                        cellsHtml += `
                            <td style="border: 1px solid #cbd5e1; padding: 8px 6px; text-align: center; color: #94a3b8; font-size: 12px; background-color: #f8fafc;">
                                -
                            </td>
                        `;
                    }
                }
            });

            tableRowsHtml += `<tr>${cellsHtml}</tr>`;
        }

        pagesHtml += `
            <div style="${pageBreak} padding: 20px; font-family: 'Simplified Arabic', 'Arial', sans-serif;">
                <!-- Header -->
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <tr>
                        <td style="text-align: right; width: 35%; font-size: 14px; line-height: 1.5; vertical-align: top;">
                            <strong>جمهورية العراق</strong><br/>
                            <strong>وزارة التربية</strong><br/>
                            <strong>${directorate}</strong><br/>
                            <strong>${schoolName}</strong>
                        </td>
                        <td style="text-align: center; width: 30%; vertical-align: middle;">
                            <div style="font-size: 20px; font-weight: bold; color: #1e3a8a; border-bottom: 2px solid #1e3a8a; padding-bottom: 4px; display: inline-block;">
                                جدول الحصص الأسبوعي للأستاذ
                            </div>
                            <div style="font-size: 14px; margin-top: 5px; color: #475569;">
                                العام الدراسي: ${academicYear}
                            </div>
                        </td>
                        <td style="text-align: left; width: 35%; font-size: 14px; line-height: 1.5; vertical-align: top;">
                            <div style="background-color: #f0fdf4; border: 1px solid #16a34a; padding: 6px 14px; border-radius: 6px; display: inline-block;">
                                <strong>اسم المدرس:</strong> ${teacher.name}<br/>
                                <strong>إجمالي النصاب:</strong> ${totalWeeklyPeriods} حصة أسبوعياً
                            </div>
                        </td>
                    </tr>
                </table>

                <!-- Schedule Table -->
                <table style="width: 100%; border-collapse: collapse; text-align: center; margin-bottom: 30px;">
                    <thead>
                        <tr style="background-color: #166534; color: #ffffff;">
                            <th style="border: 1px solid #166534; padding: 12px 6px; font-size: 15px; width: 90px;">الحصة / اليوم</th>
                            ${activeDays.map(day => `
                                <th style="border: 1px solid #166534; padding: 12px 6px; font-size: 15px;">
                                    ${DAYS_ARABIC[day] || day}
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>

                <!-- Footer Signatures -->
                <table style="width: 100%; margin-top: 30px; border-collapse: collapse;">
                    <tr>
                        <td style="text-align: center; width: 50%; font-size: 14px;">
                            <strong>توقيع الأستاذ</strong><br/><br/><br/>
                            ...........................
                        </td>
                        <td style="text-align: center; width: 50%; font-size: 14px;">
                            <strong>مدير المدرسة: ${principalName}</strong><br/><br/><br/>
                            الختم والتوقيع: ...........................
                        </td>
                    </tr>
                </table>
            </div>
        `;
    });

    const fullHtml = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" 
              xmlns:w="urn:schemas-microsoft-com:office:word" 
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <title>جداول المدرسين</title>
            <style>
                @page {
                    size: A4 landscape;
                    margin: 1.5cm 1.5cm 1.5cm 1.5cm;
                }
                body {
                    direction: rtl;
                    font-family: 'Segoe UI', Tahoma, 'Arial', sans-serif;
                }
            </style>
        </head>
        <body>
            ${pagesHtml}
        </body>
        </html>
    `;

    const fileName = teachersToExport.length === 1 
        ? `جدول_الأستاذ_${teachersToExport[0].name.replace(/\s+/g, '_')}.doc`
        : `جداول_المدرسين_الأسبوعية_${schoolName}.doc`;

    downloadBlob(fullHtml, fileName, 'application/msword;charset=utf-8');
}

export const SECTION_COLORS = [
    { headerBg: '#fbd5b5', subHeaderBg: '#fed7aa', contentBg: '#fff7ed', text: '#7c2d12' }, // Section 1 (أ) Peach
    { headerBg: '#dbeafe', subHeaderBg: '#bfdbfe', contentBg: '#eff6ff', text: '#1e40af' }, // Section 2 (ب) Light Blue
    { headerBg: '#93c5fd', subHeaderBg: '#60a5fa', contentBg: '#f0f9ff', text: '#1e3a8a' }, // Section 3 (ج) Medium Blue
    { headerBg: '#bbf7d0', subHeaderBg: '#86efac', contentBg: '#f0fdf4', text: '#166534' }, // Section 4 (د) Light Green
    { headerBg: '#fef08a', subHeaderBg: '#fde047', contentBg: '#fefce8', text: '#854d0e' }, // Section 5 (هـ) Light Yellow
    { headerBg: '#e9d5ff', subHeaderBg: '#d8b4fe', contentBg: '#faf5ff', text: '#6b21a8' }, // Section 6 (و) Light Purple
    { headerBg: '#fecdd3', subHeaderBg: '#fda4af', contentBg: '#fff1f2', text: '#9f1239' }, // Section 7 (ز) Rose
];

export const DAY_COLORS: Record<string, { bg: string; text: string; lightBg: string }> = {
    Sunday: { bg: '#1d4ed8', text: '#ffffff', lightBg: '#eff6ff' },    // الأحد: أزرق ملكي
    Monday: { bg: '#047857', text: '#ffffff', lightBg: '#f0fdf4' },    // الإثنين: أخضر زمردي
    Tuesday: { bg: '#0891b2', text: '#ffffff', lightBg: '#ecfeff' },   // الثلاثاء: تركوازي داكن
    Wednesday: { bg: '#7c3aed', text: '#ffffff', lightBg: '#f5f3ff' }, // الأربعاء: بنفسجي ملكي
    Thursday: { bg: '#c2410c', text: '#ffffff', lightBg: '#fff7ed' },  // الخميس: قرميدي برتقالي
    Friday: { bg: '#be123c', text: '#ffffff', lightBg: '#fff1f2' },    // الجمعة
    Saturday: { bg: '#4338ca', text: '#ffffff', lightBg: '#eef2ff' },  // السبت
};

export const PERIOD_COLORS: Record<number, { bg: string; text: string; arNum: string }> = {
    1: { bg: '#dc2626', text: '#ffffff', arNum: '١' },
    2: { bg: '#ea580c', text: '#ffffff', arNum: '٢' },
    3: { bg: '#eab308', text: '#000000', arNum: '٣' },
    4: { bg: '#9333ea', text: '#ffffff', arNum: '٤' },
    5: { bg: '#2563eb', text: '#ffffff', arNum: '٥' },
    6: { bg: '#0891b2', text: '#ffffff', arNum: '٦' },
    7: { bg: '#059669', text: '#ffffff', arNum: '٧' },
    8: { bg: '#4f46e5', text: '#ffffff', arNum: '٨' },
};

/**
 * Builds the complete HTML markup for a Stage Schedule table, configured for single page fitting.
 */
export function buildStageScheduleHtml(
    stage: string,
    classesInStage: ClassData[],
    schedule: MasterScheduleData,
    settings: SchoolSettings,
    activeDays: string[],
    periodsPerDayOrConfig: number | GeneralScheduleConfig,
    effectiveDate: string = '٢٠٢٦ / ٣ / ٢٥'
): string {
    const schoolName = settings.schoolName || 'المدرسة';
    const sortedClasses = [...classesInStage].sort((a, b) => compareSections(a.section || '', b.section || ''));
    const maxPeriods = resolveMaxPeriods(activeDays, periodsPerDayOrConfig);

    // Top Section Headers
    let sectionHeadersHtml = '';
    let subHeadersHtml = '';

    sortedClasses.forEach((cls, idx) => {
        const color = SECTION_COLORS[idx % SECTION_COLORS.length];
        const sectionTitle = `${cls.stage} ${cls.section}`.trim();

        sectionHeadersHtml += `
            <th colspan="2" style="border: 2px solid #000000; background-color: ${color.headerBg}; color: #000000; font-size: 15px; font-weight: bold; padding: 4px 2px; text-align: center;">
                ${sectionTitle}
            </th>
        `;

        subHeadersHtml += `
            <th style="border: 2px solid #000000; background-color: ${color.subHeaderBg}; color: #000000; font-size: 13px; font-weight: bold; padding: 3px 2px; text-align: center; width: 65px;">المادة</th>
            <th style="border: 2px solid #000000; background-color: ${color.subHeaderBg}; color: #000000; font-size: 13px; font-weight: bold; padding: 3px 2px; text-align: center; width: 80px;">المدرس</th>
        `;
    });

    // Body Rows
    let bodyRowsHtml = '';

    activeDays.forEach((day, dayIdx) => {
        const dayPeriodsCount = resolvePeriodsForDay(day, periodsPerDayOrConfig);
        const isLastDay = dayIdx === activeDays.length - 1;
        const dayBorderBottom = isLastDay ? 'border-bottom: 3px solid #000000;' : 'border-bottom: 2px solid #000000;';
        const dayColor = DAY_COLORS[day] || { bg: '#1d4ed8', text: '#ffffff', lightBg: '#eff6ff' };

        for (let p = 1; p <= dayPeriodsCount; p++) {
            const pColor = PERIOD_COLORS[p] || { bg: '#475569', text: '#ffffff', arNum: `${p}` };
            const isFirstPeriodOfDay = p === 1;
            const isLastPeriodOfDay = p === dayPeriodsCount;

            let rowHtml = '<tr style="page-break-inside: avoid;">';

            // Vertical Day Cell with custom distinct day color
            if (isFirstPeriodOfDay) {
                rowHtml += `
                    <td rowspan="${dayPeriodsCount}" style="border: 2px solid #000000; ${dayBorderBottom} background-color: ${dayColor.bg}; color: ${dayColor.text}; font-weight: 900; font-size: 15px; width: 32px; text-align: center; vertical-align: middle; padding: 3px 2px; writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 2px;">
                        ${DAYS_ARABIC[day] || day}
                    </td>
                `;
            }

            // Period Number Cell
            rowHtml += `
                <td style="border: 2px solid #000000; ${isLastPeriodOfDay ? dayBorderBottom : ''} background-color: ${pColor.bg}; color: ${pColor.text}; font-weight: 900; font-size: 14px; width: 28px; text-align: center; vertical-align: middle; padding: 3px 1px;">
                    ${pColor.arNum}
                </td>
            `;

            // Class Cells (Subject | Teacher)
            sortedClasses.forEach((cls, clsIdx) => {
                const color = SECTION_COLORS[clsIdx % SECTION_COLORS.length];
                const dayPeriods = schedule[day] || [];
                const pData = dayPeriods.find(dp => dp.period === p);
                const assign = pData?.assignments?.[cls.id];

                if (assign && assign.subjectId) {
                    rowHtml += `
                        <td style="border: 2px solid #000000; ${isLastPeriodOfDay ? dayBorderBottom : ''} background-color: ${color.contentBg}; color: #000000; font-weight: 800; font-size: 13px; text-align: center; vertical-align: middle; padding: 3px 2px; line-height: 1.2;">
                            ${assign.subject}
                        </td>
                        <td style="border: 2px solid #000000; ${isLastPeriodOfDay ? dayBorderBottom : ''} background-color: ${color.contentBg}; color: #111827; font-weight: 600; font-size: 12px; text-align: center; vertical-align: middle; padding: 3px 2px; line-height: 1.2;">
                            ${assign.teacher}
                        </td>
                    `;
                } else {
                    rowHtml += `
                        <td style="border: 2px solid #000000; ${isLastPeriodOfDay ? dayBorderBottom : ''} background-color: ${color.contentBg}; color: #9ca3af; font-size: 11px; text-align: center; vertical-align: middle; padding: 3px 2px;">
                            -
                        </td>
                        <td style="border: 2px solid #000000; ${isLastPeriodOfDay ? dayBorderBottom : ''} background-color: ${color.contentBg}; color: #9ca3af; font-size: 11px; text-align: center; vertical-align: middle; padding: 3px 2px;">
                            -
                        </td>
                    `;
                }
            });

            rowHtml += '</tr>';
            bodyRowsHtml += rowHtml;
        }
    });

    return `
        <div style="direction: rtl; font-family: 'Cairo', 'Simplified Arabic', 'Segoe UI', Tahoma, Arial, sans-serif; padding: 4px; background-color: #ffffff;">
            <!-- Header Bar -->
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 6px;">
                <tr>
                    <td style="text-align: right; width: 33%; font-size: 16px; font-weight: 900; color: #000000;">
                        إدارة ${schoolName}
                    </td>
                    <td style="text-align: center; width: 34%; font-size: 17px; font-weight: 900; color: #000000;">
                        جدول الدروس الأسبوعي ( ${stage} )
                    </td>
                    <td style="text-align: left; width: 33%; font-size: 14px; font-weight: 900; color: #000000;">
                        يعمل به بتاريخ ${effectiveDate}
                    </td>
                </tr>
            </table>

            <!-- Main Schedule Table -->
            <table style="width: 100%; border-collapse: collapse; text-align: center; border: 3px solid #000000;">
                <thead>
                    <tr style="page-break-inside: avoid;">
                        <th rowspan="2" style="border: 2px solid #000000; background-color: #0284c7; color: #ffffff; font-size: 13px; font-weight: bold; width: 32px; text-align: center; vertical-align: middle; padding: 3px;">
                            اليوم
                        </th>
                        <th rowspan="2" style="border: 2px solid #000000; background-color: #0284c7; color: #ffffff; font-size: 13px; font-weight: bold; width: 28px; text-align: center; vertical-align: middle; padding: 3px;">
                            الدرس
                        </th>
                        ${sectionHeadersHtml}
                    </tr>
                    <tr style="page-break-inside: avoid;">
                        ${subHeadersHtml}
                    </tr>
                </thead>
                <tbody>
                    ${bodyRowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Exports a Stage Schedule directly to a single-page Microsoft Word (.doc) document, optimized for A3 single-page printing.
 */
export function exportStageScheduleWord(
    stage: string,
    classesInStage: ClassData[],
    schedule: MasterScheduleData,
    settings: SchoolSettings,
    activeDays: string[],
    periodsPerDayOrConfig: number | GeneralScheduleConfig,
    effectiveDate: string = '٢٠٢٦ / ٣ / ٢٥',
    paperSize: 'a3' | 'a4' = 'a3'
) {
    const tableHtml = buildStageScheduleHtml(
        stage,
        classesInStage,
        schedule,
        settings,
        activeDays,
        periodsPerDayOrConfig,
        effectiveDate
    );

    const isA3 = paperSize === 'a3';
    const pageSizeCss = isA3
        ? `
            size: 420mm 297mm;
            mso-page-orientation: landscape;
            margin: 6mm 6mm 6mm 6mm;
        `
        : `
            size: 297mm 210mm;
            mso-page-orientation: landscape;
            margin: 4mm 4mm 4mm 4mm;
        `;

    const sectionSizeCss = isA3
        ? `
            size: 1190.55pt 841.89pt;
            mso-page-orientation: landscape;
            margin: 14.4pt 14.4pt 14.4pt 14.4pt;
        `
        : `
            size: 841.89pt 595.28pt;
            mso-page-orientation: landscape;
            margin: 10.0pt 10.0pt 10.0pt 10.0pt;
        `;

    const fullDoc = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" 
              xmlns:w="urn:schemas-microsoft-com:office:word" 
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="utf-8">
            <title>جدول ${stage}</title>
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
                @page {
                    ${pageSizeCss}
                }
                @page WordSection1 {
                    ${sectionSizeCss}
                }
                div.WordSection1 {
                    page: WordSection1;
                }
                body {
                    direction: rtl;
                    font-family: 'Simplified Arabic', 'Cairo', 'Segoe UI', Tahoma, 'Arial', sans-serif;
                    margin: 0;
                    padding: 0;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    mso-table-layout-alt: fixed;
                }
                tr {
                    page-break-inside: avoid;
                }
                td, th {
                    border: 1.5pt solid #000000;
                }
            </style>
        </head>
        <body>
            <div class="WordSection1">
                ${tableHtml}
            </div>
        </body>
        </html>
    `;

    const fileName = `جدول_مرحلة_${stage.replace(/\s+/g, '_')}_صفحة_واحدة.doc`;
    downloadBlob(fullDoc, fileName, 'application/msword;charset=utf-8');
}

/**
 * Directly downloads any DOM Element (schedule table) as a high-resolution PDF file on a single page.
 */
export async function exportElementDirectPDF(
    elementOrId: HTMLElement | string,
    fileName: string = 'الجدول_الدراسي.pdf',
    paperSize: 'a3' | 'a4' = 'a4',
    orientation: 'landscape' | 'portrait' = 'landscape'
) {
    const { default: jsPDF } = await import('jspdf');
    const { default: html2canvas } = await import('html2canvas');

    let targetEl: HTMLElement | null = null;
    if (typeof elementOrId === 'string') {
        targetEl = document.getElementById(elementOrId);
    } else {
        targetEl = elementOrId;
    }

    if (!targetEl) {
        throw new Error('Target element for PDF export not found');
    }

    await document.fonts.ready;

    const canvas = await html2canvas(targetEl, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);

    const isA3 = paperSize === 'a3';
    let pdfWidth = orientation === 'landscape' ? (isA3 ? 420 : 297) : (isA3 ? 297 : 210);
    let pdfHeight = orientation === 'landscape' ? (isA3 ? 297 : 210) : (isA3 ? 420 : 297);

    const pdf = new jsPDF({
        orientation: orientation,
        unit: 'mm',
        format: paperSize,
        compress: true,
    });

    const margin = 6;
    const availableWidth = pdfWidth - (margin * 2);
    const availableHeight = pdfHeight - (margin * 2);

    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    const ratio = imgWidth / imgHeight;

    let finalW = availableWidth;
    let finalH = finalW / ratio;

    if (finalH > availableHeight) {
        finalH = availableHeight;
        finalW = finalH * ratio;
    }

    const posX = margin + ((availableWidth - finalW) / 2);
    const posY = margin + ((availableHeight - finalH) / 2);

    pdf.addImage(imgData, 'JPEG', posX, posY, finalW, finalH, undefined, 'FAST');
    pdf.save(fileName);
}

export const exportStageScheduleDirectPDF = exportElementDirectPDF;

/**
 * Triggers a dedicated high-fidelity print preview / PDF generation dialog for a stage schedule.
 */
export function printStageSchedulePDF(
    stage: string,
    classesInStage: ClassData[],
    schedule: MasterScheduleData,
    settings: SchoolSettings,
    activeDays: string[],
    periodsPerDayOrConfig: number | GeneralScheduleConfig,
    effectiveDate: string = '٢٠٢٦ / ٣ / ٢٥',
    paperSize: 'a3' | 'a4' = 'a3'
) {
    const tableHtml = buildStageScheduleHtml(
        stage,
        classesInStage,
        schedule,
        settings,
        activeDays,
        periodsPerDayOrConfig,
        effectiveDate
    );

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const pageMargin = paperSize === 'a3' ? '5mm' : '4mm';

    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="utf-8">
            <title>جدول ${stage}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">
            <style>
                @page {
                    size: ${paperSize} landscape;
                    margin: ${pageMargin};
                }
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                html, body {
                    margin: 0;
                    padding: 0;
                    font-family: 'Cairo', 'Segoe UI', Tahoma, sans-serif;
                    direction: rtl;
                    background: #ffffff;
                    height: 100%;
                }
                table {
                    border-collapse: collapse;
                    width: 100%;
                    page-break-inside: avoid;
                }
                tr {
                    page-break-inside: avoid;
                }
            </style>
        </head>
        <body>
            ${tableHtml}
            <script>
                window.onload = function() {
                    setTimeout(() => {
                        window.focus();
                        window.print();
                        setTimeout(() => {
                            window.parent.document.body.removeChild(window.frameElement);
                        }, 500);
                    }, 250);
                };
            </script>
        </body>
        </html>
    `);
    doc.close();
}

/**
 * Exports the Master Schedule to an Excel CSV sheet (readable in Excel / Google Sheets with Arabic UTF-8 BOM).
 */
export function exportMasterScheduleCSV(
    classes: ClassData[],
    schedule: MasterScheduleData,
    activeDays: string[],
    periodsPerDayOrConfig: number | GeneralScheduleConfig
) {
    let csv = '\uFEFF'; // UTF-8 BOM for Excel Arabic support
    const maxPeriods = resolveMaxPeriods(activeDays, periodsPerDayOrConfig);

    // Header row
    csv += 'المرحلة,الشعبة,الحصة,' + activeDays.map(d => DAYS_ARABIC[d] || d).join(',') + '\n';

    classes.forEach(cls => {
        for (let p = 1; p <= maxPeriods; p++) {
            const rowData: string[] = [cls.stage, cls.section, `الحصة ${p}`];

            activeDays.forEach(day => {
                const dayPeriodsCount = resolvePeriodsForDay(day, periodsPerDayOrConfig);
                if (p > dayPeriodsCount) {
                    rowData.push('""');
                    return;
                }

                const dayPeriods = schedule[day] || [];
                const pData = dayPeriods.find(dp => dp.period === p);
                const assign = pData?.assignments?.[cls.id];

                if (assign && assign.subjectId) {
                    rowData.push(`"${assign.subject} (${assign.teacher})"`);
                } else {
                    rowData.push('""');
                }
            });

            csv += rowData.join(',') + '\n';
        }
    });

    downloadBlob(csv, `الجدول_العام_الشامل_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8');
}
