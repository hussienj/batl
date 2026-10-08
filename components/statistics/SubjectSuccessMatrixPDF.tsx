
import React, { useMemo } from 'react';
import type { SchoolSettings, ClassData, Student, CalculatedGrade, User } from '../../types.ts';
import { calculateStudentResult } from '../../lib/gradeCalculator.ts';

interface SubjectSuccessMatrixPDFProps {
    settings: SchoolSettings;
    classData: ClassData;
    users: User[];
}

const LiftedText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ position: 'relative', bottom: '6px' }}>{children}</div>
);

const GroupHeader: React.FC<{ label: string; bgColor: string }> = ({ label, bgColor }) => (
    <th className={`border-2 border-black p-2 font-black text-xl text-center ${bgColor}`} colSpan={4}>
        <LiftedText>{label}</LiftedText>
    </th>
);

const SubHeader: React.FC<{ label: string; bgColor: string; className?: string }> = ({ label, bgColor, className = "" }) => (
    <th className={`border-2 border-black p-0 font-bold text-center text-xs align-middle h-32 w-[3.5%] ${bgColor} ${className}`}>
        <div className="flex items-center justify-center h-full w-full overflow-hidden relative">
            <span 
                className="absolute font-black text-[10pt]"
                style={{ 
                    transform: 'rotate(-90deg)', 
                    whiteSpace: 'nowrap',
                    width: '120px', 
                    textAlign: 'center',
                    display: 'block'
                }}
            >
                {label}
            </span>
        </div>
    </th>
);

