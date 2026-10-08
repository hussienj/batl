import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { User, Teacher, ClassData, SchoolSettings } from '../../types.ts';
import { db } from '../../lib/firebase.ts';
import {
    MasterScheduleData,
    GeneralScheduleConfig,
    DAYS_ARABIC,
    DEFAULT_ACTIVE_DAYS,
    getPeriodsForDay,
    getMaxDailyPeriods
} from '../scheduling/schedulerAlgorithm.ts';
import {
    exportTeacherScheduleWord,
    exportElementDirectPDF,
    DAY_COLORS,
    PERIOD_COLORS
} from '../scheduling/ScheduleExporter.ts';
import {
    Calendar,
    Printer,
    FileDown,
    FileText,
    Clock,
    BookOpen,
    Users,
    Sparkles,
    CheckCircle2,
    Info,
    RefreshCw
} from 'lucide-react';

interface TeacherScheduleViewProps {
    teacher: Teacher;
    settings: SchoolSettings;
    classes: ClassData[];
}

export default function TeacherScheduleView({ teacher, settings, classes }: TeacherScheduleViewProps) {
    const [schedule, setSchedule] = useState<MasterScheduleData | null>(null);
    const [config, setConfig] = useState<GeneralScheduleConfig | null>(null);
    const [publishedDate, setPublishedDate] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
    const printAreaRef = useRef<HTMLDivElement>(null);

    const principalId = teacher.principalId || 'principal_al_hamza';

    const loadSchedule = async () => {
        setIsLoading(true);
        try {
            // First check published schedules
            const pubSnap = await db.ref(`published_schedules/${principalId}`).get();
            if (pubSnap.exists()) {
                const data = pubSnap.val();
                if (data.publishTarget === 'students' || data.publishedToTeachers === false) {
                    // Published for students only
                    setSchedule(null);
                    setConfig(null);
                    setPublishedDate(null);
                } else {
                    setSchedule(data.schedule || null);
                    setConfig(data.config || null);
                    setPublishedDate(data.publishedAt ? new Date(data.publishedAt).toLocaleDateString('ar-IQ', { dateStyle: 'long' }) : null);
                }
            } else {
                // Fallback to active schedule in weekly_schedule node
                const draftSnap = await db.ref(`weekly_schedule/${principalId}`).get();
                if (draftSnap.exists()) {
                    const data = draftSnap.val();
                    setSchedule(data.schedule || null);
                    setConfig(data.config || null);
                    setPublishedDate(data.updatedAt ? new Date(data.updatedAt).toLocaleDateString('ar-IQ', { dateStyle: 'long' }) : null);
                }
            }
        } catch (error) {
            console.error('Error fetching teacher schedule:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadSchedule();
    }, [principalId]);

    const activeDays = useMemo(() => {
        return (Array.isArray(config?.activeDays) && config.activeDays.length > 0)
            ? config.activeDays
            : DEFAULT_ACTIVE_DAYS;
    }, [config]);

    const maxPeriods = useMemo(() => {
        return getMaxDailyPeriods(config);
    }, [config]);

    // Build teacher's timetable cell map: { [day]: { [period]: { classId, stage, section, subject } } }
    const teacherGrid = useMemo(() => {
        const grid: Record<string, Record<number, { classId: string; stage: string; section: string; subject: string }>> = {};
        let totalCount = 0;
        const dailyCounts: Record<string, number> = {};
        const subjectCounts: Record<string, number> = {};
        const classCounts: Record<string, number> = {};

        activeDays.forEach(day => {
            grid[day] = {};
            dailyCounts[day] = 0;
            const periodsCount = getPeriodsForDay(day, config);
            const dayPeriods = schedule?.[day] || [];

            for (let p = 1; p <= periodsCount; p++) {
                const pData = dayPeriods.find(dp => dp.period === p);
                if (pData?.assignments) {
                    for (const [classId, assignRaw] of Object.entries(pData.assignments)) {
                        const assign = assignRaw as any;
                        if (!assign) continue;
                        const isTeacherMatch = assign.teacherId === teacher.id || 
                                              assign.teacher === teacher.name || 
                                              (teacher.name && assign.teacher?.trim().toLowerCase() === teacher.name.trim().toLowerCase());
                        
                        if (isTeacherMatch) {
                            const cls = classes.find(c => c.id === classId);
                            const stageName = cls ? cls.stage : (assign.stage || '');
                            const sectionName = cls ? cls.section : (assign.section || '');
                            const classLabel = `${stageName} - ${sectionName}`.trim();

                            grid[day][p] = {
                                classId,
                                stage: stageName,
                                section: sectionName,
                                subject: assign.subject
                            };

                            totalCount++;
                            dailyCounts[day] = (dailyCounts[day] || 0) + 1;
                            subjectCounts[assign.subject] = (subjectCounts[assign.subject] || 0) + 1;
                            classCounts[classLabel] = (classCounts[classLabel] || 0) + 1;
                            break;
                        }
                    }
                }
            }
        });

        return { grid, totalCount, dailyCounts, subjectCounts, classCounts };
    }, [schedule, config, activeDays, teacher, classes]);

    const handleDownloadPDF = async () => {
        if (!printAreaRef.current) return;
        setIsExportingPDF(true);
        try {
            const fileName = `جدول_الأستاذ_${teacher.name.replace(/\s+/g, '_')}.pdf`;
            await exportElementDirectPDF(printAreaRef.current, fileName, 'a4', 'landscape');
        } catch (e) {
            console.error('PDF export failed:', e);
            alert('حدث خطأ أثناء تصدير ملف الـ PDF. يرجى تجربة خيار الطباعة المباشرة.');
        } finally {
            setIsExportingPDF(false);
        }
    };

    const handlePrintDirect = () => {
        window.print();
    };

    const handleExportWord = () => {
        if (!schedule) return;
        exportTeacherScheduleWord([teacher], classes, schedule, settings, activeDays, config || 6);
    };

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
            {/* Action Bar / Header */}
            <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-emerald-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-2 z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-emerald-200 text-sm font-medium border border-white/10">
                        <Sparkles className="w-4 h-4 text-emerald-300" />
                        <span>بوابة الكادر التدريسي</span>
                        {publishedDate && <span>• تم النشر: {publishedDate}</span>}
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
                        <Calendar className="w-8 h-8 text-emerald-300" />
                        <span>جدول الحصص الأسبوعي: {teacher.name}</span>
                    </h1>
                    <p className="text-emerald-100 text-sm md:text-base max-w-2xl">
                        {settings.schoolName || 'المدرسة'} • العام الدراسي {settings.academicYear || '2025 - 2026'} • إجمالي النصاب: {teacherGrid.totalCount} حصة أسبوعياً
                    </p>
                </div>

                {/* Export Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 z-10">
                    <button
                        onClick={loadSchedule}
                        disabled={isLoading}
                        className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 border border-white/20"
                        title="تحديث البيانات"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        <span>تحديث</span>
                    </button>

                    <button
                        onClick={handleExportWord}
                        disabled={!schedule}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-blue-400 disabled:opacity-50"
                    >
                        <FileText className="w-4 h-4" />
                        <span>تصدير Word</span>
                    </button>

                    <button
                        onClick={handleDownloadPDF}
                        disabled={!schedule || isExportingPDF}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-rose-400 disabled:opacity-50"
                    >
                        <FileDown className="w-4 h-4" />
                        <span>{isExportingPDF ? 'جارِ التحميل...' : 'تصدير PDF'}</span>
                    </button>

                    <button
                        onClick={handlePrintDirect}
                        disabled={!schedule}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-900 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-amber-300 disabled:opacity-50"
                    >
                        <Printer className="w-4 h-4" />
                        <span>طباعة فورية</span>
                    </button>
                </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-black text-xl border border-emerald-200">
                        {teacherGrid.totalCount}
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-bold">إجمالي الحصص</div>
                        <div className="text-base font-extrabold text-gray-800">{teacherGrid.totalCount} حصة أسبوعياً</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-black text-xl border border-blue-200">
                        {Object.keys(teacherGrid.classCounts).length}
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-bold">الشعب المشمولة</div>
                        <div className="text-base font-extrabold text-gray-800">{Object.keys(teacherGrid.classCounts).length} شعب دراسية</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-black text-xl border border-purple-200">
                        {Object.keys(teacherGrid.subjectCounts).length}
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-bold">المواد المكلف بها</div>
                        <div className="text-base font-extrabold text-gray-800">{Object.keys(teacherGrid.subjectCounts).length} مواد</div>
                    </div>
                </div>

                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-black text-xl border border-amber-200">
                        {activeDays.length}
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 font-bold">أيام التدريس</div>
                        <div className="text-base font-extrabold text-gray-800">{activeDays.length} أيام أسبوعياً</div>
                    </div>
                </div>
            </div>

            {/* Schedule Table Container (Ready for Print / PDF Export) */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
                        <span className="font-bold">جارِ تحميل جدول الحصص الأسبوعي...</span>
                    </div>
                ) : !schedule ? (
                    <div className="p-12 text-center text-gray-500 space-y-3">
                        <Info className="w-12 h-12 mx-auto text-amber-500" />
                        <h3 className="text-lg font-bold text-gray-800">لم يتم نشر الجدول المدرسي بعد</h3>
                        <p className="text-sm text-gray-600 max-w-md mx-auto">
                            يقوم مدير المدرسة حالياً بإعداد واعتماد الجدول الأسبوعي. سيظهر جدولك التدريسي هنا فور نشره وتعميمه.
                        </p>
                    </div>
                ) : (
                    <div ref={printAreaRef} className="p-4 md:p-6 bg-white print:p-0">
                        {/* Printable School Header */}
                        <div className="border-b-2 border-emerald-800 pb-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-2">
                            <div className="text-right">
                                <div className="text-xs font-bold text-gray-600">جمهورية العراق • وزارة التربية</div>
                                <div className="text-sm font-extrabold text-gray-900">{settings.directorate || 'المديرية العامة للتربية'}</div>
                                <div className="text-base font-black text-emerald-800">{settings.schoolName || 'المدرسة'}</div>
                            </div>
                            <div className="text-center">
                                <div className="inline-block border-2 border-emerald-800 px-6 py-1 rounded-xl bg-emerald-50 text-emerald-900 font-black text-lg">
                                    جدول الحصص الأسبوعي للأستاذ
                                </div>
                                <div className="text-xs font-bold text-gray-600 mt-1">
                                    العام الدراسي: {settings.academicYear || '2025 - 2026'}
                                </div>
                            </div>
                            <div className="text-left bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl text-xs sm:text-sm">
                                <div><strong className="text-gray-700">الأستاذ:</strong> <span className="font-black text-emerald-900">{teacher.name}</span></div>
                                <div><strong className="text-gray-700">النصاب الأسبوعي:</strong> <span className="font-black text-emerald-900">{teacherGrid.totalCount} حصة</span></div>
                            </div>
                        </div>

                        {/* Timetable Grid */}
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-center border-2 border-gray-900">
                                <thead>
                                    <tr className="bg-emerald-900 text-white font-extrabold">
                                        <th className="border-2 border-gray-900 p-2.5 text-sm w-28">اليوم / الحصة</th>
                                        {Array.from({ length: maxPeriods }, (_, idx) => idx + 1).map(p => {
                                            const pColor = PERIOD_COLORS[p] || { bg: '#475569', text: '#ffffff', arNum: `${p}` };
                                            return (
                                                <th key={p} className="border-2 border-gray-900 p-2.5 text-sm">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <span className="text-xs text-emerald-200">الدرس</span>
                                                        <span className="text-base font-black">{pColor.arNum}</span>
                                                    </div>
                                                </th>
                                            );
                                        })}
                                        <th className="border-2 border-gray-900 p-2.5 text-sm w-24 bg-emerald-950">مجموع اليوم</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeDays.map((day) => {
                                        const dayColor = DAY_COLORS[day] || { bg: '#1d4ed8', text: '#ffffff', lightBg: '#eff6ff' };
                                        const periodsCountForDay = getPeriodsForDay(day, config);
                                        const dayLoad = teacherGrid.dailyCounts[day] || 0;

                                        return (
                                            <tr key={day} className="hover:bg-gray-50/50 transition-colors">
                                                {/* Day Name Column */}
                                                <td 
                                                    className="border-2 border-gray-900 p-3 font-black text-sm text-white"
                                                    style={{ backgroundColor: dayColor.bg }}
                                                >
                                                    <div className="text-base">{DAYS_ARABIC[day] || day}</div>
                                                    <div className="text-[11px] opacity-90 font-normal">({periodsCountForDay} حصص)</div>
                                                </td>

                                                {/* Period Columns */}
                                                {Array.from({ length: maxPeriods }, (_, idx) => idx + 1).map(p => {
                                                    if (p > periodsCountForDay) {
                                                        return (
                                                            <td key={p} className="border-2 border-gray-900 p-2 bg-gray-100 text-gray-400 text-xs">
                                                                <span className="text-gray-300 font-bold">-</span>
                                                            </td>
                                                        );
                                                    }

                                                    const cell = teacherGrid.grid[day]?.[p];

                                                    if (cell) {
                                                        return (
                                                            <td key={p} className="border-2 border-gray-900 p-2.5 bg-emerald-50/80 align-middle">
                                                                <div className="bg-white border-2 border-emerald-600 rounded-lg p-2 shadow-xs">
                                                                    <div className="font-extrabold text-emerald-900 text-sm leading-tight">
                                                                        {cell.subject}
                                                                    </div>
                                                                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-xs font-black">
                                                                        <Users className="w-3 h-3" />
                                                                        <span>{cell.stage} ({cell.section})</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    return (
                                                        <td key={p} className="border-2 border-gray-900 p-2 bg-white text-gray-400 text-xs align-middle">
                                                            <div className="text-gray-300 font-semibold py-2">شاغر</div>
                                                        </td>
                                                    );
                                                })}

                                                {/* Daily Total Column */}
                                                <td className="border-2 border-gray-900 p-2.5 bg-gray-50 font-black text-emerald-900 text-base">
                                                    {dayLoad} {dayLoad === 1 ? 'حصة' : 'حصص'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Signatures & Notes Block for Print */}
                        <div className="mt-8 pt-4 border-t-2 border-gray-300 flex items-center justify-between text-xs sm:text-sm text-gray-700 px-4">
                            <div className="text-center space-y-6">
                                <div className="font-bold">توقيع الأستاذ</div>
                                <div className="font-semibold text-gray-500">..............................</div>
                            </div>
                            <div className="text-center space-y-6">
                                <div className="font-bold">معاون شؤون الطلبة والجدول</div>
                                <div className="font-semibold text-gray-500">..............................</div>
                            </div>
                            <div className="text-center space-y-6">
                                <div className="font-bold">مدير المدرسة: {settings.principalName || 'المدير'}</div>
                                <div className="font-semibold text-gray-500">الختم والتوقيع: ..............................</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Distribution Breakdown Cards */}
            {schedule && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Classes Breakdown */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-3">
                        <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                            <Users className="w-5 h-5 text-emerald-600" />
                            <span>توزيع الحصص حسب الشعب الدراسية</span>
                        </h3>
                        <div className="divide-y divide-gray-100">
                            {Object.entries(teacherGrid.classCounts).map(([className, count]) => (
                                <div key={className} className="py-2.5 flex items-center justify-between text-sm">
                                    <span className="font-bold text-gray-800">{className}</span>
                                    <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-extrabold rounded-full text-xs">
                                        {count} حصص أسبوعياً
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Subjects Breakdown */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-3">
                        <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-blue-600" />
                            <span>توزيع الحصص حسب المواد الدراسية</span>
                        </h3>
                        <div className="divide-y divide-gray-100">
                            {Object.entries(teacherGrid.subjectCounts).map(([subjectName, count]) => (
                                <div key={subjectName} className="py-2.5 flex items-center justify-between text-sm">
                                    <span className="font-bold text-gray-800">{subjectName}</span>
                                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 font-extrabold rounded-full text-xs">
                                        {count} حصص أسبوعياً
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
