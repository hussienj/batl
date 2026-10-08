
import React from 'react';
import type { SchoolSettings, ExamAbsenceRecord } from '../../types.ts';

interface AbsenceListPageProps {
    settings: SchoolSettings;
    stages: string[];
    stageSubjects: Record<string, string>;
    date: string;
    absences: ExamAbsenceRecord[];
}

const SECTOR_COLORS = [
    '#f8fafc', // Default
    '#f0f9ff', // Blue
    '#f5f3ff', // Violet
    '#fff7ed', // Orange
    '#f0fdf4', // Green
    '#fff1f2', // Rose
    '#fdf4ff', // Fuchsia
    '#f0fdfa', // Teal
];

export default function AbsenceListPage({ settings, stages, stageSubjects, date, absences }: AbsenceListPageProps) {
    const STUDENTS_PER_PAGE = 20;

    // Split absences into pages
    const pages = React.useMemo(() => {
        const chunks: ExamAbsenceRecord[][] = [];
        for (let i = 0; i < absences.length; i += STUDENTS_PER_PAGE) {
            chunks.push(absences.slice(i, i + STUDENTS_PER_PAGE));
        }
        return chunks.length > 0 ? chunks : [[]]; // At least one page even if empty
    }, [absences]);

    return (
        <div className="flex flex-col gap-8 bg-gray-100 p-8 items-center" dir="rtl">
            {pages.map((pageAbsences, pageIdx) => {
                // Group absences by Hall + Sector for this specific page
                const grouped = (() => {
                    const groups: Record<string, ExamAbsenceRecord[]> = {};
                    pageAbsences.forEach(abs => {
                        const key = `H${abs.hallNumber}-S${abs.sectorNumber}`;
                        if (!groups[key]) groups[key] = [];
                        groups[key].push(abs);
                    });
                    // Sort groups by hall then sector
                    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
                })();

                return (
                    <div 
                        key={pageIdx} 
                        className="w-[794px] h-[1123px] bg-white p-10 flex flex-col font-['Cairo'] relative shadow-2xl pdf-page border border-gray-300"
                    >
                        {/* Header Design */}
                        <div className="border-4 border-double border-blue-900 p-1 mb-6">
                            <header className="border-2 border-blue-900 p-4 text-center bg-blue-50">
                                <h1 className="text-3xl font-black text-blue-900">قائمة غيابات الطلبة اليومية</h1>
                                
                                <div className="mt-4 text-sm font-bold">
                                    <p className="mb-3 text-blue-900">التاريخ: <span className="underline">{date}</span></p>
                                    
                                    <div className="flex justify-center flex-wrap gap-x-12 gap-y-2">
                                        {stages.map(stage => (
                                            <div key={stage} className="text-center">
                                                <p className="text-blue-700 text-base">{stage}</p>
                                                <p className="text-red-600 text-sm mt-1">{stageSubjects[stage] || 'لم تحدد المادة'}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </header>
                        </div>

                        <main className="flex-grow">
                            <table className="w-full border-collapse border-2 border-black table-fixed">
                                <thead className="bg-blue-900 text-white text-xs">
                                    <tr>
                                        <th className="border-2 border-black p-2 w-[5%]">ت</th>
                                        <th className="border-2 border-black p-2 w-[28%]">اسم الطالب الغائب</th>
                                        <th className="border-2 border-black p-2 w-[10%]">الصف</th>
                                        <th className="border-2 border-black p-2 w-[6%]">الشعبة</th>
                                        <th className="border-2 border-black p-2 w-[6%]">القاعة</th>
                                        <th className="border-2 border-black p-2 w-[6%]">قطاع</th>
                                        <th className="border-2 border-black p-2 w-[12%]">رقمه</th>
                                        <th className="border-2 border-black p-2 w-[8%]">الحالة</th>
                                        <th className="border-2 border-black p-2 w-[12%]">المراقب</th>
                                        <th className="border-2 border-black p-2 w-[7%]">التوقيع</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        let overallIndex = (pageIdx * STUDENTS_PER_PAGE) + 1;
                                        return grouped.map(([groupKey, groupAbsences], groupIdx) => {
                                            const rowBg = SECTOR_COLORS[groupIdx % SECTOR_COLORS.length];
                                            
                                            return groupAbsences.map((abs, subIdx) => (
                                                <tr key={abs.studentId} className="h-10 text-center text-[10px]">
                                                    <td className="border-2 border-black p-1 font-bold" style={{ backgroundColor: rowBg }}>{overallIndex++}</td>
                                                    <td className="border-2 border-black p-1 text-right px-2 font-black whitespace-nowrap overflow-hidden" style={{ backgroundColor: rowBg }}>
                                                        <span>{abs.studentName}</span>
                                                    </td>
                                                    <td className="border-2 border-black p-1 font-bold text-blue-900 truncate" style={{ backgroundColor: rowBg }}>{abs.stage}</td>
                                                    <td className="border-2 border-black p-1 font-bold" style={{ backgroundColor: rowBg }}>{abs.section}</td>
                                                    <td className="border-2 border-black p-1 font-black" style={{ backgroundColor: rowBg }}>{abs.hallNumber}</td>
                                                    <td className="border-2 border-black p-1 font-black" style={{ backgroundColor: rowBg }}>{abs.sectorNumber}</td>
                                                    <td className="border-2 border-black p-1 font-mono font-black text-cyan-800" style={{ backgroundColor: rowBg }}>{abs.examId}</td>
                                                    <td className="border-2 border-black p-1 font-bold" style={{ backgroundColor: rowBg }}>
                                                        {abs.isExempt ? (
                                                            <span className="text-purple-600">معفو</span>
                                                        ) : abs.status === 'excused' ? (
                                                            <span className="text-blue-600">مجاز</span>
                                                        ) : (
                                                            <span className="text-red-600">غائب</span>
                                                        )}
                                                    </td>
                                                    
                                                    {/* Merged Invigilator Cell */}
                                                    {subIdx === 0 && (
                                                        <td 
                                                            rowSpan={groupAbsences.length} 
                                                            className="border-2 border-black p-1 font-bold bg-white"
                                                        ></td>
                                                    )}
                                                    
                                                    {/* Merged Signature Cell */}
                                                    {subIdx === 0 && (
                                                        <td 
                                                            rowSpan={groupAbsences.length} 
                                                            className="border-2 border-black p-1 bg-white"
                                                        ></td>
                                                    )}
                                                </tr>
                                            ));
                                        });
                                    })()}
                                    
                                    {/* Empty padding rows to reach 20 rows per page exactly */}
                                    {Array.from({ length: STUDENTS_PER_PAGE - pageAbsences.length }).map((_, i) => (
                                        <tr key={`empty-${i}`} className="h-10">
                                            <td className="border-2 border-black p-1 text-[10px] font-bold">{(pageIdx * STUDENTS_PER_PAGE) + pageAbsences.length + i + 1}</td>
                                            <td className="border-2 border-black"></td>
                                            <td className="border-2 border-black"></td>
                                            <td className="border-2 border-black"></td>
                                            <td className="border-2 border-black"></td>
                                            <td className="border-2 border-black"></td>
                                            <td className="border-2 border-black"></td>
                                            <td className="border-2 border-black"></td>
                                            <td className="border-2 border-black"></td>
                                            <td className="border-2 border-black"></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </main>

                        <footer className="mt-8 flex justify-between items-end border-t-2 border-blue-900 pt-6 px-4">
                            <div className="text-center font-bold text-blue-900">
                                <p className="mb-12">عضو اللجنة الامتحانية</p>
                                <div className="w-48 h-px bg-blue-900 opacity-30"></div>
                            </div>
                            <div className="flex flex-col items-center">
                                <p className="text-[10px] text-gray-500 mb-2">صفحة {pageIdx + 1} من {pages.length}</p>
                                <div className="text-center font-bold text-blue-900">
                                    <p className="text-sm opacity-70 mb-1">مدير المدرسة</p>
                                    <p className="text-xl font-black">{settings.principalName}</p>
                                    <p className="mt-1 text-xs opacity-50 italic">الختم والتوقيع</p>
                                </div>
                            </div>
                        </footer>
                        
                        <div className="absolute bottom-4 left-0 right-0 text-center text-[8px] text-gray-400">
                            تم التوليد بواسطة نظام تربوي تك للإدارة المدرسية الذكية
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