export default function SubjectSuccessMatrixPDF({ settings, classData, users }: SubjectSuccessMatrixPDFProps) {
    const students = useMemo(() => (classData.students || []).filter(s => !s.enrollmentStatus || s.enrollmentStatus === 'active'), [classData.students]);
    const subjects = useMemo(() => classData.subjects || [], [classData.subjects]);

    const stats = useMemo(() => {
        const results: Record<string, {
            f1: { total: number, pass: number, fail: number, rate: string },
            mid: { total: number, pass: number, fail: number, rate: string },
            f2: { total: number, pass: number, fail: number, rate: string },
            pursuit: { total: number, pass: number, fail: number, rate: string },
            final: { total: number, pass: number, fail: number, rate: string },
            teacher: string
        }> = {};

        subjects.forEach(subject => {
            let f1_total = 0, f1_pass = 0, f1_fail = 0;
            let mid_total = 0, mid_pass = 0, mid_fail = 0;
            let f2_total = 0, f2_pass = 0, f2_fail = 0;
            let pur_total = 0, pur_pass = 0, pur_fail = 0;
            let final_total = 0, final_pass = 0, final_fail = 0;

            students.forEach(student => {
                const res = calculateStudentResult(student, subjects, settings, classData);
                const grades = student.grades?.[subject.name];
                const calculated = res.finalCalculatedGrades[subject.name];

                // F1
                if (grades?.firstTerm !== null && grades?.firstTerm !== undefined) {
                    f1_total++;
                    if (grades.firstTerm >= 50) f1_pass++; else f1_fail++;
                }
                // Mid
                if (grades?.midYear !== null && grades?.midYear !== undefined) {
                    mid_total++;
                    if (grades.midYear >= 50) mid_pass++; else mid_fail++;
                }
                // F2
                if (grades?.secondTerm !== null && grades?.secondTerm !== undefined) {
                    f2_total++;
                    if (grades.secondTerm >= 50) f2_pass++; else f2_fail++;
                }
                // Pursuit
                if (calculated?.annualPursuit !== null && calculated?.annualPursuit !== undefined) {
                    pur_total++;
                    if (calculated.annualPursuit >= 50) pur_pass++; else pur_fail++;
                }
                // Final Grade (End of Year)
                const finalGrade = calculated?.finalGradeWithDecision;
                const rawFinalExam = student.grades?.[subject.name]?.finalExam1st;
                const isExempt = calculated?.isExempt;

                if (isExempt) {
                    // Skip exempt students for statistics in this matrix
                } else if (rawFinalExam !== null && rawFinalExam !== undefined && rawFinalExam >= 0) {
                    final_total++;
                    if (rawFinalExam >= 50) final_pass++; else final_fail++;
                } else if (rawFinalExam === -1 || rawFinalExam === -2) {
                    final_total++;
                    final_fail++;
                }
            });

            const getRate = (pass: number, total: number) => total > 0 ? `${Math.round((pass / total) * 100)}%` : '---';

            const assignedTeacher = users.find(u => 
                u.role === 'teacher' && 
                u.assignments?.some(a => a.classId === classData.id && a.subjectId === subject.id)
            );

            results[subject.id] = {
                f1: { total: f1_total, pass: f1_pass, fail: f1_fail, rate: getRate(f1_pass, f1_total) },
                mid: { total: mid_total, pass: mid_pass, fail: mid_fail, rate: getRate(mid_pass, mid_total) },
                f2: { total: f2_total, pass: f2_pass, fail: f2_fail, rate: getRate(f2_pass, f2_total) },
                pursuit: { total: pur_total, pass: pur_pass, fail: pur_fail, rate: getRate(pur_pass, pur_total) },
                final: { total: final_total, pass: final_pass, fail: final_fail, rate: getRate(final_pass, final_total) },
                teacher: assignedTeacher?.name || '............'
            };
        });

        return results;
    }, [subjects, students, settings, classData, users]);

    return (
        <div className="w-[1123px] h-[794px] p-6 bg-white font-['Cairo'] flex flex-col" dir="rtl">
            <header className="mb-4">
                <h1 className="text-3xl font-black text-center text-blue-900 leading-tight">
                    الصف: {classData.stage} &nbsp;&nbsp; نسب النجاح حسب المواد الدراسية
                </h1>
                <div className="flex justify-between items-center px-10 text-xl font-bold mt-2">
                    <span>الشعبة : {classData.section}</span>
                    <span>للعام الدراسي {settings.academicYear}</span>
                </div>
            </header>

            <main className="flex-grow">
                <table className="w-full border-collapse border-4 border-black table-fixed">
                    <thead>
                        {/* Main Group Headers */}
                        <tr className="bg-yellow-400">
                            <th className="border-2 border-black p-2 font-black text-xl w-[15%] align-middle" rowSpan={2}><LiftedText>اسم المادة</LiftedText></th>
                            <GroupHeader label="معدل الفصل الأول" bgColor="bg-yellow-400" />
                            <GroupHeader label="نصف السنة" bgColor="bg-yellow-400" />
                            <GroupHeader label="معدل الفصل الثاني" bgColor="bg-yellow-400" />
                            <GroupHeader label="معدل السعي السنوي" bgColor="bg-yellow-400" />
                            <GroupHeader label="نهاية السنة" bgColor="bg-yellow-400" />
                            <th className="border-2 border-black p-2 font-black text-xl w-[15%] align-middle" rowSpan={2}><LiftedText>اسم المدرس</LiftedText></th>
                        </tr>
                        {/* Sub headers - Each takes exactly 3.5% (total 20 * 3.5 = 70% + 15% + 15% = 100%) */}
                        <tr className="h-32">
                            {/* Group 1 */}
                            <SubHeader label="العدد الكلي" bgColor="bg-green-300" />
                            <SubHeader label="الناجحين" bgColor="bg-green-300" />
                            <SubHeader label="الراسبين" bgColor="bg-green-300" />
                            <SubHeader label="النسبة" bgColor="bg-green-300" />
                            {/* Group 2 */}
                            <SubHeader label="العدد الكلي" bgColor="bg-cyan-300" />
                            <SubHeader label="الناجحين" bgColor="bg-cyan-300" />
                            <SubHeader label="الراسبين" bgColor="bg-cyan-300" />
                            <SubHeader label=" النسبة" bgColor="bg-cyan-300" />
                            {/* Group 3 */}
                            <SubHeader label="العدد الكلي" bgColor="bg-pink-300" />
                            <SubHeader label="الناجحين" bgColor="bg-pink-300" />
                            <SubHeader label="الراسبين" bgColor="bg-pink-300" />
                            <SubHeader label="النسبة" bgColor="bg-pink-300" />
                            {/* Group 4 */}
                            <SubHeader label="العدد الكلي" bgColor="bg-violet-300" />
                            <SubHeader label="الناجحين" bgColor="bg-violet-300" />
                            <SubHeader label="الراسبين" bgColor="bg-violet-300" />
                            <SubHeader label="النسبة" bgColor="bg-violet-300" />
                            {/* Group 5 */}
                            <SubHeader label="العدد الكلي" bgColor="bg-orange-300" />
                            <SubHeader label="الناجحين" bgColor="bg-orange-300" />
                            <SubHeader label="الراسبين" bgColor="bg-orange-300" />
                            <SubHeader label="النسبة" bgColor="bg-orange-300" />
                        </tr>
                    </thead>
                    <tbody>
                        {subjects.map((subject, idx) => {
                            const s = stats[subject.id];
                            const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                            return (
                                <tr key={subject.id} className={`${rowBg} h-10 border-b border-black text-center font-bold text-sm`}>
                                    <td className="border-2 border-black text-right px-2 font-black text-base truncate"><LiftedText>{subject.name}</LiftedText></td>
                                    
                                    {/* F1 */}
                                    <td className="border border-black">{s.f1.total || ''}</td>
                                    <td className="border border-black">{s.f1.pass || ''}</td>
                                    <td className="border border-black">{s.f1.fail || ''}</td>
                                    <td className="border border-black bg-yellow-50 font-black">{s.f1.rate}</td>
                                    
                                    {/* Mid */}
                                    <td className="border border-black">{s.mid.total || ''}</td>
                                    <td className="border border-black">{s.mid.pass || ''}</td>
                                    <td className="border border-black">{s.mid.fail || ''}</td>
                                    <td className="border border-black bg-yellow-50 font-black">{s.mid.rate}</td>
                                    
                                    {/* F2 */}
                                    <td className="border border-black">{s.f2.total || ''}</td>
                                    <td className="border border-black">{s.f2.pass || ''}</td>
                                    <td className="border border-black">{s.f2.fail || ''}</td>
                                    <td className="border border-black bg-yellow-50 font-black">{s.f2.rate}</td>
                                    
                                    {/* Pursuit */}
                                    <td className="border border-black">{s.pursuit.total || ''}</td>
                                    <td className="border border-black">{s.pursuit.pass || ''}</td>
                                    <td className="border border-black">{s.pursuit.fail || ''}</td>
                                    <td className="border border-black bg-yellow-50 font-black">{s.pursuit.rate}</td>

                                    {/* Final */}
                                    <td className="border border-black">{s.final.total || ''}</td>
                                    <td className="border border-black">{s.final.pass || ''}</td>
                                    <td className="border border-black">{s.final.fail || ''}</td>
                                    <td className="border border-black bg-yellow-50 font-black">{s.final.rate}</td>

                                    <td className="border-2 border-black text-right px-2 text-xs truncate font-bold"><LiftedText>{s.teacher}</LiftedText></td>
                                </tr>
                            );
                        })}
                        {/* Filling Rows */}
                        {Array.from({ length: Math.max(0, 10 - subjects.length) }).map((_, i) => (
                             <tr key={`empty-${i}`} className="h-10 border-b border-black">
                                <td className="border-2 border-black"></td>
                                {Array.from({ length: 20 }).map((_, j) => <td key={j} className="border border-black"></td>)}
                                <td className="border-2 border-black"></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </main>

            <footer className="mt-4 flex justify-between items-end px-12 pb-4 font-bold text-lg">
                <div className="text-center w-64">
                    <p className="mb-12">توقيع مدرس المادة</p>
                    <div className="w-full h-px bg-black opacity-30"></div>
                </div>
                <div className="text-center w-64">
                    <p className="mb-2">مدير المدرسة</p>
                    <p className="text-2xl font-black underline decoration-double">{settings.principalName}</p>
                </div>
            </footer>
        </div>
    );
}
