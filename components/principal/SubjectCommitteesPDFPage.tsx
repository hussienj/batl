import React from 'react';
import type { SchoolSettings } from '../../types.ts';

export interface CommitteeRow {
    teacherId: string;
    teacherName: string;
    stage: string;
    stageShort: string;
    sections: string[];
}

export interface SubjectCommitteeData {
    subjectName: string;
    rows: CommitteeRow[];
}

interface SubjectCommitteesPDFPageProps {
    settings?: SchoolSettings;
    committees: SubjectCommitteeData[];
    sectionColumns: string[];
    pageNumber: number;
    totalPages: number;
}

const normalizeSectionLetter = (sec: string) => {
    if (!sec) return '';
    const trimmed = sec.trim();
    if (trimmed === 'ه' || trimmed === 'هـ') return 'هـ';
    return trimmed;
};

export default function SubjectCommitteesPDFPage({
    settings,
    committees,
    sectionColumns,
    pageNumber,
    totalPages
}: SubjectCommitteesPDFPageProps) {
    const schoolName = settings?.schoolName || 'متوسطة بطل خيبر';
    const academicYear = settings?.academicYear || '2025-2026';

    return (
        <div
            className="w-[794px] h-[1123px] bg-white p-8 flex flex-col justify-between font-['Cairo',sans-serif] text-black"
            dir="rtl"
            style={{ boxSizing: 'border-box' }}
        >
            {/* Page Header */}
            <div>
                <div className="flex justify-between items-center border-b-2 border-black pb-2 mb-4">
                    <div className="text-right">
                        <p className="text-xs font-bold text-gray-700">جمهورية العراق - وزارة التربية</p>
                        <p className="text-sm font-black text-black">{schoolName}</p>
                    </div>
                    <div className="text-center">
                        <h1 className="text-lg font-black text-black bg-gray-100 px-4 py-1 rounded border border-black">
                            توزيع نصاب الحصص والشعب حسب اللجان التخصصية
                        </h1>
                        <p className="text-xs font-bold text-gray-600 mt-0.5">للعام الدراسي {academicYear}</p>
                    </div>
                    <div className="text-left text-xs font-bold text-gray-500">
                        <span>صفحة {pageNumber} من {totalPages}</span>
                    </div>
                </div>

                {/* Committees Stack */}
                <div className="space-y-4">
                    {committees.map((committee) => {
                        const totalColSpan = 2 + sectionColumns.length;

                        return (
                            <div key={committee.subjectName} className="border-2 border-black rounded-xs overflow-hidden">
                                <table className="w-full border-collapse text-center">
                                    <thead>
                                        {/* Committee Header (Main Subject Title) */}
                                        <tr className="bg-slate-100 border-b-2 border-black">
                                            <th
                                                colSpan={totalColSpan}
                                                className="py-1.5 px-3 text-base font-black text-black text-center tracking-wide"
                                            >
                                                {committee.subjectName}
                                            </th>
                                        </tr>

                                        {/* Column Headers */}
                                        <tr className="bg-gray-50 border-b-2 border-black text-xs font-black text-black">
                                            <th className="py-1.5 px-2 border-l border-black w-[30%] text-right pr-3">
                                                اسم المدرس
                                            </th>
                                            <th className="py-1.5 px-2 border-l border-black w-[16%] text-center">
                                                الصف
                                            </th>
                                            <th
                                                colSpan={sectionColumns.length}
                                                className="py-1 px-1 text-center bg-gray-100"
                                            >
                                                الشعب
                                            </th>
                                        </tr>

                                        {/* Section Letters Sub-Header Row */}
                                        <tr className="bg-white border-b border-black text-xs font-black text-black">
                                            <th className="py-0.5 px-1 border-l border-black bg-gray-50"></th>
                                            <th className="py-0.5 px-1 border-l border-black bg-gray-50"></th>
                                            {sectionColumns.map((sec, idx) => (
                                                <th
                                                    key={idx}
                                                    className={`py-0.5 px-1 text-center font-bold text-xs ${
                                                        idx < sectionColumns.length - 1 ? 'border-l border-black' : ''
                                                    }`}
                                                    style={{ width: `${54 / sectionColumns.length}%` }}
                                                >
                                                    {sec}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>

                                    <tbody className="text-xs font-bold divide-y divide-black">
                                        {committee.rows.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={totalColSpan}
                                                    className="py-2 text-center text-gray-500 font-normal italic"
                                                >
                                                    لم يتم إسناد أي شعب لمدرسي هذه المادة بعد
                                                </td>
                                            </tr>
                                        ) : (
                                            committee.rows.map((row, rIdx) => {
                                                const normalizedRowSections = row.sections.map(normalizeSectionLetter);

                                                return (
                                                    <tr
                                                        key={`${row.teacherId}-${row.stage}-${rIdx}`}
                                                        className={rIdx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}
                                                    >
                                                        {/* Teacher Name */}
                                                        <td className="py-1.5 px-3 border-l border-black text-right font-black text-[13px] text-gray-900">
                                                            {row.teacherName}
                                                        </td>

                                                        {/* Stage */}
                                                        <td className="py-1.5 px-2 border-l border-black text-center font-black text-xs text-gray-800">
                                                            {row.stageShort || row.stage}
                                                        </td>

                                                        {/* Section Columns */}
                                                        {sectionColumns.map((secCol, sIdx) => {
                                                            const normCol = normalizeSectionLetter(secCol);
                                                            const hasSection = normalizedRowSections.includes(normCol);

                                                            return (
                                                                <td
                                                                    key={sIdx}
                                                                    className={`py-1.5 px-1 text-center font-black text-xs text-black ${
                                                                        hasSection ? 'bg-amber-100/60 font-black' : ''
                                                                    } ${
                                                                        sIdx < sectionColumns.length - 1 ? 'border-l border-black' : ''
                                                                    }`}
                                                                >
                                                                    {hasSection ? secCol : ''}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Page Footer */}
            <div className="pt-3 border-t border-black flex justify-between items-center text-xs font-bold text-gray-700">
                <div>نظام الإدارة المدرسية المتكامل &bull; توثيق نصاب اللجان التخصصية</div>
                <div className="flex items-center gap-12 pl-4">
                    <span>مدقق الجدول: ....................</span>
                    <span>مدير المدرسة: {settings?.principalName || '....................'}</span>
                </div>
            </div>
        </div>
    );
}
