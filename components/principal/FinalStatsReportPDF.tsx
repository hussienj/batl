
import React from 'react';
import type { SchoolSettings, ClassData, Student, Subject } from '../../types.ts';

interface FinalStatsReportPDFProps {
    settings: SchoolSettings;
    classData: ClassData;
    students: Student[];
    subjects: Subject[];
    resultLabel: string;
    // Map of StudentID -> SubjectName -> Grade
    gradesMap: Record<string, Record<string, number | null>>;
    pageInfo: { pageNumber: number, totalPages: number };
}

const STUDENTS_PER_PAGE = 19;

// Helper component for Vertical Headers
const VerticalHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <th className="border-2 border-black p-0 h-32 align-middle relative w-8 min-w-[32px]">
        <div className="absolute inset-0 flex items-center justify-center">
            <span 
                className="font-bold whitespace-nowrap text-[10pt]"
                style={{ transform: 'rotate(-90deg)', display: 'inline-block' }}
            >
                {children}
            </span>
        </div>
    </th>
);

const LiftedText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ position: 'relative', bottom: '6px' }}>
        {children}
    </div>
);

export default function FinalStatsReportPDF({ settings, classData, students, subjects, resultLabel, gradesMap, pageInfo }: FinalStatsReportPDFProps) {
    return (
        <div className="w-[794px] h-[1123px] p-8 bg-white font-['Cairo'] flex flex-col box-border border" dir="rtl">
            {/* Header Section */}
            <header className="flex justify-between items-start mb-4 border-b-2 border-black pb-2 flex-shrink-0">
                <div className="w-1/3 font-bold text-sm leading-tight">
                    <p>المديرية العامة لتربية {settings.directorate}</p>
                    <p>مدرسة: {settings.schoolName}</p>
                </div>
                <div className="w-1/3 text-center">
                    <h1 className="text-xl font-black text-blue-900 leading-none">كشف درجات {resultLabel}</h1>
                    <p className="text-sm font-bold mt-1">العام الدراسي: {settings.academicYear}</p>
                </div>
                <div className="w-1/3 text-left font-bold text-sm leading-tight">
                    <p>الصف: {classData.stage}</p>
                    <p>الشعبة: {classData.section}</p>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-shrink-0">
                <table className="w-full border-collapse border-2 border-black shadow-sm table-fixed">
                    <thead className="bg-gray-100 font-bold">
                        <tr className="h-10">
                            <th className="border-2 border-black p-1 w-[35px] align-middle" rowSpan={2}><LiftedText>ت</LiftedText></th>
                            <th className="border-2 border-black p-1 text-right pr-2 align-middle w-[220px]" rowSpan={2}><LiftedText>اسم الطالب الثلاثي</LiftedText></th>
                            <th className="border-2 border-black p-1 bg-blue-50 text-xs" colSpan={subjects.length}><LiftedText>المواد الدراسية</LiftedText></th>
                            <th className="border-2 border-black p-1 w-[80px] align-middle" rowSpan={2}><LiftedText>الملاحظات</LiftedText></th>
                        </tr>
                        <tr className="h-32">
                            {subjects.map(subject => (
                                <VerticalHeader key={subject.id}>{subject.name}</VerticalHeader>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((student, index) => {
                            const studentGrades = gradesMap[student.id] || {};
                            const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                            
                            return (
                                <tr key={student.id} className={`h-9 ${rowBg}`}>
                                    <td className="border-2 border-black text-center font-bold text-sm">
                                        <LiftedText>{(pageInfo.pageNumber - 1) * STUDENTS_PER_PAGE + index + 1}</LiftedText>
                                    </td>
                                    <td className="border-2 border-black p-1 text-right pr-2 font-black text-[10pt] truncate">
                                        <LiftedText>{student.name}</LiftedText>
                                    </td>
                                    {subjects.map(subject => {
                                        const grade = studentGrades[subject.name];
                                        return (
                                            <td key={subject.id} className={`border-2 border-black text-center font-bold text-base ${grade !== null && grade < 50 ? 'text-red-600' : 'text-black'}`}>
                                                <LiftedText>{grade ?? ''}</LiftedText>
                                            </td>
                                        );
                                    })}
                                    <td className="border-2 border-black"></td>
                                </tr>
                            );
                        })}
                        {/* Empty filler rows to maintain 19 rows layout */}
                        {Array.from({ length: Math.max(0, STUDENTS_PER_PAGE - students.length) }).map((_, i) => (
                            <tr key={`empty-${i}`} className="h-9">
                                <td className="border-2 border-black"></td>
                                <td className="border-2 border-black"></td>
                                {subjects.map(s => <td key={s.id} className="border-2 border-black"></td>)}
                                <td className="border-2 border-black"></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </main>

            {/* Spacer to push footer to the bottom */}
            <div className="flex-grow"></div>

            {/* Footer with adequate space and official look */}
            <footer className="mt-4 flex justify-between items-end font-bold px-4 border-t-2 border-black pt-4 pb-8 flex-shrink-0">
                <div className="text-center w-48">
                    <p className="mb-12">توقيع مدرس المادة</p>
                    <div className="w-full h-px bg-black opacity-40"></div>
                </div>
                <div className="text-center text-xs text-gray-400">
                    <p>نظام تربوي تك للإدارة المدرسية</p>
                    <p>صفحة {pageInfo.pageNumber} من {pageInfo.totalPages}</p>
                </div>
                <div className="text-center w-48">
                    <p className="mb-2 text-gray-700">مدير المدرسة</p>
                    <p className="text-lg font-black mb-12 underline decoration-double underline-offset-4">{settings.principalName}</p>
                    <div className="w-full h-px bg-black opacity-40"></div>
                </div>
            </footer>
        </div>
    );
}
