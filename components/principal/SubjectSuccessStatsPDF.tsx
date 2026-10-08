import React, { useMemo } from 'react';
import type { SchoolSettings, ClassData, Student, CalculatedGrade } from '../../types.ts';

import { calculateStudentResult } from '../../lib/gradeCalculator.ts';

interface SubjectSuccessStatsPDFProps {
    settings: SchoolSettings;
    classes: ClassData[]; // Sorted classes for a specific stage
    subjectName: string;
    examType: 'midYear' | 'finalYear';
}

interface StatRow {
    section: string;
    total: number;
    examined: number;
    absent: number;
    successful: number;
    failing: number;
    rate: string;
}

const LiftedText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ position: 'relative', bottom: '6px' }}>{children}</div>
);

export default function SubjectSuccessStatsPDF({ settings, classes, subjectName, examType }: SubjectSuccessStatsPDFProps) {
    const examLabel = examType === 'midYear' ? 'نصف السنة' : 'نهاية السنة';
    const stageName = classes[0]?.stage || '...';
    
    const tableStats = useMemo(() => {
        const rows: StatRow[] = [];
        const targetField = examType === 'midYear' ? 'midYear' : 'finalExam1st';

        classes.forEach(cls => {
            const activeStudents = (cls.students || []).filter(s => !s.enrollmentStatus || s.enrollmentStatus === 'active');
            let examined = 0;
            let absent = 0;
            let successful = 0;
            let failing = 0;
            let validTotal = 0;

            activeStudents.forEach(student => {
                let isExempt = false;
                if (examType === 'finalYear') {
                    const isMinisterial = ['الثالث متوسط', 'السادس العلمي', 'السادس الادبي', 'السادس ابتدائي'].some(m => cls?.stage?.includes(m));
                    const result = calculateStudentResult(student, cls.subjects || [], settings, cls, 'final');
                    
                    // A student is exempt if they have general exemption OR specific subject exemption
                    const subjectCalculated = result.finalCalculatedGrades[subjectName];
                    if (subjectCalculated?.isExempt && !isMinisterial) {
                        isExempt = true;
                    }
                }

                if (isExempt) {
                    return; // Skip exempt students entirely for this specific statistics report
                }

                validTotal++;
                
                const gradeObj = student.grades?.[subjectName];
                const gradeValue = gradeObj?.[targetField];
                
                // Logic for "examined" vs "absent"
                if (gradeValue === null || gradeValue === undefined || gradeValue === -1 || gradeValue === -2) {
                    absent++;
                } else {
                    examined++;
                    // Use raw exam grade for both mid-year and final exam stats
                    if (gradeValue >= 50) {
                        successful++;
                    } else {
                        failing++;
                    }
                }
            });

            // Adjust rate to reflect success among those who actually examined
            rows.push({
                section: cls.section,
                total: validTotal,
                examined,
                absent,
                successful,
                failing,
                rate: examined > 0 ? `${Math.round((successful / examined) * 100)}%` : '0%'
            });
        });

        return rows;
    }, [classes, subjectName, examType, settings]);


    const finalSummary = useMemo(() => {
        const summary = tableStats.reduce((acc, curr) => ({
            total: acc.total + curr.total,
            examined: acc.examined + curr.examined,
            absent: acc.absent + curr.absent,
            successful: acc.successful + curr.successful,
            failing: acc.failing + curr.failing,
        }), { total: 0, examined: 0, absent: 0, successful: 0, failing: 0 });

        const rate = summary.examined > 0 ? `${Math.round((summary.successful / summary.examined) * 100)}%` : '0%';
        return { ...summary, section: 'المجموع الكلي', rate };
    }, [tableStats]);

    const headerCellClass = "border-2 border-black p-2 font-bold text-center bg-gray-100 align-middle text-lg";
    const bodyCellClass = "border-2 border-black p-2 text-center h-14 font-black text-xl align-middle";

    return (
        <div className="w-[794px] h-[1123px] bg-white p-10 flex flex-col font-['Cairo'] relative" dir="rtl">
            <header className="mb-10 text-center flex-shrink-0">
                <div className="flex justify-between items-start mb-6">
                    <div className="w-1/3 text-right font-bold">
                        <p className="text-xl">المديرية العامة لتربية {settings.directorate || '...'}</p>
                        <p className="text-xl">{settings.schoolName}</p>
                    </div>
                    <div className="w-1/3">
                        <h1 className="text-3xl font-black text-blue-900 border-b-4 border-blue-900 pb-2 mb-2 inline-block">
                            إحصائيات النجاح
                        </h1>
                        <p className="text-xl font-bold mt-2">امتحان {examLabel}</p>
                    </div>
                    <div className="w-1/3 text-left font-bold">
                        <p className="text-xl">العام الدراسي</p>
                        <p className="text-xl">{settings.academicYear}</p>
                    </div>
                </div>

                <div className="flex justify-center gap-10 mt-4 bg-yellow-400 p-3 border-2 border-black rounded-lg shadow-sm">
                    <div className="text-center font-black text-2xl">
                        <LiftedText>المادة: <span className="text-red-700">{subjectName}</span></LiftedText>
                    </div>
                    <div className="text-center font-black text-2xl">
                        <LiftedText>الصف: <span className="text-blue-900">{stageName}</span></LiftedText>
                    </div>
                </div>
            </header>

            <main className="flex-grow">
                <table className="w-full border-collapse border-4 border-black shadow-lg">
                    <thead>
                        <tr>
                            <th className={headerCellClass + " w-[15%]"}><LiftedText>الشعبة</LiftedText></th>
                            <th className={headerCellClass + " w-[12%]"}><LiftedText>العدد الكلي</LiftedText></th>
                            <th className={headerCellClass + " w-[12%]"}><LiftedText>عدد الممتحنين</LiftedText></th>
                            <th className={headerCellClass + " w-[12%]"}><LiftedText>عدد الغائبين</LiftedText></th>
                            <th className={headerCellClass + " w-[12%]"}><LiftedText>الناجحون</LiftedText></th>
                            <th className={headerCellClass + " w-[12%]"}><LiftedText>الراسبون</LiftedText></th>
                            <th className={headerCellClass + " w-[15%] bg-green-200"}><LiftedText>نسبة النجاح</LiftedText></th>
                            <th className={headerCellClass}><LiftedText>المجموع</LiftedText></th>
                        </tr>
                    </thead>
                    <tbody>
                        {tableStats.map((row, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className={bodyCellClass + " font-black text-blue-900"}>{row.section}</td>
                                <td className={bodyCellClass}>{row.total}</td>
                                <td className={bodyCellClass}>{row.examined}</td>
                                <td className={bodyCellClass + " text-red-600"}>{row.absent}</td>
                                <td className={bodyCellClass + " text-green-700"}>{row.successful}</td>
                                <td className={bodyCellClass + " text-red-600"}>{row.failing}</td>
                                <td className={bodyCellClass + " bg-green-50/50 text-green-800"}>{row.rate}</td>
                                <td className={bodyCellClass}></td>
                            </tr>
                        ))}
                        
                        {/* Filling Rows */}
                        {Array.from({ length: Math.max(0, 10 - tableStats.length) }).map((_, i) => (
                            <tr key={`empty-${i}`} className="h-14">
                                <td className="border-2 border-black"></td>
                                <td className="border-2 border-black"></td>
                                <td className="border-2 border-black"></td>
                                <td className="border-2 border-black"></td>
                                <td className="border-2 border-black"></td>
                                <td className="border-2 border-black"></td>
                                <td className="border-2 border-black bg-green-50/50"></td>
                                <td className="border-2 border-black"></td>
                            </tr>
                        ))}
                        
                        {/* Summary Row */}
                        <tr className="bg-indigo-900 text-white font-black text-2xl h-20">
                            <td className="border-2 border-black text-center p-2"><LiftedText>{finalSummary.section}</LiftedText></td>
                            <td className="border-2 border-black text-center p-2"><LiftedText>{finalSummary.total}</LiftedText></td>
                            <td className="border-2 border-black text-center p-2"><LiftedText>{finalSummary.examined}</LiftedText></td>
                            <td className="border-2 border-black text-center p-2"><LiftedText>{finalSummary.absent}</LiftedText></td>
                            <td className="border-2 border-black text-center p-2"><LiftedText>{finalSummary.successful}</LiftedText></td>
                            <td className="border-2 border-black text-center p-2"><LiftedText>{finalSummary.failing}</LiftedText></td>
                            <td className="border-2 border-black text-center p-2 bg-green-600"><LiftedText>{finalSummary.rate}</LiftedText></td>
                            <td className="border-2 border-black text-center p-2"></td>
                        </tr>
                    </tbody>
                </table>
            </main>

            <footer className="mt-12 flex justify-between items-end font-bold text-xl px-4 flex-shrink-0">
                <div className="text-center w-64">
                    <p className="mb-16">توقيع مدرس المادة</p>
                    <div className="w-full h-px bg-black opacity-30"></div>
                </div>
                <div className="text-center w-64">
                    <p className="text-gray-700 text-base mb-1">مدير المدرسة</p>
                    <p className="text-2xl font-black">{settings.principalName}</p>
                    <div className="w-full h-px bg-black opacity-30 mt-16"></div>
                </div>
            </footer>
        </div>
    );
}
