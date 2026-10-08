
import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import type { ClassData, SchoolSettings, Student, SubjectGrade, CalculatedGrade, Subject } from '../types.ts';
import { GRADE_LEVELS, compareSections } from '../constants.ts';
import { calculateStudentResult } from '../lib/gradeCalculator.ts';
import { db } from '../lib/firebase.ts';
import StudentReportCard from './StudentReportCard.tsx';
import SubjectSuccessStatsPDF from './principal/SubjectSuccessStatsPDF.tsx';
import { Download, FileText, Loader2, BarChart2, CheckCircle, FileDown, Palette, Image as ImageIcon } from 'lucide-react';

declare const XLSX: any;
declare const jspdf: any;
declare const html2canvas: any;
declare const docx: any;
declare const saveAs: any;

interface ExportManagerProps {
    classes: ClassData[];
    settings: SchoolSettings;
}

const RESULT_TYPES = ['نصف السنة', 'الدرجة النهائية', 'الفصل الاول', 'الفصل الثاني', 'السعي السنوي', 'الدور الثاني'];

const DEFAULT_SUBJECT_GRADE: SubjectGrade = {
    firstTerm: null,
    midYear: null,
    secondTerm: null,
    finalExam1st: null,
    finalExam2nd: null,
};

const DEFAULT_CALCULATED_GRADE: CalculatedGrade = {
    annualPursuit: null,
    finalGrade1st: null,
    finalGradeWithDecision: null,
    decisionApplied: 0,
    finalGrade2nd: null,
    isExempt: false,
};

