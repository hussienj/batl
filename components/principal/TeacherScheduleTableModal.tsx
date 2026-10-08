import React, { useState, useMemo } from 'react';
import type { User, ClassData, SchoolSettings } from '../../types.ts';
import {
    X,
    FileSpreadsheet,
    FileText,
    Printer,
    Search,
    Users,
    BookOpen,
    Clock,
    Layers,
    CheckCircle2,
    Loader2,
    Compass
} from 'lucide-react';
import {
    buildTeacherTableData,
    exportTeachersToExcel,
    exportTeachersToWord,
    type TeacherTableRowData
} from './TeacherTableExporter.ts';

interface TeacherScheduleTableModalProps {
    isOpen: boolean;
    onClose: () => void;
    teachers: User[];
    classes: ClassData[];
    classQuotas?: Record<string, Record<string, number>>;
    settings?: SchoolSettings;
}

export default function TeacherScheduleTableModal({
    isOpen,
    onClose,
    teachers,
    classes,
    classQuotas = {},
    settings
}: TeacherScheduleTableModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStageFilter, setSelectedStageFilter] = useState<string>('all');
    const [isExportingWord, setIsExportingWord] = useState(false);
    const [isExportingExcel, setIsExportingExcel] = useState(false);

    const fullTableData = useMemo(() => {
        return buildTeacherTableData(teachers, classes, classQuotas, settings?.schoolLevel);
    }, [teachers, classes, classQuotas, settings?.schoolLevel]);

    const filteredData = useMemo(() => {
        return fullTableData.filter(row => {
            const q = searchQuery.toLowerCase().trim();
            const matchesSearch = !q ||
                (row.name && row.name.toLowerCase().includes(q)) ||
                (row.subjects && row.subjects.toLowerCase().includes(q)) ||
                (row.stages && row.stages.toLowerCase().includes(q)) ||
                (row.sections && row.sections.toLowerCase().includes(q));

            const matchesStage =
                selectedStageFilter === 'all' ||
                (row.stages && row.stages.includes(selectedStageFilter));

            return matchesSearch && matchesStage;
        });
    }, [fullTableData, searchQuery, selectedStageFilter]);

    const uniqueStages = useMemo(() => {
        const set = new Set<string>();
        classes.forEach(c => {
            if (c.stage) set.add(c.stage);
        });
        return Array.from(set);
    }, [classes]);

    const totalWeeklyPeriods = useMemo(() => {
        return fullTableData.reduce((sum, r) => sum + r.weeklyPeriods, 0);
    }, [fullTableData]);

    const filteredTotalWeeklyPeriods = useMemo(() => {
        return filteredData.reduce((sum, r) => sum + r.weeklyPeriods, 0);
    }, [filteredData]);

    if (!isOpen) return null;

    const handleExportExcel = () => {
        try {
            setIsExportingExcel(true);
            exportTeachersToExcel(fullTableData, settings);
        } catch (error) {
            console.error('Error exporting Excel:', error);
            alert('حدث خطأ أثناء تصدير ملف Excel.');
        } finally {
            setIsExportingExcel(false);
        }
    };

    const handleExportWord = async () => {
        try {
            setIsExportingWord(true);
            await exportTeachersToWord(fullTableData, settings);
        } catch (error) {
            console.error('Error exporting Word:', error);
            alert('حدث خطأ أثناء تصدير ملف Word.');
        } finally {
            setIsExportingWord(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-gray-200">
                {/* Modal Header */}
                <div className="bg-linear-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner">
                            <BookOpen className="w-6 h-6 text-cyan-300" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black tracking-wide">جدول توزيع الحصص والمواد والشعب للمدرسين</h3>
                            <p className="text-xs text-blue-200 mt-0.5 font-medium">
                                {settings?.schoolName || 'متوسطة بطل خيبر'} — العام الدراسي: {settings?.academicYear || '2025-2026'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                            title="إغلاق"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* KPI Ribbon */}
                <div className="bg-slate-50 border-b border-gray-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                            <Users className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 font-bold">عدد المدرسين</div>
                            <div className="text-lg font-black text-gray-900">{fullTableData.length} مدرس</div>
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 font-bold">مجموع الحصص الأسبوعية</div>
                            <div className="text-lg font-black text-emerald-800">{totalWeeklyPeriods} حصة</div>
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                            <Layers className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 font-bold">عدد الشعب الدراسية</div>
                            <div className="text-lg font-black text-amber-800">{classes.length} شعبة</div>
                        </div>
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-gray-200/80 shadow-xs flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-xs text-gray-500 font-bold">معدل النصاب للمدرس</div>
                            <div className="text-lg font-black text-indigo-800">
                                {fullTableData.length > 0 ? (totalWeeklyPeriods / fullTableData.length).toFixed(1) : 0} حصة
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filter and Action Bar */}
                <div className="p-4 bg-white border-b border-gray-200 flex flex-col md:flex-row items-center justify-between gap-3">
                    <div className="flex flex-1 flex-wrap items-center gap-3 w-full">
                        {/* Search Input */}
                        <div className="relative flex-1 min-w-[220px]">
                            <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="بحث باسم المدرس أو المادة أو الشعبة..."
                                className="w-full pl-3 pr-9 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Stage Filter */}
                        {uniqueStages.length > 0 && (
                            <select
                                value={selectedStageFilter}
                                onChange={(e) => setSelectedStageFilter(e.target.value)}
                                className="px-3 py-2 text-sm border border-gray-300 rounded-xl bg-gray-50 text-gray-700 font-bold focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="all">كل المراحل والصفوف</option>
                                {uniqueStages.map(stage => (
                                    <option key={stage} value={stage}>{stage}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Export Buttons */}
                    <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                        {/* Excel Export Button */}
                        <button
                            onClick={handleExportExcel}
                            disabled={isExportingExcel}
                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl shadow-xs hover:shadow-md transition-all disabled:opacity-50 cursor-pointer"
                            title="تصدير جدول المدرسين كملف Excel (.xlsx)"
                        >
                            {isExportingExcel ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                            )}
                            <span>تصدير Excel (.xlsx)</span>
                        </button>

                        {/* Word Export Button */}
                        <button
                            onClick={handleExportWord}
                            disabled={isExportingWord}
                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-bold text-sm rounded-xl shadow-xs hover:shadow-md transition-all disabled:opacity-50 cursor-pointer"
                            title="تصدير جدول المدرسين كملف Word (.docx)"
                        >
                            {isExportingWord ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <FileText className="w-4 h-4 text-blue-100" />
                            )}
                            <span>تصدير Word (.docx)</span>
                        </button>

                        {/* Print Button */}
                        <button
                            onClick={handlePrint}
                            className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm rounded-xl border border-gray-300 transition-colors"
                            title="طباعة الجدول"
                        >
                            <Printer className="w-4 h-4" />
                            <span>طباعة</span>
                        </button>
                    </div>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
                        <table className="w-full text-right border-collapse text-sm">
                            <thead>
                                <tr className="bg-linear-to-r from-slate-800 to-indigo-900 text-white font-black">
                                    <th className="py-3 px-3 text-center w-14 border-l border-white/10">التسلسل</th>
                                    <th className="py-3 px-4 border-l border-white/10 min-w-[180px]">اسم المدرس</th>
                                    <th className="py-3 px-4 border-l border-white/10 min-w-[160px]">الصفوف التي يدرسها</th>
                                    <th className="py-3 px-4 border-l border-white/10 min-w-[160px]">المواد التي يدرسها</th>
                                    <th className="py-3 px-4 border-l border-white/10 min-w-[180px]">الشعب</th>
                                    <th className="py-3 px-3 text-center min-w-[140px]">مجموع الحصص في الأسبوع</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredData.length > 0 ? (
                                    filteredData.map((row, idx) => (
                                        <tr
                                            key={row.id}
                                            className={`hover:bg-blue-50/60 transition-colors ${
                                                idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'
                                            }`}
                                        >
                                            <td className="py-3 px-3 text-center font-bold text-gray-600 border-l border-gray-200">
                                                {row.index}
                                            </td>
                                            <td className="py-3 px-4 border-l border-gray-200 font-bold text-gray-900">
                                                <div className="flex flex-col">
                                                    <span className="text-base text-gray-900">{row.name}</span>
                                                    {row.advisorInfo && (
                                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md mt-1 w-fit">
                                                            <Compass className="w-3 h-3" />
                                                            {row.advisorInfo}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 border-l border-gray-200 text-gray-800 font-medium">
                                                {row.stages}
                                            </td>
                                            <td className="py-3 px-4 border-l border-gray-200">
                                                <span className="font-semibold text-blue-900">{row.subjects}</span>
                                            </td>
                                            <td className="py-3 px-4 border-l border-gray-200 text-gray-700">
                                                <span className="bg-slate-100 text-slate-800 px-2 py-1 rounded-md text-xs font-semibold inline-block">
                                                    {row.sections}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-center">
                                                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-900 font-black text-sm rounded-full border border-blue-200 shadow-xs">
                                                    {row.weeklyPeriods} حصة
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="text-center py-12 text-gray-500 font-medium">
                                            لا توجد بيانات مطابقة لمعايير البحث.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {filteredData.length > 0 && (
                                <tfoot>
                                    <tr className="bg-slate-100 border-t-2 border-slate-300 font-black text-gray-900">
                                        <td colSpan={2} className="py-3 px-4 text-center border-l border-gray-300">
                                            المجموع: {filteredData.length} مدرس
                                        </td>
                                        <td colSpan={3} className="py-3 px-4 text-left border-l border-gray-300">
                                            إجمالي الحصص الأسبوعية:
                                        </td>
                                        <td className="py-3 px-3 text-center bg-blue-50 text-blue-900 text-base font-black">
                                            {filteredTotalWeeklyPeriods} حصة
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="bg-gray-100 border-t border-gray-200 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="text-xs text-gray-500 font-medium text-center sm:text-right">
                        💡 يتم احتساب الحصص الأسبوعية بناءً على نصاب المواد المحدد في خطة الجدول المدرسي أو المقررات المعتمدة لوزارة التربية.
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleExportExcel}
                            disabled={isExportingExcel}
                            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-xs transition disabled:opacity-50"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>تصدير Excel</span>
                        </button>
                        <button
                            onClick={handleExportWord}
                            disabled={isExportingWord}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-lg shadow-xs transition disabled:opacity-50"
                        >
                            <FileText className="w-3.5 h-3.5" />
                            <span>تصدير Word</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold text-xs rounded-lg transition"
                        >
                            إغلاق
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
