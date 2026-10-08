
import React from 'react';
import type { ClassData, Subject, TeacherSubjectGrade, Student, SchoolSettings } from '../../types.ts';

interface TeacherGradeSheetPDFProps {
    students: Student[];
    classData: ClassData;
    subject: Subject;
    teacherName: string;
    settings: SchoolSettings;
    pageNumber: number;
    totalPages: number;
    startingIndex: number;
    isPrimary1_4: boolean;
    isPrimary5_6: boolean;
}

const DEFAULT_TEACHER_GRADE: TeacherSubjectGrade = {
    firstSemMonth1: null, firstSemMonth2: null, midYear: null, secondSemMonth1: null, secondSemMonth2: null, finalExam: null,
    october: null, november: null, december: null, january: null, february: null, march: null, april: null,
    firstTerm: null, secondTerm: null, annualPursuit: null,
};


const isValidGrade = (g: number | null): g is number => g !== null && g >= 0;

const calculateGrades = (grade: TeacherSubjectGrade) => {
    const firstSemAvg = (grade.firstTerm !== undefined && grade.firstTerm !== null)
        ? grade.firstTerm
        : (isValidGrade(grade.firstSemMonth1) && isValidGrade(grade.firstSemMonth2))
            ? Math.round((grade.firstSemMonth1 + grade.firstSemMonth2) / 2)
            : null;

    const secondSemAvg = (grade.secondTerm !== undefined && grade.secondTerm !== null)
        ? grade.secondTerm
        : (isValidGrade(grade.secondSemMonth1) && isValidGrade(grade.secondSemMonth2))
            ? Math.round((grade.secondSemMonth1 + grade.secondSemMonth2) / 2)
            : null;

    const annualPursuit = (grade.annualPursuit !== undefined && grade.annualPursuit !== null)
        ? grade.annualPursuit
        : (firstSemAvg !== null && isValidGrade(grade.midYear) && secondSemAvg !== null)
            ? Math.round((firstSemAvg + grade.midYear + secondSemAvg) / 3)
            : null;

    return { firstSemAvg, secondSemAvg, annualPursuit };
};

const calculateGradesForPrimary = (grade: TeacherSubjectGrade) => {
    const { october, november, december, january, february, march, april, midYear, firstTerm, secondTerm, annualPursuit: manualAnnualPursuit } = grade;

    let primaryFirstTerm: number | null = (firstTerm !== undefined && firstTerm !== null) ? firstTerm : null;
    if (primaryFirstTerm === null) {
        const firstTermMonths = [october, november, december, january];
        if (firstTermMonths.every(isValidGrade)) {
            primaryFirstTerm = Math.round((october! + november! + december! + january!) / 4);
        }
    }

    let primarySecondTerm: number | null = (secondTerm !== undefined && secondTerm !== null) ? secondTerm : null;
    if (primarySecondTerm === null) {
        const secondTermMonths = [february, march, april];
        if (secondTermMonths.every(isValidGrade)) {
            primarySecondTerm = Math.round((february! + march! + april!) / 3);
        }
    }

    const annualPursuit = (manualAnnualPursuit !== undefined && manualAnnualPursuit !== null)
        ? manualAnnualPursuit
        : (primaryFirstTerm !== null && isValidGrade(midYear) && primarySecondTerm !== null)
            ? Math.round((primaryFirstTerm + midYear + primarySecondTerm) / 3)
            : null;

    return { primaryFirstTerm, primarySecondTerm, annualPursuit };
};

const VerticalHeader: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
    <th rowSpan={2} className={`border border-black p-0 align-middle w-7 ${className}`}>
        <div className="flex items-center justify-center h-24 overflow-hidden">
            <span className="font-bold whitespace-nowrap block text-[10px] leading-none" style={{ transform: 'rotate(-90deg)', width: 'max-content' }}>
                {children}
            </span>
        </div>
    </th>
);

const Cell: React.FC<{ children?: React.ReactNode, className?: string}> = ({ children, className }) => (
    <td className={`border border-black text-center font-bold h-8 text-xs px-0.5 ${className}`}>{children ?? ''}</td>
);


