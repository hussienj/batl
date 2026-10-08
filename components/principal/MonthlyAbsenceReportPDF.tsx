import React from 'react';
import type { SchoolSettings, ClassData, Student } from '../../types.ts';

interface MonthlyAbsenceReportPDFProps {
    settings: SchoolSettings;
    classData: ClassData;
    students: Student[];
    monthlyAbsences: Record<string, Record<string, any>>;
    currentMonthTotals?: Record<string, { absentDays: number; runawayLessons: number; totalDays: number }>;
    yearTotals?: Record<string, { totalDays: number; absentDays: number; runawayLessons: number; runawayDays: number; warning: string }>;
    month: string;
}

const LiftedContent: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ position: 'relative', bottom: '2px' }}>{children}</div>
);

const parseRecord = (val: any): { status: string; lessons: number } => {
    if (!val) return { status: 'present', lessons: 0 };
    if (typeof val === 'string') {
        if (val.startsWith('runaway_') || val.startsWith('runaway:')) {
            const lessons = parseInt(val.split(/[_\:]/)[1], 10) || 1;
            return { status: 'runaway', lessons };
        }
        if (val === 'runaway') return { status: 'runaway', lessons: 1 };
        return { status: val, lessons: 0 };
    }
    if (typeof val === 'object') {
        return {
            status: val.status || 'present',
            lessons: val.lessons || (val.status === 'runaway' ? 1 : 0)
        };
    }
    return { status: 'present', lessons: 0 };
};

export default function MonthlyAbsenceReportPDF({
    settings,
    classData,
    students,
    monthlyAbsences,
    currentMonthTotals = {},
    yearTotals = {},
    month
}: MonthlyAbsenceReportPDFProps) {
    const [year, monthNum] = month.split('-');
    
    return (
        <div className="w-[794px] h-[1123px] bg-white p-6 pb-8 flex flex-col font-['Cairo'] text-gray-900" dir="rtl">
            <header className="text-center font-bold mb-3 border-b-2 border-gray-800 pb-2">
                <div className="flex justify-between items-center text-xs mb-1">
                    <span>جمهورية العراق - وزارة التربية</span>
                    <span>المديرية العامة لتربية {settings.governorateName || settings.directorate || 'المحافظة'}</span>
                    <span>مدرسة: {settings.schoolName}</span>
                </div>
                <h1 className="text-xl font-black mt-1 text-gray-900">سجل وخلاصة الغيابات الشهرية والتراكمية للطلبة</h1>
                <div className="flex justify-around text-xs mt-1.5 font-bold bg-gray-100 p-1.5 rounded border border-gray-300">
                    <span>الصف والمرحلة: <strong className="text-blue-900">{classData.stage}</strong></span>
                    <span>الشعبة: <strong className="text-blue-900">({classData.section})</strong></span>
                    <span>الشهر: <strong>{monthNum} / {year}</strong></span>
                    <span>العام الدراسي: <strong>{settings.academicYear}</strong></span>
                </div>
            </header>

            <main className="flex-grow">
                <table className="w-full border-collapse border border-gray-800 text-[10px]">
                    <thead>
                        <tr className="bg-gray-200 font-bold text-center">
                            <th className="border border-gray-800 p-1 w-6">ت</th>
                            <th className="border border-gray-800 p-1 min-w-[130px] text-right pr-2">اسم الطالب</th>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                                <th key={day} className="border border-gray-800 p-0.5 w-[16px] text-center text-[9px]">
                                    {day}
                                </th>
                            ))}
                            <th className="border border-gray-800 p-1 w-10 text-center" title="غيابات الشهر الحالي">غياب الشهر</th>
                            <th className="border border-gray-800 p-1 w-10 text-center bg-yellow-100" title="مجموع الغيابات التراكمي لجميع شهور العام الدراسي (كل 4 حصص هروب = يوم غياب)">مجموع العام</th>
                            <th className="border border-gray-800 p-1 min-w-[70px] text-center">الملاحظات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((student, index) => {
                            const monthData = currentMonthTotals[student.id] || { absentDays: 0, runawayLessons: 0, totalDays: 0 };
                            const yearData = yearTotals[student.id] || { totalDays: 0, absentDays: 0, runawayLessons: 0, runawayDays: 0, warning: '' };
                            
                            return (
                                <tr key={student.id} className={`h-5 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                    <td className="border border-gray-800 text-center font-bold">
                                        <LiftedContent>{index + 1}</LiftedContent>
                                    </td>
                                    <td className="border border-gray-800 text-right pr-1 font-semibold truncate max-w-[130px]">
                                        <LiftedContent>{student.name}</LiftedContent>
                                    </td>
                                    {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
                                        const dayStr = String(day).padStart(2, '0');
                                        const raw = monthlyAbsences[dayStr]?.[student.id];
                                        const rec = parseRecord(raw);
                                        let symbol = '';
                                        let colorClass = '';

                                        if (rec.status === 'absent') {
                                            symbol = 'غ';
                                            colorClass = 'text-red-700 font-bold';
                                        } else if (rec.status === 'excused') {
                                            symbol = 'م';
                                            colorClass = 'text-yellow-700 font-bold';
                                        } else if (rec.status === 'runaway') {
                                            symbol = rec.lessons > 1 ? `هـ${rec.lessons}` : 'هـ';
                                            colorClass = 'text-blue-700 font-bold';
                                        }

                                        return (
                                            <td key={day} className={`border border-gray-800 text-center p-0 ${colorClass}`}>
                                                <LiftedContent>{symbol}</LiftedContent>
                                            </td>
                                        );
                                    })}
                                    <td className="border border-gray-800 text-center font-bold">
                                        <LiftedContent>{monthData.totalDays || 0}</LiftedContent>
                                    </td>
                                    <td className="border border-gray-800 text-center font-black bg-yellow-50 text-red-800">
                                        <LiftedContent>{yearData.totalDays || 0}</LiftedContent>
                                    </td>
                                    <td className={`border border-gray-800 text-center font-bold text-[9px] px-0.5 ${
                                        yearData.warning === 'تبليغ نهائي' ? 'text-red-700 font-black' :
                                        yearData.warning === 'تبليغ ثاني' ? 'text-orange-700' :
                                        yearData.warning === 'تبليغ اولي' ? 'text-amber-700' : 'text-gray-400'
                                    }`}>
                                        <LiftedContent>{yearData.warning || '-'}</LiftedContent>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </main>

            <footer className="mt-3 pt-2 border-t border-gray-400 flex justify-between items-center text-xs font-bold text-gray-700 px-4">
                <div>
                    <span>ملاحظة: الرموز المستخدمة: (غ: غائب) ، (م: مجاز) ، (هـ: هارب) - يتم احتساب كل 4 حصص هروب كيوم غياب واحد في المجموع العام.</span>
                </div>
                <div className="flex gap-8">
                    <span>معاون شؤون الطلبة: ....................</span>
                    <span>مدير المدرسة: {settings.principalName}</span>
                </div>
            </footer>
        </div>
    );
}
