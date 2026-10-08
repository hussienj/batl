
import React, { useMemo } from 'react';
import type { User, SchoolSettings, PublishedMonthlyResult } from '../../types.ts';

interface StudentMonthlyResultCardProps {
    student: User;
    settings: SchoolSettings;
    resultsData: Record<string, PublishedMonthlyResult>;
    schoolStamp?: string | null;
    studentPhotoUrl?: string | null;
}

const LiftedText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ position: 'relative', bottom: '5px' }}>
        {children}
    </div>
);

export default function StudentMonthlyResultCard({ student, settings, resultsData, schoolStamp = null, studentPhotoUrl = null }: StudentMonthlyResultCardProps) {
    
    const processedData = useMemo(() => {
        const subjectsMap = new Map<string, {
            s1_m1: number | null;
            s1_m2: number | null;
            s1_avg: number | null;
            mid_year: number | null;
            s2_m1: number | null;
            s2_m2: number | null;
            s2_avg: number | null;
            pursuit: number | null;
            final_exam: number | null;
            final_grade: number | null;
        }>();

        // Helper to find all unique subject names across all published keys
        const allSubjectNames = new Set<string>();
        Object.values(resultsData).forEach(result => {
            result.grades.forEach(g => allSubjectNames.add(g.subjectName));
        });

        allSubjectNames.forEach(subjectName => {
            const getGrade = (key: string) => {
                const res = resultsData[key]?.grades.find(g => g.subjectName === subjectName);
                return res ? res.grade : null;
            };

            subjectsMap.set(subjectName, {
                s1_m1: getGrade('firstSemMonth1'),
                s1_m2: getGrade('firstSemMonth2'),
                s1_avg: getGrade('firstSemAvg'),
                mid_year: getGrade('midYear'),
                s2_m1: getGrade('secondSemMonth1'),
                s2_m2: getGrade('secondSemMonth2'),
                s2_avg: getGrade('secondSemAvg'),
                pursuit: getGrade('annualPursuit'),
                final_exam: getGrade('finalExam'),
                final_grade: getGrade('finalGrade')
            });
        });

        return Array.from(subjectsMap.entries()).map(([subjectName, grades]) => ({
            subjectName,
            ...grades
        }));
    }, [resultsData]);

    const cardStyle: React.CSSProperties = {
        width: '850px',
        minHeight: '1123px',
        padding: '30px',
        backgroundColor: 'white',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Cairo', sans-serif",
        direction: 'rtl',
        boxShadow: '0 0 20px rgba(0,0,0,0.1)',
        borderRadius: '15px',
        border: '10px double #1e3a8a',
    };
    
    const renderGrade = (grade: number | null) => {
        if (grade === null || grade === undefined) return '';
        return grade;
    };

    const getGradeColor = (grade: number | null) => {
        if (grade !== null && grade < 50) return 'text-red-600 font-black';
        return 'text-gray-900 font-bold';
    };

    return (
        <div style={cardStyle} className="mx-auto bg-gradient-to-b from-white to-gray-50">
            <header className="flex-grow-0 border-b-4 border-blue-900 pb-6 mb-6">
                <div className="flex justify-between items-start">
                    <div className="w-1/3 text-right space-y-1">
                        <div className="bg-blue-900 text-white px-3 py-1 rounded-l-full inline-block font-bold mb-2">وزارة التربية</div>
                        <p className="font-bold text-blue-900">المديرية العامة للتربية في {settings.directorate || '......'}</p>
                        <p className="font-bold text-gray-700">إدارة: {settings.schoolName}</p>
                    </div>
                    <div className="text-center w-1/3">
                        <img src="https://i.imgur.com/jDSB6Ry.png" alt="Logo" className="w-24 h-24 mx-auto mb-2 rounded-full border-2 border-blue-900 shadow-md object-contain" />
                        <h1 className="text-2xl font-black text-blue-900">بطاقة كشف الدرجات</h1>
                        <div className="bg-yellow-400 text-blue-900 px-6 py-1 rounded-full inline-block font-black mt-2 shadow-sm border border-blue-900/20">
                            الدور الأول
                        </div>
                    </div>
                    <div className="text-left w-1/3 space-y-1">
                         <div className="bg-blue-900 text-white px-3 py-1 rounded-r-full inline-block font-bold mb-2">العام الدراسي</div>
                        <p className="text-xl font-black text-blue-900">{settings.academicYear}</p>
                        <p className="text-sm font-bold text-gray-500 italic">تاريخ الإصدار: {new Date().toLocaleDateString('ar-EG')}</p>
                    </div>
                </div>
                
                <div className="mt-6 flex items-stretch gap-4">
                    {/* Student Photo */}
                    <div className="w-28 h-28 flex-shrink-0 bg-white border-2 border-blue-900/30 p-1 rounded-2xl shadow-sm flex flex-col items-center justify-center text-center overflow-hidden">
                        {studentPhotoUrl ? (
                            <img src={studentPhotoUrl} alt="صورة الطالب" className="w-full h-full object-cover rounded-xl" />
                        ) : (
                            <div className="flex flex-col items-center justify-center text-gray-400 h-full p-1">
                                <UserIcon className="w-8 h-8 mb-1 text-blue-900/60" />
                                <span className="text-[10px] font-bold text-blue-900/70">صورة الطالب</span>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 grid grid-cols-2 gap-4">
                        <div className="bg-white border-2 border-blue-900/20 p-3 rounded-2xl shadow-sm flex items-center gap-4">
                            <div className="bg-blue-100 p-2 rounded-xl text-blue-700"><UserIcon className="w-6 h-6" /></div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold">اسم الطالب الرباعي</p>
                                <p className="text-xl font-black text-gray-800">{student.name}</p>
                            </div>
                        </div>
                        <div className="bg-white border-2 border-blue-900/20 p-3 rounded-2xl shadow-sm flex items-center gap-4">
                            <div className="bg-blue-100 p-2 rounded-xl text-blue-700"><Shield className="w-6 h-6" /></div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold">الصف والشعبة</p>
                                <p className="text-xl font-black text-gray-800">{student.stage} - {student.section}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-grow">
                <div className="overflow-hidden border-2 border-black rounded-xl shadow-md">
                    <table className="w-full border-collapse text-center">
                        <thead>
                            <tr className="bg-blue-900 text-white text-sm font-bold">
                                <th rowSpan={2} className="border-b border-l border-white/20 p-3 w-[18%] align-middle"><LiftedText>المادة الدراسية</LiftedText></th>
                                <th colSpan={3} className="border-b border-l border-white/20 p-1 bg-blue-800/50"><LiftedText>الفصل الدراسي الأول</LiftedText></th>
                                <th rowSpan={2} className="border-b border-l border-white/20 p-2 w-[8%] align-middle bg-yellow-500 text-blue-900 font-black"><LiftedText>نصف السنة</LiftedText></th>
                                <th colSpan={3} className="border-b border-l border-white/20 p-1 bg-green-800/50"><LiftedText>الفصل الدراسي الثاني</LiftedText></th>
                                <th rowSpan={2} className="border-b border-l border-white/20 p-2 w-[8%] align-middle bg-orange-500 font-black"><LiftedText>السعي السنوي</LiftedText></th>
                                <th rowSpan={2} className="border-b border-l border-white/20 p-2 w-[8%] align-middle bg-red-600 font-black"><LiftedText>الامتحان النهائي</LiftedText></th>
                                <th rowSpan={2} className="border-b border-white/20 p-2 w-[10%] align-middle bg-indigo-700 font-black"><LiftedText>النتيجة النهائية</LiftedText></th>
                            </tr>
                            <tr className="bg-gray-800 text-white text-[10px] font-bold">
                                <th className="border-b border-l border-white/10 p-1 w-[6%]"><LiftedText>شهر ١</LiftedText></th>
                                <th className="border-b border-l border-white/10 p-1 w-[6%]"><LiftedText>شهر ٢</LiftedText></th>
                                <th className="border-b border-l border-white/10 p-1 w-[6%] bg-blue-700/30"><LiftedText>معدل</LiftedText></th>
                                <th className="border-b border-l border-white/10 p-1 w-[6%]"><LiftedText>شهر ١</LiftedText></th>
                                <th className="border-b border-l border-white/10 p-1 w-[6%]"><LiftedText>شهر ٢</LiftedText></th>
                                <th className="border-b border-l border-white/10 p-1 w-[6%] bg-green-700/30"><LiftedText>معدل</LiftedText></th>
                            </tr>
                        </thead>
                        <tbody>
                            {processedData.map((row, index) => {
                                const isOdd = index % 2 !== 0;
                                return (
                                    <tr key={row.subjectName} className={`text-sm h-11 ${isOdd ? 'bg-gray-50' : 'bg-white'} border-b border-gray-200`}>
                                        <td className="border-l border-gray-200 text-right pr-4 font-black text-blue-900 bg-blue-50/30">{row.subjectName}</td>
                                        
                                        <td className={`border-l border-gray-100 ${getGradeColor(row.s1_m1)}`}>{renderGrade(row.s1_m1)}</td>
                                        <td className={`border-l border-gray-100 ${getGradeColor(row.s1_m2)}`}>{renderGrade(row.s1_m2)}</td>
                                        <td className={`border-l border-gray-200 bg-blue-100/50 ${getGradeColor(row.s1_avg)}`}>{renderGrade(row.s1_avg)}</td>
                                        
                                        <td className={`border-l border-gray-200 bg-yellow-50 text-base ${getGradeColor(row.mid_year)}`}>{renderGrade(row.mid_year)}</td>
                                        
                                        <td className={`border-l border-gray-100 ${getGradeColor(row.s2_m1)}`}>{renderGrade(row.s2_m1)}</td>
                                        <td className={`border-l border-gray-100 ${getGradeColor(row.s2_m2)}`}>{renderGrade(row.s2_m2)}</td>
                                        <td className={`border-l border-gray-200 bg-green-100/50 ${getGradeColor(row.s2_avg)}`}>{renderGrade(row.s2_avg)}</td>
                                        
                                        <td className={`border-l border-gray-200 bg-orange-100/50 text-base ${getGradeColor(row.pursuit)}`}>{renderGrade(row.pursuit)}</td>
                                        <td className={`border-l border-gray-200 bg-red-100/30 text-base ${getGradeColor(row.final_exam)}`}>{renderGrade(row.final_exam)}</td>
                                        <td className={`bg-indigo-100/50 text-lg ${getGradeColor(row.final_grade)}`}>{renderGrade(row.final_grade)}</td>
                                    </tr>
                                );
                            })}
                            {/* Empty rows filler */}
                            {Array.from({ length: Math.max(0, 12 - processedData.length) }).map((_, index) => (
                                <tr key={`empty-${index}`} className={`h-11 border-b border-gray-100 ${(processedData.length + index) % 2 !== 0 ? 'bg-gray-50' : 'bg-white'}`}>
                                    <td className="border-l border-gray-200"></td><td className="border-l border-gray-100"></td><td className="border-l border-gray-100"></td><td className="border-l border-gray-200 bg-blue-100/10"></td><td className="border-l border-gray-200 bg-yellow-50/20"></td><td className="border-l border-gray-100"></td><td className="border-l border-gray-100"></td><td className="border-l border-gray-200 bg-green-100/10"></td><td className="border-l border-gray-200 bg-orange-50/20"></td><td className="border-l border-gray-200 bg-red-50/10"></td><td className="bg-indigo-50/20"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </main>

            <footer className="flex-grow-0 mt-8">
                <div className="flex justify-between items-center mb-8">
                    <div className="flex-1 border-2 border-blue-900/20 p-4 rounded-3xl bg-blue-50/50 shadow-inner">
                        <p className="text-center text-sm font-bold text-blue-900 mb-1">الملاحظات العامة</p>
                        <div className="h-20 flex items-center justify-center text-gray-400 italic text-xs">توقيع ولي الأمر: .......................................</div>
                    </div>
                    <div className="mx-8 flex justify-center">
                        {schoolStamp && (
                            <div className="w-32 h-32 flex items-center justify-center p-2 border-4 border-double border-red-600 rounded-full opacity-80 rotate-12">
                                 <img src={schoolStamp} alt="School Stamp" className="max-w-full max-h-full object-contain grayscale" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 text-center space-y-4">
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-gray-500">مدير المدرسة</p>
                            <p className="text-2xl font-black text-blue-900 underline decoration-double underline-offset-4">{settings.principalName}</p>
                        </div>
                        <div className="pt-4">
                            <p className="text-xs text-gray-400 font-bold">توقيع مرشد الصف</p>
                            <div className="w-32 h-px bg-gray-300 mx-auto mt-6"></div>
                        </div>
                    </div>
                </div>
                
                <div className="text-center pt-4 border-t border-gray-200">
                    <p className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Generated by TrbaweTK Smart School Management System</p>
                </div>
            </footer>
        </div>
    );
}

const UserIcon = ({className}:{className?: string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
);

const Shield = ({className}:{className?: string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
);