export default function TeacherGradeSheetPDF({ students, classData, subject, teacherName, settings, pageNumber, totalPages, startingIndex, isPrimary1_4, isPrimary5_6 }: TeacherGradeSheetPDFProps) {
    const MAX_ROWS_PER_PAGE = 21;
    
    const teacherLabel = settings.schoolLevel === 'ابتدائية' ? 'المعلم' : 'المدرس';
    const studentLabel = settings.schoolLevel === 'ابتدائية' ? 'التلميذ' : 'الطالب';

    const formatGradeForPdf = (gradeValue: number | null, schoolGender: string | undefined): string | number => {
        if (gradeValue === null || gradeValue === undefined) return '';
        if (gradeValue === -1) return schoolGender === 'بنات' ? 'غائبة' : 'غائب';
        if (gradeValue === -2) return schoolGender === 'بنات' ? 'مجازة' : 'مجاز';
        return gradeValue;
    };
    
    return (
        <div className="w-[794px] h-[1123px] p-8 bg-white flex flex-col font-['Cairo']" dir="rtl">
            <header className="mb-4">
                 <div className="flex justify-between items-center text-lg font-bold">
                    <span className="text-right flex-1">المادة: {subject.name} | {teacherLabel}: {teacherName}</span>
                    <span className="text-left flex-1">العام الدراسي: {settings.academicYear}</span>
                </div>
                <h2 className="text-center text-2xl font-bold mt-2">سجل درجات: {classData.stage} - {classData.section}</h2>
            </header>

            <main className="flex-grow">
                {isPrimary1_4 ? (
                    <table className="w-full border-collapse border border-black text-sm">
                        <thead className="bg-yellow-200 text-black font-bold text-xs">
                            <tr>
                                <th className="border border-black p-1 w-8">ت</th>
                                <th className="border border-black p-1 min-w-[200px] whitespace-nowrap">اسم {studentLabel}</th>
                                <th className="border border-black p-1 w-24">درجة نصف السنة</th>
                                <th className="border border-black p-1 w-24">درجة نهاية السنة</th>
                                <th className="border border-black p-1">الملاحظات</th>
                            </tr>
                        </thead>
                         <tbody>
                            {students.map((student, index) => {
                                const grade = student ? { ...DEFAULT_TEACHER_GRADE, ...(student.teacherGrades?.[subject.name] || {}) } : null;
                                const isTransferred = student?.enrollmentStatus === 'transferred';
                                const isDismissed = student?.enrollmentStatus === 'dismissed';
                                
                                let rowBg = student ? ['#ffffff', '#f0f9ff', '#fff0f5', '#f0fff0', '#f5f0ff'][index % 5] : '#ffffff';
                                if (isTransferred) rowBg = '#d8b4fe';
                                if (isDismissed) rowBg = '#fca5a5';
                                
                                return (
                                    <tr key={student?.id ?? `empty-${index}`} style={{ backgroundColor: rowBg, height: '28px' }}>
                                        <td className="border border-black text-center text-xs">{startingIndex + index + 1}</td>
                                        <td className="border border-black p-1 font-semibold whitespace-nowrap text-xs">{student?.name}</td>
                                        {isTransferred ? (
                                            <td colSpan={3} className="border border-black text-center font-bold text-purple-900">منقول الى مدرسة اخرى</td>
                                        ) : isDismissed ? (
                                            <td colSpan={3} className="border border-black text-center font-bold text-red-900">تم فصل الطالب للعام الدراسي الحالي لتجاوزة الغيابات المسموح بها</td>
                                        ) : (
                                            <>
                                                <Cell>{formatGradeForPdf(grade?.midYear, settings.schoolGender)}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.finalExam, settings.schoolGender)}</Cell>
                                                <td className="border border-black"></td>
                                            </>
                                        )}
                                    </tr>
                                )
                            })}
                            {Array.from({ length: Math.max(0, MAX_ROWS_PER_PAGE - students.length) }).map((_, index) => (
                                 <tr key={`empty-${index}`} style={{ height: '32px' }}>
                                    <td className="border border-black text-center">{startingIndex + students.length + index + 1}</td>
                                    {Array.from({ length: 4 }).map((_, i) => <td key={i} className="border border-black"></td>)}
                                 </tr>
                            ))}
                        </tbody>
                    </table>
                ) : isPrimary5_6 ? (
                     <table className="w-full border-collapse border border-black text-[10px]">
                        <thead className="text-black font-bold">
                            <tr className="bg-yellow-200 h-28">
                                <th rowSpan={2} className="border border-black p-1 w-7">ت</th>
                                <th rowSpan={2} className="border border-black p-1 min-w-[150px] whitespace-nowrap">اسم {studentLabel}</th>
                                <th colSpan={4} className="border-b border-black p-1" style={{backgroundColor: '#a5f3fc'}}>الفصل الأول</th>
                                <VerticalHeader className="bg-orange-200">معدل الفصل الأول</VerticalHeader>
                                <VerticalHeader className="bg-pink-200">نصف السنة</VerticalHeader>
                                <th colSpan={3} className="border-b border-black p-1" style={{backgroundColor: '#a7f3d0'}}>الفصل الثاني</th>
                                <VerticalHeader className="bg-orange-200">معدل الفصل الثاني</VerticalHeader>
                                <VerticalHeader className="bg-red-300">السعي السنوي</VerticalHeader>
                            </tr>
                            <tr className="bg-yellow-200">
                                <th className="border border-black p-0.5 w-8" style={{backgroundColor: '#a5f3fc'}}>تشرين الأول</th>
                                <th className="border border-black p-0.5 w-8" style={{backgroundColor: '#a5f3fc'}}>تشرين الثاني</th>
                                <th className="border border-black p-0.5 w-8" style={{backgroundColor: '#a5f3fc'}}>كانون الأول</th>
                                <th className="border border-black p-0.5 w-8" style={{backgroundColor: '#a5f3fc'}}>كانون الثاني</th>
                                <th className="border border-black p-0.5 w-8" style={{backgroundColor: '#a7f3d0'}}>شباط</th>
                                <th className="border border-black p-0.5 w-8" style={{backgroundColor: '#a7f3d0'}}>آذار</th>
                                <th className="border border-black p-0.5 w-8" style={{backgroundColor: '#a7f3d0'}}>نيسان</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((student, index) => {
                                const grade = student ? { ...DEFAULT_TEACHER_GRADE, ...(student.teacherGrades?.[subject.name] || {}) } : null;
                                const calculated = grade ? calculateGradesForPrimary(grade) : { primaryFirstTerm: null, primarySecondTerm: null, annualPursuit: null };
                                const isTransferred = student?.enrollmentStatus === 'transferred';
                                const isDismissed = student?.enrollmentStatus === 'dismissed';
                                
                                let rowBg = student ? ['#ffffff', '#f0f9ff', '#fff0f5', '#f0fff0', '#f5f0ff'][index % 5] : '#ffffff';
                                if (isTransferred) rowBg = '#d8b4fe';
                                if (isDismissed) rowBg = '#fca5a5';
                                
                                return (
                                    <tr key={student?.id ?? `empty-${index}`} style={{ backgroundColor: rowBg, height: '28px' }}>
                                        <td className="border border-black text-center">{startingIndex + index + 1}</td>
                                        <td className="border border-black p-1 font-semibold whitespace-nowrap">{student?.name}</td>
                                        {isTransferred ? (
                                            <td colSpan={12} className="border border-black text-center font-bold text-purple-900">منقول الى مدرسة اخرى</td>
                                        ) : isDismissed ? (
                                            <td colSpan={12} className="border border-black text-center font-bold text-red-900">تم فصل الطالب للعام الدراسي الحالي لتجاوزة الغيابات المسموح بها</td>
                                        ) : (
                                            <>
                                                <Cell>{formatGradeForPdf(grade?.october, settings.schoolGender)}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.november, settings.schoolGender)}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.december, settings.schoolGender)}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.january, settings.schoolGender)}</Cell>
                                                <Cell className="bg-yellow-100">{calculated?.primaryFirstTerm}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.midYear, settings.schoolGender)}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.february, settings.schoolGender)}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.march, settings.schoolGender)}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.april, settings.schoolGender)}</Cell>
                                                <Cell className="bg-yellow-100">{calculated?.primarySecondTerm}</Cell>
                                                <Cell className="bg-orange-200 text-red-600 text-lg">{calculated?.annualPursuit}</Cell>
                                            </>
                                        )}
                                    </tr>
                                )
                            })}
                            {Array.from({ length: Math.max(0, MAX_ROWS_PER_PAGE - students.length) }).map((_, index) => (
                                <tr key={`empty-${index}`} style={{ height: '32px' }}>
                                    <td className="border border-black text-center">{startingIndex + students.length + index + 1}</td>
                                    {Array.from({ length: 12 }).map((_, i) => <td key={i} className="border border-black"></td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <table className="w-full border-collapse border border-black text-[10px]">
                        <thead className="bg-yellow-200 text-black font-bold">
                            <tr>
                                <th rowSpan={2} className="border border-black p-1 w-7">ت</th>
                                <th rowSpan={2} className="border border-black p-1 min-w-[150px] whitespace-nowrap">اسم {studentLabel}</th>
                                <th colSpan={2} className="border-b border-black p-1 bg-sky-200">الفصل اول</th>
                                <VerticalHeader className="bg-orange-300">معدل الفصل اول</VerticalHeader>
                                <VerticalHeader className="bg-orange-300">نصف السنة</VerticalHeader>
                                <th colSpan={2} className="border-b border-black p-1 bg-green-200">الفصل الثاني</th>
                                <VerticalHeader className="bg-orange-300">معدل الفصل الثاني</VerticalHeader>
                                <VerticalHeader className="bg-orange-300">السعي السنوي</VerticalHeader>
                            </tr>
                            <tr>
                                <th className="border border-black p-0.5 bg-sky-200 w-9">الشهر الاول</th>
                                <th className="border border-black p-0.5 bg-sky-200 w-9">الشهر الثاني</th>
                                <th className="border border-black p-0.5 bg-green-200 w-9">الشهر الاول</th>
                                <th className="border border-black p-0.5 bg-green-200 w-9">الشهر الثاني</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.map((student, index) => {
                                const grade = student ? { ...DEFAULT_TEACHER_GRADE, ...(student.teacherGrades?.[subject.name] || {}) } : null;
                                const calculated = grade ? calculateGrades(grade) : { firstSemAvg: null, midYear: null, secondSemAvg: null, annualPursuit: null };
                                
                                const isTransferred = student?.enrollmentStatus === 'transferred';
                                const isDismissed = student?.enrollmentStatus === 'dismissed';
                                
                                let rowBg = student ? ['#ffffff', '#f0f9ff', '#fff0f5', '#f0fff0', '#f5f0ff'][index % 5] : '#ffffff';
                                if (isTransferred) rowBg = '#d8b4fe';
                                if (isDismissed) rowBg = '#fca5a5';
                                
                                return (
                                    <tr key={student?.id ?? `empty-${index}`} style={{ backgroundColor: rowBg, height: '28px' }}>
                                        <td className="border border-black text-center">{startingIndex + index + 1}</td>
                                        <td className="border border-black p-1 font-semibold whitespace-nowrap">{student?.name}</td>
                                        {isTransferred ? (
                                            <td colSpan={9} className="border border-black text-center font-bold text-purple-900">منقول الى مدرسة اخرى</td>
                                        ) : isDismissed ? (
                                            <td colSpan={9} className="border border-black text-center font-bold text-red-900">تم فصل الطالب للعام الدراسي الحالي لتجاوزة الغيابات المسموح بها</td>
                                        ) : (
                                            <>
                                                <Cell>{formatGradeForPdf(grade?.firstSemMonth1, settings.schoolGender)}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.firstSemMonth2, settings.schoolGender)}</Cell>
                                                <Cell className="bg-yellow-100">{calculated?.firstSemAvg}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.midYear, settings.schoolGender)}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.secondSemMonth1, settings.schoolGender)}</Cell>
                                                <Cell>{formatGradeForPdf(grade?.secondSemMonth2, settings.schoolGender)}</Cell>
                                                <Cell className="bg-yellow-100">{calculated?.secondSemAvg}</Cell>
                                                <Cell className="bg-orange-200 text-red-600 text-lg">{calculated?.annualPursuit}</Cell>
                                            </>
                                        )}
                                    </tr>
                                )
                            })}
                            {Array.from({ length: Math.max(0, MAX_ROWS_PER_PAGE - students.length) }).map((_, index) => (
                                <tr key={`empty-${index}`} style={{ height: '32px' }}>
                                    <td className="border border-black text-center">{startingIndex + students.length + index + 1}</td>
                                    {Array.from({ length: 9 }).map((_, i) => <td key={i} className="border border-black"></td>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </main>
            
            <footer className="mt-auto pt-4">
                <div className="flex justify-between font-bold text-base">
                    <span>توقيع {teacherLabel} المادة / ..............................</span>
                    <span>توقيع مدير المدرسة / ..............................</span>
                </div>
                <div className="text-center text-xs mt-2">
                    صفحة {pageNumber} من {totalPages}
                </div>
            </footer>
        </div>
    );
}