const ColorInput = ({ label, value, onChange }: { label: string, value: string, onChange: (value: string) => void }) => (
    <div className="flex flex-col items-center">
        <label className="text-xs font-bold text-gray-600 mb-1">{label}</label>
        <div className="relative w-12 h-8 rounded border border-gray-300 overflow-hidden cursor-pointer">
            <input
                type="color"
                value={value}
                onChange={e => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full cursor-pointer p-0 border-0 scale-150"
            />
        </div>
    </div>
);

export default function ExportManager({ classes, settings }: ExportManagerProps) {
    const [selectedStage, setSelectedStage] = useState<string>('');
    const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
    const [resultType, setResultType] = useState<string>('الدرجة النهائية');
    const [logos, setLogos] = useState<{ school: string | null; ministry: string | null; stamp: string | null }>({ school: null, ministry: null, stamp: null });
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [studentPhotos, setStudentPhotos] = useState<Record<string, string>>({});

    useEffect(() => {
        const principalId = (settings as any).principalId || 'principal_al_hamza';
        const photosMap: Record<string, string> = {};

        const loadPhotos = async () => {
            try {
                const formsSnap = await db.ref(`student_saved_forms/${principalId}`).get();
                if (formsSnap.exists()) {
                    const forms = formsSnap.val();
                    Object.entries(forms).forEach(([key, val]: [string, any]) => {
                        if (val?.studentPhoto) {
                            photosMap[key] = val.studentPhoto;
                            if (val.formData?.fullName) {
                                photosMap[val.formData.fullName.trim()] = val.studentPhoto;
                            }
                            if (val.formData?.studentCode) {
                                photosMap[val.formData.studentCode.trim()] = val.studentPhoto;
                            }
                        }
                    });
                }

                const subsSnap = await db.ref(`student_submissions/${principalId}`).get();
                if (subsSnap.exists()) {
                    const subs = subsSnap.val();
                    Object.values(subs).forEach((val: any) => {
                        if (val?.studentPhoto) {
                            if (val.studentId) photosMap[val.studentId] = val.studentPhoto;
                            if (val.studentCode) photosMap[val.studentCode] = val.studentPhoto;
                            if (val.studentName) photosMap[val.studentName.trim()] = val.studentPhoto;
                        }
                    });
                }

                setStudentPhotos(photosMap);
            } catch (err) {
                console.error("Error loading student photos:", err);
            }
        };

        loadPhotos();
    }, [(settings as any).principalId]);

    const getStudentPhoto = (student: Student): string | null => {
        if (!student) return null;
        if (student.photoUrl && typeof student.photoUrl === 'string' && !student.photoUrl.includes("GckSf3v")) {
            return student.photoUrl;
        }
        if (student.id && studentPhotos[student.id]) return studentPhotos[student.id];
        const code = (student as any).code;
        if (code && studentPhotos[code]) return studentPhotos[code];
        if (student.studentAccessCode && studentPhotos[student.studentAccessCode]) return studentPhotos[student.studentAccessCode];
        if (student.examId && studentPhotos[String(student.examId)]) return studentPhotos[String(student.examId)];
        if (student.name && studentPhotos[student.name.trim()]) return studentPhotos[student.name.trim()];
        return null;
    };

    // --- Card Background Customization ---
    const [resultBoxColor, setResultBoxColor] = useState('#f5f3ff'); // Light Violet
    const [successBoxColor, setSuccessBoxColor] = useState('#f0fdf4'); // Light Green

    // --- State for Subject Stats ---
    const [statStage, setStatStage] = useState('');
    const [statExamType, setStatExamType] = useState<'midYear' | 'finalYear'>('midYear');
    const [statSubjectName, setStatSubjectName] = useState('');

    const classesInSelectedStage = useMemo(() => {
        return selectedStage ? classes.filter(c => c.stage === selectedStage) : [];
    }, [selectedStage, classes]);

    const statSubjects = useMemo(() => {
        if (!statStage) return [];
        const classForStage = classes.find(c => c.stage === statStage);
        return classForStage?.subjects || [];
    }, [statStage, classes]);

    const handleStageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setSelectedStage(e.target.value);
        setSelectedClassIds([]);
    };

    const handleClassSelection = (classId: string) => {
        setSelectedClassIds(prev =>
            prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
        );
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'school' | 'ministry' | 'stamp') => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setLogos(prev => ({ ...prev, [type]: event.target?.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };
    
    const getStudentsToExport = (): { student: Student, classData: ClassData }[] => {
        return classes
            .filter(c => selectedClassIds.includes(c.id))
            .flatMap(c => (c.students || [])
                .filter(s => !s.enrollmentStatus || s.enrollmentStatus === 'active')
                .map(s => ({ student: s, classData: c }))
            );
    };

    const handleExportPdf = async () => {
        const studentsToExport = getStudentsToExport();
        if (studentsToExport.length === 0) {
            alert('يرجى اختيار طالب واحد على الأقل للتصدير.');
            return;
        }
    
        setIsExporting(true);
        setExportProgress(0);
    
        if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
            alert("خطأ: مكتبة تصدير PDF غير محملة. يرجى تحديث الصفحة والمحاولة مرة أخرى.");
            setIsExporting(false);
            return;
        }
    
        const { jsPDF } = jspdf;
        const pdf = new jsPDF({
            orientation: 'p',
            unit: 'mm',
            format: 'a4'
        });
    
        const tempContainer = document.createElement('div');
        Object.assign(tempContainer.style, {
            position: 'absolute',
            left: '-9999px',
            top: '-9999px',
            width: '794px',
            height: '1123px',
        });
        document.body.appendChild(tempContainer);
        const root = ReactDOM.createRoot(tempContainer);
    
        const renderComponent = (component: React.ReactElement): Promise<void> => {
            return new Promise((resolve) => {
                root.render(component);
                setTimeout(resolve, 800);
            });
        };
    
        const evalContext = resultType === 'نصف السنة' ? 'midYear' : 'final';

        try {
            await document.fonts.ready;
    
            for (let i = 0; i < studentsToExport.length; i++) {
                const { student, classData } = studentsToExport[i];
                const studentResultData = calculateStudentResult(student, classData.subjects, settings, classData, evalContext);
    
                await renderComponent(
                    <StudentReportCard
                        student={student}
                        classData={classData}
                        settings={settings}
                        studentResultData={studentResultData}
                        logos={logos}
                        resultType={resultType}
                        resultBoxColor={resultBoxColor}
                        successBoxColor={successBoxColor}
                        studentPhotoUrl={getStudentPhoto(student)}
                    />
                );
    
                const reportElement = tempContainer.children[0] as HTMLElement;
                const canvas = await html2canvas(reportElement, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                });
                
                const imgData = canvas.toDataURL('image/png');
                const { width: pageWidth, height: pageHeight } = pdf.internal.pageSize;
    
                if (i > 0) {
                    pdf.addPage();
                }
                pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
                
                setExportProgress(Math.round(((i + 1) / studentsToExport.length) * 100));
            }
    
            pdf.save(`نتائج-${selectedStage}.pdf`);
    
        } catch (error) {
            console.error("An error occurred during PDF export:", error);
            alert(`حدث خطأ أثناء التصدير.`);
        } finally {
            root.unmount();
            if (document.body.contains(tempContainer)) {
                document.body.removeChild(tempContainer);
            }
            setIsExporting(false);
            setExportProgress(0);
        }
    };

    const handleExportWord = async () => {
        const studentsToExport = getStudentsToExport();
        if (studentsToExport.length === 0) {
            alert('يرجى اختيار طالب واحد على الأقل للتصدير.');
            return;
        }

        setIsExporting(true);
        setExportProgress(0);

        if (typeof docx === 'undefined') {
            alert("خطأ: مكتبة تصدير Word غير محملة. يرجى تحديث الصفحة والمحاولة مرة أخرى.");
            setIsExporting(false);
            return;
        }

        const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, TextRun, VerticalAlign, BorderStyle, HeadingLevel, PageOrientation } = docx;

        try {
            const sections = [];
            const evalContext = resultType === 'نصف السنة' ? 'midYear' : 'final';

            for (let i = 0; i < studentsToExport.length; i++) {
                const { student, classData } = studentsToExport[i];
                const studentResultData = calculateStudentResult(student, classData.subjects, settings, classData, evalContext);
                const { finalCalculatedGrades, result } = studentResultData;
                const subjects = classData.subjects || [];

                const cardItems: any[] = [];

                // 1. Header
                cardItems.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: settings.schoolName, bold: true, size: 36 }),
                    ],
                }));
                cardItems.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: `المديرية العامة لتربية ${settings.directorate || ".........."}`, bold: true, size: 24 }),
                    ],
                }));
                cardItems.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: `بيان نتيجة الطالب للعام الدراسي ${settings.academicYear}`, bold: true, size: 24 }),
                    ],
                }));
                cardItems.push(new Paragraph({ text: "" })); // Spacer

                // 2. Student Info Table
                cardItems.push(new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ text: `الاسم: ${student.name}`, bold: true, size: 24 })], alignment: AlignmentType.RIGHT })],
                                    verticalAlign: VerticalAlign.CENTER,
                                }),
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ text: `الصف: ${classData.stage} (${classData.section})`, bold: true, size: 24 })], alignment: AlignmentType.RIGHT })],
                                    verticalAlign: VerticalAlign.CENTER,
                                }),
                            ],
                        }),
                        new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ text: `الرقم الامتحاني: ${student.examId || "---"}`, bold: true, size: 24 })], alignment: AlignmentType.RIGHT })],
                                    verticalAlign: VerticalAlign.CENTER,
                                }),
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ text: `سجل القيد: ${student.registrationId || "---"}`, bold: true, size: 24 })], alignment: AlignmentType.RIGHT })],
                                    verticalAlign: VerticalAlign.CENTER,
                                }),
                            ],
                        }),
                    ],
                }));

                cardItems.push(new Paragraph({ text: "" })); // Spacer

                // 3. Grades Table
                const headers = ['المادة الدراسية', 'ف1', 'نصف السنة', 'ف2', 'السعي', 'نهائي', 'الدرجة النهائية', 'الدور 2', 'النتيجة النهائية'];
                const gradeRows = [
                    new TableRow({
                        tableHeader: true,
                        children: headers.map(h => new TableCell({
                            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, color: "FFFFFF" })], alignment: AlignmentType.CENTER })],
                            shading: { fill: "333333" },
                            verticalAlign: VerticalAlign.CENTER,
                        })),
                    })
                ];

                subjects.forEach((subject) => {
                    const grades = student.grades?.[subject.name] || DEFAULT_SUBJECT_GRADE;
                    const calculated = finalCalculatedGrades[subject.name] || DEFAULT_CALCULATED_GRADE;
                    const decisionApplied = calculated.decisionApplied;
                    const originalGrade = calculated.finalGrade1st;
                    const decisionGrade = calculated.finalGradeWithDecision;
                    const isDecisionGrade = decisionApplied > 0 && decisionGrade === 50 && originalGrade !== null && originalGrade < 50;

                    const rowCells = [
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: subject.name, bold: true, size: 20 })], alignment: AlignmentType.RIGHT })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(grades.firstTerm ?? "-"), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(grades.midYear ?? "-"), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(grades.secondTerm ?? "-"), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(calculated.annualPursuit ?? "-"), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: calculated.isExempt ? "معفو" : String(grades.finalExam1st ?? "-"), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ 
                            children: isDecisionGrade ? [
                                new Paragraph({ children: [new TextRun({ text: "50", size: 16, bold: false })], alignment: AlignmentType.CENTER }),
                                new Paragraph({ children: [new TextRun({ text: String(originalGrade), size: 24, bold: true, color: "FF0000" })], alignment: AlignmentType.CENTER })
                            ] : [
                                new Paragraph({ children: [new TextRun({ text: String(decisionGrade ?? "-"), size: 20, bold: true })], alignment: AlignmentType.CENTER })
                            ], 
                            verticalAlign: VerticalAlign.CENTER,
                            shading: isDecisionGrade ? { fill: "FFFFEE" } : undefined
                        }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(grades.finalExam2nd ?? "-"), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(calculated.finalGrade2nd ?? "-"), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: VerticalAlign.CENTER }),
                    ];

                    gradeRows.push(new TableRow({ children: rowCells }));
                });

                cardItems.push(new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: gradeRows,
                }));

                cardItems.push(new Paragraph({ text: "" })); // Spacer

                // 4. Result Status
                cardItems.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new TextRun({ text: `النتيجة: ${result.message}`, bold: true, size: 32, color: result.status === 'مكمل' || result.status === 'راسب' ? "FF0000" : "0000FF" }),
                    ],
                }));

                cardItems.push(new Paragraph({ text: "" })); // Spacer
                cardItems.push(new Paragraph({ text: "" })); // Spacer

                // 5. Footer
                cardItems.push(new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ text: "الختم والتوقيع", bold: true, size: 24 })], alignment: AlignmentType.CENTER })],
                                    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                                }),
                                new TableCell({
                                    children: [new Paragraph({ children: [new TextRun({ text: "مدير المدرسة", bold: true, size: 24 })], alignment: AlignmentType.CENTER })],
                                    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
                                }),
                            ],
                        }),
                    ],
                }));

                sections.push({
                    properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
                    children: cardItems,
                });

                setExportProgress(Math.round(((i + 1) / studentsToExport.length) * 100));
            }

            const doc = new Document({
                title: `نتائج الطلاب - ${selectedStage}`,
                sections: sections
            });

            const blob = await Packer.toBlob(doc);
            saveAs(blob, `نتائج-${selectedStage}.docx`);

        } catch (error) {
            console.error("An error occurred during Word export:", error);
            alert(`حدث خطأ أثناء التصدير.`);
        } finally {
            setIsExporting(false);
            setExportProgress(0);
        }
    };

    const handleExportGeneralExemptedPdf = async () => {
        if (!selectedStage) {
            alert('يرجى اختيار المرحلة الدراسية.');
            return;
        }

        setIsExporting(true);
        setExportProgress(0);

        if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
            alert("خطأ: مكتبة تصدير PDF غير محملة. يرجى تحديث الصفحة والمحاولة مرة أخرى.");
            setIsExporting(false);
            return;
        }

        const stageClasses = classes.filter(c => c.stage === selectedStage);
        const allStudentsInStage = stageClasses.flatMap(c => 
            (c.students || [])
            .filter(s => !s.enrollmentStatus || s.enrollmentStatus === 'active')
            .map(s => ({ student: s, classData: c }))
        );

        if (allStudentsInStage.length === 0) {
            alert('لا يوجد طلاب في هذه المرحلة.');
            setIsExporting(false);
            return;
        }

        const tempContainer = document.createElement('div');
        Object.assign(tempContainer.style, {
            position: 'absolute',
            left: '-9999px',
            top: '-9999px',
            width: '794px',
            height: '1123px',
        });
        document.body.appendChild(tempContainer);
        const root = ReactDOM.createRoot(tempContainer);

        const renderComponent = (component: React.ReactElement): Promise<void> => {
            return new Promise((resolve) => {
                root.render(component);
                setTimeout(resolve, 800);
            });
        };

        try {
            await document.fonts.ready;
            const generalExempted: { student: Student, classData: ClassData, resultData: any }[] = [];
            
            // Phase 1: Filtering
            for (let i = 0; i < allStudentsInStage.length; i++) {
                const { student, classData } = allStudentsInStage[i];
                const resultData = calculateStudentResult(student, classData.subjects, settings, classData, 'final');
                
                // A student is general exempt if any of their calculated subject grades has isGeneralExempt true
                const isGeneralExempt = Object.values(resultData.finalCalculatedGrades).some(g => (g as any).isGeneralExempt);
                if (isGeneralExempt) {
                    generalExempted.push({ student, classData, resultData });
                }
            }

            if (generalExempted.length === 0) {
                alert('لا يوجد طلاب معفون إعفاءً عاماً في هذه المرحلة.');
                setIsExporting(false);
                return;
            }

            // Phase 2: PDF Generation
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4'
            });

            for (let i = 0; i < generalExempted.length; i++) {
                const { student, classData, resultData } = generalExempted[i];
    
                await renderComponent(
                    <StudentReportCard
                        student={student}
                        classData={classData}
                        settings={settings}
                        studentResultData={resultData}
                        logos={logos}
                        resultType="الدرجة النهائية"
                        resultBoxColor={resultBoxColor}
                        successBoxColor={successBoxColor}
                    />
                );
    
                const reportElement = tempContainer.children[0] as HTMLElement;
                const canvas = await html2canvas(reportElement, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                });
                
                const imgData = canvas.toDataURL('image/png');
                const { width: pageWidth, height: pageHeight } = pdf.internal.pageSize;
    
                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
                
                setExportProgress(Math.round(((i + 1) / generalExempted.length) * 100));
            }
    
            pdf.save(`نتائج_المعفويين_عاما_${selectedStage}.pdf`);
    
        } catch (error) {
            console.error(error);
            alert(`حدث خطأ أثناء التصدير.`);
        } finally {
            root.unmount();
            if (document.body.contains(tempContainer)) {
                document.body.removeChild(tempContainer);
            }
            setIsExporting(false);
            setExportProgress(0);
        }
    };

    const handleExportSubjectStatsPdf = async () => {
        if (!statStage || !statSubjectName) {
            alert('يرجى اختيار المرحلة والمادة.');
            return;
        }

        setIsExporting(true);
        setExportProgress(0);

        const tempContainer = document.createElement('div');
        Object.assign(tempContainer.style, { position: 'absolute', left: '-9999px', top: '0' });
        document.body.appendChild(tempContainer);
        const root = ReactDOM.createRoot(tempContainer);

        try {
            await document.fonts.ready;
            
            const stageClasses = classes.filter(c => c.stage === statStage).sort((a,b) => compareSections(a.section, b.section));
            if (stageClasses.length === 0) throw new Error("لا توجد شعب لهذه المرحلة.");

            await new Promise<void>(resolve => {
                root.render(
                    <SubjectSuccessStatsPDF
                        settings={settings}
                        classes={stageClasses}
                        subjectName={statSubjectName}
                        examType={statExamType}
                    />
                );
                setTimeout(resolve, 800);
            });

            const element = tempContainer.children[0] as HTMLElement;
            const canvas = await html2canvas(element, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL('image/png');

            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
            pdf.save(`إحصائية_نجاح_${statSubjectName}_${statStage}.pdf`);

        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء التصدير.");
        } finally {
            root.unmount();
            if (document.body.contains(tempContainer)) {
                document.body.removeChild(tempContainer);
            }
            setIsExporting(false);
            setExportProgress(0);
        }
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            <div className="bg-white p-8 rounded-xl shadow-lg">
                <h2 className="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">تصدير بطاقات وكشوفات النتائج</h2>
                
                {isExporting && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex flex-col justify-center items-center z-50 text-white">
                        <Loader2 className="animate-spin h-16 w-16 mb-4" />
                        <p className="text-2xl font-bold mb-2">جاري التصدير...</p>
                        <div className="w-1/2 bg-gray-600 rounded-full h-4">
                            <div className="bg-cyan-500 h-4 rounded-full" style={{ width: `${exportProgress}%` }}></div>
                        </div>
                        <p className="mt-2 text-lg">{exportProgress}%</p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div>
                            <label className="block text-md font-bold text-gray-700 mb-2">1. المرحلة الدراسية</label>
                            <select onChange={handleStageChange} value={selectedStage} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500">
                                <option value="">-- اختر مرحلة --</option>
                                {GRADE_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                            </select>
                        </div>

                        {selectedStage && (
                            <div>
                                <label className="block text-md font-bold text-gray-700 mb-2">2. الشعبة</label>
                                <div className="space-y-2 max-h-48 overflow-y-auto p-2 border rounded-lg bg-gray-50">
                                    {classesInSelectedStage.length > 0 ? classesInSelectedStage.map(c => (
                                        <label key={c.id} className="flex items-center gap-3 p-2 rounded-md hover:bg-gray-100 cursor-pointer">
                                            <input type="checkbox" checked={selectedClassIds.includes(c.id)} onChange={() => handleClassSelection(c.id)} className="h-5 w-5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"/>
                                            <span className="font-semibold">{c.stage} - {c.section}</span>
                                            <span className="text-sm text-gray-500">({(c.students || []).length} طالب)</span>
                                        </label>
                                    )) : <p className="text-gray-500">لا توجد شعب لهذه المرحلة.</p>}
                                </div>
                            </div>
                        )}
                        
                        <div>
                            <label className="block text-md font-bold text-gray-700 mb-2">3. نوع النتيجة</label>
                            <select onChange={e => setResultType(e.target.value)} value={resultType} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-cyan-500 focus:border-cyan-500">
                                {RESULT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                            </select>
                        </div>

                        <div className="bg-gray-50 p-4 rounded-lg border">
                            <label className="block text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                                <Palette size={16} className="text-cyan-600" />
                                ألوان البطاقات
                            </label>
                            <div className="flex justify-around">
                                <ColorInput label="اللون العام" value={resultBoxColor} onChange={setResultBoxColor} />
                                <ColorInput label="لون الناجحين" value={successBoxColor} onChange={setSuccessBoxColor} />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-md font-bold text-gray-700 mb-2">4. الشعارات والأختام</label>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="p-3 border rounded-lg bg-gray-50">
                                    <label className="text-sm font-bold text-gray-700 block mb-2">شعار الوزارة</label>
                                    <input type="file" onChange={e => handleFileChange(e, 'ministry')} accept="image/*" className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-white file:text-gray-700 hover:file:bg-gray-100"/>
                                </div>
                                <div className="p-3 border rounded-lg bg-gray-50">
                                    <label className="text-sm font-bold text-gray-700 block mb-2">شعار المدرسة</label>
                                    <input type="file" onChange={e => handleFileChange(e, 'school')} accept="image/*" className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-white file:text-gray-700 hover:file:bg-gray-100"/>
                                </div>
                                <div className="p-3 border rounded-lg bg-cyan-50 border-cyan-100">
                                    <label className="text-sm font-bold text-cyan-800 flex items-center gap-2 mb-2">
                                        <ImageIcon size={14} /> ختم المدرسة
                                    </label>
                                    <input type="file" onChange={e => handleFileChange(e, 'stamp')} accept="image/*" className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-white file:text-gray-700 hover:file:bg-gray-100"/>
                                    {logos.stamp && <img src={logos.stamp} alt="Stamp Preview" className="mt-2 h-16 object-contain border p-1 bg-white" />}
                                </div>
                            </div>
                        </div>
                        
                        <div className="border-t pt-6 space-y-4">
                            <label className="block text-md font-bold text-gray-700 mb-1 text-center">5. تنفيذ التصدير</label>
                            <div className="flex flex-col gap-3">
                                <button onClick={handleExportPdf} disabled={selectedClassIds.length === 0 || isExporting} className="w-full px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition shadow-md disabled:bg-gray-400 flex items-center justify-center gap-2">
                                    <FileText size={20} />
                                    تصدير البطاقات (PDF)
                                </button>
                                <button onClick={handleExportWord} disabled={selectedClassIds.length === 0 || isExporting} className="w-full px-6 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition shadow-md disabled:bg-gray-400 flex items-center justify-center gap-2">
                                    <FileDown size={20} />
                                    تصدير البطاقات (Word)
                                </button>
                                <button onClick={handleExportGeneralExemptedPdf} disabled={!selectedStage || isExporting} className="w-full px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition shadow-md disabled:bg-gray-400 flex items-center justify-center gap-2">
                                    <CheckCircle size={20} />
                                    تصدير المعفويين عاماً فقط (PDF)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Subject Success Stats --- */}
            <div className="bg-white p-8 rounded-xl shadow-lg border-t-4 border-indigo-600">
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                        <BarChart2 size={32} />
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold text-gray-800">إحصائيات نجاح مادة محددة</h2>
                        <p className="text-sm text-gray-500">استخراج نسب النجاح لمادة دراسية لمرحلة معينة مع تفاصيل كل شعبة</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">1. المرحلة الدراسية</label>
                        <select 
                            value={statStage} 
                            onChange={e => { setStatStage(e.target.value); setStatSubjectName(''); }} 
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">-- اختر مرحلة --</option>
                            {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">2. نوع الامتحان</label>
                        <select 
                            value={statExamType} 
                            onChange={e => setStatExamType(e.target.value as any)} 
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="midYear">نصف السنة</option>
                            <option value="finalYear">نهاية السنة</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">3. المادة الدراسية</label>
                        <select 
                            value={statSubjectName} 
                            onChange={e => setStatSubjectName(e.target.value)} 
                            disabled={!statStage}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
                        >
                            <option value="">-- اختر المادة --</option>
                            {statSubjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <button 
                            onClick={handleExportSubjectStatsPdf}
                            disabled={!statStage || !statSubjectName || isExporting}
                            className="w-full flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition shadow-md disabled:bg-gray-400"
                        >
                            <FileDown size={20} />
                            <span>تصدير الإحصائية (PDF)</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

