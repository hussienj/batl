
import React, { useState, useMemo, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import type { ClassData, SchoolSettings, Student, StudentResult, CalculatedGrade, Subject, User, SeatingAssignment } from '../types.ts';
import { GRADE_LEVELS, compareSections } from '../constants.ts';
import { calculateStudentResult } from '../lib/gradeCalculator.ts';
import { Loader2, FileDown, AlertTriangle, Table, BookOpen } from 'lucide-react';
import OverallPercentagesManager from './statistics/OverallPercentagesManager.tsx';
import SubjectSuccessMatrixPDF from './statistics/SubjectSuccessMatrixPDF.tsx';
import { db } from '../lib/firebase.ts';

declare const jspdf: any;
declare const html2canvas: any;
declare const ExcelJS: any;
declare const docx: any;
declare const saveAs: any;

// Define types and constants
type ReportType = 'successful' | 'failing' | 'supplementary' | 'decision_log' | 'overall_percentages' | 'subject_success_matrix' | 'exempted';

const REPORT_TABS: { key: ReportType; label: string }[] = [
    { key: 'successful', label: 'الناجحون' },
    { key: 'failing', label: 'الراسبون' },
    { key: 'supplementary', label: 'تبليغات المكملين' },
    { key: 'decision_log', label: 'سجل إضافات القرار' },
    { key: 'exempted', label: 'المعفويين' },
    { key: 'overall_percentages', label: 'النسب الكلية' },
    { key: 'subject_success_matrix', label: 'مصفوفة نسب المواد' },
];

const ROWS_PER_PAGE = 15;

// ReportPage component (for PDF generation)
interface ReportPageProps {
    settings: SchoolSettings;
    title: string;
    children: React.ReactNode;
    pageNumber: number;
    totalPages: number;
    orientation?: 'p' | 'l';
    stageName?: string;
}
const ReportPage = React.forwardRef<HTMLDivElement, ReportPageProps>(({ settings, title, children, pageNumber, totalPages, orientation = 'p', stageName }, ref) => (
    <div 
        ref={ref} 
        className={`${orientation === 'p' ? 'w-[794px] h-[1123px]' : 'w-[1123px] h-[794px]'} p-10 bg-white flex flex-col font-['Cairo']`} 
        style={{ direction: 'rtl' }}
    >
        <header className="text-center mb-4">
            <p>إدارة: {settings.directorate || '..............'}</p>
            <p>اسم المدرسة: {settings.schoolName}</p>
            <p>العام الدراسي: {settings.academicYear} &nbsp;&nbsp;&nbsp; الدور الاول</p>
        </header>
        <h2 className="text-2xl font-bold text-center my-4">
            {title} {stageName ? `- ${stageName}` : ''}
        </h2>
        <main className="flex-grow overflow-hidden">
            {children}
        </main>
        <footer className="flex justify-between items-center text-center mt-auto pt-2 border-t-2 border-black">
             <p>اسم مدير المدرسة: {settings.principalName}</p>
             <p>صفحة {pageNumber} من {totalPages}</p>
        </footer>
    </div>
));

// Report Tables
interface SuccessFailReportProps {
    students: (Student & { classId: string })[];
    classMap: Map<string, ClassData>;
    startingIndex?: number;
}
const SuccessFailReport: React.FC<SuccessFailReportProps> = ({ students, classMap, startingIndex = 0 }) => {
    const headers = ['تسلسل', 'اسم الطالب', 'الرقم الامتحاني', 'رقم القيد', 'المواليد', 'الشعبة', 'الملاحظات'];
    return (
        <table className="w-full border-collapse border border-black text-lg">
            <thead className="bg-gray-200">
                <tr>
                    {headers.map(h => <th key={h} className="border border-black p-2 font-bold">{h}</th>)}
                </tr>
            </thead>
            <tbody>
                {students.map((s, i) => (
                    <tr key={s.id} className="odd:bg-white even:bg-gray-100 h-10">
                        <td className="border border-black p-2 text-center">{startingIndex + i + 1}</td>
                        <td className="border border-black p-2 text-right whitespace-nowrap">{s.name}</td>
                        <td className="border border-black p-2 text-center">{s.examId}</td>
                        <td className="border border-black p-2 text-center">{s.registrationId}</td>
                        <td className="border border-black p-2 text-center">{s.birthDate || '-'}</td>
                        <td className="border border-black p-2 text-center">{classMap.get(s.classId)?.section}</td>
                        <td className="border border-black p-2 text-center">{s.notes || ''}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

interface SupplementaryStudent extends Student {
    classId: string;
    failingSubjects: string[];
}
const SupplementaryReport: React.FC<{ students: SupplementaryStudent[], classMap: Map<string, ClassData>, startingIndex?: number }> = ({ students, classMap, startingIndex = 0 }) => {
    const headers = ['تسلسل', 'اسم الطالب', 'الرقم الامتحاني', 'المواليد', 'الشعبة', 'الدروس التي اكمل بها', 'الملاحظات', 'التوقيع'];
    return (
        <table className="w-full border-collapse border border-black text-lg">
            <thead className="bg-gray-200">
                <tr>
                    {headers.map(h => <th key={h} className="border border-black p-2 font-bold">{h}</th>)}
                </tr>
            </thead>
            <tbody>
                {students.map((s, i) => (
                    <tr key={s.id} className="odd:bg-white even:bg-gray-100 h-12">
                        <td className="border border-black p-2 text-center">{startingIndex + i + 1}</td>
                        <td className="border border-black p-2 text-right">{s.name}</td>
                        <td className="border border-black p-2 text-center">{s.examId}</td>
                        <td className="border border-black p-2 text-center">{s.birthDate || '-'}</td>
                        <td className="border border-black p-2 text-center">{classMap.get(s.classId)?.section}</td>
                        <td className="border border-black p-2 text-center font-semibold text-red-600">{s.failingSubjects.join('، ')}</td>
                        <td className="border border-black p-2 text-center">{s.notes || ''}</td>
                        <td className="border border-black p-2"></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

interface DecisionStudent extends Student {
    classId: string;
    amountGranted: number;
    decisionSubjects: { name: string; points: number }[];
    remainingPoints: number;
    finalResult: StudentResult['status'];
    failingSubjects: string[];
}
const DecisionLogReport: React.FC<{ 
    students: DecisionStudent[], 
    classMap: Map<string, ClassData>, 
    settings: SchoolSettings, 
    startingIndex?: number, 
    isMinisterial?: boolean,
    selectedStage?: string 
}> = ({ students, classMap, settings, startingIndex = 0, isMinisterial = false, selectedStage }) => {
    const headers = ['ت', 'الرقم الامتحاني', 'اسم الطالب', 'الشعبة', 'مقدار المنح', 'المواد التي حصل عليها القرار', 'المتبقي', 'المواد الراسبة الأخرى', 'النتيجة'];
    
    return (
        <div className="flex flex-col gap-2">
            {selectedStage && (
                <div className="flex justify-between items-center mb-1 px-2 border-b border-gray-300 pb-1">
                    <span className="font-bold text-lg">المرحلة: {selectedStage}</span>
                    <span className="text-sm text-gray-600">سجل إضافات القرار</span>
                </div>
            )}
            <table className="w-full border-collapse border border-black text-[10px]">
                <thead className="bg-gray-200">
                    <tr>
                        <th className="border border-black p-1 font-bold w-[30px]">{headers[0]}</th>
                        <th className="border border-black p-1 font-bold w-[60px]">{headers[1]}</th>
                        <th className="border border-black p-1 font-bold min-w-[150px]">{headers[2]}</th>
                        <th className="border border-black p-1 font-bold w-[40px]">{headers[3]}</th>
                        <th className="border border-black p-1 font-bold w-[50px]">{headers[4]}</th>
                        <th className="border border-black p-1 font-bold">{headers[5]}</th>
                        <th className="border border-black p-1 font-bold w-[50px]">{headers[6]}</th>
                        <th className="border border-black p-1 font-bold">{headers[7]}</th>
                        <th className="border border-black p-1 font-bold w-[70px]">{headers[8]}</th>
                    </tr>
                </thead>
                <tbody>
                    {students.map((s, i) => (
                        <tr key={s.id} className="odd:bg-white even:bg-gray-100 h-9">
                            <td className="border border-black p-1 text-center font-bold">{startingIndex + i + 1}</td>
                            <td className="border border-black p-1 text-center font-bold">{s.examId || '-'}</td>
                            <td className="border border-black p-1 text-right font-bold whitespace-nowrap overflow-hidden text-ellipsis">{s.name}</td>
                            <td className="border border-black p-1 text-center">{classMap.get(s.classId)?.section}</td>
                            <td className="border border-black p-1 text-center font-bold text-blue-600">{s.amountGranted}</td>
                            <td className="border border-black p-1 text-center font-semibold text-green-600 text-[9px] leading-tight">
                                {s.decisionSubjects.length > 0 ? s.decisionSubjects.map(ds => `${ds.name} (${ds.points}+)`).join('، ') : '-'}
                            </td>
                            <td className="border border-black p-1 text-center">{s.remainingPoints}</td>
                            <td className="border border-black p-1 text-center font-semibold text-red-600 text-[9px] leading-tight">
                                {s.failingSubjects.length > 0 ? s.failingSubjects.join('، ') : '-'}
                            </td>
                            <td className="border border-black p-1 text-center font-semibold">{s.finalResult}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


interface ExemptedStudent extends Student {
    classId: string;
    isGeneralExempt: boolean;
    exemptedSubjectsCount: number;
    average: number;
    subjectGrades: Record<string, number | null>;
}

interface ExemptedSummary {
    section: string;
    subjectCounts: Record<string, number>;
    generalExemptCount: number;
}

const ExemptedSummaryTable: React.FC<{
    subjects: Subject[],
    summaryData: ExemptedSummary[],
    title?: string,
    showGeneralExempt?: boolean
}> = ({ subjects, summaryData, title = "إحصائية المعفويين", showGeneralExempt = true }) => {
    return (
        <div className="mt-2 w-full overflow-hidden">
            <h3 className="text-center font-black text-xl mb-3 bg-gray-100 p-1 border-2 border-black">{title}</h3>
            <table className="w-full border-collapse border-2 border-black text-sm">
                <thead>
                    <tr className="bg-green-600 text-white">
                        <th className="border-2 border-black p-1 w-16 font-black">الشعبة</th>
                        {subjects.map(s => (
                            <th key={s.id} className="border-2 border-black p-1 font-black text-center text-[10px] leading-tight">{s.name}</th>
                        ))}
                        {showGeneralExempt && <th className="border-2 border-black p-1 w-24 bg-orange-600 font-black text-center">الاعفاء العام</th>}
                    </tr>
                </thead>
                <tbody>
                    {summaryData.map((sum, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-yellow-50' : 'bg-orange-50'}>
                            <td className="border-2 border-black p-1 text-center font-black bg-green-400 text-sm">{sum.section}</td>
                            {subjects.map(s => (
                                <td key={s.id} className="border-2 border-black p-1 text-center font-black text-base">
                                    {sum.subjectCounts[s.name] || 0}
                                </td>
                            ))}
                            {showGeneralExempt && (
                                <td className="border-2 border-black p-1 text-center font-black bg-orange-300 text-base">
                                    {sum.generalExemptCount}
                                </td>
                            )}
                        </tr>
                    ))}
                    <tr className="bg-white font-black">
                        <td className="border-2 border-black p-1 text-center bg-green-700 text-white text-sm">المجموع</td>
                        {subjects.map(s => {
                            const total = summaryData.reduce((acc, curr) => acc + (curr.subjectCounts[s.name] || 0), 0);
                            return (
                                <td key={s.id} className="border-2 border-black p-1 text-center text-base">{total}</td>
                            );
                        })}
                        {showGeneralExempt && (
                            <td className="border-2 border-black p-1 text-center bg-orange-600 text-white text-base">
                                {summaryData.reduce((acc, curr) => acc + curr.generalExemptCount, 0)}
                            </td>
                        )}
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

const ExemptedReport: React.FC<{ 
    students: ExemptedStudent[], 
    classMap: Map<string, ClassData>, 
    subjects: Subject[], 
    startingIndex?: number
}> = ({ students, classMap, subjects, startingIndex = 0 }) => {
    return (
        <div className="flex flex-col gap-6">
            <table className="w-full border-collapse border border-black text-[10px]">
                <thead className="bg-yellow-300">
                    <tr>
                        <th className="border border-black p-1 w-8">ت</th>
                        <th className="border border-black p-1 min-w-[120px]">اسم الطالب المعفو</th>
                        <th className="border border-black p-1 w-16">الشعبة</th>
                        {subjects.map(s => (
                            <th key={s.id} className="border border-black p-1 text-center">{s.name}</th>
                        ))}
                        <th className="border border-black p-1 w-16">المعدل العام</th>
                        <th className="border border-black p-1 w-24">الملاحظات</th>
                    </tr>
                </thead>
                <tbody>
                    {students.map((s, i) => {
                        const notes = s.isGeneralExempt ? 'اعفاء عام' : `معفو بـ ${s.exemptedSubjectsCount} مواد`;
                        const classData = classMap.get(s.classId);
                        const sectionName = classData ? classData.section : '';
                        return (
                            <tr key={s.id} className={`h-8 ${i % 2 === 1 ? 'bg-cyan-50' : 'bg-white'}`}>
                                <td className="border border-black p-1 text-center">{startingIndex + i + 1}</td>
                                <td className="border border-black p-1 text-right font-bold">{s.name}</td>
                                <td className="border border-black p-1 text-center font-bold">{sectionName}</td>
                                {subjects.map(subj => {
                                    const grade = s.subjectGrades[subj.name];
                                    const isExemptedInThisSubject = s.isGeneralExempt || (grade !== null && grade >= 90);
                                    return (
                                        <td 
                                            key={subj.id} 
                                            className={`border border-black p-1 text-center font-bold ${isExemptedInThisSubject ? 'bg-blue-600 text-white' : ''}`}
                                        >
                                            {grade ?? '-'}
                                        </td>
                                    );
                                })}
                                <td className="border border-black p-1 text-center font-bold">{Math.round(s.average)}</td>
                                <td className="border border-black p-1 text-center text-[9px] font-bold">{notes}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// Main Component
export default function StatisticsManager({ classes, settings, users, currentUser }: { classes: ClassData[], settings: SchoolSettings, users: User[], currentUser: User }) {
    const [selectedStage, setSelectedStage] = useState('');
    const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<ReportType>('successful');
    const [isExporting, setIsExporting] = useState(false);
    const [selectedSubjectName, setSelectedSubjectName] = useState('');
    const [seatingAssignments, setSeatingAssignments] = useState<Record<string, SeatingAssignment>>({});

    const principalId = settings.principalName + "_" + settings.schoolName;

    useEffect(() => {
        const path = `exam_seating/${principalId}`;
        const ref = db.ref(path);
        const callback = (snap: any) => setSeatingAssignments(snap.val() || {});
        ref.on('value', callback);
        return () => ref.off('value', callback);
    }, [principalId]);

    const classesInSelectedStage = useMemo(() => {
        return selectedStage ? classes.filter(c => c.stage === selectedStage) : [];
    }, [selectedStage, classes]);

    const availableSubjects = useMemo(() => {
        const subjects = new Set<string>();
        classesInSelectedStage.forEach(c => {
            (c.subjects || []).forEach(s => subjects.add(s.name));
        });
        return Array.from(subjects).sort();
    }, [classesInSelectedStage]);

    const studentResults = useMemo(() => {
        const results = new Map<string, { finalCalculatedGrades: Record<string, CalculatedGrade>, result: StudentResult }>();
        const students: (Student & { classId: string })[] = [];
        const classMap = new Map<string, ClassData>();

        classes
            .filter(c => selectedClassIds.includes(c.id))
            .forEach(c => {
                if (!c) return;
                classMap.set(c.id, c);
                (c.students || [])
                    .filter(s => s.enrollmentStatus === 'active' || !s.enrollmentStatus)
                    .forEach(s => {
                        const studentWithClassId = { ...s, classId: c.id };
                        students.push(studentWithClassId);
                        results.set(s.id, calculateStudentResult(s, c.subjects || [], settings, c));
                    });
            });
        
        return { students, results, classMap };
    }, [selectedClassIds, classes, settings]);

    const filteredData = useMemo(() => {
        const { students, results, classMap } = studentResults;
        switch (activeTab) {
            case 'successful':
                return students.filter(s => ['ناجح', 'مؤهل', 'مؤهل بقرار'].includes(results.get(s.id)?.result.status || ''));
            case 'failing':
                 return students
                    .filter(s => ['راسب', 'غير مؤهل'].includes(results.get(s.id)?.result.status || ''))
                    .sort((a, b) => {
                        const aId = a.examId || '';
                        const bId = b.examId || '';
                        return aId.localeCompare(bId, undefined, { numeric: true });
                    });
            case 'supplementary':
                return students
                    .filter(s => results.get(s.id)?.result.status === 'مكمل')
                    .map(s => {
                        const res = results.get(s.id);
                        if (!res) return { ...s, failingSubjects: [] };
                        const studentClass = classMap.get(s.classId);
                        const failingSubjects = (studentClass?.subjects || [])
                            .filter(subj => {
                                const gradeInfo = res.finalCalculatedGrades[subj.name];
                                return gradeInfo && !gradeInfo.isExempt && gradeInfo.finalGradeWithDecision !== null && gradeInfo.finalGradeWithDecision < 50;
                            })
                            .map(subj => subj.name);
                        return { ...s, failingSubjects };
                    })
                    .sort((a, b) => {
                        const aId = a.examId || '';
                        const bId = b.examId || '';
                        return aId.localeCompare(bId, undefined, { numeric: true });
                    });
            case 'decision_log':
                const ministerialStages = ['الثالث متوسط', 'السادس العلمي', 'السادس الادبي'];
                const isMinisterialReport = ministerialStages.includes(selectedStage);

                let decisionData = students
                    .map(s => {
                        const res = results.get(s.id);
                        if (!res) return null;

                        let amountGranted = 0;
                        const decisionSubjects: { name: string; points: number }[] = [];
                        const failingSubjects: string[] = [];
                        const studentClass = classMap.get(s.classId);
                        const subjects = studentClass?.subjects || [];
                        
                        subjects.forEach(subj => {
                            const gradeInfo = res.finalCalculatedGrades[subj.name];
                            if (gradeInfo) {
                                if (isMinisterialReport) {
                                    if (gradeInfo.decisionAppliedOnPursuit && gradeInfo.decisionAppliedOnPursuit > 0) {
                                        amountGranted += gradeInfo.decisionAppliedOnPursuit;
                                        decisionSubjects.push({ name: subj.name, points: gradeInfo.decisionAppliedOnPursuit });
                                    } else if (gradeInfo.annualPursuit !== null && gradeInfo.annualPursuit < 50 && !gradeInfo.isExempt) {
                                        failingSubjects.push(subj.name);
                                    }
                                } else {
                                    if (gradeInfo.decisionApplied > 0) {
                                        amountGranted += gradeInfo.decisionApplied;
                                        decisionSubjects.push({ name: subj.name, points: gradeInfo.decisionApplied });
                                    }
                                }
                            }
                        });

                        const decisionPointsLimit = isMinisterialReport ? (studentClass?.ministerialDecisionPoints ?? 5) : settings.decisionPoints;

                        if (isMinisterialReport || amountGranted > 0) {
                            return {
                                ...s,
                                amountGranted,
                                decisionSubjects,
                                failingSubjects,
                                remainingPoints: decisionPointsLimit - amountGranted,
                                finalResult: res.result.status
                            };
                        }
                        return null;
                    })
                    .filter((s): s is DecisionStudent => s !== null);

                // Always sort by Exam ID for Decision Log as requested
                decisionData.sort((a, b) => {
                    const aId = a.examId || '';
                    const bId = b.examId || '';
                    return aId.localeCompare(bId, undefined, { numeric: true });
                });

                return decisionData;
            case 'exempted':
                return students
                    .map(s => {
                        const res = results.get(s.id);
                        if (!res) return null;

                        const studentClass = classMap.get(s.classId);
                        const subjects = studentClass?.subjects || [];
                        
                        let isGeneralExempt = false;
                        let exemptedSubjectsCount = 0;
                        let totalPursuit = 0;
                        let pursuitCount = 0;
                        const subjectGrades: Record<string, number | null> = {};

                        subjects.forEach(subj => {
                            const gradeInfo = res.finalCalculatedGrades[subj.name];
                            if (gradeInfo) {
                                if (gradeInfo.isGeneralExempt) isGeneralExempt = true;
                                if (gradeInfo.isExempt) exemptedSubjectsCount++;
                                if (gradeInfo.annualPursuit !== null) {
                                    totalPursuit += gradeInfo.annualPursuit;
                                    pursuitCount++;
                                    subjectGrades[subj.name] = gradeInfo.annualPursuit;
                                } else {
                                    subjectGrades[subj.name] = null;
                                }
                            }
                        });

                        if (exemptedSubjectsCount > 0) {
                            return {
                                ...s,
                                isGeneralExempt,
                                exemptedSubjectsCount,
                                average: pursuitCount > 0 ? totalPursuit / pursuitCount : 0,
                                subjectGrades
                            };
                        }
                        return null;
                    })
                    .filter((s): s is ExemptedStudent => s !== null);
            default:
                return [];
        }
    }, [studentResults, activeTab, settings.decisionPoints]);
    
    const handleExportDecisionExcel = async () => {
        if (typeof ExcelJS === 'undefined') {
            alert('خطأ: مكتبة تصدير Excel غير محملة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const data = filteredData as DecisionStudent[];
        if (data.length === 0) {
            alert('لا يوجد بيانات لتصديرها.');
            return;
        }

        setIsExporting(true);

        try {
            const ministerialStages = ['الثالث متوسط', 'السادس العلمي', 'السادس الادبي'];
            const isMinisterialReport = ministerialStages.includes(selectedStage);

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('سجل إضافات القرار', {
                views: [{ rightToLeft: true }]
            });

            const headers = isMinisterialReport 
                ? ['الرقم الامتحاني', 'اسم الطالب', 'الشعبة', 'مقدار المنح', 'المواد التي حصل عليها القرار', 'المتبقي', 'المواد الراسبة الأخرى', 'النتيجة']
                : ['ت', 'اسم الطالب', 'الشعبة', 'مقدار المنح', 'المواد التي حصل عليها القرار', 'المتبقي', 'النتيجة'];

            // Set column widths
            worksheet.columns = headers.map((h, i) => {
                if (i === 1) return { width: 35 }; // Name
                if (i === 4 || i === 6) return { width: 40 }; // Subjects
                return { width: 15 };
            });

            // Add Header Info
            const addHeaderCell = (text: string, row: number) => {
                const r = worksheet.getRow(row);
                r.getCell(1).value = text;
                r.getCell(1).font = { bold: true, size: 12 };
            };

            addHeaderCell(`إدارة: ${settings.directorate || '..............'}`, 1);
            addHeaderCell(`اسم المدرسة: ${settings.schoolName}`, 2);
            addHeaderCell(`العام الدراسي: ${settings.academicYear} - الدور الاول`, 3);
            addHeaderCell(`سجل إضافات القرار - ${selectedStage}`, 4);
            worksheet.addRow([]); // Empty row

            // Define Table Header
            const headerRow = worksheet.addRow(headers);
            headerRow.height = 30;
            headerRow.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FF000000' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }; // Light gray
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            // Add Data Rows
            data.forEach((s, i) => {
                const rowData = [
                    isMinisterialReport ? (s.examId || '-') : (i + 1),
                    s.name,
                    studentResults.classMap.get(s.classId)?.section || '',
                    s.amountGranted,
                    s.decisionSubjects.length > 0 ? s.decisionSubjects.map(ds => `${ds.name} (${ds.points}+)`).join('، ') : '-',
                    s.remainingPoints,
                    ...(isMinisterialReport ? [s.failingSubjects.length > 0 ? s.failingSubjects.join('، ') : '-'] : []),
                    s.finalResult
                ];
                
                const row = worksheet.addRow(rowData);
                row.height = 25;
                row.eachCell((cell, colNumber) => {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    
                    if (headers[colNumber-1] === 'اسم الطالب') {
                        cell.alignment = { vertical: 'middle', horizontal: 'right' };
                    }
                    
                    if (headers[colNumber-1] === 'مقدار المنح') {
                        cell.font = { bold: true, color: { argb: 'FF2563EB' } };
                    }
                    
                    if (headers[colNumber-1] === 'المواد التي حصل عليها القرار') {
                        cell.font = { bold: true, color: { argb: 'FF16A34A' } };
                    }
                    
                    if (isMinisterialReport && headers[colNumber-1] === 'المواد الراسبة الأخرى') {
                        cell.font = { bold: true, color: { argb: 'FFDC2626' } };
                    }
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `سجل_إضافات_القرار_${selectedStage}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء تصدير ملف Excel.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportExemptedExcel = async () => {
        if (typeof ExcelJS === 'undefined') {
            alert('خطأ: مكتبة تصدير Excel غير محملة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const data = filteredData as ExemptedStudent[];
        if (data.length === 0) {
            alert('لا يوجد معفون لتصديرهم.');
            return;
        }

        setIsExporting(true);

        try {
            const subjectNamesSet = new Set<string>();
            classes.filter(c => selectedClassIds.includes(c.id)).forEach(c => {
                c.subjects.forEach(s => subjectNamesSet.add(s.name));
            });
            const commonSubjects = Array.from(subjectNamesSet);

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('المعفويين', {
                views: [{ rightToLeft: true }]
            });

            // Set default column widths
            worksheet.columns = [
                { width: 5 },  // ت
                { width: 35 }, // الاسم
                { width: 10 }, // الشعبة
                ...commonSubjects.map(() => ({ width: 12 })),
                { width: 12 }, // المعدل
                { width: 25 }, // الملاحظات
            ];

            // Add Header Info
            const addHeaderCell = (text: string, row: number) => {
                const r = worksheet.getRow(row);
                r.getCell(1).value = text;
                r.getCell(1).font = { bold: true, size: 12 };
            };

            addHeaderCell(`إدارة: ${settings.directorate || '..............'}`, 1);
            addHeaderCell(`اسم المدرسة: ${settings.schoolName}`, 2);
            addHeaderCell(`العام الدراسي: ${settings.academicYear} - الدور الاول`, 3);
            addHeaderCell(`قائمة المعفويين - ${selectedStage}`, 4);
            worksheet.addRow([]); // Empty row

            // Define Table Header
            const tableHeader = ['ت', 'اسم الطالب المعفو', 'الشعبة', ...commonSubjects, 'المعدل العام', 'الملاحظات'];
            const headerRow = worksheet.addRow(tableHeader);
            headerRow.height = 30;
            headerRow.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FF000000' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            // Add Data Rows
            data.forEach((s, i) => {
                const notes = s.isGeneralExempt ? 'اعفاء عام' : `معفو بـ ${s.exemptedSubjectsCount} مواد`;
                const classData = studentResults.classMap.get(s.classId);
                const sectionName = classData ? classData.section : '';
                
                const rowValues = [
                    i + 1,
                    s.name,
                    sectionName,
                    ...commonSubjects.map(subj => s.subjectGrades[subj] ?? '-'),
                    Math.round(s.average),
                    notes
                ];
                
                const row = worksheet.addRow(rowValues);
                row.height = 25;
                row.eachCell((cell, colNumber) => {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    
                    // Style for subject grades if exempted
                    if (colNumber > 3 && colNumber <= 3 + commonSubjects.length) {
                        const subjName = commonSubjects[colNumber - 4];
                        const grade = s.subjectGrades[subjName];
                        if (s.isGeneralExempt || (grade !== null && grade >= 90)) {
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Blue
                            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
                        }
                    }
                });
            });

            // Summary Calculations
            const selectedClasses = classes.filter(c => selectedClassIds.includes(c.id));
            const summaryData = selectedClasses.map(c => {
                const sectionStudents = data.filter(s => s.classId === c.id);
                const subjectCounts: Record<string, number> = {};
                commonSubjects.forEach(subj => {
                    subjectCounts[subj] = sectionStudents.filter(s => s.isGeneralExempt || (s.subjectGrades[subj] !== null && (s.subjectGrades[subj] || 0) >= 90)).length;
                });
                return {
                    section: c.section,
                    subjectCounts,
                    generalExemptCount: sectionStudents.filter(s => s.isGeneralExempt).length
                };
            }).sort((a, b) => compareSections(a.section, b.section));

            const individualSummaryData = selectedClasses.map(c => {
                const sectionStudents = data.filter(s => s.classId === c.id && !s.isGeneralExempt);
                const subjectCounts: Record<string, number> = {};
                commonSubjects.forEach(subj => {
                    subjectCounts[subj] = sectionStudents.filter(s => (s.subjectGrades[subj] !== null && (s.subjectGrades[subj] || 0) >= 90)).length;
                });
                return {
                    section: c.section,
                    subjectCounts,
                    generalExemptCount: 0
                };
            }).sort((a, b) => compareSections(a.section, b.section));

            // Add Summaries Below
            worksheet.addRow([]);
            worksheet.addRow([]);
            
            // Summary 1
            const s1Header = worksheet.addRow(['إحصائية المعفويين (شاملة)']);
            s1Header.getCell(1).font = { bold: true, size: 14, color: { argb: 'FF1E40AF' } };
            const s1SubHeader = worksheet.addRow(['الشعبة', ...commonSubjects, 'الاعفاء العام']);
            s1SubHeader.height = 25;
            s1SubHeader.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } }; // Green
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            summaryData.forEach(sum => {
                const r = worksheet.addRow([
                    sum.section,
                    ...commonSubjects.map(s => sum.subjectCounts[s] || 0),
                    sum.generalExemptCount
                ]);
                r.height = 20;
                r.eachCell(cell => {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    cell.font = { bold: true };
                });
            });

            // Summary 2
            worksheet.addRow([]);
            const s2Header = worksheet.addRow(['إحصائية المعفويين فردياً (يهمل المعفو إعفاء عام)']);
            s2Header.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFEA580C' } };
            const s2SubHeader = worksheet.addRow(['الشعبة', ...commonSubjects]);
            s2SubHeader.height = 25;
            s2SubHeader.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            individualSummaryData.forEach(sum => {
                const r = worksheet.addRow([
                    sum.section,
                    ...commonSubjects.map(s => sum.subjectCounts[s] || 0)
                ]);
                r.height = 20;
                r.eachCell(cell => {
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    cell.font = { bold: true };
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `المعفويين_${selectedStage}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء تصدير ملف Excel.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportIndividualSubjectExemptExcel = async () => {
        if (!selectedSubjectName) {
            alert('يرجى اختيار المادة الدراسية أولاً.');
            return;
        }

        if (typeof ExcelJS === 'undefined') {
            alert('خطأ: مكتبة تصدير Excel غير محملة. يرجى تحديث الصفحة والمحاولة مرة أخرى.');
            return;
        }

        const data = studentResults.students
            .map(s => {
                const res = studentResults.results.get(s.id);
                if (!res) return null;
                const gradeInfo = res.finalCalculatedGrades[selectedSubjectName];
                const isGeneralExempt = Object.values(res.finalCalculatedGrades).some((g: any) => g.isGeneralExempt);

                // Include only students who ARE exempt in this subject but NOT general exempt
                if (gradeInfo?.isExempt && !isGeneralExempt) {
                    const seating = seatingAssignments[s.id] || { hallNumber: '', sectorNumber: '' };
                    return {
                        id: s.id,
                        name: s.name,
                        examId: s.examId || '-',
                        sectorNumber: seating.sectorNumber || '-',
                        hallNumber: seating.hallNumber || '-'
                    };
                }
                return null;
            })
            .filter((s): s is any => s !== null)
            .sort((a, b) => (a.examId || '').localeCompare(b.examId || '', undefined, { numeric: true }));

        if (data.length === 0) {
            alert(`لا يوجد طلاب معفويين إعفاء فردي في مادة "${selectedSubjectName}".`);
            return;
        }

        setIsExporting(true);

        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('المعفويين فرديا', {
                views: [{ rightToLeft: true }]
            });

            worksheet.columns = [
                { width: 8 },  // ت
                { width: 35 }, // اسم الطالب المعفو
                { width: 22 }, // رقم الامتحاني
                { width: 17 }, // رقم القطاع
            ];

            // Header Row 1: Title
            worksheet.mergeCells(`A1:D1`);
            const titleCell = worksheet.getCell('A1');
            titleCell.value = `أسماء الطلبة المعفيين في مادة ${selectedSubjectName}`;
            titleCell.font = { bold: true, size: 16 };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            worksheet.getRow(1).height = 40;

            // Header Row 2: Table Headers
            const headers = ['ت', 'اسم الطالب المعفو', 'رقم الامتحاني', 'رقم القطاع'];
            const headerRow = worksheet.addRow(headers);
            headerRow.height = 30;
            headerRow.eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FF000000' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }; // Yellow
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            // Data Rows
            data.forEach((s, i) => {
                const row = worksheet.addRow([i + 1, s.name, s.examId, s.sectorNumber]);
                row.height = 28;
                row.eachCell((cell, colIndex) => {
                    cell.alignment = { vertical: 'middle', horizontal: 'center' };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    cell.font = { size: 12 };
                    if (colIndex === 1) cell.font = { bold: true };
                });
                // Names aligned to right
                row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `المعفويين_فردي_${selectedSubjectName}_${selectedStage}.xlsx`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء تصدير ملف Excel.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportDecisionWord = async () => {
        const data = filteredData as DecisionStudent[];
        if (data.length === 0) {
            alert('لا يوجد بيانات لتصديرها.');
            return;
        }

        setIsExporting(true);

        if (typeof docx === 'undefined') {
            alert("خطأ: مكتبة تصدير Word غير محملة. يرجى تحديث الصفحة والمحاولة مرة أخرى.");
            setIsExporting(false);
            return;
        }

        const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, VerticalAlign } = docx;

        try {
            const rows = [];
            const headers = ['ت', 'الرقم الامتحاني', 'اسم الطالب', 'الشعبة', 'مقدار المنح', 'المواد التي حصل عليها القرار', 'المتبقي', 'المواد الراسبة الأخرى', 'النتيجة'];
            
            // Add Table Headers
            rows.push(new TableRow({
                tableHeader: true,
                children: headers.map(h => new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20 })], alignment: AlignmentType.CENTER })],
                    shading: { fill: "E2E8F0" },
                    verticalAlign: VerticalAlign.CENTER,
                })),
            }));

            // Add Data Rows
            data.forEach((s, i) => {
                const section = studentResults.classMap.get(s.classId)?.section || '';
                rows.push(new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(i + 1), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.examId || '-'), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.name, bold: true, size: 20 })], alignment: AlignmentType.RIGHT })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: section, size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.amountGranted), bold: true, size: 20, color: "2563EB" })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.decisionSubjects.length > 0 ? s.decisionSubjects.map(ds => `${ds.name} (${ds.points}+)`).join('، ') : '-', size: 18, color: "16A34A" })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.remainingPoints), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.failingSubjects.length > 0 ? s.failingSubjects.join('، ') : '-', size: 18, color: "DC2626" })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.finalResult, bold: true, size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                    ],
                }));
            });

            const doc = new Document({
                sections: [{
                    properties: { 
                        page: { 
                            margin: { top: 720, right: 360, bottom: 720, left: 360 },
                            orientation: "landscape"
                        } 
                    },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({ text: `إدارة: ${settings.directorate || '..............'}`, size: 24 }),
                            ],
                        }),
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({ text: `اسم المدرسة: ${settings.schoolName}`, size: 24 }),
                            ],
                        }),
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({ text: `العام الدراسي: ${settings.academicYear}     الدور الاول`, size: 24 }),
                            ],
                        }),
                        new Paragraph({ text: "", spacing: { after: 200 } }),
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({ text: `سجل إضافات القرار - ${selectedStage}`, bold: true, size: 36 }),
                            ],
                        }),
                        new Paragraph({ text: "", spacing: { after: 400 } }),
                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: rows,
                        }),
                        new Paragraph({ text: "", spacing: { before: 800 } }),
                        new Paragraph({
                            alignment: AlignmentType.LEFT,
                            children: [
                                new TextRun({ text: `اسم مدير المدرسة: ${settings.principalName}`, bold: true, size: 28 }),
                            ],
                        }),
                    ],
                }],
            });

            const blob = await Packer.toBlob(doc);
            saveAs(blob, `سجل_إضافات_القرار_${selectedStage}.docx`);

        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء تصدير ملف Word.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportSupplementaryWord = async () => {
        const data = filteredData as SupplementaryStudent[];
        if (data.length === 0) {
            alert('لا يوجد طلاب مكملون لتصديرهم.');
            return;
        }

        setIsExporting(true);

        if (typeof docx === 'undefined') {
            alert("خطأ: مكتبة تصدير Word غير محملة. يرجى تحديث الصفحة والمحاولة مرة أخرى.");
            setIsExporting(false);
            return;
        }

        const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, VerticalAlign } = docx;

        try {
            const rows = [];

            // Add Table Headers
            const headers = ['ت', 'اسم الطالب', 'الرقم الامتحاني', 'الشعبة', 'الدروس التي اكمل بها', 'التوقيع'];
            rows.push(new TableRow({
                tableHeader: true,
                children: headers.map(h => new TableCell({
                    children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 24 })], alignment: AlignmentType.CENTER })],
                    shading: { fill: "E2E8F0" },
                    verticalAlign: VerticalAlign.CENTER,
                })),
            }));

            // Add Data Rows
            data.forEach((s, i) => {
                const section = studentResults.classMap.get(s.classId)?.section || '';
                rows.push(new TableRow({
                    children: [
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(i + 1), size: 24 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.name, bold: true, size: 24 })], alignment: AlignmentType.RIGHT })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.examId || '-'), size: 24 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: section, size: 24 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.failingSubjects.join('، '), bold: true, size: 24, color: "DC2626" })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ text: "" })], verticalAlign: VerticalAlign.CENTER }),
                    ],
                }));
            });

            const doc = new Document({
                sections: [{
                    properties: { 
                        page: { 
                            margin: { top: 720, right: 720, bottom: 720, left: 720 }
                        } 
                    },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({ text: `إدارة: ${settings.directorate || '..............'}`, size: 24 }),
                            ],
                        }),
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({ text: `اسم المدرسة: ${settings.schoolName}`, size: 24 }),
                            ],
                        }),
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({ text: `العام الدراسي: ${settings.academicYear}     الدور الاول`, size: 24 }),
                            ],
                        }),
                        new Paragraph({ text: "", spacing: { after: 200 } }),
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new TextRun({ text: `تبليغات المكملين - ${selectedStage}`, bold: true, size: 36 }),
                            ],
                        }),
                        new Paragraph({ text: "", spacing: { after: 400 } }),
                        new Table({
                            width: { size: 100, type: WidthType.PERCENTAGE },
                            rows: rows,
                        }),
                        new Paragraph({ text: "", spacing: { before: 800 } }),
                        new Paragraph({
                            alignment: AlignmentType.LEFT,
                            children: [
                                new TextRun({ text: `اسم مدير المدرسة: ${settings.principalName}`, bold: true, size: 28 }),
                            ],
                        }),
                    ],
                }],
            });

            const blob = await Packer.toBlob(doc);
            saveAs(blob, `تبليغات_المكملين_${selectedStage}.docx`);

        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء تصدير ملف Word.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportSuccessFailWord = async () => {
        const reportTitle = REPORT_TABS.find(t => t.key === activeTab)?.label || 'تقرير';
        const data = filteredData as (Student & { classId: string })[];
        if (data.length === 0) {
            alert(`لا يوجد طلاب في قائمة "${reportTitle}" لتصديرهم.`);
            return;
        }

        setIsExporting(true);

        if (typeof docx === 'undefined') {
            alert("خطأ: مكتبة تصدير Word غير محملة. يرجى تحديث الصفحة والمحاولة مرة أخرى.");
            setIsExporting(false);
            return;
        }

        const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, VerticalAlign, PageBreak } = docx;

        try {
            const sections = [];
            const rowsPerPage = 15;
            const totalPages = Math.ceil(data.length / rowsPerPage);

            for (let page = 0; page < totalPages; page++) {
                const pageData = data.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
                const rows = [];
                const headers = ['تسلسل', 'اسم الطالب', 'الرقم الامتحاني', 'رقم القيد', 'المواليد', 'الشعبة', 'الملاحظات'];
                
                // Add Table Headers
                rows.push(new TableRow({
                    tableHeader: true,
                    children: headers.map((h, idx) => new TableCell({
                        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 24 })], alignment: AlignmentType.CENTER })],
                        shading: { fill: "E2E8F0" },
                        verticalAlign: VerticalAlign.CENTER,
                        width: idx === 1 ? { size: 35, type: WidthType.PERCENTAGE } : undefined
                    })),
                }));

                // Add Data Rows
                pageData.forEach((s, i) => {
                    const section = studentResults.classMap.get(s.classId)?.section || '';
                    rows.push(new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(page * rowsPerPage + i + 1), size: 24 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ 
                                children: [new Paragraph({ 
                                    children: [new TextRun({ text: s.name, bold: true, size: 24 })], 
                                    alignment: AlignmentType.RIGHT,
                                    noWrap: true
                                })], 
                                verticalAlign: VerticalAlign.CENTER,
                                width: { size: 35, type: WidthType.PERCENTAGE }
                            }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.examId || '-'), size: 24 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.registrationId || '-'), size: 24 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(s.birthDate || '-'), size: 24 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: section, size: 24 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s.notes || '', size: 24 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        ],
                    }));
                });

                // Add empty rows to maintain exactly 15 rows if not the last page or precisely 15
                const emptyRowsNeeded = rowsPerPage - pageData.length;
                for (let j = 0; j < emptyRowsNeeded; j++) {
                    rows.push(new TableRow({
                        children: headers.map(() => new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: " ", size: 24 })] })],
                            verticalAlign: VerticalAlign.CENTER,
                            height: { value: 600, rule: "atLeast" }
                        }))
                    }));
                }

                if (page === 0) {
                    sections.push({
                        properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: `إدارة: ${settings.directorate || '..............'}`, size: 24 })],
                            }),
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: `اسم المدرسة: ${settings.schoolName}`, size: 24 })],
                            }),
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: `العام الدراسي: ${settings.academicYear}     الدور الاول`, size: 24 })],
                            }),
                            new Paragraph({ text: "", spacing: { after: 200 } }),
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: `${reportTitle} - ${selectedStage}`, bold: true, size: 36 })],
                            }),
                            new Paragraph({ text: "", spacing: { after: 400 } }),
                            new Table({
                                width: { size: 100, type: WidthType.PERCENTAGE },
                                rows: rows,
                            }),
                            new Paragraph({ text: "", spacing: { before: 800 } }),
                            new Paragraph({
                                alignment: AlignmentType.LEFT,
                                children: [new TextRun({ text: `اسم مدير المدرسة: ${settings.principalName}`, bold: true, size: 28 })],
                            }),
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: `صفحة ${page + 1} من ${totalPages}`, size: 20 })],
                            }),
                        ],
                    });
                } else {
                    // Add Page Break and new Content
                    sections[0].children.push(new Paragraph({ children: [new PageBreak()] }));
                    sections[0].children.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: `إدارة: ${settings.directorate || '..............'}`, size: 24 })],
                    }));
                    sections[0].children.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: `اسم المدرسة: ${settings.schoolName}`, size: 24 })],
                    }));
                    sections[0].children.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: `العام الدراسي: ${settings.academicYear}`, size: 24 })],
                    }));
                    sections[0].children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
                    sections[0].children.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: `${reportTitle} - ${selectedStage}`, bold: true, size: 36 })],
                    }));
                    sections[0].children.push(new Paragraph({ text: "", spacing: { after: 400 } }));
                    sections[0].children.push(new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        rows: rows,
                    }));
                    sections[0].children.push(new Paragraph({ text: "", spacing: { before: 800 } }));
                    sections[0].children.push(new Paragraph({
                        alignment: AlignmentType.LEFT,
                        children: [new TextRun({ text: `اسم مدير المدرسة: ${settings.principalName}`, bold: true, size: 28 })],
                    }));
                    sections[0].children.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: `صفحة ${page + 1} من ${totalPages}`, size: 20 })],
                    }));
                }
            }

            const doc = new Document({ sections });
            const blob = await Packer.toBlob(doc);
            saveAs(blob, `${reportTitle}_${selectedStage}.docx`);

        } catch (error) {
            console.error(error);
            alert('حدث خطأ أثناء تصدير ملف Word.');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportPdf = async () => {
        if (activeTab === 'subject_success_matrix') {
            await handleExportMatrixPdf();
            return;
        }

        const reportTitle = REPORT_TABS.find(t => t.key === activeTab)?.label || 'تقرير';
        const data = filteredData;

        if (data.length === 0) {
            alert(`لا يوجد طلاب في قائمة "${reportTitle}" لتصديرهم.`);
            return;
        }

        setIsExporting(true);

        const tempContainer = document.createElement('div');
        Object.assign(tempContainer.style, { position: 'absolute', left: '-9999px', top: '-9999px' });
        document.body.appendChild(tempContainer);
        const root = ReactDOM.createRoot(tempContainer);

        const renderComponent = (component: React.ReactElement) => new Promise<void>(resolve => {
            root.render(component);
            setTimeout(resolve, 500);
        });
        
        const rowsPerPage = (activeTab === 'exempted' || activeTab === 'successful' || activeTab === 'failing') ? 15 : (activeTab === 'decision_log' ? 11 : ROWS_PER_PAGE);
        const totalPages = Math.ceil(data.length / rowsPerPage) || 1;
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ orientation: (activeTab === 'exempted' || activeTab === 'decision_log') ? 'l' : 'p', unit: 'mm', format: 'a4' });

        try {
            await document.fonts.ready;
            
            // Get common subjects for exempted report
            const commonSubjects: Subject[] = [];
            let summaryData: ExemptedSummary[] = [];
            let individualSummaryData: ExemptedSummary[] = [];
            if (activeTab === 'exempted') {
                const subjectNames = new Set<string>();
                classes.filter(c => selectedClassIds.includes(c.id)).forEach(c => {
                    c.subjects.forEach(s => subjectNames.add(s.name));
                });
                Array.from(subjectNames).forEach((name, idx) => {
                    commonSubjects.push({ id: `subj-${idx}`, name });
                });

                // Calculate summary data using all selected classes
                const selectedClasses = classes.filter(c => selectedClassIds.includes(c.id));
                const exemptedStudents = (data as ExemptedStudent[]);
                
                // 1. General Summary (Current)
                summaryData = selectedClasses.map(c => {
                    const sectionStudents = exemptedStudents.filter(s => s.classId === c.id);
                    const subjectCounts: Record<string, number> = {};
                    commonSubjects.forEach(subj => {
                        subjectCounts[subj.name] = sectionStudents.filter(s => s.isGeneralExempt || (s.subjectGrades[subj.name] !== null && (s.subjectGrades[subj.name] || 0) >= 90)).length;
                    });
                    return {
                        section: c.section,
                        subjectCounts,
                        generalExemptCount: sectionStudents.filter(s => s.isGeneralExempt).length
                    };
                }).sort((a, b) => compareSections(a.section, b.section));

                // 2. Individual Summary (Only those who are NOT general exempt)
                individualSummaryData = selectedClasses.map(c => {
                    const sectionStudents = exemptedStudents.filter(s => s.classId === c.id && !s.isGeneralExempt);
                    const subjectCounts: Record<string, number> = {};
                    commonSubjects.forEach(subj => {
                        subjectCounts[subj.name] = sectionStudents.filter(s => (s.subjectGrades[subj.name] !== null && (s.subjectGrades[subj.name] || 0) >= 90)).length;
                    });
                    return {
                        section: c.section,
                        subjectCounts,
                        generalExemptCount: 0
                    };
                }).sort((a, b) => compareSections(a.section, b.section));
            }

            for (let i = 0; i < totalPages; i++) {
                const pageData = data.slice(i * rowsPerPage, (i + 1) * rowsPerPage);
                
                let reportContent;
                if (activeTab === 'supplementary') {
                    reportContent = <SupplementaryReport students={pageData as SupplementaryStudent[]} classMap={studentResults.classMap} startingIndex={i * rowsPerPage} />;
                } else if (activeTab === 'decision_log') {
                    const ministerialStages = ['الثالث متوسط', 'السادس العلمي', 'السادس الادبي'];
                    const isMinisterialReport = ministerialStages.includes(selectedStage);
                    reportContent = <DecisionLogReport students={pageData as DecisionStudent[]} classMap={studentResults.classMap} settings={settings} startingIndex={i * rowsPerPage} isMinisterial={isMinisterialReport} selectedStage={selectedStage} />;
                } else if (activeTab === 'exempted') {
                    reportContent = <ExemptedReport 
                        students={pageData as ExemptedStudent[]} 
                        classMap={studentResults.classMap} 
                        subjects={commonSubjects} 
                        startingIndex={i * rowsPerPage}
                    />;
                } else {
                    reportContent = <SuccessFailReport students={pageData} classMap={studentResults.classMap} startingIndex={i * rowsPerPage}/>;
                }
                
                await renderComponent(
                    <ReportPage 
                        settings={settings} 
                        title={reportTitle} 
                        pageNumber={i + 1} 
                        totalPages={activeTab === 'exempted' ? totalPages + 2 : totalPages} 
                        orientation={(activeTab === 'exempted' || activeTab === 'decision_log') ? 'l' : 'p'}
                        stageName={selectedStage}
                    >
                        {reportContent}
                    </ReportPage>
                );

                const reportElement = tempContainer.children[0] as HTMLElement;
                const canvas = await html2canvas(reportElement, { scale: 2, useCORS: true });
                const imgData = canvas.toDataURL('image/png');
                
                if (i > 0) pdf.addPage();
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            }

            // Add summary page for exempted report
            if (activeTab === 'exempted' && summaryData.length > 0) {
                // Page 1: General Summary
                await renderComponent(
                    <ReportPage 
                        settings={settings} 
                        title="إحصائية المعفويين" 
                        pageNumber={totalPages + 1} 
                        totalPages={totalPages + 2} 
                        orientation="l"
                        stageName={selectedStage}
                    >
                        <ExemptedSummaryTable subjects={commonSubjects} summaryData={summaryData} title="إحصائية المعفويين (شاملة)" />
                    </ReportPage>
                );

                let reportElement = tempContainer.children[0] as HTMLElement;
                let canvas = await html2canvas(reportElement, { scale: 2, useCORS: true });
                let imgData = canvas.toDataURL('image/png');
                
                pdf.addPage();
                let pdfWidth = pdf.internal.pageSize.getWidth();
                let pdfHeight = pdf.internal.pageSize.getHeight();
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

                // Page 2: Individual Summary
                await renderComponent(
                    <ReportPage 
                        settings={settings} 
                        title="إحصائية المعفويين فردياً" 
                        pageNumber={totalPages + 2} 
                        totalPages={totalPages + 2} 
                        orientation="l"
                        stageName={selectedStage}
                    >
                        <ExemptedSummaryTable 
                            subjects={commonSubjects} 
                            summaryData={individualSummaryData} 
                            title="إحصائية المعفويين فردياً (يهمل المعفو إعفاء عام)" 
                            showGeneralExempt={false}
                        />
                    </ReportPage>
                );

                reportElement = tempContainer.children[0] as HTMLElement;
                canvas = await html2canvas(reportElement, { scale: 2, useCORS: true });
                imgData = canvas.toDataURL('image/png');
                
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            }

            pdf.save(`${reportTitle}_${selectedStage}.pdf`);
        } catch (error) {
            console.error("PDF Export Error:", error);
            const message = error instanceof Error ? error.message : String(error);
            alert(`حدث خطأ أثناء التصدير: ${message}`);
        } finally {
            root.unmount();
            document.body.removeChild(tempContainer);
            setIsExporting(false);
        }
    };

    const handleExportMatrixPdf = async () => {
        if (selectedClassIds.length === 0) {
            alert("يرجى اختيار شعبة واحدة على الأقل.");
            return;
        }

        setIsExporting(true);

        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
        
        const tempContainer = document.createElement('div');
        Object.assign(tempContainer.style, { position: 'absolute', left: '-9999px', top: '0' });
        document.body.appendChild(tempContainer);
        const root = ReactDOM.createRoot(tempContainer);

        const renderComponent = (component: React.ReactElement) => new Promise<void>(resolve => {
            root.render(component);
            setTimeout(resolve, 800);
        });

        try {
            await document.fonts.ready;
            for (let i = 0; i < selectedClassIds.length; i++) {
                const classId = selectedClassIds[i];
                const currentClass = classes.find(c => c.id === classId);
                if (!currentClass) continue;

                await renderComponent(
                    <SubjectSuccessMatrixPDF
                        settings={settings}
                        classData={currentClass}
                        users={users}
                    />
                );

                const element = tempContainer.children[0] as HTMLElement;
                const canvas = await html2canvas(element, { scale: 2, useCORS: true });
                if (i > 0) pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 297, 210, undefined, 'FAST');
            }
            pdf.save(`مصفوفة_نسب_النجاح_${selectedStage}.pdf`);
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء تصدير مصفوفة النسب.");
        } finally {
            root.unmount();
            document.body.removeChild(tempContainer);
            setIsExporting(false);
        }
    };
    
    const renderContent = () => {
        if (activeTab === 'overall_percentages') {
            return <OverallPercentagesManager classes={classes} settings={settings} />;
        }
        
        if (activeTab === 'subject_success_matrix') {
             if (selectedClassIds.length === 0) {
                return (
                    <div className="flex items-center justify-center h-64 text-gray-500 bg-white rounded-lg">
                        <div className="text-center">
                            <Table className="mx-auto mb-2 opacity-20" size={48} />
                            <p>يرجى اختيار شعبة واحدة على الأقل لعرض مصفوفة نسب المواد.</p>
                        </div>
                    </div>
                );
            }
            const firstClassId = selectedClassIds[0];
            const firstClass = classes.find(c => c.id === firstClassId);
            if (!firstClass) return null;

            return (
                <div className="p-4 bg-white rounded-lg border shadow-inner">
                    <h3 className="text-lg font-bold mb-4 text-center">معاينة المصفوفة (لأول شعبة مختارة)</h3>
                    <div className="transform scale-[0.6] origin-top mx-auto -my-40">
                       <SubjectSuccessMatrixPDF settings={settings} classData={firstClass} users={users} />
                    </div>
                </div>
            );
        }

        if (selectedClassIds.length === 0) {
            return (
                <div className="flex items-center justify-center h-64 text-gray-500">
                    <p>اختر مرحلة وشعبة لعرض التقرير.</p>
                </div>
            );
        }

        const reportTitleForPreview = REPORT_TABS.find(t => t.key === activeTab)?.label || 'تقرير';

        const rowsPerPage = (activeTab === 'exempted' || activeTab === 'successful' || activeTab === 'failing') ? 15 : (activeTab === 'decision_log' ? 11 : ROWS_PER_PAGE);
        const pageData = filteredData.slice(0, rowsPerPage);
        let reportContent;
        if (activeTab === 'supplementary') {
            reportContent = <SupplementaryReport students={pageData as SupplementaryStudent[]} classMap={studentResults.classMap} />;
        } else if (activeTab === 'decision_log') {
            const ministerialStages = ['الثالث متوسط', 'السادس العلمي', 'السادس الادبي'];
            const isMinisterialReport = ministerialStages.includes(selectedStage);
            reportContent = <DecisionLogReport students={pageData as DecisionStudent[]} classMap={studentResults.classMap} settings={settings} isMinisterial={isMinisterialReport} selectedStage={selectedStage} />;
        } else if (activeTab === 'exempted') {
            const subjectNames = new Set<string>();
            classes.filter(c => selectedClassIds.includes(c.id)).forEach(c => {
                c.subjects.forEach(s => subjectNames.add(s.name));
            });
            const commonSubjects = Array.from(subjectNames).map((name, idx) => ({ id: `subj-${idx}`, name }));
            
            // Calculate summary data for preview using all selected classes
            const selectedClasses = classes.filter(c => selectedClassIds.includes(c.id));
            const exemptedStudentsForPreview = (filteredData as ExemptedStudent[]);

            const summaryData = selectedClasses.map(c => {
                const sectionStudents = exemptedStudentsForPreview.filter(s => s.classId === c.id);
                const subjectCounts: Record<string, number> = {};
                commonSubjects.forEach(subj => {
                    subjectCounts[subj.name] = sectionStudents.filter(s => s.isGeneralExempt || (s.subjectGrades[subj.name] !== null && (s.subjectGrades[subj.name] || 0) >= 90)).length;
                });
                return {
                    section: c.section,
                    subjectCounts,
                    generalExemptCount: sectionStudents.filter(s => s.isGeneralExempt).length
                };
            }).sort((a, b) => compareSections(a.section, b.section));

            const individualSummaryData = selectedClasses.map(c => {
                const sectionStudents = exemptedStudentsForPreview.filter(s => s.classId === c.id && !s.isGeneralExempt);
                const subjectCounts: Record<string, number> = {};
                commonSubjects.forEach(subj => {
                    subjectCounts[subj.name] = sectionStudents.filter(s => (s.subjectGrades[subj.name] !== null && (s.subjectGrades[subj.name] || 0) >= 90)).length;
                });
                return {
                    section: c.section,
                    subjectCounts,
                    generalExemptCount: 0
                };
            }).sort((a, b) => compareSections(a.section, b.section));

            reportContent = (
                <div className="flex flex-col gap-8">
                    <ExemptedReport 
                        students={pageData as ExemptedStudent[]} 
                        classMap={studentResults.classMap} 
                        subjects={commonSubjects} 
                    />
                    <div className="border-t-4 border-double border-black pt-8">
                        <ExemptedSummaryTable subjects={commonSubjects} summaryData={summaryData} title="إحصائية المعفويين (شاملة)" />
                    </div>
                    <div className="border-t-4 border-double border-black pt-8">
                        <ExemptedSummaryTable 
                            subjects={commonSubjects} 
                            summaryData={individualSummaryData} 
                            title="إحصائية المعفويين فردياً (يهمل المعفو إعفاء عام)" 
                            showGeneralExempt={false}
                        />
                    </div>
                </div>
            );
        } else {
            reportContent = <SuccessFailReport students={pageData} classMap={studentResults.classMap} />;
        }
         return (
            <div className={`transform ${(activeTab === 'exempted' || activeTab === 'decision_log') ? 'scale-[0.5]' : 'scale-[0.8]'} origin-top mx-auto`}>
              <ReportPage 
                settings={settings} 
                title={reportTitleForPreview} 
                pageNumber={1} 
                totalPages={Math.ceil(filteredData.length / rowsPerPage) || 1} 
                orientation={(activeTab === 'exempted' || activeTab === 'decision_log') ? 'l' : 'p'}
                stageName={selectedStage}
              >
                 {reportContent}
              </ReportPage>
            </div>
         )
    };
    
    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
            {isExporting && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex flex-col justify-center items-center z-50 text-white">
                    <Loader2 className="animate-spin h-16 w-16 mb-4" />
                    <p className="text-2xl font-bold">جاري التصدير...</p>
                </div>
            )}
            <h2 className="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">الإحصائيات والتقارير</h2>
            
            {activeTab !== 'overall_percentages' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-md font-bold text-gray-700 mb-2">1. اختر المرحلة</label>
                        <select onChange={e => {setSelectedStage(e.target.value); setSelectedClassIds([]);}} value={selectedStage} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500">
                            <option value="">-- اختر مرحلة --</option>
                            {GRADE_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-md font-bold text-gray-700 mb-2">2. اختر الشعب</label>
                        <div className="space-y-2 p-2 border rounded-lg max-h-32 overflow-y-auto">
                            {selectedStage && classesInSelectedStage.length > 0 ? classesInSelectedStage.map(c => (
                                <label key={c.id} className="flex items-center gap-3 p-1 rounded-md hover:bg-gray-100 cursor-pointer">
                                    <input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => setSelectedClassIds(prev => prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id])} className="h-5 w-5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"/>
                                    <span className="font-semibold">{c.stage} - {c.section}</span>
                                    <span className="text-sm text-gray-500">({(c.students || []).length} طالب)</span>
                                </label>
                            )) : <p className="text-gray-500 text-center">اختر مرحلة لعرض الشعب.</p>}
                        </div>
                    </div>
                    {activeTab === 'exempted' && selectedStage && (
                        <div className="md:col-span-2 mt-4 border-t pt-4 bg-cyan-50 p-4 rounded-xl border-cyan-200">
                            <label className="block text-md font-bold text-cyan-800 mb-2 flex items-center gap-2">
                                <BookOpen size={20} />
                                تصدير المعفويين فردياً حسب المادة:
                            </label>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <select 
                                    value={selectedSubjectName} 
                                    onChange={(e) => setSelectedSubjectName(e.target.value)} 
                                    className="flex-1 px-4 py-2 border border-cyan-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500 font-bold bg-white text-gray-800"
                                >
                                    <option value="">-- اختر المادة الدراسية --</option>
                                    {availableSubjects.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                                <button 
                                    onClick={handleExportIndividualSubjectExemptExcel} 
                                    disabled={isExporting || !selectedSubjectName || selectedClassIds.length === 0}
                                    className="flex items-center justify-center gap-2 px-6 py-2 bg-cyan-700 text-white font-bold rounded-lg hover:bg-cyan-800 transition disabled:bg-gray-400 whitespace-nowrap shadow-md"
                                >
                                    <Table size={20} />
                                    <span>تصدير إعفاء فردي (Excel)</span>
                                </button>
                            </div>
                            <p className="text-xs text-cyan-600 mt-2 font-semibold">
                                * يقوم هذا الزر بتصدير الطلبة المعفويين إعفاءً "فردياً" فقط للمادة المختارة، مع إدراج الرقم الامتحاني ورقم القطاع من توزيع القاعات الأخير.
                            </p>
                        </div>
                    )}
                </div>
            )}
            
            <div className="flex items-center justify-between border-b-2 mb-4">
                 <div className="flex flex-wrap gap-1">
                    {REPORT_TABS.map(tab => (
                        <button 
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 font-semibold rounded-t-lg transition-colors ${activeTab === tab.key ? 'bg-cyan-600 text-white' : 'bg-gray-200 hover:bg-gray-300'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                {activeTab !== 'overall_percentages' && (
                    <div className="flex gap-2">
                        <button onClick={handleExportPdf} disabled={isExporting || (activeTab !== 'subject_success_matrix' && filteredData.length === 0) || (activeTab === 'subject_success_matrix' && selectedClassIds.length === 0)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:bg-gray-400">
                            <FileDown size={20} />
                            <span>تصدير PDF</span>
                        </button>
                        {(activeTab === 'successful' || activeTab === 'failing') && (
                            <button onClick={handleExportSuccessFailWord} disabled={isExporting || filteredData.length === 0} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400">
                                <FileDown size={20} />
                                <span>تصدير Word</span>
                            </button>
                        )}
                        {activeTab === 'supplementary' && (
                            <button onClick={handleExportSupplementaryWord} disabled={isExporting || filteredData.length === 0} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400">
                                <FileDown size={20} />
                                <span>تصدير Word</span>
                            </button>
                        )}
                        {activeTab === 'decision_log' && (
                            <button onClick={handleExportDecisionWord} disabled={isExporting || filteredData.length === 0} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400">
                                <FileDown size={20} />
                                <span>تصدير Word</span>
                            </button>
                        )}
                        {activeTab === 'exempted' && (
                            <button onClick={handleExportExemptedExcel} disabled={isExporting || filteredData.length === 0} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition disabled:bg-gray-400">
                                <Table size={20} />
                                <span>تصدير Excel</span>
                            </button>
                        )}
                        {activeTab === 'decision_log' && (
                            <button onClick={handleExportDecisionExcel} disabled={isExporting || filteredData.length === 0} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition disabled:bg-gray-400">
                                <Table size={20} />
                                <span>تصدير Excel</span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="bg-gray-100 p-4 rounded-lg overflow-x-auto min-h-[400px]">
                {renderContent()}
            </div>

        </div>
    );
}
