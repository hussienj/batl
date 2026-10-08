import React, { useState, useMemo } from 'react';
import * as ReactDOM from 'react-dom/client';
import type { ClassData, SchoolSettings, Student, StudentResult, CalculatedGrade, Subject } from '../../types.ts';
import { GRADE_LEVELS } from '../../constants.ts';
import { calculateStudentResult } from '../../lib/gradeCalculator.ts';
import { Loader2, FileDown, BarChart2 } from 'lucide-react';
import OverallPercentagesPDF from './OverallPercentagesPDF.tsx';


declare const jspdf: any;
declare const html2canvas: any;
declare const docx: any;
declare const saveAs: any;

export interface StageSubjectStats {
    subjectName: string;
    examined: number;
    successful: number;
    failing: number;
    absent: string;
    successRate: string;
}

export interface StageOverallStats {
    stageName: string;
    participants: number;
    successful: number;
    supplementary_1: number;
    supplementary_2: number;
    supplementary_3: number;
    totalSupplementary: number;
    totalFailing: number;
    totalExamined: number;
    absent: number;
    successRateParticipants: string;
    successRateExamined: string;
}


export interface ReportData {
    subjectStats: Record<string, StageSubjectStats[]>;
    overallStats: StageOverallStats[];
    totalOverallStats: StageOverallStats;
}

