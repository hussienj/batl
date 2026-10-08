import React from 'react';
import type { SchoolSettings } from '../../types.ts';

export interface ColumnDef {
    id: string;
    title: string;
    minWidth?: string;
    isCustom?: boolean;
}

export interface StudentRowData {
    seq: number;
    id: string;
    name: string;
    section: string;
    examId?: string;
    values: Record<string, string>; // columnId -> value/status
}

interface TextbookDistributionPDFPageProps {
    settings: SchoolSettings;
    stageName: string;
    sectionName: string;
    academicYear: string;
    columns: ColumnDef[];
    students: StudentRowData[];
    pageNumber: number;
    totalPages: number;
    schoolLogo?: string | null;
    ministryLogo?: string | null;
    customNote?: string;
    counselorName?: string;
    totalExpectedRows?: number; // default 20
}

export default function TextbookDistributionPDFPage({
    settings,
    stageName,
    sectionName,
    academicYear,
    columns,
    students,
    pageNumber,
    totalPages,
    schoolLogo,
    ministryLogo,
    customNote,
    counselorName = '',
    totalExpectedRows = 20,
}: TextbookDistributionPDFPageProps) {
    // Fill remaining rows up to totalExpectedRows (20) to guarantee uniform height
    const rowsToDisplay: (StudentRowData | null)[] = [...students];
    while (rowsToDisplay.length < totalExpectedRows) {
        rowsToDisplay.push(null);
    }

    const isDense = columns.length > 8;
    const isVeryDense = columns.length > 11;

    return (
        <div 
            className="w-[1123px] h-[794px] p-5 bg-white flex flex-col justify-between font-['Cairo'] text-black border-2 border-black box-border"
            style={{ width: '1123px', height: '794px', minWidth: '1123px', minHeight: '794px' }}
            dir="rtl"
        >
            {/* Header */}
            <div>
                <div className="flex items-center justify-between border-b-2 border-black pb-1.5 mb-1.5">
                    {/* Right side: Ministry Info */}
                    <div className="text-right w-1/4">
                        <p className="text-[11px] font-bold leading-tight">جمهورية العراق</p>
                        <p className="text-xs font-extrabold leading-tight">وزارة التربية</p>
                        <p className="text-[10px] font-semibold text-gray-700 leading-tight">{settings.directorate || 'المديرية العامة للتربية'}</p>
                        <p className="text-[11px] font-bold text-cyan-900 leading-tight">مدرسة: {settings.schoolName}</p>
                    </div>

                    {/* Center: Title & Class info */}
                    <div className="text-center flex-1 px-2">
                        <h1 className="text-lg font-black tracking-wide text-gray-900 leading-tight">
                            سجل تسليم واستلام الكتب المدرسية
                        </h1>
                        <div className="inline-flex items-center justify-center gap-3 mt-1 px-3 py-0.5 bg-gray-100 border border-black rounded text-[11px] font-bold">
                            <span>العام الدراسي: {academicYear || settings.academicYear}</span>
                            <span className="text-gray-400">|</span>
                            <span>المرحلة: {stageName || 'كافة المراحل'}</span>
                            <span className="text-gray-400">|</span>
                            <span>الشعبة: {sectionName || 'كافة الشعب'}</span>
                        </div>
                    </div>

                    {/* Left side: Logos & Page Info */}
                    <div className="text-left w-1/4 flex flex-col items-end">
                        <div className="flex items-center gap-2 mb-1">
                            {ministryLogo ? (
                                <img src={ministryLogo} alt="وزارة التربية" className="w-8 h-8 object-contain" />
                            ) : null}
                            {schoolLogo ? (
                                <img src={schoolLogo} alt="المدرسة" className="w-8 h-8 object-contain rounded-full border border-gray-300" />
                            ) : null}
                        </div>
                        <span className="text-[10px] font-bold bg-gray-100 px-2 py-0.5 rounded border border-gray-400">
                            صفحة ({pageNumber}) من ({totalPages})
                        </span>
                    </div>
                </div>

                {/* Table */}
                <table className={`w-full border-collapse border border-black text-center ${isVeryDense ? 'text-[9.5px]' : isDense ? 'text-[10.5px]' : 'text-xs'}`}>
                    <thead>
                        <tr style={{ backgroundColor: '#e2efda' }} className="font-extrabold text-gray-900">
                            <th className="border border-black px-1 py-1 w-7 text-center">ت</th>
                            <th className={`border border-black px-1.5 py-1 ${isVeryDense ? 'min-w-[130px] max-w-[150px]' : isDense ? 'min-w-[140px] max-w-[170px]' : 'min-w-[160px] max-w-[200px]'} text-right font-bold`}>
                                اسم الطالب
                            </th>
                            <th className="border border-black px-1 py-1 w-11 text-center">
                                الشعبة
                            </th>
                            {columns.map(col => (
                                <th 
                                    key={col.id} 
                                    className="border border-black px-1 py-1 font-bold text-center leading-tight"
                                    style={{ minWidth: col.minWidth || (isVeryDense ? '45px' : isDense ? '55px' : '65px') }}
                                >
                                    {col.title}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rowsToDisplay.map((row, idx) => {
                            const isOddRow = idx % 2 === 0; // row 0 is warm tinted, row 1 is white
                            const bgColor = isOddRow ? '#fff2cc' : '#ffffff';
                            const seqNumber = row ? row.seq : (students.length > 0 ? students[0].seq + idx : idx + 1);

                            if (!row) {
                                return (
                                    <tr key={`empty-${idx}`} style={{ backgroundColor: bgColor, height: '24px' }}>
                                        <td className="border border-black px-0.5 py-0.5 font-bold text-gray-400">{seqNumber}</td>
                                        <td className="border border-black px-1 py-0.5 text-right"></td>
                                        <td className="border border-black px-0.5 py-0.5"></td>
                                        {columns.map(col => (
                                            <td key={col.id} className="border border-black px-0.5 py-0.5"></td>
                                        ))}
                                    </tr>
                                );
                            }

                            return (
                                <tr 
                                    key={row.id || `row-${idx}`} 
                                    style={{ backgroundColor: bgColor, height: '24px' }}
                                    className="hover:bg-amber-100 transition-colors"
                                >
                                    <td className="border border-black px-0.5 py-0.5 font-bold text-center">
                                        {row.seq}
                                    </td>
                                    <td className="border border-black px-1.5 py-0.5 text-right font-bold text-gray-900 truncate">
                                        {row.name}
                                    </td>
                                    <td className="border border-black px-0.5 py-0.5 font-semibold text-center">
                                        {row.section}
                                    </td>
                                    {columns.map(col => {
                                        const cellVal = row.values[col.id] || '';
                                        return (
                                            <td key={col.id} className="border border-black px-0.5 py-0.5 text-center font-medium">
                                                {cellVal === 'delivered' ? '✔' : cellVal}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Footer with Signatures & Official verification */}
            <div className="mt-1 pt-1.5 border-t-2 border-black text-xs font-bold">
                {customNote && (
                    <p className="text-[10.5px] text-gray-600 mb-1 leading-snug">
                        ملاحظة: {customNote}
                    </p>
                )}
                <div className="grid grid-cols-2 text-center gap-12 pt-0.5 max-w-2xl mx-auto">
                    <div>
                        <p className="font-extrabold text-gray-800 text-[11px]">معاون شؤون الطلبة</p>
                        <p className="mt-0.5 text-gray-600 font-semibold text-[11px]">{counselorName || '.....................................'}</p>
                        <p className="text-[9.5px] text-gray-400 mt-2">التوقيع</p>
                    </div>
                    <div>
                        <p className="font-extrabold text-gray-800 text-[11px]">مدير المدرسة</p>
                        <p className="mt-0.5 text-gray-900 font-black text-[11px]">{settings.principalName || '.....................................'}</p>
                        <p className="text-[9.5px] text-gray-400 mt-2">التوقيع والختم الرسمي</p>
                    </div>
                </div>
                <div className="flex justify-between items-center text-[8.5px] text-gray-400 mt-1.5">
                    <span>* تم إعداد هذا السجل وفق الضوابط والتعليمات الوزارية المعتمدة لتوزيع واستلام الكتب المدرسية.</span>
                    <span>نظام تربوي تك للإدارة المدرسية الحديثة</span>
                </div>
            </div>
        </div>
    );
}
