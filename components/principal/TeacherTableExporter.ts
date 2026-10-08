import * as XLSX from 'xlsx';
import {
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
    AlignmentType,
    BorderStyle,
    HeadingLevel,
    ShadingType
} from 'docx';
import type { User, ClassData, SchoolSettings } from '../../types.ts';
import { getDefaultQuotaForSubject } from '../scheduling/schedulerAlgorithm.ts';
import { GRADE_LEVELS } from '../../constants.ts';

export interface TeacherTableRowData {
    index: number;
    id: string;
    name: string;
    role: string;
    stages: string;
    subjects: string;
    sections: string;
    weeklyPeriods: number;
    advisorInfo?: string;
    details: {
        stage: string;
        section: string;
        subjectName: string;
        periods: number;
    }[];
}

/**
 * Builds structured data for each teacher with stages, subjects, sections, and weekly periods.
 */
export function buildTeacherTableData(
    teachers: User[],
    classes: ClassData[],
    classQuotas: Record<string, Record<string, number>> = {},
    schoolLevel?: string
): TeacherTableRowData[] {
    // Filter staff that are teachers or have teaching assignments
    const teacherList = teachers.filter(u => u.role === 'teacher' || (Array.isArray(u.assignments) && u.assignments.length > 0));

    // Sort alphabetically in Arabic
    const sortedTeachers = [...teacherList].sort((a, b) => a.name.localeCompare(b.name, 'ar-IQ'));

    return sortedTeachers.map((teacher, idx) => {
        const assignments = teacher.assignments || [];
        
        const details: {
            stage: string;
            section: string;
            subjectName: string;
            periods: number;
        }[] = [];

        let totalWeeklyPeriods = 0;
        const stagesSet = new Set<string>();
        const subjectsSet = new Set<string>();
        const stageSectionsMap = new Map<string, Set<string>>();

        assignments.forEach(assign => {
            const cls = classes.find(c => c.id === assign.classId);
            if (!cls) return;

            const subj = cls.subjects.find(s => s.id === assign.subjectId);
            if (!subj) return;

            const stage = cls.stage || 'غير محدد';
            const section = cls.section || 'أ';
            const subjectName = subj.name || 'مادة غير محددة';

            stagesSet.add(stage);
            subjectsSet.add(subjectName);

            if (!stageSectionsMap.has(stage)) {
                stageSectionsMap.set(stage, new Set<string>());
            }
            stageSectionsMap.get(stage)!.add(section);

            // Compute quota
            const customQuota = classQuotas[cls.id]?.[subj.id];
            const periodCount = customQuota !== undefined ? Number(customQuota) : getDefaultQuotaForSubject(subjectName, schoolLevel || cls.stage);

            totalWeeklyPeriods += periodCount;

            details.push({
                stage,
                section,
                subjectName,
                periods: periodCount
            });
        });

        // Sort stages by standard educational order if possible
        const sortedStages = Array.from(stagesSet).sort((a, b) => {
            const indexA = GRADE_LEVELS.indexOf(a as any);
            const indexB = GRADE_LEVELS.indexOf(b as any);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            return a.localeCompare(b, 'ar-IQ');
        });

        // Format sections string: e.g. "الأول متوسط (أ، ب)، الثاني متوسط (ج)"
        const sectionsFormatted = sortedStages.map(st => {
            const sections = Array.from(stageSectionsMap.get(st) || []).sort();
            if (sections.length === 0) return st;
            return `${st} (${sections.join('، ')})`;
        }).join(' - ');

        let advisorInfo = '';
        if (teacher.advisorClassId) {
            const advClass = classes.find(c => c.id === teacher.advisorClassId);
            if (advClass) {
                advisorInfo = `مرشد ${advClass.stage} (${advClass.section})`;
            }
        }

        return {
            index: idx + 1,
            id: teacher.id,
            name: teacher.name,
            role: teacher.role,
            stages: sortedStages.join('، ') || 'لا يوجد',
            subjects: Array.from(subjectsSet).join('، ') || 'لا يوجد',
            sections: sectionsFormatted || 'لا يوجد',
            weeklyPeriods: totalWeeklyPeriods,
            advisorInfo,
            details
        };
    });
}