export default function OverallPercentagesManager({ classes, settings }: { classes: ClassData[], settings: SchoolSettings }) {
    const [selectedStages, setSelectedStages] = useState<string[]>([]);
    const [selectedClassIds, setSelectedClassIds] = useState<Record<string, string[]>>({});
    const [reportData, setReportData] = useState<ReportData | null>(null);

    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    const handleStageToggle = (stage: string) => {
        setSelectedStages(prev => {
            const newStages = prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage];
            if (!newStages.includes(stage)) {
                setSelectedClassIds(current => {
                    const newIds = { ...current };
                    delete newIds[stage];
                    return newIds;
                });
            }
            return newStages;
        });
    };

    const handleClassToggle = (stage: string, classId: string) => {
        setSelectedClassIds(prev => {
            const currentStageClasses = prev[stage] || [];
            const newStageClasses = currentStageClasses.includes(classId)
                ? currentStageClasses.filter(id => id !== classId)
                : [...currentStageClasses, classId];
            return { ...prev, [stage]: newStageClasses };
        });
    };

    const handleGenerateReport = () => {
        const allSelectedClassIds = Object.values(selectedClassIds).flat();
        const classesToProcess = classes.filter(c => allSelectedClassIds.includes(c.id));
        if (classesToProcess.length === 0) {
            alert("يرجى اختيار شعبة واحدة على الأقل.");
            return;
        }

        const subjectStats: Record<string, StageSubjectStats[]> = {};
        const overallStats: StageOverallStats[] = [];

        for (const stageName of selectedStages) {
            const stageClassIds = selectedClassIds[stageName] || [];
            if (stageClassIds.length === 0) continue;

            const stageClasses = classes.filter(c => stageClassIds.includes(c.id));
            const stageStudents = stageClasses.flatMap(c => c.students || [])
                .filter(s => !s.enrollmentStatus || s.enrollmentStatus === 'active');
            const stageSubjects = stageClasses[0]?.subjects || [];

            // Calculate per-subject stats
            const currentStageSubjectStats: StageSubjectStats[] = [];
            for (const subject of stageSubjects) {
                let successful = 0;
                let failing = 0;
                let absentCount = 0;
                let examined = 0;

                stageStudents.forEach(student => {
                    const studentClass = stageClasses.find(c => (c.students || []).some(s => s.id === student.id));
                    if (!studentClass) return;
                    const res = calculateStudentResult(student, stageSubjects, settings, studentClass);
                    const grade = res.finalCalculatedGrades[subject.name];
                    const rawFinalGrade = student.grades?.[subject.name]?.finalExam1st;

                    const isExempt = grade && (grade.isExempt || grade.isGeneralExempt);
                    if (isExempt) {
                        examined++;
                        successful++;
                    } else if (grade && (rawFinalGrade !== null && rawFinalGrade !== undefined && rawFinalGrade >= 0)) {
                        examined++;
                        if (rawFinalGrade >= 50) {
                            successful++;
                        } else {
                            failing++;
                        }
                    } else if (rawFinalGrade === -1 || rawFinalGrade === -2) {
                        absentCount++;
                    } else {
                        // Data not entered is often counted as absent in final reports
                        absentCount++;
                    }
                });

                const stageTotal = stageStudents.length;
                const rate = stageTotal > 0 ? `${Math.round((successful / stageTotal) * 100)}%` : '---';

                currentStageSubjectStats.push({
                    subjectName: subject.name,
                    examined: examined,
                    successful: successful,
                    failing: failing,
                    absent: String(absentCount),
                    successRate: rate,
                });
            }
            subjectStats[stageName] = currentStageSubjectStats;

            // Calculate overall stats for the stage
            let successful_overall = 0, failing_overall = 0, supp1 = 0, supp2 = 0, supp3 = 0;
            const participants = stageStudents.length;

            stageStudents.forEach(student => {
                const studentClass = stageClasses.find(c => (c.students || []).some(s => s.id === student.id));
                if(!studentClass) return;

                const res = calculateStudentResult(student, stageSubjects, settings, studentClass);
                
                if (res.result.message?.includes('معفو اعفاء عام') || res.result.status === 'ناجح') {
                    successful_overall++;
                } else if (res.result.status === 'راسب') {
                    failing_overall++;
                } else if (res.result.status === 'مكمل') {
                    const failingCount = Object.values(res.finalCalculatedGrades).filter((g: CalculatedGrade) => !g.isExempt && g.finalGradeWithDecision !== null && g.finalGradeWithDecision < 50).length;
                    if (failingCount === 1) supp1++;
                    else if (failingCount === 2) supp2++;
                    else if (failingCount >= 3) supp3++;
                }
            });
            
            const totalSupplementary = supp1 + supp2 + supp3;
            const totalExamined = successful_overall + totalSupplementary + failing_overall;
            const absent = participants - totalExamined;
            
            const successRateParticipants = participants > 0 ? `${Math.round((successful_overall / participants) * 100)}` : '---';
            const successRateExamined = totalExamined > 0 ? `${Math.round((successful_overall / totalExamined) * 100)}` : '---';

            overallStats.push({
                stageName,
                participants,
                successful: successful_overall,
                supplementary_1: supp1,
                supplementary_2: supp2,
                supplementary_3: supp3,
                totalSupplementary,
                totalFailing: failing_overall,
                totalExamined,
                absent,
                successRateParticipants,
                successRateExamined,
            });
        }
        
        const totalOverallStats: StageOverallStats = overallStats.reduce((acc, current) => ({
            stageName: 'المجموع',
            participants: acc.participants + current.participants,
            successful: acc.successful + current.successful,
            supplementary_1: acc.supplementary_1 + current.supplementary_1,
            supplementary_2: acc.supplementary_2 + current.supplementary_2,
            supplementary_3: acc.supplementary_3 + current.supplementary_3,
            totalSupplementary: acc.totalSupplementary + current.totalSupplementary,
            totalFailing: acc.totalFailing + current.totalFailing,
            totalExamined: acc.totalExamined + current.totalExamined,
            absent: acc.absent + current.absent,
            successRateParticipants: '',
            successRateExamined: '',
        }), { stageName: 'المجموع', participants: 0, successful: 0, supplementary_1: 0, supplementary_2: 0, supplementary_3: 0, totalSupplementary: 0, totalFailing: 0, totalExamined: 0, absent: 0, successRateParticipants: '', successRateExamined: '' });

        totalOverallStats.successRateParticipants = totalOverallStats.participants > 0 ? `${Math.round((totalOverallStats.successful / totalOverallStats.participants) * 100)}` : '---';
        totalOverallStats.successRateExamined = totalOverallStats.totalExamined > 0 ? `${Math.round((totalOverallStats.successful / totalOverallStats.totalExamined) * 100)}` : '---';

        setReportData({ subjectStats, overallStats, totalOverallStats });
    };

    const handleExportPdf = async () => {
        if (!reportData) return;
        setIsExporting(true);
        setExportProgress(0);

        if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
            alert("خطأ: مكتبة تصدير PDF غير محملة.");
            setIsExporting(false);
            return;
        }

        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        const tempContainer = document.createElement('div');
        Object.assign(tempContainer.style, { position: 'absolute', left: '-9999px', top: '-9999px', width: '794px' });
        document.body.appendChild(tempContainer);
        const root = ReactDOM.createRoot(tempContainer);

        const renderComponent = (component: React.ReactElement) => new Promise<void>(resolve => {
            root.render(component);
            setTimeout(resolve, 500);
        });
        
        const pageComponents = [];
        Object.keys(reportData.subjectStats).forEach(stageName => {
            pageComponents.push({ type: 'subjects', stageName });
        });
        pageComponents.push({ type: 'summary' });

        try {
            await document.fonts.ready;
            for (let i = 0; i < pageComponents.length; i++) {
                await renderComponent(
                    <OverallPercentagesPDF 
                        settings={settings}
                        reportData={reportData}
                        pagesToRender={[pageComponents[i]]}
                    />
                );

                const reportElement = tempContainer.children[0] as HTMLElement;
                const canvas = await html2canvas(reportElement, { scale: 2, useCORS: true });
                const imgData = canvas.toDataURL('image/png');
                
                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, 'FAST');
                setExportProgress(Math.round(((i + 1) / pageComponents.length) * 100));
            }
            pdf.save('report_overall_percentages.pdf');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            alert(`حدث خطأ أثناء التصدير: ${message}`);
        } finally {
            root.unmount();
            document.body.removeChild(tempContainer);
            setIsExporting(false);
        }
    };

    const handleExportWord = async () => {
        if (!reportData) return;
        setIsExporting(true);

        if (typeof docx === 'undefined') {
            alert("خطأ: مكتبة تصدير Word غير محملة.");
            setIsExporting(false);
            return;
        }

        const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, VerticalAlign, HeadingLevel } = docx;

        try {
            const sections = [];
            const schoolGender = settings.schoolGender === 'بنين' ? 'للبنين' : settings.schoolGender === 'بنات' ? 'للبنات' : 'المختلطة';

            // Stage Subject Stats Pages
            for (const stageName of Object.keys(reportData.subjectStats)) {
                const stats = reportData.subjectStats[stageName];
                const rows = [];

                // Header Row
                rows.push(new TableRow({
                    tableHeader: true,
                    children: [
                        'المادة', 'الممتحنون', 'الناجحون', 'الراسبون', 'الغائبون', 'نسبة النجاح'
                    ].map(h => new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 24 })], alignment: AlignmentType.CENTER })],
                        shading: { fill: "FFFF00" },
                        verticalAlign: VerticalAlign.CENTER,
                    })),
                }));

                // Data Rows
                stats.forEach((row, idx) => {
                    rows.push(new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.subjectName, bold: true, size: 22 })], alignment: AlignmentType.RIGHT })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.examined || '---'), size: 22 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.successful || '---'), size: 22 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.failing || '---'), size: 22 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.absent || '---'), size: 22 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.successRate, bold: true, size: 22 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        ],
                    }));
                });

                sections.push({
                    properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
                    children: [
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${settings.schoolName} ${schoolGender}`, bold: true, size: 32 })] }),
                        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `للعام الدراسي ${settings.academicYear} الدور الاول`, size: 24 })] }),
                        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 400 }, children: [new TextRun({ text: `احصائية النسب الكلية - ${stageName}`, bold: true, size: 40 })] }),
                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: rows,
                        }),
                    ],
                });
            }

            // Summary Page
            const summaryRows = [];
            const summaryHeaders = [
                { text: 'الصف', rowSpan: 3 },
                { text: 'المشاركون', rowSpan: 3 },
                { text: 'الممتحنون', colSpan: 7 },
                { text: 'الغائبون', rowSpan: 3 },
                { text: 'نسبة النجاح', colSpan: 2 }
            ];
            
            // Header Row 1
            summaryRows.push(new TableRow({
                children: summaryHeaders.map(h => new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: h.text, bold: true, size: 20 })], alignment: AlignmentType.CENTER })],
                    rowSpan: h.rowSpan,
                    columnSpan: h.colSpan,
                    shading: { fill: "D9F99D" },
                    verticalAlign: VerticalAlign.CENTER,
                }))
            }));

            // Header Row 2
            summaryRows.push(new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الناجحون', bold: true, size: 20 })], alignment: AlignmentType.CENTER })], rowSpan: 2, shading: { fill: "D9F99D" }, verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'المكملون', bold: true, size: 20 })], alignment: AlignmentType.CENTER })], columnSpan: 4, shading: { fill: "D9F99D" }, verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الراسبون', bold: true, size: 20 })], alignment: AlignmentType.CENTER })], rowSpan: 2, shading: { fill: "D9F99D" }, verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'مجموع الممتحنين', bold: true, size: 20 })], alignment: AlignmentType.CENTER })], rowSpan: 2, shading: { fill: "D9F99D" }, verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'المشاركين', bold: true, size: 20 })], alignment: AlignmentType.CENTER })], rowSpan: 2, shading: { fill: "D9F99D" }, verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الناجحين', bold: true, size: 20 })], alignment: AlignmentType.CENTER })], rowSpan: 2, shading: { fill: "D9F99D" }, verticalAlign: VerticalAlign.CENTER }),
                ]
            }));

            // Header Row 3
            summaryRows.push(new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'بدرس', bold: true, size: 20 })], alignment: AlignmentType.CENTER })], shading: { fill: "D9F99D" }, verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'بدرسين', bold: true, size: 20 })], alignment: AlignmentType.CENTER })], shading: { fill: "D9F99D" }, verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'بثلاث دروس', bold: true, size: 20 })], alignment: AlignmentType.CENTER })], shading: { fill: "D9F99D" }, verticalAlign: VerticalAlign.CENTER }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'مجموع المكملون', bold: true, size: 20 })], alignment: AlignmentType.CENTER })], shading: { fill: "D9F99D" }, verticalAlign: VerticalAlign.CENTER }),
                ]
            }));

            const allStats = [...reportData.overallStats];
            if (reportData.overallStats.length > 1) {
                allStats.push(reportData.totalOverallStats);
            }

            allStats.forEach(row => {
                summaryRows.push(new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.stageName, bold: row.stageName === 'المجموع', size: 20 })], alignment: AlignmentType.CENTER })], shading: row.stageName === 'المجموع' ? { fill: "FED7AA" } : undefined, verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.participants), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.successful), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.supplementary_1), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.supplementary_2), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.supplementary_3), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.totalSupplementary), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.totalFailing), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(row.totalExamined), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '----', size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.successRateParticipants === '---' ? '----' : row.successRateParticipants, size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.successRateExamined === '---' ? '----' : row.successRateExamined, size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                    ]
                }));
            });

            sections.push({
                properties: { page: { margin: { top: 720, right: 360, bottom: 720, left: 360 }, orientation: "landscape" } },
                children: [
                    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `الإحصائية الكلية لـ${settings.schoolName} ${schoolGender} بعد إضافة ${settings.decisionPoints} درجات`, bold: true, size: 32 })] }),
                    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 }, children: [new TextRun({ text: `للعام الدراسي ${settings.academicYear.replace('-', '/')} الدور الاول`, size: 24 })] }),
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: summaryRows,
                    }),
                ]
            });

            const doc = new Document({ sections });
            const blob = await Packer.toBlob(doc);
            saveAs(blob, 'الإحصائية_الكلية_للنسب.docx');

        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء تصدير ملف Word.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            {isExporting && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex flex-col justify-center items-center z-50 text-white">
                    <Loader2 className="animate-spin h-16 w-16 mb-4" />
                    <p className="text-2xl font-bold mb-2">جاري التصدير...</p>
                    <div className="w-1/2 bg-gray-600 rounded-full h-4"><div className="bg-cyan-500 h-4 rounded-full" style={{ width: `${exportProgress}%` }}></div></div>
                    <p className="mt-2 text-lg">{exportProgress}%</p>
                </div>
            )}
            
            <div className="p-4 bg-gray-50 rounded-lg border">
                <h3 className="text-lg font-bold mb-2">1. اختر المراحل الدراسية</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {GRADE_LEVELS.map(stage => (
                        <label key={stage} className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-200 cursor-pointer">
                            <input type="checkbox" checked={selectedStages.includes(stage)} onChange={() => handleStageToggle(stage)} className="h-4 w-4 rounded text-cyan-600"/>
                            <span>{stage}</span>
                        </label>
                    ))}
                </div>
            </div>

            {selectedStages.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-lg border">
                    <h3 className="text-lg font-bold mb-2">2. اختر الشعب</h3>
                    <div className="space-y-3">
                        {selectedStages.map(stage => (
                            <div key={stage}>
                                <h4 className="font-semibold text-cyan-700">{stage}</h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-1">
                                    {classes.filter(c => c.stage === stage).map(c => (
                                        <label key={c.id} className="flex items-center gap-2 p-1 rounded-md hover:bg-gray-200 cursor-pointer">
                                            <input type="checkbox" checked={(selectedClassIds[stage] || []).includes(c.id)} onChange={() => handleClassToggle(stage, c.id)} className="h-4 w-4 rounded text-cyan-600"/>
                                            <span>{c.section}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            <div className="flex justify-center gap-4 relative z-10">
                 <button onClick={handleGenerateReport} disabled={Object.values(selectedClassIds).flat().length === 0} className="flex items-center gap-2 px-6 py-3 bg-cyan-600 text-white font-semibold rounded-lg hover:bg-cyan-700 transition disabled:bg-gray-400">
                    <BarChart2 size={20} />
                    <span>عرض التقرير</span>
                </button>
                 {reportData && (
                     <div className="flex gap-2">
                        <button onClick={handleExportPdf} disabled={isExporting} className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:bg-gray-400">
                            <FileDown size={20} />
                            <span>تصدير PDF</span>
                        </button>
                        <button onClick={handleExportWord} disabled={isExporting} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400">
                            <FileDown size={20} />
                            <span>تصدير Word</span>
                        </button>
                     </div>
                 )}
            </div>

            {reportData && (
                <div className="mt-10 p-4 bg-white rounded-lg border">
                    <h3 className="text-lg font-bold mb-4">معاينة التقرير</h3>
                    <div className="transform scale-[0.6] origin-top mx-auto -my-32">
                       <OverallPercentagesPDF settings={settings} reportData={reportData} />
                    </div>
                </div>
            )}
        </div>
    );
}