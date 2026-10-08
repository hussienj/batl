import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { User, ScheduleData, SchoolSettings, ClassData } from '../../types.ts';
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
    exportElementDirectPDF,
    DAY_COLORS,
    PERIOD_COLORS
} from '../scheduling/ScheduleExporter.ts';
import {
    Calendar,
    Printer,
    FileDown,
    RefreshCw,
    BookOpen,
    UserCheck,
    Sparkles,
    Info,
    CheckCircle2
} from 'lucide-react';

interface StudentScheduleViewProps {
    currentUser: User;
    scheduleData?: ScheduleData | null;
    allClasses?: ClassData[];
}

export default function StudentScheduleView({ currentUser, scheduleData: propScheduleData, allClasses }: StudentScheduleViewProps) {
    const [settings, setSettings] = useState<SchoolSettings | null>(null);
    const [publishedSchedule, setPublishedSchedule] = useState<MasterScheduleData | null>(null);
    const [config, setConfig] = useState<GeneralScheduleConfig | null>(null);
    const [publishedDate, setPublishedDate] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
    const printAreaRef = useRef<HTMLDivElement>(null);

    const principalId = currentUser.principalId || 'principal_al_hamza';

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load settings
            const settingsSnap = await db.ref(`settings/${principalId}`).get();
            if (settingsSnap.exists()) {
                setSettings(settingsSnap.val());
            }

            // Load published schedule
            const pubSnap = await db.ref(`published_schedules/${principalId}`).get();
            if (pubSnap.exists()) {
                const data = pubSnap.val();
                if (data.publishTarget === 'teachers' || data.publishedToStudents === false) {
                    // Published for teachers only, hide from students
                    setPublishedSchedule(null);
                    setConfig(null);
                    setPublishedDate(null);
                } else {
                    setPublishedSchedule(data.schedule || null);
                    setConfig(data.config || null);
                    setPublishedDate(data.publishedAt ? new Date(data.publishedAt).toLocaleDateString('ar-IQ', { dateStyle: 'long' }) : null);
                }
            } else {
                // Fallback to student_schedules node
                const studentSchedSnap = await db.ref(`student_schedules/${principalId}`).get();
                if (studentSchedSnap.exists()) {
                    const studentSchedData = studentSchedSnap.val();
                    if (studentSchedData && studentSchedData.isPublished === false) {
                        setPublishedSchedule(null);
                    } else {
                        setPublishedSchedule(studentSchedData);
                    }
                } else if (propScheduleData) {
                    setPublishedSchedule(propScheduleData as unknown as MasterScheduleData);
                }
            }
        } catch (error) {
            console.error('Error fetching student schedule:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [principalId]);

    const activeDays = useMemo(() => {
        return (Array.isArray(config?.activeDays) && config.activeDays.length > 0)
            ? config.activeDays
            : DEFAULT_ACTIVE_DAYS;
    }, [config]);

    const maxPeriods = useMemo(() => {
        return getMaxDailyPeriods(config);
    }, [config]);

    const studentStage = currentUser.stage || 'الأول متوسط';
    const studentSection = currentUser.section || 'أ';
    const studentClassId = currentUser.classId;

    // Find class assignments for each day and period
    const scheduleGrid = useMemo(() => {
        const grid: Record<string, Record<number, { subject: string; teacher: string }>> = {};
        let totalCount = 0;
        const subjectCounts: Record<string, number> = {};

        const classNameKey = `${studentStage.replace(/ /g, '-')}-${studentSection}`;

        activeDays.forEach(day => {
            grid[day] = {};
            const periodsCount = getPeriodsForDay(day, config);
            const dayPeriods = publishedSchedule?.[day] || [];

            for (let p = 1; p <= periodsCount; p++) {
                const pData = dayPeriods.find(dp => dp.period === p);
                if (pData?.assignments) {
                    // Try to match by studentClassId
                    let assign = studentClassId ? pData.assignments[studentClassId] : null;
                    
                    // If not found, try classNameKey
                    if (!assign) {
                        assign = pData.assignments[classNameKey];
                    }

                    // If still not found, search in assignments by stage and section
                    if (!assign) {
                        for (const [, aRaw] of Object.entries(pData.assignments)) {
                            const a = aRaw as any;
                            if (a?.stage === studentStage && a?.section === studentSection) {
                                assign = a;
                                break;
                            }
                        }
                    }

                    if (assign && (assign as any).subject) {
                        const a = assign as any;
                        grid[day][p] = {
                            subject: a.subject,
                            teacher: a.teacher || 'مدرس المادة'
                        };
                        totalCount++;
                        subjectCounts[a.subject] = (subjectCounts[a.subject] || 0) + 1;
                    }
                }
            }
        });

        return { grid, totalCount, subjectCounts };
    }, [publishedSchedule, config, activeDays, studentStage, studentSection, studentClassId]);

    const handleExportPDF = async () => {
        if (!printAreaRef.current) return;
        setIsExportingPDF(true);
        try {
            const fileName = `جدول_${studentStage}_شعبة_${studentSection}_${currentUser.name || 'طالب'}.pdf`;
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

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-cyan-900 text-white rounded-2xl p-6 shadow-xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="space-y-2 z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-cyan-200 text-sm font-medium border border-white/10">
                        <Sparkles className="w-4 h-4 text-cyan-300" />
                        <span>بوابة الطالب الأكاديمية</span>
                        {publishedDate && <span>• تم التحديث: {publishedDate}</span>}
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
                        <Calendar className="w-8 h-8 text-cyan-300" />
                        <span>جدولي الدراسي: {studentStage} (شعبة {studentSection})</span>
                    </h1>
                    <p className="text-cyan-100 text-sm md:text-base max-w-2xl">
                        الطالب: {currentUser.name} • {settings?.schoolName || 'المدرسة'} • العام الدراسي {settings?.academicYear || '2025 - 2026'}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2.5 z-10">
                    <button
                        onClick={loadData}
                        disabled={isLoading}
                        className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 border border-white/20"
                        title="تحديث البيانات"
                    >
                        <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                        <span>تحديث</span>
                    </button>

                    <button
                        onClick={handleExportPDF}
                        disabled={!publishedSchedule || isExportingPDF}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-rose-400 disabled:opacity-50"
                    >
                        <FileDown className="w-4 h-4" />
                        <span>{isExportingPDF ? 'جارِ التحميل...' : 'تصدير PDF'}</span>
                    </button>

                    <button
                        onClick={handlePrintDirect}
                        disabled={!publishedSchedule}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-gray-900 rounded-xl text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2 border border-amber-300 disabled:opacity-50"
                    >
                        <Printer className="w-4 h-4" />
                        <span>طباعة الجدول</span>
                    </button>
                </div>
            </div>

            {/* Schedule View Content */}
            <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-12 text-center text-gray-500 flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
                        <span className="font-bold">جارِ تحميل جدولك الدراسي...</span>
                    </div>
                ) : !publishedSchedule ? (
                    <div className="p-12 text-center text-gray-500 space-y-3">
                        <Info className="w-12 h-12 mx-auto text-amber-500" />
                        <h3 className="text-lg font-bold text-gray-800">لم يتم نشر الجدول الدراسي بعد</h3>
                        <p className="text-sm text-gray-600 max-w-md mx-auto">
                            تقوم إدارة المدرسة حالياً بإعداد الجدول الأسبوعي. سيظهر جدول شعبتك هنا فور نشره وتعميمه.
                        </p>
                    </div>
                ) : (
                    <div ref={printAreaRef} className="p-4 md:p-6 bg-white print:p-0">
                        {/* School Official Header */}
                        <div className="border-b-2 border-blue-900 pb-4 mb-4 flex flex-col sm:flex-row items-center justify-between gap-2">
                            <div className="text-right">
                                <div className="text-xs font-bold text-gray-600">جمهورية العراق • وزارة التربية</div>
                                <div className="text-sm font-extrabold text-gray-900">{settings?.directorate || 'المديرية العامة للتربية'}</div>
                                <div className="text-base font-black text-blue-900">{settings?.schoolName || 'المدرسة'}</div>
                            </div>
                            <div className="text-center">
                                <div className="inline-block border-2 border-blue-900 px-6 py-1 rounded-xl bg-blue-50 text-blue-950 font-black text-lg">
                                    جدول الدروس الأسبوعي
                                </div>
                                <div className="text-xs font-bold text-gray-600 mt-1">
                                    العام الدراسي: {settings?.academicYear || '2025 - 2026'}
                                </div>
                            </div>
                            <div className="text-left bg-blue-50 border border-blue-200 px-4 py-2 rounded-xl text-xs sm:text-sm">
                                <div><strong className="text-gray-700">الصف والشعبة:</strong> <span className="font-black text-blue-900">{studentStage} - شعبة ({studentSection})</span></div>
                                <div><strong className="text-gray-700">اسم الطالب:</strong> <span className="font-black text-blue-900">{currentUser.name}</span></div>
                            </div>
                        </div>

                        {/* Weekly Schedule Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-center border-2 border-gray-900">
                                <thead>
                                    <tr className="bg-blue-900 text-white font-extrabold">
                                        <th className="border-2 border-gray-900 p-2.5 text-sm w-28">اليوم / الحصة</th>
                                        {Array.from({ length: maxPeriods }, (_, idx) => idx + 1).map(p => {
                                            const pColor = PERIOD_COLORS[p] || { bg: '#475569', text: '#ffffff', arNum: `${p}` };
                                            return (
                                                <th key={p} className="border-2 border-gray-900 p-2.5 text-sm">
                                                    <div className="flex flex-col items-center justify-center">
                                                        <span className="text-xs text-blue-200">الدرس</span>
                                                        <span className="text-base font-black">{pColor.arNum}</span>
                                                    </div>
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeDays.map((day) => {
                                        const dayColor = DAY_COLORS[day] || { bg: '#1d4ed8', text: '#ffffff', lightBg: '#eff6ff' };
                                        const periodsCountForDay = getPeriodsForDay(day, config);

                                        return (
                                            <tr key={day} className="hover:bg-gray-50/50 transition-colors">
                                                {/* Day Column */}
                                                <td 
                                                    className="border-2 border-gray-900 p-3 font-black text-sm text-white"
                                                    style={{ backgroundColor: dayColor.bg }}
                                                >
                                                    <div className="text-base">{DAYS_ARABIC[day] || day}</div>
                                                    <div className="text-[11px] opacity-90 font-normal">({periodsCountForDay} دروس)</div>
                                                </td>

                                                {/* Periods Columns */}
                                                {Array.from({ length: maxPeriods }, (_, idx) => idx + 1).map(p => {
                                                    if (p > periodsCountForDay) {
                                                        return (
                                                            <td key={p} className="border-2 border-gray-900 p-2 bg-gray-100 text-gray-400 text-xs">
                                                                <span className="text-gray-300 font-bold">-</span>
                                                            </td>
                                                        );
                                                    }

                                                    const cell = scheduleGrid.grid[day]?.[p];

                                                    if (cell) {
                                                        return (
                                                            <td key={p} className="border-2 border-gray-900 p-2.5 bg-blue-50/70 align-middle">
                                                                <div className="bg-white border-2 border-blue-600 rounded-lg p-2 shadow-xs">
                                                                    <div className="font-black text-blue-950 text-base leading-tight">
                                                                        {cell.subject}
                                                                    </div>
                                                                    <div className="mt-1 text-xs text-gray-600 font-semibold flex items-center justify-center gap-1">
                                                                        <UserCheck className="w-3 h-3 text-blue-600" />
                                                                        <span>{cell.teacher}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        );
                                                    }

                                                    return (
                                                        <td key={p} className="border-2 border-gray-900 p-2 bg-white text-gray-400 text-xs align-middle">
                                                            <div className="text-gray-300 font-semibold py-2">لا يوجد درس</div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Signatures & School Stamp */}
                        <div className="mt-8 pt-4 border-t-2 border-gray-300 flex items-center justify-between text-xs sm:text-sm text-gray-700 px-4">
                            <div className="text-center space-y-6">
                                <div className="font-bold">مرشد الصف</div>
                                <div className="font-semibold text-gray-500">..............................</div>
                            </div>
                            <div className="text-center space-y-6">
                                <div className="font-bold">معاون شؤون الطلبة</div>
                                <div className="font-semibold text-gray-500">..............................</div>
                            </div>
                            <div className="text-center space-y-6">
                                <div className="font-bold">مدير المدرسة: {settings?.principalName || 'المدير'}</div>
                                <div className="font-semibold text-gray-500">الختم والتوقيع: ..............................</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Subjects Summary Card */}
            {publishedSchedule && (
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 space-y-3">
                    <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-blue-600" />
                        <span>نصاب المواد الدراسية الأسبوعية لشعبتك</span>
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {Object.entries(scheduleGrid.subjectCounts).map(([subjectName, count]) => (
                            <div key={subjectName} className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 flex items-center justify-between">
                                <span className="font-bold text-gray-800 text-sm">{subjectName}</span>
                                <span className="px-2 py-0.5 bg-blue-600 text-white font-extrabold rounded-md text-xs">
                                    {count} {count === 1 ? 'حصة' : 'حصص'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
