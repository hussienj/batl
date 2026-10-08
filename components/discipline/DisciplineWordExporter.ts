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
import type { SchoolSettings, Student, DisciplineRecord, ClassData } from '../../types.ts';

interface ExportDisciplineWordProps {
    student: Student;
    classData?: ClassData;
    settings: SchoolSettings;
    records: DisciplineRecord[];
    maxPoints: number;
    currentPoints: number;
    counselorName?: string;
    assistantName?: string;
}

export async function exportDisciplineWordDocument({
    student,
    classData,
    settings,
    records,
    maxPoints,
    currentPoints,
    counselorName = '',
    assistantName = ''
}: ExportDisciplineWordProps): Promise<void> {
    const stage = classData?.stage || 'غير محدد';
    const section = classData?.section || 'غير محدد';
    const schoolName = settings.schoolName || 'المدرسة';
    const directorate = settings.directorate || 'المديرية العامة للتربية';
    const academicYear = settings.academicYear || '2025-2026';
    const currentDate = new Date().toLocaleDateString('ar-IQ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const activeRecords = records.filter(r => r.status !== 'archived');
    const totalDeductions = activeRecords.reduce((sum, r) => sum + r.pointsDeducted, 0);

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
                    // Header
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: 'جمهورية العراق - وزارة التربية', bold: true, size: 24, font: 'Arial' }),
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: directorate, bold: true, size: 22, font: 'Arial' }),
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new TextRun({ text: `إدارة ${schoolName} / معاونية شؤون الطلبة`, bold: true, size: 22, font: 'Arial', color: '1E3A8A' }),
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 100, after: 200 },
                        children: [
                            new TextRun({ 
                                text: '═══════════════════════════════════════════════════════', 
                                color: '94A3B8',
                                size: 16 
                            }),
                        ]
                    }),

                    // Title
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { before: 100, after: 200 },
                        children: [
                            new TextRun({ 
                                text: '🔴 استمارة كشف مخالفات الانضباط واستدعاء ولي أمر الطالب 🔴', 
                                bold: true, 
                                size: 28, 
                                font: 'Arial',
                                color: '991B1B'
                            }),
                        ]
                    }),

                    // Student Information Box / Table
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({
                                        width: { size: 50, type: WidthType.PERCENTAGE },
                                        shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                                        children: [
                                            new Paragraph({
                                                alignment: AlignmentType.RIGHT,
                                                children: [
                                                    new TextRun({ text: 'اسم الطالب الرباعي: ', bold: true, size: 22, font: 'Arial' }),
                                                    new TextRun({ text: student.name || 'بدون اسم', bold: true, size: 22, font: 'Arial', color: '0F172A' }),
                                                ]
                                            }),
                                            new Paragraph({
                                                alignment: AlignmentType.RIGHT,
                                                children: [
                                                    new TextRun({ text: 'الرقم الامتحاني / الكود: ', bold: true, size: 20, font: 'Arial' }),
                                                    new TextRun({ text: student.examId || student.studentAccessCode || student.id || '---', size: 20, font: 'Arial' }),
                                                ]
                                            }),
                                            new Paragraph({
                                                alignment: AlignmentType.RIGHT,
                                                children: [
                                                    new TextRun({ text: 'تاريخ إصدار التقرير: ', bold: true, size: 20, font: 'Arial' }),
                                                    new TextRun({ text: currentDate, size: 20, font: 'Arial' }),
                                                ]
                                            })
                                        ]
                                    }),
                                    new TableCell({
                                        width: { size: 50, type: WidthType.PERCENTAGE },
                                        shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
                                        children: [
                                            new Paragraph({
                                                alignment: AlignmentType.RIGHT,
                                                children: [
                                                    new TextRun({ text: 'الصف والشعبة: ', bold: true, size: 22, font: 'Arial' }),
                                                    new TextRun({ text: `${stage} / ${section}`, bold: true, size: 22, font: 'Arial', color: '0F172A' }),
                                                ]
                                            }),
                                            new Paragraph({
                                                alignment: AlignmentType.RIGHT,
                                                children: [
                                                    new TextRun({ text: 'العام الدراسي: ', bold: true, size: 20, font: 'Arial' }),
                                                    new TextRun({ text: academicYear, size: 20, font: 'Arial' }),
                                                ]
                                            }),
                                            new Paragraph({
                                                alignment: AlignmentType.RIGHT,
                                                children: [
                                                    new TextRun({ text: 'رصيد نقاط الانضباط: ', bold: true, size: 20, font: 'Arial' }),
                                                    new TextRun({ 
                                                        text: `${currentPoints} من أصل ${maxPoints} (${currentPoints === 0 ? 'استنفد كامل النقاط ⚠️' : 'متبقي'})`, 
                                                        bold: true, 
                                                        size: 22, 
                                                        font: 'Arial',
                                                        color: currentPoints === 0 ? 'DC2626' : '1E3A8A'
                                                    }),
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    }),

                    new Paragraph({
                        spacing: { before: 200, after: 150 },
                        alignment: AlignmentType.RIGHT,
                        children: [
                            new TextRun({ 
                                text: 'سجل المخالفات السلوكية السلبية المرصودة بحق الطالب:', 
                                bold: true, 
                                size: 22, 
                                font: 'Arial', 
                                color: '1E293B' 
                            }),
                        ]
                    }),

                    // Violations Table
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            // Table Header
                            new TableRow({
                                tableHeader: true,
                                children: [
                                    new TableCell({
                                        width: { size: 6, type: WidthType.PERCENTAGE },
                                        shading: { fill: '0F172A', type: ShadingType.CLEAR },
                                        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'ت', bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })] })]
                                    }),
                                    new TableCell({
                                        width: { size: 18, type: WidthType.PERCENTAGE },
                                        shading: { fill: '0F172A', type: ShadingType.CLEAR },
                                        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'التاريخ والوقت', bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })] })]
                                    }),
                                    new TableCell({
                                        width: { size: 16, type: WidthType.PERCENTAGE },
                                        shading: { fill: '0F172A', type: ShadingType.CLEAR },
                                        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'المادة الدراسية', bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })] })]
                                    }),
                                    new TableCell({
                                        width: { size: 20, type: WidthType.PERCENTAGE },
                                        shading: { fill: '0F172A', type: ShadingType.CLEAR },
                                        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'المدرس / الموثق', bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })] })]
                                    }),
                                    new TableCell({
                                        width: { size: 25, type: WidthType.PERCENTAGE },
                                        shading: { fill: '0F172A', type: ShadingType.CLEAR },
                                        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'نوع المخالفة السلوكية', bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })] })]
                                    }),
                                    new TableCell({
                                        width: { size: 15, type: WidthType.PERCENTAGE },
                                        shading: { fill: '0F172A', type: ShadingType.CLEAR },
                                        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'الخصم / ملاحظات', bold: true, color: 'FFFFFF', size: 18, font: 'Arial' })] })]
                                    }),
                                ]
                            }),

                            // Table Rows
                            ...(activeRecords.length > 0
                                ? activeRecords.map((rec, index) => {
                                      const recDate = new Date(rec.timestamp).toLocaleDateString('ar-EG');
                                      const recTime = new Date(rec.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                                      const isEven = index % 2 === 0;
                                      const fill = isEven ? 'FFFFFF' : 'F8FAFC';

                                      return new TableRow({
                                          children: [
                                              new TableCell({
                                                  shading: { fill, type: ShadingType.CLEAR },
                                                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${index + 1}`, size: 18, font: 'Arial' })] })]
                                              }),
                                              new TableCell({
                                                  shading: { fill, type: ShadingType.CLEAR },
                                                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${recDate}\n${recTime}`, size: 16, font: 'Arial' })] })]
                                              }),
                                              new TableCell({
                                                  shading: { fill, type: ShadingType.CLEAR },
                                                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: rec.subjectName || 'عام', size: 18, font: 'Arial' })] })]
                                              }),
                                              new TableCell({
                                                  shading: { fill, type: ShadingType.CLEAR },
                                                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: rec.teacherName || 'الإدارة', bold: true, size: 18, font: 'Arial' })] })]
                                              }),
                                              new TableCell({
                                                  shading: { fill, type: ShadingType.CLEAR },
                                                  children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: rec.criterionTitle || rec.notes || 'مخالفة انضباط', bold: true, color: '991B1B', size: 18, font: 'Arial' })] })]
                                              }),
                                              new TableCell({
                                                  shading: { fill, type: ShadingType.CLEAR },
                                                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `خصم (${rec.pointsDeducted}) نقطة${rec.notes ? '\n' + rec.notes : ''}`, size: 16, font: 'Arial' })] })]
                                              }),
                                          ]
                                      });
                                  })
                                : [
                                      new TableRow({
                                          children: [
                                              new TableCell({
                                                  columnSpan: 6,
                                                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'لا توجد مخالفات مسجلة بحق الطالب.', size: 20, font: 'Arial' })] })]
                                              })
                                          ]
                                      })
                                  ])
                        ]
                    }),

                    // Parent Summon Directive Text
                    new Paragraph({
                        spacing: { before: 200, after: 100 },
                        alignment: AlignmentType.RIGHT,
                        children: [
                            new TextRun({ 
                                text: 'إلى ولي أمر الطالب المحترم:', 
                                bold: true, 
                                size: 22, 
                                font: 'Arial',
                                color: '991B1B'
                            }),
                        ]
                    }),
                    new Paragraph({
                        alignment: AlignmentType.BOTH,
                        spacing: { after: 150 },
                        children: [
                            new TextRun({
                                text: `نود إعلامكم بأن الطالب (${student.name}) قد استنفد كامل رصيد نقاط الانضباط المدرسي المحددة له (${maxPoints} نقاط) نتيجة تكرار المخالفات المذكورة في الجدول أعلاه. يرجى الحضور إلى إدارة المدرسة (معاونية شؤون الطلبة) على وجه السرعة لمقابلة الإدارة والمرشد التربوي، وتوقيع التعهد الخطي اللازم لضمان استمرار الطالب في مسيرته الدراسية.`,
                                size: 20,
                                font: 'Arial'
                            })
                        ]
                    }),

                    // Signatures Table
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({
                                        width: { size: 25, type: WidthType.PERCENTAGE },
                                        children: [
                                            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'توقيع ولي الأمر', bold: true, size: 18, font: 'Arial' })] }),
                                            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: '....................................', size: 18 })] }),
                                            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'الاسم: ..........................', size: 16 })] }),
                                            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'الهاتف: .........................', size: 16 })] }),
                                        ]
                                    }),
                                    new TableCell({
                                        width: { size: 25, type: WidthType.PERCENTAGE },
                                        children: [
                                            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'مرشد الصف / التربوي', bold: true, size: 18, font: 'Arial' })] }),
                                            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: '....................................', size: 18 })] }),
                                            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: counselorName || '....................................', size: 16, font: 'Arial' })] }),
                                        ]
                                    }),
                                    new TableCell({
                                        width: { size: 25, type: WidthType.PERCENTAGE },
                                        children: [
                                            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'معاون شؤون الطلبة', bold: true, size: 18, font: 'Arial' })] }),
                                            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: '....................................', size: 18 })] }),
                                            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: assistantName || 'معاون شؤون الطلبة', size: 16, font: 'Arial' })] }),
                                        ]
                                    }),
                                    new TableCell({
                                        width: { size: 25, type: WidthType.PERCENTAGE },
                                        children: [
                                            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'مدير المدرسة والختم', bold: true, size: 18, font: 'Arial' })] }),
                                            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 300 }, children: [new TextRun({ text: '....................................', size: 18 })] }),
                                            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: settings.principalName || 'مدير المدرسة', size: 16, font: 'Arial' })] }),
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `تقرير_انضباط_واستدعاء_ولي_امر_${(student.name || 'طالب').replace(/\s+/g, '_')}_${stage}_${section}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