/**
 * Exports teacher table to an Excel (.xlsx) file with professional RTL layout and headers.
 */
export function exportTeachersToExcel(
    tableData: TeacherTableRowData[],
    settings?: SchoolSettings
): void {
    const schoolName = settings?.schoolName || 'متوسطة بطل خيبر';
    const directorate = settings?.directorate || 'المديرية العامة للتربية';
    const academicYear = settings?.academicYear || '2025-2026';
    const dateStr = new Date().toLocaleDateString('ar-IQ');

    const sheetRows: any[][] = [];

    // Title and Metadata Rows
    sheetRows.push(['جمهورية العراق - وزارة التربية']);
    sheetRows.push([directorate]);
    sheetRows.push([`إدارة ${schoolName}`]);
    sheetRows.push([`العام الدراسي: ${academicYear}`, '', '', '', '', `تاريخ التصدير: ${dateStr}`]);
    sheetRows.push([`جدول توزيع الحصص والمواد والشعب للملاكات التدريسية`]);
    sheetRows.push([]); // Empty row

    // Table Headers
    const headers = [
        'التسلسل',
        'اسم المدرس',
        'الصفوف التي يدرسها',
        'المواد التي يدرسها',
        'الشعب',
        'مجموع الحصص في الأسبوع'
    ];
    sheetRows.push(headers);

    // Data Rows
    let totalPeriodsAllTeachers = 0;
    tableData.forEach(row => {
        totalPeriodsAllTeachers += row.weeklyPeriods;
        sheetRows.push([
            row.index,
            row.name + (row.advisorInfo ? ` [${row.advisorInfo}]` : ''),
            row.stages,
            row.subjects,
            row.sections,
            row.weeklyPeriods
        ]);
    });

    // Summary Row
    sheetRows.push([]);
    sheetRows.push([
        'المجموع الكلي',
        `عدد المدرسين: ${tableData.length}`,
        '',
        '',
        'إجمالي الحصص الأسبوعية:',
        totalPeriodsAllTeachers
    ]);

    // Signatures
    sheetRows.push([]);
    sheetRows.push([
        '',
        'توقيع منظم الجدول / المعاون',
        '',
        '',
        'توقيع وختم مدير المدرسة'
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);

    // Set Column Widths
    worksheet['!cols'] = [
        { wch: 10 }, // No
        { wch: 32 }, // Name
        { wch: 28 }, // Stages
        { wch: 28 }, // Subjects
        { wch: 36 }, // Sections
        { wch: 22 }  // Weekly periods
    ];

    // Right to left view
    worksheet['!views'] = [{ RTL: true }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'جدول المدرسين والحصص');

    const cleanSchoolName = schoolName.replace(/[/\\?%*:|"<>]/g, '-').trim();
    const fileName = `جدول_المدرسين_والمواد_والحصص_${cleanSchoolName}.xlsx`;
    XLSX.writeFile(workbook, fileName);
}

/**
 * Exports teacher table to an official MS Word (.docx) document.
 */
export async function exportTeachersToWord(
    tableData: TeacherTableRowData[],
    settings?: SchoolSettings
): Promise<void> {
    const schoolName = settings?.schoolName || 'متوسطة بطل خيبر';
    const directorate = settings?.directorate || 'المديرية العامة للتربية';
    const academicYear = settings?.academicYear || '2025-2026';
    const principalName = settings?.principalName || '';
    const dateStr = new Date().toLocaleDateString('ar-IQ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    let totalPeriodsAllTeachers = 0;
    tableData.forEach(r => { totalPeriodsAllTeachers += r.weeklyPeriods; });

    // Table Header Row
    const headerRow = new TableRow({
        tableHeader: true,
        children: [
            new TableCell({
                width: { size: 7, type: WidthType.PERCENTAGE },
                shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'التسلسل', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })]
                    })
                ]
            }),
            new TableCell({
                width: { size: 24, type: WidthType.PERCENTAGE },
                shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'اسم المدرس', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })]
                    })
                ]
            }),
            new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'الصفوف التي يدرسها', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })]
                    })
                ]
            }),
            new TableCell({
                width: { size: 20, type: WidthType.PERCENTAGE },
                shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'المواد التي يدرسها', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })]
                    })
                ]
            }),
            new TableCell({
                width: { size: 17, type: WidthType.PERCENTAGE },
                shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'الشعب', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })]
                    })
                ]
            }),
            new TableCell({
                width: { size: 12, type: WidthType.PERCENTAGE },
                shading: { fill: '1E3A8A', type: ShadingType.CLEAR },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: 'مجموع الحصص الأسبوعية', bold: true, color: 'FFFFFF', size: 20, font: 'Arial' })]
                    })
                ]
            }),
        ]
    });

    // Table Data Rows
    const dataRows = tableData.map((row, index) => {
        const isEven = index % 2 === 1;
        const bgFill = isEven ? 'F8FAFC' : 'FFFFFF';

        return new TableRow({
            children: [
                new TableCell({
                    width: { size: 7, type: WidthType.PERCENTAGE },
                    shading: { fill: bgFill, type: ShadingType.CLEAR },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: String(row.index), bold: true, size: 19, font: 'Arial' })]
                        })
                    ]
                }),
                new TableCell({
                    width: { size: 24, type: WidthType.PERCENTAGE },
                    shading: { fill: bgFill, type: ShadingType.CLEAR },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [
                                new TextRun({ text: row.name, bold: true, size: 20, font: 'Arial', color: '0F172A' }),
                                ...(row.advisorInfo ? [
                                    new TextRun({ text: `\n(${row.advisorInfo})`, size: 16, font: 'Arial', color: '047857', italics: true })
                                ] : [])
                            ]
                        })
                    ]
                }),
                new TableCell({
                    width: { size: 20, type: WidthType.PERCENTAGE },
                    shading: { fill: bgFill, type: ShadingType.CLEAR },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [new TextRun({ text: row.stages, size: 19, font: 'Arial' })]
                        })
                    ]
                }),
                new TableCell({
                    width: { size: 20, type: WidthType.PERCENTAGE },
                    shading: { fill: bgFill, type: ShadingType.CLEAR },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [new TextRun({ text: row.subjects, size: 19, font: 'Arial' })]
                        })
                    ]
                }),
                new TableCell({
                    width: { size: 17, type: WidthType.PERCENTAGE },
                    shading: { fill: bgFill, type: ShadingType.CLEAR },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [new TextRun({ text: row.sections, size: 18, font: 'Arial' })]
                        })
                    ]
                }),
                new TableCell({
                    width: { size: 12, type: WidthType.PERCENTAGE },
                    shading: { fill: bgFill, type: ShadingType.CLEAR },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [new TextRun({ text: `${row.weeklyPeriods} حصة`, bold: true, size: 20, font: 'Arial', color: '1E3A8A' })]
                        })
                    ]
                }),
            ]
        });
    });

    // Summary Footer Row
    const summaryRow = new TableRow({
        children: [
            new TableCell({
                width: { size: 31, type: WidthType.PERCENTAGE },
                shading: { fill: 'E2E8F0', type: ShadingType.CLEAR },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: `المجموع: عدد المدرسين (${tableData.length})`, bold: true, size: 20, font: 'Arial', color: '0F172A' })
                        ]
                    })
                ]
            }),
            new TableCell({
                width: { size: 57, type: WidthType.PERCENTAGE },
                shading: { fill: 'E2E8F0', type: ShadingType.CLEAR },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        children: [
                            new TextRun({ text: 'إجمالي نصاب الحصص الأسبوعية لكافة الملاكات التدريسية بالمدرسة:', bold: true, size: 19, font: 'Arial' })
                        ]
                    })
                ]
            }),
            new TableCell({
                width: { size: 12, type: WidthType.PERCENTAGE },
                shading: { fill: 'CBD5E1', type: ShadingType.CLEAR },
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: `${totalPeriodsAllTeachers} حصة`, bold: true, size: 21, font: 'Arial', color: '1E3A8A' })
                        ]
                    })
                ]
            }),
        ]
    });

    const doc = new Document({
        sections: [
            {
                properties: {
                    page: {
                        margin: {
                            top: 720,
                            bottom: 720,
                            left: 720,
                            right: 720
                        }
                    }
                },
                children: [
                    // Official Header
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: 'جمهورية العراق - وزارة التربية', bold: true, size: 22, font: 'Arial' }),
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: directorate, bold: true, size: 20, font: 'Arial' }),
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: `إدارة ${schoolName}`, bold: true, size: 22, font: 'Arial', color: '1E3A8A' }),
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 80, after: 140 },
                        children: [
                            new TextRun({ 
                                text: '═══════════════════════════════════════════════════════════════════════════════', 
                                color: '94A3B8',
                                size: 14 
                            }),
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 80, after: 120 },
                        children: [
                            new TextRun({ 
                                text: '📋 جدول توزيع الحصص والمواد والشعب للملاكات التدريسية 📋', 
                                bold: true, 
                                size: 24, 
                                font: 'Arial',
                                color: '0F172A'
                            }),
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 200 },
                        children: [
                            new TextRun({ text: `العام الدراسي: ${academicYear}   |   تاريخ الإصدار: ${dateStr}`, size: 18, font: 'Arial', color: '475569' }),
                        ]
                    }),

                    // The Table
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: {
                            top: { style: BorderStyle.SINGLE, size: 8, color: '94A3B8' },
                            bottom: { style: BorderStyle.SINGLE, size: 8, color: '94A3B8' },
                            left: { style: BorderStyle.SINGLE, size: 8, color: '94A3B8' },
                            right: { style: BorderStyle.SINGLE, size: 8, color: '94A3B8' },
                            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                            insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
                        },
                        rows: [
                            headerRow,
                            ...dataRows,
                            summaryRow
                        ]
                    }),

                    // Signatures Section
                    new Paragraph({
                        spacing: { before: 400 },
                        children: [new TextRun({ text: '' })]
                    }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: {
                            top: { style: BorderStyle.NONE },
                            bottom: { style: BorderStyle.NONE },
                            left: { style: BorderStyle.NONE },
                            right: { style: BorderStyle.NONE },
                            insideHorizontal: { style: BorderStyle.NONE },
                            insideVertical: { style: BorderStyle.NONE },
                        },
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({
                                        width: { size: 50, type: WidthType.PERCENTAGE },
                                        children: [
                                            new Paragraph({
                                                alignment: AlignmentType.CENTER,
                                                children: [
                                                    new TextRun({ text: 'منظم الجدول / المعاون', bold: true, size: 20, font: 'Arial' }),
                                                ]
                                            }),
                                            new Paragraph({
                                                alignment: AlignmentType.CENTER,
                                                spacing: { before: 250 },
                                                children: [
                                                    new TextRun({ text: 'التوقيع: .......................................', size: 18, font: 'Arial', color: '64748B' }),
                                                ]
                                            })
                                        ]
                                    }),
                                    new TableCell({
                                        width: { size: 50, type: WidthType.PERCENTAGE },
                                        children: [
                                            new Paragraph({
                                                alignment: AlignmentType.CENTER,
                                                children: [
                                                    new TextRun({ text: 'مدير المدرسة', bold: true, size: 20, font: 'Arial' }),
                                                ]
                                            }),
                                            new Paragraph({
                                                alignment: AlignmentType.CENTER,
                                                spacing: { before: 80 },
                                                children: [
                                                    new TextRun({ text: principalName || '.......................................', bold: true, size: 19, font: 'Arial', color: '1E3A8A' }),
                                                ]
                                            }),
                                            new Paragraph({
                                                alignment: AlignmentType.CENTER,
                                                spacing: { before: 150 },
                                                children: [
                                                    new TextRun({ text: 'التوقيع والختم: ................................', size: 18, font: 'Arial', color: '64748B' }),
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    })
                ]
            }
        ]
    });

    const blob = await Packer.toBlob(doc);
    const cleanSchoolName = schoolName.replace(/[/\\?%*:|"<>]/g, '-').trim();
    const fileName = `جدول_المدرسين_والمواد_والحصص_${cleanSchoolName}.docx`;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}
