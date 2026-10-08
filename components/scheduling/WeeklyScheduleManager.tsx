import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { User, ClassData, SchoolSettings, Subject } from '../../types.ts';
import { compareSections } from '../../constants.ts';
import {
    CalendarClock,
    Sparkles,
    CheckCircle2,
    AlertTriangle,
    Save,
    Printer,
    FileText,
    FileSpreadsheet,
    RefreshCw,
    Users,
    BookOpen,
    Sliders,
    Layers,
    UserCheck,
    ChevronDown,
    ChevronUp,
    Plus,
    Minus,
    Trash2,
    ArrowRightLeft,
    Eye,
    EyeOff,
    Palette,
    Paintbrush,
    RotateCcw,
    SlidersHorizontal,
    ShieldAlert,
    Clock,
    Check,
    X,
    Info,
    Calendar,
    Send,
    Download,
    Zap,
    Repeat,
    GraduationCap,
    LayoutGrid,
    Share2,
    Bot,
    Smartphone,
    Ban
} from 'lucide-react';
import TeacherColorModal from './TeacherColorModal.tsx';
import {
    TeacherColorConfig,
    resolveTeacherColor,
    getDefaultTeacherColor
} from './teacherColorUtils.ts';
import { db } from '../../lib/firebase.ts';
import {
    MasterScheduleData,
    ScheduleConflict,
    TeacherConstraint,
    GeneralScheduleConfig,
    DAYS_ARABIC,
    ALL_POSSIBLE_DAYS,
    DEFAULT_ACTIVE_DAYS,
    DEFAULT_PERIODS_PER_DAY,
    STANDARD_CURRICULUM_QUOTAS,
    getDefaultQuotaForSubject,
    validateScheduleFeasibility,
    generateWeeklySchedule,
    generateOptimizedWeeklySchedule,
    autoRepairSchedule,
    findScheduleConflicts,
    compactScheduleGaps,
    validateMoveOrSwap,
    getPeriodsForDay,
    getMaxDailyPeriods,
    getTotalWeeklyCapacity,
    isTeacherUnavailableAt,
    getTeacherUnavailablePeriodsOnDay
} from './schedulerAlgorithm.ts';
import { sendTelegramNotification, TelegramConfig } from '../../lib/telegram.ts';
import {
    exportClassScheduleWord,
    exportTeacherScheduleWord,
    exportMasterScheduleCSV,
    exportStageScheduleWord,
    exportStageScheduleDirectPDF,
    printStageSchedulePDF,
    SECTION_COLORS,
    PERIOD_COLORS,
    DAY_COLORS
} from './ScheduleExporter.ts';

interface WeeklyScheduleManagerProps {
    principal: User;
    users: User[];
    classes: ClassData[];
    settings: SchoolSettings;
}

type ActiveTab = 'schedule_view' | 'quotas_editor' | 'teacher_constraints' | 'general_settings';
type ScheduleDisplayMode = 'by_class' | 'by_teacher' | 'master_grid';

export default function WeeklyScheduleManager({
    principal,
    users,
    classes,
    settings
}: WeeklyScheduleManagerProps) {
    // ----------------------------------------------------
    // State: Active Tabs & Views
    // ----------------------------------------------------
    const [activeTab, setActiveTab] = useState<ActiveTab>('schedule_view');
    const [displayMode, setDisplayMode] = useState<ScheduleDisplayMode>('by_class');
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');

    // ----------------------------------------------------
    // State: Schedule Data & Constraints
    // ----------------------------------------------------
    const [schedule, setSchedule] = useState<MasterScheduleData>({});
    const [classQuotas, setClassQuotas] = useState<Record<string, Record<string, number>>>({});
    const [teacherConstraints, setTeacherConstraints] = useState<Record<string, TeacherConstraint>>({});
    const [config, setConfig] = useState<GeneralScheduleConfig>({
        activeDays: DEFAULT_ACTIVE_DAYS,
        periodsPerDay: DEFAULT_PERIODS_PER_DAY,
        maxConsecutiveSameSubject: 1,
        preferBalancedTeacherLoad: true
    });

    // ----------------------------------------------------
    // State: Execution, Conflicts & Modals
    // ----------------------------------------------------
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
    const [showConflictModal, setShowConflictModal] = useState(false);
    const [generationSummary, setGenerationSummary] = useState<any | null>(null);

    // Drag and Drop State
    const [draggedCell, setDraggedCell] = useState<{
        day: string;
        period: number;
        classId: string;
        assignment: any;
    } | null>(null);
    const [dragOverCell, setDragOverCell] = useState<{
        day: string;
        period: number;
        classId: string;
    } | null>(null);
    const [dragConflictAlert, setDragConflictAlert] = useState<{
        title: string;
        message: string;
    } | null>(null);

    // Edit Cell Modal State
    const [editingCell, setEditingCell] = useState<{
        day: string;
        period: number;
        classId: string;
    } | null>(null);

    // Stage Schedule Modal & Export State
    const [showStageModal, setShowStageModal] = useState(false);
    const [selectedStageForExport, setSelectedStageForExport] = useState<string>('');
    const [stageEffectiveDate, setStageEffectiveDate] = useState<string>('٢٠٢٦ / ٣ / ٢٥');
    const [stagePaperSize, setStagePaperSize] = useState<'a3' | 'a4'>('a3');
    const [isExportingPDF, setIsExportingPDF] = useState(false);
    const [highlightRepeatedSubjects, setHighlightRepeatedSubjects] = useState(true);

    // Publish to Teachers & Students State
    const [showPublishModal, setShowPublishModal] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishTarget, setPublishTarget] = useState<'all' | 'teachers' | 'students'>('all');
    const [sendTelegramToStudents, setSendTelegramToStudents] = useState(true);
    const [telegramBotTokenInput, setTelegramBotTokenInput] = useState(settings.telegramBotToken || '');
    const [customPublishEffectiveDate, setCustomPublishEffectiveDate] = useState('اعتباراً من الأحد القادم');
    const [publishedInfo, setPublishedInfo] = useState<{
        publishTarget?: 'all' | 'teachers' | 'students';
        publishedAt?: string;
        effectiveDate?: string;
    } | null>(null);
    const [publishProgress, setPublishProgress] = useState<{
        total: number;
        current: number;
        successCount: number;
        failCount: number;
        statusMessage: string;
    } | null>(null);
    const [publishResult, setPublishResult] = useState<{
        success: boolean;
        message: string;
        telegramSent: number;
        telegramFailed: number;
        errors: string[];
    } | null>(null);

    // Capacity Validation Alert State (Prevent decreasing below maximum class quota in the school)
    const [capacityAlert, setCapacityAlert] = useState<{
        attemptedCapacity: number;
        maxQuota: number;
        maxStageName: string;
        maxClassName: string;
    } | null>(null);

    // Unassigned Lessons & Auto-Repair State
    const [showUnassignedModal, setShowUnassignedModal] = useState<boolean>(false);
    const [showClearScheduleConfirm, setShowClearScheduleConfirm] = useState<boolean>(false);
    const [isAutoRepairing, setIsAutoRepairing] = useState<boolean>(false);
    const [autoRepairNotice, setAutoRepairNotice] = useState<{
        success: boolean;
        message: string;
    } | null>(null);

    // Teacher Colors State (Prominent Defaults, Manual Customization, Blanking/Clear Colors)
    const [teacherColors, setTeacherColors] = useState<Record<string, TeacherColorConfig | null | 'none'>>({});
    const [enableTeacherColors, setEnableTeacherColors] = useState<boolean>(true);
    const [showTeacherColorModal, setShowTeacherColorModal] = useState<boolean>(false);
    const [isSavingColors, setIsSavingColors] = useState<boolean>(false);

    // Filter Teachers (only role === 'teacher')
    const teachers = useMemo(() => {
        return users.filter(u => u.role === 'teacher' && (u.principalId === principal.id || !u.principalId));
    }, [users, principal.id]);

    // Dynamic Reactive List of Unplaced / Deficit Lessons across all classes
    // This updates live: as soon as a lesson is placed manually or automatically, it instantly disappears!
    const dynamicUnplacedLessons = useMemo(() => {
        const list: {
            classId: string;
            className: string;
            stage: string;
            section: string;
            subjectId: string;
            subjectName: string;
            teacherId: string;
            teacherName: string;
            requiredQuota: number;
            placedCount: number;
            missingCount: number;
        }[] = [];

        if (!classes || classes.length === 0) return list;

        classes.forEach(cls => {
            const clsQuotas = classQuotas[cls.id] || {};
            (cls.subjects || []).forEach(subj => {
                const required = clsQuotas[subj.id] !== undefined
                    ? clsQuotas[subj.id]
                    : getDefaultQuotaForSubject(subj.name, cls.stage);

                if (required <= 0) return;

                let placed = 0;
                config.activeDays.forEach(day => {
                    const dayPeriods = getPeriodsForDay(day, config);
                    const pList = schedule[day] || [];
                    for (let p = 0; p < Math.min(pList.length, dayPeriods); p++) {
                        const assign = pList[p]?.assignments?.[cls.id];
                        if (assign && (assign.subjectId === subj.id || (!assign.subjectId && assign.subject === subj.name))) {
                            placed++;
                        }
                    }
                });

                const missing = required - placed;
                if (missing > 0) {
                    const assignedTeacher = teachers.find(t => 
                        t && t.role === 'teacher' && 
                        Array.isArray(t.assignments) && 
                        t.assignments.some(a => a && a.classId === cls.id && a.subjectId === subj.id)
                    );
                    const teacherId = assignedTeacher ? assignedTeacher.id : '';
                    const teacherName = assignedTeacher ? assignedTeacher.name : 'غير محدد';

                    list.push({
                        classId: cls.id,
                        className: `${cls.stage} (${cls.section})`.trim(),
                        stage: cls.stage,
                        section: cls.section,
                        subjectId: subj.id,
                        subjectName: subj.name,
                        teacherId,
                        teacherName,
                        requiredQuota: required,
                        placedCount: placed,
                        missingCount: missing
                    });
                }
            });
        });

        return list;
    }, [classes, classQuotas, schedule, config, teachers]);

    const totalMissingLessonsCount = useMemo(() => {
        return dynamicUnplacedLessons.reduce((sum, item) => sum + item.missingCount, 0);
    }, [dynamicUnplacedLessons]);

    // Unique Stages List in the school
    const stagesList = useMemo(() => {
        const set = new Set<string>();
        classes.forEach(c => {
            if (c.stage) {
                set.add(c.stage.trim());
            }
        });
        return Array.from(set);
    }, [classes]);

    // Helper: checks if a subject appears more than once on the same day for a class
    const getSubjectDayRepeatInfo = useCallback((day: string, classId: string, subjectId?: string, subjectName?: string) => {
        if (!subjectId && !subjectName) return { isRepeated: false, count: 0 };
        const dayPeriods = schedule[day] || [];
        let count = 0;
        dayPeriods.forEach(p => {
            const a = p.assignments?.[classId];
            if (a && a.subjectId && (a.subjectId === subjectId || a.subject === subjectName)) {
                count++;
            }
        });
        return { isRepeated: count > 1, count };
    }, [schedule]);

    // Set initial class, teacher & stage selection
    useEffect(() => {
        if (classes.length > 0 && !selectedClassId) {
            setSelectedClassId(classes[0].id);
        }
    }, [classes, selectedClassId]);

    useEffect(() => {
        if (stagesList.length > 0 && !selectedStageForExport) {
            setSelectedStageForExport(stagesList[0]);
        }
    }, [stagesList, selectedStageForExport]);

    useEffect(() => {
        if (teachers.length > 0 && !selectedTeacherId) {
            setSelectedTeacherId(teachers[0].id);
        }
    }, [teachers, selectedTeacherId]);

    // ----------------------------------------------------
    // Load Saved Data from Firebase & LocalStorage
    // ----------------------------------------------------
    useEffect(() => {
        const principalId = principal.id;
        setIsLoading(true);

        const scheduleRef = db.ref(`schedules/${principalId}`);
        const quotasRef = db.ref(`schedule_quotas/${principalId}`);
        const constraintsRef = db.ref(`schedule_teacher_constraints/${principalId}`);
        const configRef = db.ref(`schedule_config/${principalId}`);
        const pubRef = db.ref(`published_schedules/${principalId}`);
        const colorsRef = db.ref(`schedule_teacher_colors/${principalId}`);
        const enableColorsRef = db.ref(`schedule_enable_teacher_colors/${principalId}`);

        Promise.all([
            scheduleRef.get(),
            quotasRef.get(),
            constraintsRef.get(),
            configRef.get(),
            pubRef.get(),
            colorsRef.get(),
            enableColorsRef.get()
        ]).then(([schedSnap, quotasSnap, constrSnap, cfgSnap, pubSnap, colorsSnap, enableColorsSnap]) => {
            if (schedSnap.exists()) {
                setSchedule(schedSnap.val());
            }

            if (quotasSnap.exists()) {
                setClassQuotas(quotasSnap.val());
            } else {
                // Initialize default quotas based on class subjects
                const initialQuotas: Record<string, Record<string, number>> = {};
                classes.forEach(cls => {
                    initialQuotas[cls.id] = {};
                    cls.subjects.forEach(s => {
                        initialQuotas[cls.id][s.id] = getDefaultQuotaForSubject(s.name, settings.schoolLevel);
                    });
                });
                setClassQuotas(initialQuotas);
            }

            if (constrSnap.exists()) {
                setTeacherConstraints(constrSnap.val());
            } else {
                const initialConstraints: Record<string, TeacherConstraint> = {};
                teachers.forEach(t => {
                    initialConstraints[t.id] = {
                        teacherId: t.id,
                        teacherName: t.name,
                        offDays: [],
                        maxDailyPeriods: 5
                    };
                });
                setTeacherConstraints(initialConstraints);
            }

            if (cfgSnap.exists()) {
                const loadedCfg = cfgSnap.val() || {};
                setConfig({
                    periodsPerDay: DEFAULT_PERIODS_PER_DAY,
                    maxConsecutiveSameSubject: 1,
                    preferBalancedTeacherLoad: true,
                    ...loadedCfg,
                    activeDays: (Array.isArray(loadedCfg.activeDays) && loadedCfg.activeDays.length > 0)
                        ? loadedCfg.activeDays
                        : DEFAULT_ACTIVE_DAYS
                });
            }

            if (pubSnap.exists()) {
                const pubData = pubSnap.val();
                if (pubData.publishTarget) {
                    setPublishTarget(pubData.publishTarget);
                }
                setPublishedInfo({
                    publishTarget: pubData.publishTarget || 'all',
                    publishedAt: pubData.publishedAt,
                    effectiveDate: pubData.effectiveDate
                });
            }

            if (colorsSnap.exists()) {
                setTeacherColors(colorsSnap.val() || {});
            } else {
                try {
                    const local = localStorage.getItem(`schedule_teacher_colors_${principalId}`);
                    if (local) setTeacherColors(JSON.parse(local));
                } catch (e) {}
            }

            if (enableColorsSnap.exists()) {
                setEnableTeacherColors(Boolean(enableColorsSnap.val()));
            } else {
                try {
                    const local = localStorage.getItem(`schedule_enable_teacher_colors_${principalId}`);
                    if (local !== null) setEnableTeacherColors(local === 'true');
                } catch (e) {}
            }
        }).catch(err => {
            console.error("Error loading schedule data:", err);
        }).finally(() => {
            setIsLoading(false);
        });
    }, [principal.id, classes, teachers, settings.schoolLevel]);

    // ----------------------------------------------------
    // Realtime Conflict Re-evaluation
    // ----------------------------------------------------
    useEffect(() => {
        if (!isLoading && schedule && Object.keys(schedule).length > 0) {
            const detected = findScheduleConflicts(
                schedule,
                classes,
                teachers,
                teacherConstraints,
                config.activeDays,
                config.periodsPerDay
            );
            setConflicts(detected);
        }
    }, [schedule, classes, teachers, teacherConstraints, config, isLoading]);

    // ----------------------------------------------------
    // Save to Firebase
    // ----------------------------------------------------
    const handleSaveAll = async () => {
        setIsSaving(true);
        const principalId = principal.id;

        try {
            await Promise.all([
                db.ref(`schedules/${principalId}`).set(schedule),
                db.ref(`schedule_quotas/${principalId}`).set(classQuotas),
                db.ref(`schedule_teacher_constraints/${principalId}`).set(teacherConstraints),
                db.ref(`schedule_config/${principalId}`).set(config),
                db.ref(`schedule_teacher_colors/${principalId}`).set(teacherColors),
                db.ref(`schedule_enable_teacher_colors/${principalId}`).set(enableTeacherColors)
            ]);
            try {
                localStorage.setItem(`schedule_teacher_colors_${principalId}`, JSON.stringify(teacherColors));
                localStorage.setItem(`schedule_enable_teacher_colors_${principalId}`, String(enableTeacherColors));
            } catch (e) {}
            setHasUnsavedChanges(false);
            alert("تم حفظ الجدول والإعدادات والأنصبة وألوان المدرسين بنجاح في قاعدة البيانات!");
        } catch (error) {
            console.error("Error saving schedule:", error);
            alert("حدث خطأ أثناء حفظ الجدول. يرجى المحاولة مرة أخرى.");
        } finally {
            setIsSaving(false);
        }
    };

    // Dedicated Save for Teacher Colors
    const handleSaveTeacherColors = async () => {
        setIsSavingColors(true);
        const principalId = principal.id;
        try {
            await Promise.all([
                db.ref(`schedule_teacher_colors/${principalId}`).set(teacherColors),
                db.ref(`schedule_enable_teacher_colors/${principalId}`).set(enableTeacherColors)
            ]);
            try {
                localStorage.setItem(`schedule_teacher_colors_${principalId}`, JSON.stringify(teacherColors));
                localStorage.setItem(`schedule_enable_teacher_colors_${principalId}`, String(enableTeacherColors));
            } catch (e) {}
        } catch (error) {
            console.error("Error saving teacher colors:", error);
        } finally {
            setIsSavingColors(false);
        }
    };

    // Update specific teacher color
    const handleUpdateTeacherColor = (teacherId: string, color: TeacherColorConfig | null | 'none') => {
        setTeacherColors(prev => {
            const updated = { ...prev };
            if (color === null) {
                delete updated[teacherId]; // restores prominent default
            } else {
                updated[teacherId] = color;
            }
            try {
                localStorage.setItem(`schedule_teacher_colors_${principal.id}`, JSON.stringify(updated));
            } catch (e) {}
            return updated;
        });
        setHasUnsavedChanges(true);
    };

    // Reset all teacher colors to default prominent palettes
    const handleResetAllColorsToDefault = () => {
        setTeacherColors({});
        setEnableTeacherColors(true);
        try {
            localStorage.removeItem(`schedule_teacher_colors_${principal.id}`);
            localStorage.setItem(`schedule_enable_teacher_colors_${principal.id}`, 'true');
        } catch (e) {}
        db.ref(`schedule_teacher_colors/${principal.id}`).set({}).catch(() => {});
        db.ref(`schedule_enable_teacher_colors/${principal.id}`).set(true).catch(() => {});
        setHasUnsavedChanges(true);
    };

    // Clear all table colors ("تفريغ ألوان الجدول")
    const handleClearAllColors = () => {
        const blankColors: Record<string, 'none'> = {};
        teachers.forEach(t => {
            blankColors[t.id] = 'none';
        });
        setTeacherColors(blankColors);
        setEnableTeacherColors(false);
        try {
            localStorage.setItem(`schedule_teacher_colors_${principal.id}`, JSON.stringify(blankColors));
            localStorage.setItem(`schedule_enable_teacher_colors_${principal.id}`, 'false');
        } catch (e) {}
        db.ref(`schedule_teacher_colors/${principal.id}`).set(blankColors).catch(() => {});
        db.ref(`schedule_enable_teacher_colors/${principal.id}`).set(false).catch(() => {});
        setHasUnsavedChanges(true);
    };

    // Master Toggle for Table Coloring
    const handleToggleEnableTeacherColors = (enabled: boolean) => {
        setEnableTeacherColors(enabled);
        try {
            localStorage.setItem(`schedule_enable_teacher_colors_${principal.id}`, String(enabled));
        } catch (e) {}
        db.ref(`schedule_enable_teacher_colors/${principal.id}`).set(enabled).catch(() => {});
    };

    // ----------------------------------------------------
    // Automated Schedule Generation
    // ----------------------------------------------------
    const handleGenerateSchedule = () => {
        handleGenerateOptimizedSchedule(5);
    };

    const handleGenerateOptimizedSchedule = (attemptsCount = 25) => {
        if (!classes || classes.length === 0) {
            alert("لا توجد شعب دراسية مضافة حالياً. يرجى إضافة الشعب والمراحل الدراسية أولاً.");
            return;
        }

        setIsGenerating(true);

        setTimeout(async () => {
            try {
                const result = generateOptimizedWeeklySchedule(
                    classes,
                    teachers,
                    classQuotas,
                    teacherConstraints,
                    config,
                    attemptsCount
                );

                setSchedule(result.schedule);
                setConflicts(result.conflicts);
                setGenerationSummary(result);
                setHasUnsavedChanges(true);
                setActiveTab('schedule_view');
                setShowConflictModal(true);

                // Auto-save generated schedule to Firebase for durability
                const principalId = principal.id;
                try {
                    await Promise.all([
                        db.ref(`schedules/${principalId}`).set(result.schedule),
                        db.ref(`schedule_quotas/${principalId}`).set(classQuotas),
                        db.ref(`schedule_teacher_constraints/${principalId}`).set(teacherConstraints),
                        db.ref(`schedule_config/${principalId}`).set(config)
                    ]);
                    setHasUnsavedChanges(false);
                } catch (saveErr) {
                    console.warn("Could not auto-save to Firebase, kept in local state:", saveErr);
                }
            } catch (err) {
                console.error("Scheduling generation error:", err);
                alert("حدث خطأ غير متوقع أثناء توليد الجدول.");
            } finally {
                setIsGenerating(false);
            }
        }, 150);
    };

    // ----------------------------------------------------
    // Auto-Repair & Schedule Optimization for Unplaced Lessons
    // ----------------------------------------------------
    const handleAutoRepairSchedule = async () => {
        if (!classes || classes.length === 0) return;

        setIsAutoRepairing(true);
        setAutoRepairNotice(null);

        setTimeout(async () => {
            try {
                const result = autoRepairSchedule(
                    schedule,
                    classes,
                    teachers,
                    classQuotas,
                    teacherConstraints,
                    config
                );

                setSchedule(result.schedule);
                setConflicts(result.conflicts);
                setHasUnsavedChanges(true);

                // Update generation summary if present
                if (generationSummary) {
                    setGenerationSummary(prev => prev ? {
                        ...prev,
                        schedule: result.schedule,
                        conflicts: result.conflicts,
                        unassignedItems: result.remainingUnassigned,
                        placedCount: result.placedCount,
                        success: result.success
                    } : null);
                }

                // Auto-save to Firebase
                const principalId = principal.id;
                try {
                    await db.ref(`schedules/${principalId}`).set(result.schedule);
                    setHasUnsavedChanges(false);
                } catch (saveErr) {
                    console.warn("Could not auto-save repaired schedule to Firebase:", saveErr);
                }

                if (result.success || result.remainingUnassigned.length === 0) {
                    setAutoRepairNotice({
                        success: true,
                        message: `تم حل وتوزيع كافة الحصص المتعذرة (${result.resolvedCount} حصة) بنجاح واكتمال أنصبة الجدول 100%!`
                    });
                } else {
                    const remainingTotal = result.remainingUnassigned.reduce((s, it) => s + it.count, 0);
                    setAutoRepairNotice({
                        success: false,
                        message: `تمت معالجة وتوزيع (${result.resolvedCount} حصة) آلياً بنجاح. متبقي (${remainingTotal} حصة) تحتاج مراجعة يدوية أو تخفيف بعض أيام التفرغ للمدرسين.`
                    });
                }
            } catch (err) {
                console.error("Auto repair schedule error:", err);
                setAutoRepairNotice({
                    success: false,
                    message: "حدث خطأ أثناء تشغيل خوارزمية المعالجة الآلية."
                });
            } finally {
                setIsAutoRepairing(false);
            }
        }, 150);
    };

    // ----------------------------------------------------
    // Clear Schedule Confirmed (Wipe entire schedule)
    // ----------------------------------------------------
    const handleClearScheduleConfirmed = async () => {
        const emptySchedule: MasterScheduleData = {};
        config.activeDays.forEach(day => {
            const dayPeriods = getPeriodsForDay(day, config);
            emptySchedule[day] = Array.from({ length: dayPeriods }, (_, i) => ({
                period: i + 1,
                assignments: {}
            }));
        });
        setSchedule(emptySchedule);
        setConflicts([]);
        setGenerationSummary(null);
        setAutoRepairNotice(null);
        setHasUnsavedChanges(true);
        setShowClearScheduleConfirm(false);

        // Auto-save empty schedule to Firebase
        try {
            await db.ref(`schedules/${principal.id}`).set(emptySchedule);
            setHasUnsavedChanges(false);
        } catch (saveErr) {
            console.warn("Could not save cleared schedule to Firebase:", saveErr);
        }
    };

    const handleClearSchedule = () => {
        setShowClearScheduleConfirm(true);
    };

    // ----------------------------------------------------
    // Apply Curriculum Template to Class Quotas
    // ----------------------------------------------------
    const handleApplyStandardTemplate = (targetClassId?: string) => {
        const levelKey = (settings.schoolLevel && settings.schoolLevel.includes('ابتدائ'))
            ? 'ابتدائية'
            : (settings.schoolLevel && settings.schoolLevel.includes('اعداد'))
                ? 'اعدادية'
                : 'متوسطة';

        const newQuotas = { ...classQuotas };
        const targetClasses = targetClassId 
            ? classes.filter(c => c.id === targetClassId)
            : classes;

        targetClasses.forEach(cls => {
            newQuotas[cls.id] = {};
            cls.subjects.forEach(subj => {
                newQuotas[cls.id][subj.id] = getDefaultQuotaForSubject(subj.name, levelKey);
            });
        });

        setClassQuotas(newQuotas);
        setHasUnsavedChanges(true);
        alert(`تم تطبيق الخطة الدراسية القياسية لـ (${levelKey}) بنجاح!`);
    };

    // ----------------------------------------------------
    // Helper: Update Single Quota
    // ----------------------------------------------------
    const handleUpdateQuota = (classId: string, subjectId: string, delta: number) => {
        setClassQuotas(prev => {
            const clsQ = { ...(prev[classId] || {}) };
            const current = clsQ[subjectId] !== undefined ? clsQ[subjectId] : 0;
            const updated = Math.max(0, current + delta);
            clsQ[subjectId] = updated;
            return { ...prev, [classId]: clsQ };
        });
        setHasUnsavedChanges(true);
    };

    // ----------------------------------------------------
    // Helper: Toggle Teacher Off Day
    // ----------------------------------------------------
    const handleToggleTeacherOffDay = (teacherId: string, day: string) => {
        setTeacherConstraints(prev => {
            const teacher = teachers.find(t => t.id === teacherId);
            const current = prev[teacherId] || {
                teacherId,
                teacherName: teacher ? teacher.name : '',
                offDays: [],
                maxDailyPeriods: 5
            };

            const currentOffDays = Array.isArray(current.offDays) ? current.offDays : [];
            const exists = currentOffDays.includes(day);
            const updatedOffDays = exists 
                ? currentOffDays.filter(d => d !== day)
                : [...currentOffDays, day];

            return {
                ...prev,
                [teacherId]: {
                    ...current,
                    offDays: updatedOffDays
                }
            };
        });
        setHasUnsavedChanges(true);
    };

    // ----------------------------------------------------
    // Helper: Update Teacher Max Daily Periods
    // ----------------------------------------------------
    const handleUpdateTeacherMaxDaily = (teacherId: string, val: number) => {
        setTeacherConstraints(prev => {
            const teacher = teachers.find(t => t.id === teacherId);
            const current = prev[teacherId] || {
                teacherId,
                teacherName: teacher ? teacher.name : '',
                offDays: [],
                maxDailyPeriods: 5
            };
            return {
                ...prev,
                [teacherId]: {
                    ...current,
                    maxDailyPeriods: Math.max(1, Math.min(config.periodsPerDay, val))
                }
            };
        });
        setHasUnsavedChanges(true);
    };

    // ----------------------------------------------------
    // Helper: Toggle Teacher Unavailable Period on a Day (Partial Day Off)
    // ----------------------------------------------------
    const handleToggleTeacherUnavailablePeriod = (teacherId: string, day: string, period: number) => {
        setTeacherConstraints(prev => {
            const teacher = teachers.find(t => t.id === teacherId);
            const current = prev[teacherId] || {
                teacherId,
                teacherName: teacher ? teacher.name : '',
                offDays: [],
                maxDailyPeriods: 5
            };

            const currentUnavailable = { ...(current.unavailablePeriods || {}) };
            const dayPeriods = Array.isArray(currentUnavailable[day]) ? [...currentUnavailable[day]] : [];
            const exists = dayPeriods.includes(period);

            const updatedDayPeriods = exists
                ? dayPeriods.filter(p => p !== period)
                : [...dayPeriods, period].sort((a, b) => a - b);

            if (updatedDayPeriods.length === 0) {
                delete currentUnavailable[day];
            } else {
                currentUnavailable[day] = updatedDayPeriods;
            }

            return {
                ...prev,
                [teacherId]: {
                    ...current,
                    unavailablePeriods: currentUnavailable
                }
            };
        });
        setHasUnsavedChanges(true);
    };

    // ----------------------------------------------------
    // Helper: Set Quick Unavailable Preset for a Specific Day
    // ----------------------------------------------------
    const handleSetTeacherDayUnavailablePreset = (
        teacherId: string,
        day: string,
        preset: 'first' | 'last' | 'both' | 'clear'
    ) => {
        setTeacherConstraints(prev => {
            const teacher = teachers.find(t => t.id === teacherId);
            const current = prev[teacherId] || {
                teacherId,
                teacherName: teacher ? teacher.name : '',
                offDays: [],
                maxDailyPeriods: 5
            };

            const currentUnavailable = { ...(current.unavailablePeriods || {}) };
            const dayTotalPeriods = getPeriodsForDay(day, config);

            if (preset === 'clear') {
                delete currentUnavailable[day];
            } else if (preset === 'first') {
                currentUnavailable[day] = [1];
            } else if (preset === 'last') {
                currentUnavailable[day] = [dayTotalPeriods];
            } else if (preset === 'both') {
                currentUnavailable[day] = [1, dayTotalPeriods];
            }

            return {
                ...prev,
                [teacherId]: {
                    ...current,
                    unavailablePeriods: currentUnavailable
                }
            };
        });
        setHasUnsavedChanges(true);
    };

    // ----------------------------------------------------
    // Helper: Set Quick Global Unavailable Preset Across All Active Days
    // ----------------------------------------------------
    const handleSetTeacherGlobalUnavailablePreset = (
        teacherId: string,
        preset: 'first' | 'last' | 'clear'
    ) => {
        setTeacherConstraints(prev => {
            const teacher = teachers.find(t => t.id === teacherId);
            const current = prev[teacherId] || {
                teacherId,
                teacherName: teacher ? teacher.name : '',
                offDays: [],
                maxDailyPeriods: 5
            };

            const offDays = Array.isArray(current.offDays) ? current.offDays : [];
            const activeDays = (Array.isArray(config?.activeDays) && config.activeDays.length > 0) ? config.activeDays : DEFAULT_ACTIVE_DAYS;
            const workingDays = activeDays.filter(d => !offDays.includes(d));
            const newUnavailable: Record<string, number[]> = {};

            if (preset === 'clear') {
                // Completely empty
            } else {
                workingDays.forEach(day => {
                    const dayTotalPeriods = getPeriodsForDay(day, config);
                    if (preset === 'first') {
                        newUnavailable[day] = [1];
                    } else if (preset === 'last') {
                        newUnavailable[day] = [dayTotalPeriods];
                    }
                });
            }

            return {
                ...prev,
                [teacherId]: {
                    ...current,
                    unavailablePeriods: newUnavailable
                }
            };
        });
        setHasUnsavedChanges(true);
    };

    // ----------------------------------------------------
    // Manual Cell Assignment / Swap
    // ----------------------------------------------------
    const handleSaveCellAssignment = (newSubjectId: string, newTeacherId: string) => {
        if (!editingCell) return;
        const { day, period, classId } = editingCell;

        const targetClass = classes.find(c => c.id === classId);
        const targetSubject = targetClass?.subjects.find(s => s.id === newSubjectId);
        const targetTeacher = teachers.find(t => t.id === newTeacherId);

        setSchedule(prev => {
            const nextSched = JSON.parse(JSON.stringify(prev));
            if (!nextSched[day]) {
                nextSched[day] = Array.from({ length: config.periodsPerDay }, (_, i) => ({
                    period: i + 1,
                    assignments: {}
                }));
            }

            const pData = nextSched[day].find((p: any) => p.period === period);
            if (pData) {
                if (newSubjectId === '__EMPTY__') {
                    delete pData.assignments[classId];
                } else if (targetSubject && targetTeacher && targetClass) {
                    pData.assignments[classId] = {
                        subject: targetSubject.name,
                        teacher: targetTeacher.name,
                        subjectId: targetSubject.id,
                        teacherId: targetTeacher.id,
                        classId: targetClass.id,
                        stage: targetClass.stage,
                        section: targetClass.section
                    };
                }
            }

            const updatedConflicts = findScheduleConflicts(
                nextSched,
                classes,
                teachers,
                teacherConstraints,
                config.activeDays,
                config.periodsPerDay
            );
            setConflicts(updatedConflicts);

            return nextSched;
        });

        setEditingCell(null);
        setHasUnsavedChanges(true);
    };

    // ----------------------------------------------------
    // Publish Schedule to Teachers & Students + Telegram Broadcast
    // ----------------------------------------------------
    const handlePublishSchedule = async () => {
        const principalId = principal.id;
        setIsPublishing(true);
        setPublishResult(null);

        try {
            const publishedToTeachers = publishTarget === 'all' || publishTarget === 'teachers';
            const publishedToStudents = publishTarget === 'all' || publishTarget === 'students';

            // 1. Durably save published payload in Firebase
            const publishPayload = {
                schedule,
                config,
                publishedAt: new Date().toISOString(),
                publishedBy: principal.name,
                academicYear: settings.academicYear || '2025 - 2026',
                effectiveDate: customPublishEffectiveDate,
                publishTarget,
                publishedToTeachers,
                publishedToStudents
            };

            const writePromises: Promise<any>[] = [
                db.ref(`published_schedules/${principalId}`).set(publishPayload),
                db.ref(`schedules/${principalId}`).set(schedule),
                db.ref(`schedule_config/${principalId}`).set(config),
                db.ref(`schedule_quotas/${principalId}`).set(classQuotas),
                db.ref(`schedule_teacher_constraints/${principalId}`).set(teacherConstraints)
            ];

            if (publishedToStudents) {
                writePromises.push(db.ref(`student_schedules/${principalId}`).set(schedule));
            } else {
                writePromises.push(db.ref(`student_schedules/${principalId}`).set({
                    isPublished: false,
                    unpublishedReason: 'published_to_teachers_only',
                    updatedAt: new Date().toISOString()
                }));
            }

            await Promise.all(writePromises);

            setHasUnsavedChanges(false);
            setPublishedInfo({
                publishTarget,
                publishedAt: publishPayload.publishedAt,
                effectiveDate: customPublishEffectiveDate
            });

            // 2. Process Telegram notifications if requested AND students are included
            let telegramSent = 0;
            let telegramFailed = 0;
            const errors: string[] = [];

            if (sendTelegramToStudents && publishedToStudents) {
                interface StudentNotificationItem {
                    id: string;
                    name: string;
                    telegramChatId: string;
                    classId: string;
                    stage: string;
                    section: string;
                }

                const studentsToNotify: StudentNotificationItem[] = [];
                classes.forEach(c => {
                    (c.students || []).forEach(s => {
                        if (s && s.id && s.telegramChatId && s.telegramChatId.trim()) {
                            studentsToNotify.push({
                                id: s.id,
                                name: s.name,
                                telegramChatId: s.telegramChatId.trim(),
                                classId: c.id,
                                stage: c.stage,
                                section: c.section
                            });
                        }
                    });
                });

                const botToken = telegramBotTokenInput.trim() || settings.telegramBotToken?.trim();

                if (!botToken) {
                    errors.push('لم يتم إرسال التليكرام: يرجى إدخال رمز البوت (Bot Token).');
                } else if (studentsToNotify.length === 0) {
                    // No students with registered Telegram IDs
                } else {
                    setPublishProgress({
                        total: studentsToNotify.length,
                        current: 0,
                        successCount: 0,
                        failCount: 0,
                        statusMessage: `جاري إرسال إشعارات التليكرام لـ (${studentsToNotify.length}) طالب...`
                    });

                    const telegramConfig: TelegramConfig = {
                        botToken: botToken,
                        enabled: true
                    };

                    for (let i = 0; i < studentsToNotify.length; i++) {
                        const st = studentsToNotify[i];
                        
                        // Build schedule summary for student's class
                        const daysLines: string[] = [];
                        const activeDaysList = (Array.isArray(config.activeDays) && config.activeDays.length > 0) 
                            ? config.activeDays 
                            : DEFAULT_ACTIVE_DAYS;
                        
                        activeDaysList.forEach(day => {
                            const pCount = getPeriodsForDay(day, config);
                            const dayPeriods = schedule[day] || [];
                            const subjNames: string[] = [];
                            
                            for (let p = 1; p <= pCount; p++) {
                                const pData = dayPeriods.find(dp => dp.period === p);
                                const assign = pData?.assignments?.[st.classId];
                                if (assign && assign.subject) {
                                    subjNames.push(`ح${p}: ${assign.subject}`);
                                }
                            }
                            
                            if (subjNames.length > 0) {
                                daysLines.push(`▫️ <b>${DAYS_ARABIC[day] || day}:</b> ${subjNames.join(' | ')}`);
                            }
                        });

                        const message = `🔔 <b>إشعار جدول الدروس الأسبوعي الجديد</b>\n` +
                            `🏛️ <b>${settings.schoolName || 'المدرسة'}</b>\n` +
                            `━━━━━━━━━━━━━━━━━━━\n` +
                            `👤 <b>الطالب:</b> ${st.name}\n` +
                            `🏫 <b>الصف والشعبة:</b> ${st.stage} (${st.section})\n` +
                            `📅 <b>تاريخ الاعتماد:</b> ${customPublishEffectiveDate}\n\n` +
                            `📖 <b>ملخص جدول الحصص الأسبوعي لشعبتك:</b>\n` +
                            (daysLines.length > 0 ? daysLines.join('\n') : 'تم إتاحة الجدول كاملاً على المنصة.') +
                            `\n\n💡 <i>ملاحظة: يمكنك الاطلاع على الجدول الدراسي وتصديره بصيغة PDF عبر الدخول إلى بوابتك في منصة المدرسة.</i>`;

                        try {
                            const res = await sendTelegramNotification(telegramConfig, st.telegramChatId, message);
                            if (res.success) {
                                telegramSent++;
                            } else {
                                telegramFailed++;
                                if (errors.length < 5 && res.error) {
                                    errors.push(`${st.name}: ${res.error}`);
                                }
                            }
                        } catch (err: any) {
                            telegramFailed++;
                            if (errors.length < 5) {
                                errors.push(`${st.name}: ${err?.message || 'فشل الاتصال'}`);
                            }
                        }

                        setPublishProgress({
                            total: studentsToNotify.length,
                            current: i + 1,
                            successCount: telegramSent,
                            failCount: telegramFailed,
                            statusMessage: `جاري الإرسال (${i + 1}/${studentsToNotify.length})...`
                        });

                        // Small delay to prevent hitting Telegram rate limit
                        if (i < studentsToNotify.length - 1) {
                            await new Promise(r => setTimeout(r, 60));
                        }
                    }
                }
            }

            let resultSuccessMsg = 'تم نشر وتعميم الجدول المدرسي بنجاح لكافة المدرسين والطلبة!';
            if (publishTarget === 'teachers') {
                resultSuccessMsg = 'تم نشر الجدول بنجاح لبوابة المدرسين فقط (مخفي عن الطلبة لحين الاعتماد النهائي).';
            } else if (publishTarget === 'students') {
                resultSuccessMsg = 'تم نشر الجدول بنجاح لبوابة الطلبة وتطبيق التليكرام فقط.';
            }

            setPublishResult({
                success: true,
                message: resultSuccessMsg,
                telegramSent,
                telegramFailed,
                errors
            });
        } catch (err: any) {
            console.error('Error publishing schedule:', err);
            setPublishResult({
                success: false,
                message: `حدث خطأ أثناء نشر الجدول: ${err?.message || 'يرجى المحاولة مجدداً'}`,
                telegramSent: 0,
                telegramFailed: 0,
                errors: [err?.message || 'خطأ غير معروف']
            });
        } finally {
            setIsPublishing(false);
            setPublishProgress(null);
        }
    };

    // ----------------------------------------------------
    // Compact Schedule & Eliminate Gaps
    // ----------------------------------------------------
    const handleCompactSchedule = () => {
        const { schedule: compactedSchedule, compactedMovesCount } = compactScheduleGaps(
            schedule,
            classes,
            teachers,
            teacherConstraints,
            config.activeDays,
            config.periodsPerDay
        );
        setSchedule(compactedSchedule);
        setHasUnsavedChanges(true);

        const updatedConflicts = findScheduleConflicts(
            compactedSchedule,
            classes,
            teachers,
            teacherConstraints,
            config.activeDays,
            config.periodsPerDay
        );
        setConflicts(updatedConflicts);

        if (compactedMovesCount > 0) {
            alert(`تم ضغط الجدول بنجاح وسحب ${compactedMovesCount} من الحصص للأعلى لسد الفراغات! أصبح الفراغ في نهاية اليوم فقط.`);
        } else {
            alert("الجدول مضغوط بالفعل وتتوالى الحصص دون أي فراغات في منتصف اليوم.");
        }
    };

    // ----------------------------------------------------
    // Drag & Drop Handler Functions with Conflict Validation
    // ----------------------------------------------------
    const handleDragStart = (
        e: React.DragEvent,
        day: string,
        period: number,
        classId: string,
        assignment: any
    ) => {
        if (!assignment || !assignment.subjectId) return;
        setDraggedCell({ day, period, classId, assignment });
        e.dataTransfer.setData('text/plain', JSON.stringify({ day, period, classId }));
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (
        e: React.DragEvent,
        day: string,
        period: number,
        classId: string
    ) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!dragOverCell || dragOverCell.day !== day || dragOverCell.period !== period || dragOverCell.classId !== classId) {
            setDragOverCell({ day, period, classId });
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        // Handled naturally or cleared on drop/dragend
    };

    const handleDragEnd = () => {
        setDraggedCell(null);
        setDragOverCell(null);
    };

    const handleDrop = (
        e: React.DragEvent,
        targetDay: string,
        targetPeriod: number,
        targetClassId: string
    ) => {
        e.preventDefault();
        setDragOverCell(null);

        if (!draggedCell) return;
        const source = {
            day: draggedCell.day,
            period: draggedCell.period,
            classId: draggedCell.classId
        };
        const target = {
            day: targetDay,
            period: targetPeriod,
            classId: targetClassId
        };

        // Same position
        if (source.day === target.day && source.period === target.period && source.classId === target.classId) {
            setDraggedCell(null);
            return;
        }

        // Validate Move / Swap using scheduler rules
        const validation = validateMoveOrSwap(
            schedule,
            source,
            target,
            classes,
            teachers,
            teacherConstraints,
            config.activeDays,
            config.periodsPerDay
        );

        if (!validation.valid) {
            setDraggedCell(null);
            setDragConflictAlert({
                title: 'تنبيه: تم منع التحريك لوجود تعارض في الجدول',
                message: validation.reason || 'يوجد تعارض في نقل أو تبديل هذه الحصة.'
            });
            return;
        }

        // Apply Move or Swap to Master Schedule
        setSchedule(prev => {
            const nextSched: MasterScheduleData = {};
            config.activeDays.forEach(d => {
                nextSched[d] = Array.from({ length: config.periodsPerDay }, (_, pIdx) => {
                    const existingPeriod = prev?.[d]?.[pIdx];
                    return {
                        period: pIdx + 1,
                        assignments: existingPeriod ? { ...existingPeriod.assignments } : {}
                    };
                });
            });

            const sourceAssign = nextSched[source.day]?.[source.period - 1]?.assignments?.[source.classId];
            const targetAssign = nextSched[target.day]?.[target.period - 1]?.assignments?.[target.classId];

            if (!sourceAssign) return prev;

            if (targetAssign && targetAssign.subjectId) {
                // Swap assignments
                nextSched[target.day][target.period - 1].assignments[target.classId] = { ...sourceAssign };
                nextSched[source.day][source.period - 1].assignments[source.classId] = { ...targetAssign };
            } else {
                // Move assignment
                nextSched[target.day][target.period - 1].assignments[target.classId] = { ...sourceAssign };
                delete nextSched[source.day][source.period - 1].assignments[source.classId];
            }

            const updatedConflicts = findScheduleConflicts(
                nextSched,
                classes,
                teachers,
                teacherConstraints,
                config.activeDays,
                config.periodsPerDay
            );
            setConflicts(updatedConflicts);

            return nextSched;
        });

        setHasUnsavedChanges(true);
        setDraggedCell(null);
    };

    // ----------------------------------------------------
    // Selected Class Total Quota vs Capacity
    // ----------------------------------------------------
    const selectedClassData = useMemo(() => {
        return classes.find(c => c.id === selectedClassId) || classes[0];
    }, [classes, selectedClassId]);

    const selectedClassTotalQuota = useMemo(() => {
        if (!selectedClassData) return 0;
        const q = classQuotas[selectedClassData.id] || {};
        return selectedClassData.subjects.reduce((acc, s) => {
            const count = q[s.id] !== undefined ? q[s.id] : getDefaultQuotaForSubject(s.name, settings.schoolLevel);
            return acc + count;
        }, 0);
    }, [selectedClassData, classQuotas, settings.schoolLevel]);

    const weeklyCapacity = config.activeDays.length * config.periodsPerDay;

    // ----------------------------------------------------
    // Maximum Class Quota in School (Validation Baseline)
    // ----------------------------------------------------
    const classQuotaDetails = useMemo(() => {
        if (!classes || classes.length === 0) {
            return { maxQuota: 0, maxClassName: '', maxStageName: '', allQuotas: {} as Record<string, number> };
        }
        let maxQ = 0;
        let maxClsName = '';
        let maxStgName = '';
        const map: Record<string, number> = {};

        classes.forEach(cls => {
            const q = classQuotas[cls.id] || {};
            const total = (cls.subjects || []).reduce((acc, s) => {
                const count = q[s.id] !== undefined ? q[s.id] : getDefaultQuotaForSubject(s.name, settings.schoolLevel);
                return acc + count;
            }, 0);
            map[cls.id] = total;
            if (total > maxQ) {
                maxQ = total;
                maxClsName = `${cls.stage} (${cls.section})`;
                maxStgName = cls.stage;
            }
        });

        return {
            maxQuota: maxQ,
            maxClassName: maxClsName,
            maxStageName: maxStgName,
            allQuotas: map
        };
    }, [classes, classQuotas, settings.schoolLevel]);

    // Capacity reduction validator: rejects reduction if weekly capacity falls below maximum class quota
    const checkCapacityReduction = (prospectiveConfig: GeneralScheduleConfig): boolean => {
        const prospectiveCapacity = getTotalWeeklyCapacity(prospectiveConfig);
        const maxQuota = classQuotaDetails.maxQuota;

        if (maxQuota > 0 && prospectiveCapacity < maxQuota) {
            setCapacityAlert({
                attemptedCapacity: prospectiveCapacity,
                maxQuota: maxQuota,
                maxStageName: classQuotaDetails.maxStageName,
                maxClassName: classQuotaDetails.maxClassName
            });
            return false;
        }
        return true;
    };

    // ----------------------------------------------------
    // Render Modals
    // ----------------------------------------------------
    const renderCapacityAlertModal = () => {
        if (!capacityAlert) return null;

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[130] p-4" dir="rtl">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-rose-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center gap-3.5 text-rose-950">
                        <div className="p-3 rounded-2xl bg-rose-600 text-white shadow-md">
                            <ShieldAlert size={26} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black">تعذر تقليل الحصص عن النصاب المطلوب</h3>
                            <p className="text-xs text-rose-700 font-medium mt-0.5">تم رفض التعديل للحفاظ على اكتمال نصاب الشعبة الأعلى حصصاً</p>
                        </div>
                    </div>

                    <div className="p-6 text-sm text-gray-700 space-y-4">
                        <div className="p-4 bg-rose-50/70 border border-rose-200 rounded-2xl leading-relaxed text-gray-900 font-medium">
                            حاولت تحديد مجموع الحصص الأسبوعية إلى <strong className="text-rose-700 text-base font-black">({capacityAlert.attemptedCapacity} حصة)</strong>، ولكن أعلى نصاب معتمد للشعب في المدرسة هو <strong className="text-rose-700 text-base font-black">({capacityAlert.maxQuota} حصة أسبوعياً)</strong> لشعبة <strong className="text-gray-950 font-bold">[{capacityAlert.maxClassName}]</strong>.
                        </div>

                        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-950 text-xs flex items-start gap-2.5">
                            <Info size={20} className="text-amber-600 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <span className="font-bold block">قاعدة نظام الجدول الذكي:</span>
                                <p className="text-amber-800 leading-relaxed">
                                    يرفض النظام تقليل عدد الحصص عن النصاب الإجمالي المطلوب لأكبر شعبة من حيث عدد الحصص ({capacityAlert.maxQuota} حصة)، لضمان استيعاب كافة المواد والأنصبة المقررة لجميع الصفوف دون حدوث نقص في الخطة الدراسية لأي شعبة.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                        <button
                            type="button"
                            onClick={() => setCapacityAlert(null)}
                            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl font-black text-xs shadow-md transition"
                        >
                            حسناً، فهمت (الإبقاء على {capacityAlert.maxQuota} حصة فأكثر)
                        </button>
                    </div>
                </div>
            </div>
        );
    };
    const renderConflictModal = () => {
        if (!showConflictModal) return null;

        const isSuccess = generationSummary?.success;

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[120] p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className={`p-5 flex items-center justify-between border-b ${
                        isSuccess ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-amber-50 border-amber-100 text-amber-900'
                    }`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl ${isSuccess ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'}`}>
                                {isSuccess ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">
                                    {isSuccess ? 'تم توليد الجدول بنجاح تام!' : 'تقرير توليد الجدول وملاحظات التوزيع'}
                                </h3>
                                <p className="text-xs opacity-80 mt-0.5">
                                    {generationSummary ? `استغرق التوزيع: ${generationSummary.statistics.generationTimeMs} مللي ثانية | نسبة التغطية: ${generationSummary.statistics.coveragePercentage}%` : 'تحليل القيود والتعارضات'}
                                </p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setShowConflictModal(false)}
                            className="p-1.5 hover:bg-black/10 rounded-lg text-gray-500 hover:text-gray-800 transition"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 overflow-y-auto space-y-4 flex-grow text-sm">
                        {generationSummary && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-center">
                                    <p className="text-xs text-blue-600 font-bold">الحصص الموزعة</p>
                                    <p className="text-xl font-black text-blue-900 mt-1">
                                        {generationSummary.placedCount} / {generationSummary.totalRequiredCount}
                                    </p>
                                </div>
                                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                                    <p className="text-xs text-emerald-600 font-bold">عدد الشعب</p>
                                    <p className="text-xl font-black text-emerald-900 mt-1">{classes.length}</p>
                                </div>
                                <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl text-center">
                                    <p className="text-xs text-purple-600 font-bold">المدرسون المتاحون</p>
                                    <p className="text-xl font-black text-purple-900 mt-1">{teachers.length}</p>
                                </div>
                                <div className={`p-3 border rounded-xl text-center ${
                                    conflicts.length === 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'
                                }`}>
                                    <p className={`text-xs font-bold ${conflicts.length === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>التعارضات</p>
                                    <p className={`text-xl font-black mt-1 ${conflicts.length === 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                                        {conflicts.length}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Auto-Repair Notice if triggered */}
                        {autoRepairNotice && (
                            <div className={`p-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-3 ${
                                autoRepairNotice.success
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                                    : 'bg-amber-50 border-amber-300 text-amber-950'
                            }`}>
                                {autoRepairNotice.success ? (
                                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                                ) : (
                                    <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                                )}
                                <div>
                                    <p className="font-bold">{autoRepairNotice.message}</p>
                                </div>
                            </div>
                        )}

                        {/* High Conflict Count (>10) Optimization Suggestion Banner */}
                        {conflicts.length > 10 ? (
                            <div className="p-4 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-400 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-pulse">
                                <div className="flex items-start gap-3 text-amber-950">
                                    <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs shrink-0 mt-0.5">
                                        <Sparkles size={20} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-black text-sm text-amber-950">
                                                تم رصد أكثر من 10 تعارضات ({conflicts.length} تعارضاً) في هذا التوزيع
                                            </p>
                                            <span className="bg-rose-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                تحسين موصى به
                                            </span>
                                        </div>
                                        <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                                            يمكنك الضغط على الزر أدناه لإجراء محاولة جديدة تعتمد على استكشاف عشرات التباديل وتطبيق خوارزمية التبادل الذكي لتقليل التعارضات وتكرار المواد إلى أدنى حد ممكن.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleGenerateOptimizedSchedule(30)}
                                    disabled={isGenerating || isAutoRepairing}
                                    className="shrink-0 w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:scale-95 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                                >
                                    <RefreshCw size={15} className={isGenerating ? "animate-spin" : ""} />
                                    <span>{isGenerating ? 'جارِ التحسين والتبديل...' : 'إجراء محاولة أخرى لتقليل التعارضات'}</span>
                                </button>
                            </div>
                        ) : conflicts.length > 0 ? (
                            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-xs">
                                <div className="flex items-center gap-2 text-amber-900">
                                    <Sparkles size={16} className="text-amber-600 shrink-0" />
                                    <span>يوجد {conflicts.length} تعارضات يمكن تقليلها بمحاولة ذكية أخرى:</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleGenerateOptimizedSchedule(20)}
                                    disabled={isGenerating || isAutoRepairing}
                                    className="shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                                >
                                    <RefreshCw size={13} className={isGenerating ? "animate-spin" : ""} />
                                    <span>إجراء محاولة أخرى</span>
                                </button>
                            </div>
                        ) : null}

                        {/* Conflicts List */}
                        {conflicts.length > 0 ? (
                            <div className="space-y-3 mt-4">
                                <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                    <ShieldAlert className="text-amber-600" size={18} />
                                    <span>التعارضات والقيود التي تحتاج انتباهك ({conflicts.length}):</span>
                                </h4>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {conflicts.map((conf, idx) => (
                                        <div key={idx} className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs flex items-start gap-2.5">
                                            <AlertTriangle className="text-rose-600 flex-shrink-0 mt-0.5" size={16} />
                                            <div>
                                                <p className="font-bold">{conf.message}</p>
                                                {conf.details && <p className="text-rose-700 mt-1">{conf.details}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-center gap-3">
                                <CheckCircle2 className="text-emerald-600" size={24} />
                                <div>
                                    <p className="font-bold">الجدول متكامل وخالٍ من أي تعارضات!</p>
                                    <p className="text-xs text-emerald-700 mt-0.5">تم التحقق من منع تضارب المدرسين، احترام أيام الإجازة، والالتزام بكافة الحصص المسندة.</p>
                                </div>
                            </div>
                        )}

                        {/* Dynamic Live Unassigned items list */}
                        {dynamicUnplacedLessons.length > 0 ? (
                            <div className="space-y-3 mt-4 p-4 bg-amber-50/70 border border-amber-200 rounded-2xl">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                    <div>
                                        <h4 className="font-black text-amber-950 text-sm flex items-center gap-2">
                                            <AlertTriangle size={18} className="text-amber-600" />
                                            <span>حصص تعذر وضعها بسبب القيود ({totalMissingLessonsCount} حصة متبقية):</span>
                                        </h4>
                                        <p className="text-[11px] text-amber-800 mt-0.5">
                                            💡 تختفي كل مشكلة تلقائياً من القائمة فور حلها يدوياً بسحب الحصة أو عند استخدام الحل الآلي.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAutoRepairSchedule}
                                        disabled={isAutoRepairing || isGenerating}
                                        className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-md transition disabled:opacity-50"
                                    >
                                        <Sparkles size={15} className={isAutoRepairing ? "animate-spin" : ""} />
                                        <span>{isAutoRepairing ? 'جارِ التصحيح والتوزيع...' : '✨ محاولة تصحيح الجدول وتوزيع الحصص آلياً'}</span>
                                    </button>
                                </div>

                                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                    {dynamicUnplacedLessons.map((item, idx) => (
                                        <div key={idx} className="p-2.5 bg-white border border-amber-200 rounded-xl text-xs flex flex-wrap justify-between items-center gap-2 text-gray-800 shadow-2xs">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 bg-cyan-100 text-cyan-900 rounded-md font-bold text-[11px]">
                                                    {item.className}
                                                </span>
                                                <span className="font-bold text-gray-900">مادة {item.subjectName}</span>
                                                <span className="text-gray-500 font-medium">({item.teacherName})</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="bg-amber-100 text-amber-900 px-2.5 py-1 rounded-lg font-black text-xs">
                                                    متبقي: {item.missingCount} حصة (موزع {item.placedCount}/{item.requiredQuota})
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedClassId(item.classId);
                                                        setDisplayMode('by_class');
                                                        setActiveTab('schedule_view');
                                                        setShowConflictModal(false);
                                                    }}
                                                    className="px-2.5 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-300 rounded-lg text-xs font-bold transition"
                                                    title="الانتقال لجدول هذه الشعبة للتوزيع اليدوي"
                                                >
                                                    وضع يدوي
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                                <span className="font-bold">كافة أنصبة المواد تم وضعها وتوزيعها بنسبة 100% ولا توجد أي حصص متبقية!</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            {dynamicUnplacedLessons.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleAutoRepairSchedule}
                                    disabled={isAutoRepairing || isGenerating}
                                    className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition disabled:opacity-50"
                                >
                                    <Sparkles size={14} className={isAutoRepairing ? "animate-spin" : ""} />
                                    <span>{isAutoRepairing ? 'جارِ التصحيح الآلي...' : 'تصحيح الجدول وحل الحصص آلياً'}</span>
                                </button>
                            )}

                            {conflicts.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => handleGenerateOptimizedSchedule(30)}
                                    disabled={isGenerating || isAutoRepairing}
                                    className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-xs transition active:scale-95 disabled:opacity-50"
                                >
                                    <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
                                    <span>إجراء محاولة جديدة</span>
                                </button>
                            )}
                        </div>

                        <button
                            onClick={() => setShowConflictModal(false)}
                            className="px-5 py-2 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-xl text-xs transition shadow-md ms-auto"
                        >
                            إغلاق ومتابعة
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ----------------------------------------------------
    // Persistent Unplaced / Missing Lessons Modal
    // ----------------------------------------------------
    const renderUnassignedLessonsModal = () => {
        if (!showUnassignedModal) return null;

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[125] p-4" dir="rtl">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="p-5 bg-gradient-to-r from-cyan-900 via-cyan-800 to-blue-900 text-white flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20">
                                <BookOpen size={24} className="text-cyan-300" />
                            </div>
                            <div>
                                <h3 className="text-lg sm:text-xl font-black">
                                    قائمة الحصص المتعذرة والمتبقية للتوزيع ({totalMissingLessonsCount} حصة)
                                </h3>
                                <p className="text-xs text-cyan-200 mt-0.5">
                                    متابعة الحصص التي تعذر وضعها بسبب القيود أو تحتاج إسناد يدوي، وتختفي كل مادة فور حلها
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowUnassignedModal(false)}
                            className="p-2 hover:bg-white/10 rounded-xl text-white transition"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Controls & Quick Auto-Repair Bar */}
                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-700">
                                الحصص المتبقية: <strong className="text-rose-700 text-sm font-black">{totalMissingLessonsCount} حصة</strong> عبر {dynamicUnplacedLessons.length} مادة
                            </span>
                        </div>

                        {dynamicUnplacedLessons.length > 0 && (
                            <button
                                type="button"
                                onClick={handleAutoRepairSchedule}
                                disabled={isAutoRepairing || isGenerating}
                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white font-black rounded-xl text-xs shadow-md transition disabled:opacity-50"
                            >
                                <Sparkles size={15} className={isAutoRepairing ? "animate-spin" : ""} />
                                <span>{isAutoRepairing ? 'جارِ المعالجة والتوزيع الذكي...' : '✨ محاولة حل وتوزيع كافة الحصص آلياً'}</span>
                            </button>
                        )}
                    </div>

                    {/* Notice if any */}
                    {autoRepairNotice && (
                        <div className={`p-4 mx-5 mt-4 rounded-2xl border text-xs leading-relaxed flex items-start gap-3 ${
                            autoRepairNotice.success
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                                : 'bg-amber-50 border-amber-300 text-amber-950'
                        }`}>
                            {autoRepairNotice.success ? (
                                <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                                <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                            )}
                            <div>
                                <p className="font-bold">{autoRepairNotice.message}</p>
                            </div>
                        </div>
                    )}

                    {/* List Content */}
                    <div className="p-5 overflow-y-auto space-y-3 flex-grow text-sm">
                        {dynamicUnplacedLessons.length === 0 ? (
                            <div className="p-8 text-center bg-emerald-50/70 border border-emerald-200 rounded-3xl text-emerald-900 space-y-3">
                                <div className="w-16 h-16 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md">
                                    <CheckCircle2 size={36} />
                                </div>
                                <h4 className="text-lg font-black text-emerald-950">
                                    تهانينا! اكتمل توزيع جميع الحصص بنسبة 100%
                                </h4>
                                <p className="text-xs text-emerald-800 max-w-md mx-auto leading-relaxed">
                                    تم استيفاء كافة أنصبة المواد لجميع الصفوف والشعب الدراسية دون وجود أي حصة متعذرة أو متبقية.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {dynamicUnplacedLessons.map((item, idx) => (
                                    <div
                                        key={idx}
                                        className="p-4 bg-white border border-gray-200 hover:border-cyan-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs transition"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-900 flex items-center justify-center font-black text-sm shrink-0">
                                                {item.section || 'ش'}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-black text-gray-900 text-sm">{item.className}</span>
                                                    <span className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200 rounded-md">
                                                        {item.subjectName}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    المدرس: <strong className="text-gray-800">{item.teacherName}</strong>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 self-end sm:self-center">
                                            <div className="text-left sm:text-right">
                                                <span className="px-3 py-1 bg-amber-100 text-amber-900 font-black rounded-lg text-xs block">
                                                    متبقي {item.missingCount} حصة
                                                </span>
                                                <span className="text-[10px] text-gray-500 font-medium block mt-0.5">
                                                    موزع {item.placedCount} من {item.requiredQuota}
                                                </span>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedClassId(item.classId);
                                                    setDisplayMode('by_class');
                                                    setActiveTab('schedule_view');
                                                    setShowUnassignedModal(false);
                                                }}
                                                className="px-3.5 py-2 bg-cyan-700 hover:bg-cyan-800 active:scale-95 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center gap-1.5"
                                                title="الانتقال لجدول هذه الشعبة لوضع الحصة يدوياً"
                                            >
                                                <span>وضع يدوي</span>
                                                <ArrowRightLeft size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-xs">
                        <span className="text-gray-500">
                            💡 تتوفر هذه القائمة في أي وقت للاطلاع عليها وإدارتها يدوياً أو آلياً.
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowUnassignedModal(false)}
                            className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl font-bold transition"
                        >
                            إغلاق
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ----------------------------------------------------
    // Clear Schedule Confirmation Modal
    // ----------------------------------------------------
    const renderClearScheduleConfirmModal = () => {
        if (!showClearScheduleConfirm) return null;

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[140] p-4" dir="rtl">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-rose-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center gap-3.5 text-rose-950">
                        <div className="p-3 rounded-2xl bg-rose-600 text-white shadow-md">
                            <Trash2 size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black">تفريغ وتصفير الجدول المدرسي</h3>
                            <p className="text-xs text-rose-700 font-medium mt-0.5">مسح جميع الحصص الموزعة في الجدول الأسبوعي</p>
                        </div>
                    </div>

                    <div className="p-6 text-sm text-gray-700 space-y-4">
                        <div className="p-4 bg-rose-50/50 border border-rose-200 rounded-2xl leading-relaxed text-gray-900 font-medium">
                            هل أنت متأكد من رغبتك في <strong className="text-rose-700 font-black">تفريغ ومسح جميع حصص الجدول بالكامل</strong> لكافة الشعب والصفوف؟
                        </div>

                        <p className="text-xs text-gray-500 leading-relaxed">
                            💡 ستتحول جميع خانات الجدول إلى فراغات فارغة، مع الاحتفاظ بكافة أنصبة المواد وإعدادات أيام التفرغ كما هي، لتتمكن من إعادة توليد الجدول تلقائياً أو إعادة بنائه يدوياً في أي وقت.
                        </p>
                    </div>

                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setShowClearScheduleConfirm(false)}
                            className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 active:scale-95 text-gray-700 rounded-xl font-bold text-xs transition"
                        >
                            إلغاء التراجع
                        </button>

                        <button
                            type="button"
                            onClick={handleClearScheduleConfirmed}
                            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl font-black text-xs shadow-md transition flex items-center gap-2"
                        >
                            <Trash2 size={16} />
                            <span>تأكيد تفريغ الجدول الآن</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ----------------------------------------------------
    // Render Edit Cell Modal
    // ----------------------------------------------------
    const renderEditCellModal = () => {
        if (!editingCell) return null;
        const { day, period, classId } = editingCell;
        const cls = classes.find(c => c.id === classId);
        if (!cls) return null;

        const currentAssignment = schedule[day]?.find(p => p.period === period)?.assignments?.[classId];

        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[130] p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden">
                    <div className="p-4 bg-cyan-700 text-white flex justify-between items-center">
                        <div>
                            <h3 className="font-bold text-lg">تعديل الحصة الدراسية</h3>
                            <p className="text-xs text-cyan-100">
                                {cls.stage} {cls.section} &bull; {DAYS_ARABIC[day] || day} &bull; الحصة {period}
                            </p>
                        </div>
                        <button onClick={() => setEditingCell(null)} className="p-1 hover:bg-cyan-600 rounded-lg text-white">
                            <X size={18} />
                        </button>
                    </div>

                    <div className="p-5 space-y-4">
                        <p className="text-xs text-gray-500">
                            اختر المادة والمدرس لتثبيتها في هذه الخانة، أو تفريغ الخانة:
                        </p>

                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {/* Empty Cell Option */}
                            <button
                                type="button"
                                onClick={() => handleSaveCellAssignment('__EMPTY__', '')}
                                className="w-full p-2.5 rounded-xl border border-dashed border-red-300 hover:bg-red-50 text-red-600 text-xs font-bold text-right transition flex items-center justify-between"
                            >
                                <span>تفريغ هذه الخانة (حصة فراغ)</span>
                                <Trash2 size={16} />
                            </button>

                            {cls.subjects.map(subj => {
                                const assignedTeacher = teachers.find(t => 
                                    t.assignments?.some(a => a.classId === cls.id && a.subjectId === subj.id)
                                );

                                const teacherName = assignedTeacher ? assignedTeacher.name : 'غير مسند';
                                const isCurrent = currentAssignment?.subjectId === subj.id;

                                // Check conflict in real-time
                                const teacherOffDays = Array.isArray(assignedTeacher && teacherConstraints[assignedTeacher.id]?.offDays)
                                    ? teacherConstraints[assignedTeacher.id].offDays
                                    : [];
                                const isTeacherOff = assignedTeacher 
                                    ? teacherOffDays.includes(day)
                                    : false;

                                return (
                                    <button
                                        key={subj.id}
                                        type="button"
                                        onClick={() => {
                                            if (assignedTeacher) {
                                                handleSaveCellAssignment(subj.id, assignedTeacher.id);
                                            } else {
                                                alert("يرجى إسناد مدرس لهذه المادة أولاً من لوحة إدارة المدرسين.");
                                            }
                                        }}
                                        className={`w-full p-3 rounded-xl border text-right transition flex items-center justify-between ${
                                            isCurrent 
                                                ? 'border-cyan-600 bg-cyan-50 font-bold' 
                                                : 'border-gray-200 hover:border-cyan-400 bg-white hover:bg-gray-50'
                                        }`}
                                    >
                                        <div>
                                            <p className="text-gray-900 font-bold">{subj.name}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">المدرس: {teacherName}</p>
                                        </div>
                                        {isTeacherOff && (
                                            <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                                                يوم إجازة للمدرس
                                            </span>
                                        )}
                                        {isCurrent && (
                                            <Check className="text-cyan-700" size={18} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                        <button
                            type="button"
                            onClick={() => setEditingCell(null)}
                            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold text-xs"
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ----------------------------------------------------
    // Drag & Drop Conflict Alert Modal
    // ----------------------------------------------------
    const renderDragConflictAlertModal = () => {
        if (!dragConflictAlert) return null;

        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[130] p-4">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-rose-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                    <div className="p-5 bg-rose-50 border-b border-rose-100 flex items-center gap-3 text-rose-900">
                        <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-xs">
                            <ShieldAlert size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black">{dragConflictAlert.title}</h3>
                            <p className="text-xs text-rose-700 mt-0.5">تم إلغاء النقل للحفاظ على سلامة الجدول</p>
                        </div>
                    </div>

                    <div className="p-6 text-sm text-gray-700 space-y-4">
                        <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-xl leading-relaxed text-gray-800 font-medium">
                            {dragConflictAlert.message}
                        </div>
                        <p className="text-xs text-gray-500">
                            💡 النظام يمنع تلقائياً أي نقل يؤدي إلى تضارب في حصص المدرسين، أو انتهاك أيام التفرغ، أو تكرار نفس الدرس للشعبة في اليوم الواحد.
                        </p>
                    </div>

                    <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end">
                        <button
                            type="button"
                            onClick={() => setDragConflictAlert(null)}
                            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl font-bold text-xs shadow-xs transition"
                        >
                            حسناً، فهمت
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ----------------------------------------------------
    // Full Stage Schedule Export & Print Preview Modal
    // ----------------------------------------------------
    const handleDirectStagePDFDownload = async (stage: string) => {
        setIsExportingPDF(true);
        try {
            await exportStageScheduleDirectPDF('stage-schedule-printable-card', stage, stagePaperSize);
        } catch (err) {
            console.error('Error generating stage PDF:', err);
        } finally {
            setIsExportingPDF(false);
        }
    };

    const renderStageScheduleModal = () => {
        if (!showStageModal) return null;

        const currentStage = selectedStageForExport || (stagesList.length > 0 ? stagesList[0] : '');
        const classesInCurrentStage = classes
            .filter(c => (c.stage || '').trim() === currentStage.trim())
            .sort((a, b) => compareSections(a.section || '', b.section || ''));

        const schoolName = settings.schoolName || 'متوسطة بطل خيبر';

        return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-[140] p-3 sm:p-5 overflow-y-auto">
                <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl border border-gray-200 overflow-hidden flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-200">
                    {/* Modal Top Header */}
                    <div className="p-5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 text-white flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-2xl bg-white/10 backdrop-blur-xs border border-white/20">
                                <GraduationCap size={24} className="text-indigo-300" />
                            </div>
                            <div>
                                <h3 className="text-lg sm:text-xl font-black">
                                    جدول المرحلة الدراسية الكاملة
                                </h3>
                                <p className="text-xs text-indigo-200 mt-0.5">
                                    تصدير ومعاينة جدول شعب المرحلة كافة في ورقة واحدة منظمة (A3 / A4)
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowStageModal(false)}
                            className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition text-white"
                            title="إغلاق"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Controls Bar */}
                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <label className="font-bold text-gray-700">المرحلة الدراسية:</label>
                                <select
                                    value={currentStage}
                                    onChange={(e) => setSelectedStageForExport(e.target.value)}
                                    className="px-3 py-2 bg-white border border-gray-300 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                                >
                                    {stagesList.map(stg => (
                                        <option key={stg} value={stg}>
                                            {stg} ({classes.filter(c => (c.stage || '').trim() === stg.trim()).length} شعب)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex items-center gap-2">
                                <label className="font-bold text-gray-700">يعمل به بتاريخ:</label>
                                <input
                                    type="text"
                                    value={stageEffectiveDate}
                                    onChange={(e) => setStageEffectiveDate(e.target.value)}
                                    placeholder="٢٠٢٦ / ٣ / ٢٥"
                                    className="px-3 py-2 bg-white border border-gray-300 rounded-xl font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 shadow-2xs w-32 text-center"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <label className="font-bold text-gray-700">حجم الورقة:</label>
                                <select
                                    value={stagePaperSize}
                                    onChange={(e) => setStagePaperSize(e.target.value as 'a3' | 'a4')}
                                    className="px-3 py-2 bg-white border border-indigo-300 text-indigo-950 rounded-xl font-bold focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                                >
                                    <option value="a3">ورقة واحدة A3 (موصى به للطباعة)</option>
                                    <option value="a4">ورقة واحدة A4 (مضغوط)</option>
                                </select>
                            </div>
                        </div>

                        {/* Action Export Buttons */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Direct PDF Export */}
                            <button
                                onClick={() => handleDirectStagePDFDownload(currentStage)}
                                disabled={isExportingPDF}
                                className="flex items-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-800 disabled:bg-gray-400 text-white rounded-xl font-bold shadow-xs transition active:scale-95"
                                title="تحميل مباشر لملف PDF جاهز على ورقة واحدة"
                            >
                                <Download size={16} />
                                <span>{isExportingPDF ? 'جارِ إنشاء PDF...' : 'تصدير مباشر PDF'}</span>
                            </button>

                            {/* Word Export */}
                            <button
                                onClick={() => exportStageScheduleWord(
                                    currentStage,
                                    classesInCurrentStage,
                                    schedule,
                                    settings,
                                    config.activeDays,
                                    config.periodsPerDay,
                                    stageEffectiveDate,
                                    stagePaperSize
                                )}
                                className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-bold shadow-xs transition active:scale-95"
                                title="تصدير ملف Word منسق لورقة واحدة"
                            >
                                <FileText size={16} />
                                <span>تصدير Word (.doc)</span>
                            </button>

                            {/* Standard Print / PDF Preview (Previous Style) */}
                            <button
                                onClick={() => printStageSchedulePDF(
                                    currentStage,
                                    classesInCurrentStage,
                                    schedule,
                                    settings,
                                    config.activeDays,
                                    config.periodsPerDay,
                                    stageEffectiveDate,
                                    stagePaperSize
                                )}
                                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-xs transition active:scale-95"
                                title="طباعة مباشرة / حفظ PDF بالأسلوب السابق"
                            >
                                <Printer size={16} />
                                <span>طباعة / نافذة الطباعة</span>
                            </button>
                        </div>
                    </div>

                    {/* Table Live Preview Container */}
                    <div className="p-4 sm:p-6 overflow-auto flex-1 bg-white">
                        {classesInCurrentStage.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 font-bold">
                                لا توجد شعب مضافة في هذه المرحلة حالياً.
                            </div>
                        ) : (
                            <div id="stage-schedule-printable-card" className="border-2 border-black rounded-lg overflow-hidden p-3 bg-white max-w-full">
                                {/* Top School Header Bar */}
                                <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-3 text-black font-black text-sm sm:text-base">
                                    <div>إدارة {schoolName}</div>
                                    <div className="text-base sm:text-lg">
                                        جدول الدروس الأسبوعي ( {currentStage} )
                                    </div>
                                    <div className="text-xs sm:text-sm">
                                        يعمل به بتاريخ {stageEffectiveDate}
                                    </div>
                                </div>

                                {/* Table Matching the Exact Image Format */}
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse text-center border-2 border-black">
                                        <thead>
                                            {/* Row 1: Day, Period, Section Titles */}
                                            <tr>
                                                <th
                                                    rowSpan={2}
                                                    className="border-2 border-black bg-[#0284c7] text-white font-black text-xs sm:text-sm p-2 w-14"
                                                >
                                                    اليوم
                                                </th>
                                                <th
                                                    rowSpan={2}
                                                    className="border-2 border-black bg-[#0284c7] text-white font-black text-xs sm:text-sm p-2 w-10"
                                                >
                                                    الدرس
                                                </th>
                                                {classesInCurrentStage.map((cls, idx) => {
                                                    const color = SECTION_COLORS[idx % SECTION_COLORS.length];
                                                    return (
                                                        <th
                                                            key={cls.id}
                                                            colSpan={2}
                                                            style={{ backgroundColor: color.headerBg }}
                                                            className="border-2 border-black text-black font-black text-sm sm:text-base p-2"
                                                        >
                                                            {cls.stage} {cls.section}
                                                        </th>
                                                    );
                                                })}
                                            </tr>
                                            {/* Row 2: Sub-headers (المادة | المدرس) */}
                                            <tr>
                                                {classesInCurrentStage.map((cls, idx) => {
                                                    const color = SECTION_COLORS[idx % SECTION_COLORS.length];
                                                    return (
                                                        <React.Fragment key={`sub_${cls.id}`}>
                                                            <th
                                                                style={{ backgroundColor: color.subHeaderBg }}
                                                                className="border-2 border-black text-black font-bold text-xs sm:text-sm p-1.5 w-24"
                                                            >
                                                                المادة
                                                            </th>
                                                            <th
                                                                style={{ backgroundColor: color.subHeaderBg }}
                                                                className="border-2 border-black text-black font-bold text-xs sm:text-sm p-1.5 w-28"
                                                            >
                                                                المدرس
                                                            </th>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {config.activeDays.map(day => {
                                                const dayColor = DAY_COLORS[day] || { bg: '#1e3a8a', text: '#ffffff' };
                                                return Array.from({ length: config.periodsPerDay }, (_, pIdx) => {
                                                    const period = pIdx + 1;
                                                    const pColor = PERIOD_COLORS[period] || { bg: '#475569', text: '#ffffff', arNum: `${period}` };

                                                    return (
                                                        <tr key={`${day}_${period}`}>
                                                            {/* Vertical Day Column with Distinct Day Color */}
                                                            {period === 1 && (
                                                                <td
                                                                    rowSpan={config.periodsPerDay}
                                                                    style={{
                                                                        backgroundColor: dayColor.bg,
                                                                        color: dayColor.text,
                                                                        writingMode: 'vertical-rl',
                                                                        textOrientation: 'upright',
                                                                        letterSpacing: '3px'
                                                                    }}
                                                                    className="border-2 border-black font-black text-sm sm:text-base p-1 text-center align-middle shadow-inner"
                                                                >
                                                                    {DAYS_ARABIC[day] || day}
                                                                </td>
                                                            )}

                                                            {/* Colored Period Number */}
                                                            <td
                                                                style={{ backgroundColor: pColor.bg, color: pColor.text }}
                                                                className="border-2 border-black font-black text-sm sm:text-base p-1.5 align-middle"
                                                            >
                                                                {pColor.arNum}
                                                            </td>

                                                            {/* Section Subject & Teacher Columns */}
                                                            {classesInCurrentStage.map((cls, idx) => {
                                                                const color = SECTION_COLORS[idx % SECTION_COLORS.length];
                                                                const dayPeriods = schedule[day] || [];
                                                                const pData = dayPeriods.find(dp => dp.period === period);
                                                                const assign = pData?.assignments?.[cls.id];

                                                                const repeatInfo = getSubjectDayRepeatInfo(day, cls.id, assign?.subjectId, assign?.subject);
                                                                const isRepeated = Boolean(assign && repeatInfo.isRepeated);

                                                                return (
                                                                    <React.Fragment key={`${cls.id}_${day}_${period}`}>
                                                                        <td
                                                                            style={{ backgroundColor: isRepeated ? '#fef3c7' : color.contentBg }}
                                                                            className={`border-2 border-black p-1.5 align-middle text-xs sm:text-sm font-extrabold ${isRepeated ? 'text-amber-950 ring-1 ring-amber-400' : 'text-black'}`}
                                                                        >
                                                                            {assign ? (
                                                                                <div className="flex flex-col items-center">
                                                                                    <span>{assign.subject}</span>
                                                                                    {isRepeated && (
                                                                                        <span className="text-[9px] bg-amber-500 text-white px-1 py-0.2 rounded font-black mt-0.5">
                                                                                            مكرر ({repeatInfo.count})
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-gray-400 font-normal">-</span>
                                                                            )}
                                                                        </td>
                                                                        <td
                                                                            style={{ backgroundColor: isRepeated ? '#fef3c7' : color.contentBg }}
                                                                            className="border-2 border-black p-1.5 align-middle text-xs sm:text-sm font-semibold text-gray-900"
                                                                        >
                                                                            {assign ? assign.teacher : <span className="text-gray-400 font-normal">-</span>}
                                                                        </td>
                                                                    </React.Fragment>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                });
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Modal Footer */}
                    <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-xs text-gray-500">
                        <span>💡 تم ضغط وتنسيق الجدول ليظهر في ورقة واحدة فقط (A3 أو A4) ملائمة للطباعة والحفظ دون انقسام على عدة صفحات.</span>
                        <button
                            type="button"
                            onClick={() => setShowStageModal(false)}
                            className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-bold"
                        >
                            إغلاق المعاينة
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    // ----------------------------------------------------
    // Tab 1: Schedule View (By Class, Teacher, or Master Grid)
    // ----------------------------------------------------
    const renderScheduleViewTab = () => {
        return (
            <div className="space-y-6">
                {/* Control Bar */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
                    {/* Display Mode Switcher */}
                    <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl border border-gray-200">
                        <button
                            onClick={() => setDisplayMode('by_class')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                displayMode === 'by_class'
                                    ? 'bg-cyan-700 text-white shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            حسب الشعبة
                        </button>
                        <button
                            onClick={() => setDisplayMode('by_teacher')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                displayMode === 'by_teacher'
                                    ? 'bg-cyan-700 text-white shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            حسب المدرس
                        </button>
                        <button
                            onClick={() => setDisplayMode('master_grid')}
                            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                displayMode === 'master_grid'
                                    ? 'bg-cyan-700 text-white shadow-xs'
                                    : 'text-gray-600 hover:text-gray-900'
                            }`}
                        >
                            الجدول العام الشامل
                        </button>
                    </div>

                    {/* Filter Selector depending on Mode */}
                    {displayMode === 'by_class' && (
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-gray-600 whitespace-nowrap">اختر الشعبة:</label>
                            <select
                                value={selectedClassId}
                                onChange={(e) => setSelectedClassId(e.target.value)}
                                className="px-3 py-1.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-cyan-500"
                            >
                                {classes.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.stage} - {c.section}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {displayMode === 'by_teacher' && (
                        <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-gray-600 whitespace-nowrap">اختر المدرس:</label>
                            <select
                                value={selectedTeacherId}
                                onChange={(e) => setSelectedTeacherId(e.target.value)}
                                className="px-3 py-1.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-cyan-500"
                            >
                                {teachers.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Export & Action Buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Stage Schedule Export (Word / PDF) */}
                        <button
                            onClick={() => {
                                const defaultStage = selectedClassData?.stage || (stagesList.length > 0 ? stagesList[0] : '');
                                setSelectedStageForExport(defaultStage);
                                setShowStageModal(true);
                            }}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-700 hover:bg-red-800 text-yellow-300 hover:text-yellow-200 rounded-xl text-xs font-bold shadow-xs transition border border-red-800"
                            title="معاينة وتصدير جدول مرحلة دراسية كاملة بصيغتي Word و PDF وفق النموذج المعتمد"
                        >
                            <GraduationCap size={15} className="text-yellow-300" />
                            <span className="text-yellow-300 font-bold">جدول مرحلة كاملة (Word / PDF)</span>
                        </button>

                        <button
                            onClick={handleCompactSchedule}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
                            title="ضغط الجدول وسحب الحصص للأعلى لضمان عدم وجود أي فراغ بين الدروس"
                        >
                            <Zap size={15} />
                            <span>ضغط وسد الفراغات</span>
                        </button>

                        {displayMode === 'by_class' && selectedClassData && (
                            <button
                                onClick={() => exportClassScheduleWord([selectedClassData], schedule, settings, config.activeDays, config)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition"
                                title="تحميل جدول هذه الشعبة Word"
                            >
                                <FileText size={15} />
                                <span>Word الشعبة</span>
                            </button>
                        )}

                        <button
                            onClick={() => exportClassScheduleWord(classes, schedule, settings, config.activeDays, config)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-800 hover:bg-blue-900 text-white rounded-xl text-xs font-bold shadow-xs transition"
                            title="تحميل جميع الشعب في ملف Word واحد"
                        >
                            <Download size={15} />
                            <span>كافة الشعب (Word)</span>
                        </button>

                        <button
                            onClick={() => exportTeacherScheduleWord(teachers, classes, schedule, settings, config.activeDays, config, teacherConstraints)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs transition"
                            title="تحميل جداول المدرسين في ملف Word"
                        >
                            <Users size={15} />
                            <span>جداول المدرسين (Word)</span>
                        </button>

                        <button
                            onClick={() => exportMasterScheduleCSV(classes, schedule, config.activeDays, config)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-700 hover:bg-green-800 text-white rounded-xl text-xs font-bold shadow-xs transition"
                            title="تصدير ملف Excel CSV"
                        >
                            <FileSpreadsheet size={15} />
                            <span>Excel</span>
                        </button>

                        <button
                            onClick={() => window.print()}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded-xl text-xs font-bold shadow-xs transition"
                            title="طباعة الجدول الحالي"
                        >
                            <Printer size={15} />
                            <span>طباعة</span>
                        </button>

                        {/* Teacher Colors Button */}
                        <button
                            type="button"
                            onClick={() => setShowTeacherColorModal(true)}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-700 to-purple-700 hover:from-indigo-800 hover:to-purple-800 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer"
                            title="تخصيص ألوان المدرسين أو تفريغ ألوان الجدول أو استعادة الافتراضي"
                        >
                            <Palette size={15} className="text-yellow-300" />
                            <span>ألوان المدرسين 🎨</span>
                        </button>
                    </div>
                </div>

                {/* Teacher Colors Legend & Quick Access Bar */}
                {(displayMode === 'by_class' || displayMode === 'master_grid') && (
                    <div className="bg-white p-3 sm:p-4 rounded-2xl shadow-xs border border-gray-200 flex flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100">
                                    <Palette size={18} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xs sm:text-sm font-black text-gray-900">
                                            ألوان المدرسين في الجدول
                                        </h4>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${
                                            enableTeacherColors
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                : 'bg-rose-50 text-rose-800 border-rose-200'
                                        }`}>
                                            {enableTeacherColors ? 'مفعلة بالجدول 🎨' : 'مفرّغة بدون ألوان ⚪'}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 font-medium">
                                        ألوان مميزة وبارزة لكل مدرس &bull; انقر على أي مدرس لتعديل لونه أو تخصيصه يدوياً
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                {/* Quick Toggle: Blank Table Colors / Enable */}
                                <button
                                    type="button"
                                    onClick={() => handleToggleEnableTeacherColors(!enableTeacherColors)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer border ${
                                        enableTeacherColors
                                            ? 'bg-white hover:bg-rose-50 text-rose-700 border-gray-200 hover:border-rose-300'
                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs'
                                    }`}
                                    title={enableTeacherColors ? "تفريغ ألوان الجدول مؤقتاً لعرضه بدون ألوان" : "إعادة تفعيل ألوان المدرسين"}
                                >
                                    {enableTeacherColors ? (
                                        <>
                                            <EyeOff size={13} />
                                            <span>تفريغ ألوان الجدول</span>
                                        </>
                                    ) : (
                                        <>
                                            <Eye size={13} />
                                            <span>تفعيل ألوان المدرسين</span>
                                        </>
                                    )}
                                </button>

                                {/* Reset to Prominent Defaults button */}
                                <button
                                    type="button"
                                    onClick={handleResetAllColorsToDefault}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-black transition cursor-pointer"
                                    title="استعادة الألوان الافتراضية البارزة لكافة المدرسين"
                                >
                                    <RotateCcw size={13} />
                                    <span>استعادة الافتراضي</span>
                                </button>

                                {/* Open Full Color Management Modal */}
                                <button
                                    type="button"
                                    onClick={() => setShowTeacherColorModal(true)}
                                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 active:scale-95 text-white rounded-xl text-xs font-black shadow-xs transition cursor-pointer"
                                    title="فتح نافذة تخصيص وإدارة الألوان بالكامل"
                                >
                                    <SlidersHorizontal size={13} className="text-yellow-300" />
                                    <span>تخصيص الألوان يدوياً</span>
                                </button>
                            </div>
                        </div>

                        {/* Teacher Color Swatches */}
                        {enableTeacherColors && teachers.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-gray-100 max-h-28 overflow-y-auto">
                                {teachers.map(t => {
                                    const color = resolveTeacherColor(t.id, teacherColors, teachers);
                                    const isNone = teacherColors[t.id] === 'none';
                                    return (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setShowTeacherColorModal(true)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition cursor-pointer hover:scale-105"
                                            style={color && !isNone ? {
                                                backgroundColor: color.bg,
                                                borderColor: color.border,
                                                color: color.text
                                            } : {
                                                backgroundColor: '#f9fafb',
                                                borderColor: '#e5e7eb',
                                                color: '#6b7280'
                                            }}
                                            title={`انقر لتعديل لون الأستاذ: ${t.name}`}
                                        >
                                            <span
                                                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                                                style={{ backgroundColor: color && !isNone ? color.accent : '#d1d5db' }}
                                            />
                                            <span>{t.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* High Conflicts Warning & Re-optimization Banner */}
                {conflicts.length > 10 && (
                    <div className="p-4 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                        <div className="flex items-center gap-3 text-amber-950">
                            <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0">
                                <Sparkles size={18} />
                            </div>
                            <div>
                                <p className="font-bold text-xs sm:text-sm text-amber-950">
                                    يحتوي الجدول حالياً على أكثر من 10 تعارضات ({conflicts.length} تعارضاً).
                                </p>
                                <p className="text-[11px] text-amber-800 mt-0.5">
                                    يمكنك تشغيل خوارزمية البحث المتقدم للقيام بمحاولة أخرى ذكية تقلل التعارضات وتكرار المواد وتصل إلى أفضل توزيع ممكن.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                            <button
                                type="button"
                                onClick={() => handleGenerateOptimizedSchedule(30)}
                                disabled={isGenerating}
                                className="flex-1 sm:flex-initial px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
                            >
                                <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
                                <span>{isGenerating ? 'جارِ إجراء المحاولة والتحسين...' : 'إجراء محاولة أخرى لتقليل التعارضات'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowConflictModal(true)}
                                className="px-3 py-2 bg-white hover:bg-gray-50 border border-amber-300 text-amber-900 font-bold rounded-xl text-xs transition"
                            >
                                عرض التقرير
                            </button>
                        </div>
                    </div>
                )}

                {/* Missing / Unassigned Lessons Reactive Status & Auto-Repair Bar */}
                {totalMissingLessonsCount > 0 ? (
                    <div className="p-4 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border-2 border-amber-300 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
                        <div className="flex items-center gap-3 text-amber-950">
                            <div className="p-2.5 bg-amber-500 text-white rounded-2xl shrink-0 shadow-xs">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="font-black text-sm text-amber-950">
                                        توجد حصص تعذر وضعها بسبب القيود ({totalMissingLessonsCount} حصة متبقية)
                                    </p>
                                    <span className="bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                        تحديث لحظي
                                    </span>
                                </div>
                                <p className="text-xs text-amber-800 mt-0.5">
                                    يمكنك محاولة حل وتوزيع هذه الحصص آلياً بضغطة زر، أو فتح القائمة ومراجعتها وتوزيعها يدوياً. تختفي كل مشكلة فور حلها.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto shrink-0 flex-wrap">
                            <button
                                type="button"
                                onClick={handleAutoRepairSchedule}
                                disabled={isAutoRepairing || isGenerating}
                                className="flex-1 md:flex-initial px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition disabled:opacity-50"
                            >
                                <Sparkles size={15} className={isAutoRepairing ? "animate-spin" : ""} />
                                <span>{isAutoRepairing ? 'جارِ التصحيح والتوزيع...' : '✨ محاولة تصحيح الجدول آلياً'}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setShowUnassignedModal(true)}
                                className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-amber-300 text-amber-950 font-bold rounded-xl text-xs transition shadow-2xs"
                            >
                                عرض قائمة المشاكل ({dynamicUnplacedLessons.length})
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-emerald-950 text-xs">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                                <CheckCircle2 size={16} />
                            </div>
                            <div>
                                <span className="font-black text-emerald-900">اكتمال أنصبة الحصص بنسبة 100%:</span>
                                <span className="text-emerald-800 mr-1.5 font-medium">تم استيفاء وتوزيع جميع الحصص المقررة لكافة الشعب والصفوف بنجاح.</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowUnassignedModal(true)}
                            className="px-3 py-1.5 bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold rounded-xl text-[11px] transition self-end sm:self-center"
                        >
                            سجل استيفاء الأنصبة
                        </button>
                    </div>
                )}

                {/* Sub-View Rendering */}
                {displayMode === 'by_class' && selectedClassData && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        {/* Section Header */}
                        <div className="p-4 bg-gradient-to-l from-cyan-800 to-cyan-900 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div>
                                <h3 className="text-xl font-black">
                                    جدول شعبة: {selectedClassData.stage} ({selectedClassData.section})
                                </h3>
                                <p className="text-xs text-cyan-200 mt-0.5">
                                    العام الدراسي: {settings.academicYear || '2024 - 2025'} &bull; عدد الطلاب: {(selectedClassData.students || []).length} طالب
                                </p>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={() => setHighlightRepeatedSubjects(prev => !prev)}
                                    className={`text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1.5 shadow-xs transition ${
                                        highlightRepeatedSubjects 
                                            ? 'bg-amber-500 text-white border border-amber-300' 
                                            : 'bg-white/10 text-white/70 hover:bg-white/20 border border-white/20'
                                    }`}
                                    title="تبديل إبراز المواد المتكررة في نفس اليوم للشعبة بلون بارز لتسهيل العثور عليها وسحبها"
                                >
                                    <Repeat size={13} />
                                    <span>{highlightRepeatedSubjects ? 'إبراز المكرر (مفعل)' : 'إبراز المكرر'}</span>
                                </button>

                                <span className="text-xs bg-cyan-600/60 border border-cyan-400/40 px-3 py-1 rounded-full font-bold flex items-center gap-1.5 shadow-xs">
                                    <ArrowRightLeft size={13} className="text-cyan-200" />
                                    <span>اسحب الحصة وأفلتها للتحريك والتبديل</span>
                                </span>
                            </div>
                        </div>

                        {/* Interactive Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-center">
                                <thead>
                                    <tr className="bg-gray-100 text-gray-800 font-bold border-b border-gray-200">
                                        <th className="p-3.5 border-l border-gray-200 w-24 text-xs">الحصة / اليوم</th>
                                        {config.activeDays.map(day => (
                                            <th key={day} className="p-3.5 border-l border-gray-200 text-sm">
                                                {DAYS_ARABIC[day] || day}
                                                <span className="block text-[10px] text-gray-500 font-normal">
                                                    ({getPeriodsForDay(day, config)} حصص)
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {Array.from({ length: getMaxDailyPeriods(config) }, (_, pIdx) => {
                                        const period = pIdx + 1;
                                        return (
                                            <tr key={period} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                                                <td className="p-3 font-bold text-gray-700 bg-gray-50/80 border-l border-gray-200 text-xs">
                                                    الحصة {period}
                                                </td>

                                                {config.activeDays.map(day => {
                                                    const maxDayPeriods = getPeriodsForDay(day, config);
                                                    if (period > maxDayPeriods) {
                                                        return (
                                                            <td key={day} className="p-3 border-l border-gray-200 bg-gray-100/60 text-gray-400 text-xs select-none">
                                                                <span className="text-[11px] opacity-70">انتهاء الدوام</span>
                                                            </td>
                                                        );
                                                    }

                                                    const assignment = schedule[day]?.find(p => p.period === period)?.assignments?.[selectedClassData.id];

                                                    // Calculate if this empty slot is a gap in the middle of lessons
                                                    let lastAssignedPeriodOnDay = 0;
                                                    for (let p = 1; p <= maxDayPeriods; p++) {
                                                        if (schedule[day]?.find(x => x.period === p)?.assignments?.[selectedClassData.id]) {
                                                            lastAssignedPeriodOnDay = p;
                                                        }
                                                    }
                                                    const isMidDayGap = !assignment && lastAssignedPeriodOnDay > 0 && period < lastAssignedPeriodOnDay;

                                                    // Check if cell has any conflicts
                                                    const hasConflict = conflicts.some(c => 
                                                        c.classId === selectedClassData.id && 
                                                        c.day === day && 
                                                        c.period === period
                                                    );

                                                    const isDraggedSource = Boolean(
                                                        draggedCell && 
                                                        draggedCell.day === day && 
                                                        draggedCell.period === period && 
                                                        draggedCell.classId === selectedClassData.id
                                                    );

                                                    const isDragTarget = Boolean(
                                                        dragOverCell && 
                                                        dragOverCell.day === day && 
                                                        dragOverCell.period === period && 
                                                        dragOverCell.classId === selectedClassData.id
                                                    );

                                                    // Check if subject is repeated on the same day for this class
                                                    const repeatInfo = getSubjectDayRepeatInfo(day, selectedClassData.id, assignment?.subjectId, assignment?.subject);
                                                    const isRepeatedSubject = Boolean(assignment && repeatInfo.isRepeated && highlightRepeatedSubjects);

                                                    // Teacher Color Resolution
                                                    const teacherColor = (enableTeacherColors && assignment)
                                                        ? resolveTeacherColor(assignment.teacherId || assignment.teacher, teacherColors, teachers)
                                                        : null;

                                                    return (
                                                        <td
                                                            key={day}
                                                            draggable={Boolean(assignment)}
                                                            onDragStart={(e) => handleDragStart(e, day, period, selectedClassData.id, assignment)}
                                                            onDragEnd={handleDragEnd}
                                                            onDragOver={(e) => handleDragOver(e, day, period, selectedClassData.id)}
                                                            onDragLeave={handleDragLeave}
                                                            onDrop={(e) => handleDrop(e, day, period, selectedClassData.id)}
                                                            onClick={() => setEditingCell({ day, period, classId: selectedClassData.id })}
                                                            title={isRepeatedSubject ? `مادة مكررة ${repeatInfo.count} مرات في هذا اليوم - اسحبها لنقلها إلى يوم آخر` : undefined}
                                                            style={teacherColor && !isDraggedSource && !isDragTarget && !hasConflict ? {
                                                                backgroundColor: teacherColor.bg,
                                                                borderColor: teacherColor.border,
                                                                borderLeftWidth: '5px',
                                                                borderLeftColor: teacherColor.accent
                                                            } : undefined}
                                                            className={`p-3 border-l border-gray-200 transition-all select-none group relative ${
                                                                isDraggedSource
                                                                    ? 'opacity-40 scale-95 border-2 border-dashed border-cyan-500 bg-cyan-50/50'
                                                                    : isDragTarget
                                                                        ? assignment
                                                                            ? 'bg-amber-100 border-2 border-dashed border-amber-500 shadow-md ring-2 ring-amber-400 scale-[1.02] z-10'
                                                                            : 'bg-emerald-100 border-2 border-dashed border-emerald-500 shadow-md ring-2 ring-emerald-400 scale-[1.02] z-10'
                                                                        : hasConflict
                                                                            ? 'bg-rose-50 hover:bg-rose-100 border-rose-300'
                                                                            : isRepeatedSubject
                                                                                ? 'bg-amber-50 hover:bg-amber-100/90 border-2 border-amber-400 ring-1 ring-amber-300 shadow-2xs cursor-grab active:cursor-grabbing'
                                                                                : assignment
                                                                                    ? teacherColor
                                                                                        ? 'cursor-grab active:cursor-grabbing hover:shadow-xs'
                                                                                        : 'bg-white hover:bg-cyan-50/60 cursor-grab active:cursor-grabbing hover:shadow-xs'
                                                                                    : isMidDayGap
                                                                                        ? 'bg-amber-50/80 hover:bg-amber-100/80 border-2 border-dashed border-amber-300'
                                                                                        : 'bg-gray-50/30 hover:bg-gray-100'
                                                            }`}
                                                        >
                                                            {assignment ? (
                                                                <div className="flex flex-col items-center">
                                                                    <span 
                                                                        className={`font-black text-sm transition ${isRepeatedSubject ? 'text-amber-950 font-black group-hover:text-amber-800' : 'text-cyan-900 group-hover:text-cyan-700'}`}
                                                                        style={teacherColor ? { color: teacherColor.text } : undefined}
                                                                    >
                                                                        {assignment.subject}
                                                                    </span>
                                                                    <span 
                                                                        className={`text-[11px] mt-1 px-2.5 py-0.5 rounded-lg shadow-2xs font-bold transition inline-flex items-center gap-1 ${isRepeatedSubject ? 'text-amber-900' : ''}`}
                                                                        style={teacherColor ? {
                                                                            backgroundColor: teacherColor.accent,
                                                                            color: '#ffffff'
                                                                        } : {
                                                                            backgroundColor: '#f1f5f9',
                                                                            color: '#475569'
                                                                        }}
                                                                    >
                                                                        {assignment.teacher}
                                                                    </span>
                                                                    {isRepeatedSubject && (
                                                                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500 hover:bg-amber-600 text-white font-black px-1.5 py-0.5 rounded-md shadow-2xs mt-1 transition">
                                                                            <Repeat size={10} />
                                                                            <span>مكرر اليوم ({repeatInfo.count})</span>
                                                                        </span>
                                                                    )}
                                                                    {hasConflict && (
                                                                        <span className="absolute top-1 left-1 w-2 h-2 rounded-full bg-rose-600 animate-ping" />
                                                                    )}
                                                                </div>
                                                            ) : isDragTarget ? (
                                                                <div className="flex flex-col items-center text-emerald-700 font-bold text-xs py-1">
                                                                    <span>إفلات هنا للنقل</span>
                                                                </div>
                                                            ) : isMidDayGap ? (
                                                                <div className="flex flex-col items-center text-amber-700">
                                                                    <span className="text-[11px] font-bold flex items-center gap-1">
                                                                        <AlertTriangle size={12} className="text-amber-600" />
                                                                        فراغ بين الدروس
                                                                    </span>
                                                                    <span className="text-[10px] text-amber-600/80 mt-0.5">انقر لإسناد أو اسحب حصة لهنا</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-gray-400 group-hover:text-cyan-600 font-medium">
                                                                    + إضافة مادة
                                                                </span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Sub-View: By Teacher */}
                {displayMode === 'by_teacher' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        {(() => {
                            const teacher = teachers.find(t => t.id === selectedTeacherId) || teachers[0];
                            if (!teacher) return <div className="p-8 text-center text-gray-500">لا يوجد مدرس محدد</div>;

                            const tConstraint = teacherConstraints[teacher.id];
                            const offDays = Array.isArray(tConstraint?.offDays) ? tConstraint.offDays : [];
                            const unavailableMap = tConstraint?.unavailablePeriods || {};
                            const totalPartialOff: number = Object.values(unavailableMap).reduce<number>((acc, pArr: any) => acc + (Array.isArray(pArr) ? pArr.length : 0), 0);

                            // Calculate teacher stats
                            let totalPlacedLessons = 0;
                            config.activeDays.forEach(day => {
                                const periods = schedule[day] || [];
                                periods.forEach(p => {
                                    Object.values(p.assignments || {}).forEach((assign: any) => {
                                        if (assign && (assign.teacherId === teacher.id || assign.teacher === teacher.name)) {
                                            totalPlacedLessons++;
                                        }
                                    });
                                });
                            });

                            return (
                                <>
                                    <div className="p-4 bg-gradient-to-l from-emerald-800 to-emerald-900 text-white flex justify-between items-center">
                                        <div>
                                            <h3 className="text-xl font-black">جدول الأستاذ: {teacher.name}</h3>
                                            <p className="text-xs text-emerald-200 mt-0.5">
                                                إجمالي الحصص الموزعة: {totalPlacedLessons} حصة أسبوعياً &bull; أيام التفرغ: {offDays.length > 0 ? offDays.map(d => DAYS_ARABIC[d] || d).join('، ') : 'دوام كامل'}
                                                {totalPartialOff > 0 && ` • تفريغ جزئي: ${totalPartialOff} حصة`}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => exportTeacherScheduleWord([teacher], classes, schedule, settings, config.activeDays, config, teacherConstraints)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-xs transition"
                                        >
                                            <FileText size={15} />
                                            <span>تحميل Word</span>
                                        </button>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full border-collapse text-center">
                                            <thead>
                                                <tr className="bg-gray-100 text-gray-800 font-bold border-b border-gray-200">
                                                    <th className="p-3.5 border-l border-gray-200 w-24 text-xs">الحصة / اليوم</th>
                                                    {config.activeDays.map(day => (
                                                        <th key={day} className="p-3.5 border-l border-gray-200 text-sm">
                                                            {DAYS_ARABIC[day] || day}
                                                            {offDays.includes(day) ? (
                                                                <span className="block text-[10px] text-amber-700 font-normal">
                                                                    (تفرغ كامل)
                                                                </span>
                                                            ) : (
                                                                <span className="block text-[10px] text-gray-500 font-normal">
                                                                    ({getPeriodsForDay(day, config)} حصص)
                                                                </span>
                                                            )}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Array.from({ length: getMaxDailyPeriods(config) }, (_, pIdx) => {
                                                    const period = pIdx + 1;
                                                    return (
                                                        <tr key={period} className="border-b border-gray-100 hover:bg-gray-50/50 transition">
                                                            <td className="p-3 font-bold text-gray-700 bg-gray-50/80 border-l border-gray-200 text-xs">
                                                                الحصة {period}
                                                            </td>

                                                            {config.activeDays.map(day => {
                                                                const maxDayPeriods = getPeriodsForDay(day, config);
                                                                if (period > maxDayPeriods) {
                                                                    return (
                                                                        <td key={day} className="p-3 border-l border-gray-200 bg-gray-100/60 text-gray-400 text-xs select-none">
                                                                            <span className="text-[11px] opacity-70">-</span>
                                                                        </td>
                                                                    );
                                                                }

                                                                const dayPeriods = schedule[day] || [];
                                                                const pData = dayPeriods.find(dp => dp.period === period);
                                                                
                                                                let assignment: any = null;
                                                                if (pData?.assignments) {
                                                                    for (const [clsId, assignRaw] of Object.entries(pData.assignments)) {
                                                                        const assign: any = assignRaw;
                                                                        if (assign && (assign.teacherId === teacher.id || assign.teacher === teacher.name)) {
                                                                            const cls = classes.find(c => c.id === clsId);
                                                                            assignment = {
                                                                                ...assign,
                                                                                className: cls ? `${cls.stage} ${cls.section}` : `${assign.stage || ''} ${assign.section || ''}`
                                                                            };
                                                                            break;
                                                                        }
                                                                    }
                                                                }

                                                                const isOffDay = offDays.includes(day);
                                                                const isPartialOff = !isOffDay && tConstraint && isTeacherUnavailableAt(tConstraint, day, period);

                                                                return (
                                                                    <td
                                                                        key={day}
                                                                        className={`p-3 border-l border-gray-200 text-center ${
                                                                            isOffDay
                                                                                ? 'bg-amber-50/40 text-amber-800'
                                                                                : isPartialOff
                                                                                    ? 'bg-amber-50/30 text-amber-900'
                                                                                    : assignment
                                                                                        ? 'bg-emerald-50/70 text-emerald-900'
                                                                                        : 'bg-white text-gray-400'
                                                                        }`}
                                                                    >
                                                                        {assignment ? (
                                                                            <div className="flex flex-col items-center">
                                                                                <span className="font-black text-emerald-900 text-sm">
                                                                                    {assignment.className}
                                                                                </span>
                                                                                <span className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                                                                                    {assignment.subject}
                                                                                </span>
                                                                            </div>
                                                                        ) : isOffDay ? (
                                                                            <span className="text-xs font-semibold text-amber-700 opacity-60">
                                                                                يوم تفرغ
                                                                            </span>
                                                                        ) : isPartialOff ? (
                                                                            <span className="text-[11px] font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded border border-amber-300/60 inline-flex items-center gap-1">
                                                                                <Ban size={11} className="text-amber-700" />
                                                                                تفريغ جزئي
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-xs text-gray-300">-</span>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}

                {/* Sub-View: Master Grid (All classes & periods) */}
                {displayMode === 'master_grid' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 bg-gray-800 text-white flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold">الجدول العام الشامل للمدرسة</h3>
                                <p className="text-xs text-gray-300 mt-0.5">عرض مجمع لكافة الصفوف والشعب والمدرسين</p>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-xs text-center">
                                <thead>
                                    <tr className="bg-gray-100 text-gray-800 font-bold border-b border-gray-300">
                                        <th className="p-2.5 border border-gray-300 w-24">المرحلة / الشعبة</th>
                                        <th className="p-2.5 border border-gray-300 w-16">الحصة</th>
                                        {config.activeDays.map(day => (
                                            <th key={day} className="p-2.5 border border-gray-300">
                                                {DAYS_ARABIC[day] || day}
                                                <span className="block text-[9px] text-gray-500 font-normal">
                                                    ({getPeriodsForDay(day, config)} حصص)
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {classes.map(cls => {
                                        const maxGridPeriods = getMaxDailyPeriods(config);
                                        return (
                                            <React.Fragment key={cls.id}>
                                                {Array.from({ length: maxGridPeriods }, (_, pIdx) => {
                                                    const period = pIdx + 1;
                                                    return (
                                                        <tr key={`${cls.id}_${period}`} className={`border-b border-gray-200 ${period === maxGridPeriods ? 'border-b-2 border-gray-400' : ''}`}>
                                                            {period === 1 && (
                                                                <td
                                                                    rowSpan={maxGridPeriods}
                                                                    className="p-2 border border-gray-300 font-black text-cyan-900 bg-cyan-50/70 align-middle"
                                                                >
                                                                    {cls.stage}
                                                                    <span className="block text-xs font-bold text-gray-600 mt-1">
                                                                        شعبة {cls.section}
                                                                    </span>
                                                                </td>
                                                            )}
                                                            <td className="p-2 border border-gray-300 font-bold bg-gray-50 text-gray-700">
                                                                {period}
                                                            </td>
                                                            {config.activeDays.map(day => {
                                                                const maxDayPeriods = getPeriodsForDay(day, config);
                                                                if (period > maxDayPeriods) {
                                                                    return (
                                                                        <td key={day} className="p-1.5 border border-gray-300 bg-gray-100/60 text-gray-400 select-none text-[10px]">
                                                                            -
                                                                        </td>
                                                                    );
                                                                }

                                                                const assign = schedule[day]?.find(p => p.period === period)?.assignments?.[cls.id];
                                                                const isDraggedSource = Boolean(
                                                                    draggedCell && 
                                                                    draggedCell.day === day && 
                                                                    draggedCell.period === period && 
                                                                    draggedCell.classId === cls.id
                                                                );
                                                                const isDragTarget = Boolean(
                                                                    dragOverCell && 
                                                                    dragOverCell.day === day && 
                                                                    dragOverCell.period === period && 
                                                                    dragOverCell.classId === cls.id
                                                                );

                                                                // Check if subject is repeated on the same day for this class
                                                                const repeatInfo = getSubjectDayRepeatInfo(day, cls.id, assign?.subjectId, assign?.subject);
                                                                const isRepeatedSubject = Boolean(assign && repeatInfo.isRepeated && highlightRepeatedSubjects);

                                                                // Teacher Color Resolution
                                                                const teacherColor = (enableTeacherColors && assign)
                                                                    ? resolveTeacherColor(assign.teacherId || assign.teacher, teacherColors, teachers)
                                                                    : null;

                                                                return (
                                                                    <td
                                                                        key={day}
                                                                        draggable={Boolean(assign)}
                                                                        onDragStart={(e) => handleDragStart(e, day, period, cls.id, assign)}
                                                                        onDragEnd={handleDragEnd}
                                                                        onDragOver={(e) => handleDragOver(e, day, period, cls.id)}
                                                                        onDragLeave={handleDragLeave}
                                                                        onDrop={(e) => handleDrop(e, day, period, cls.id)}
                                                                        onClick={() => setEditingCell({ day, period, classId: cls.id })}
                                                                        title={isRepeatedSubject ? `مادة مكررة ${repeatInfo.count} مرات في هذا اليوم - اسحبها لنقلها إلى يوم آخر` : undefined}
                                                                        style={teacherColor && !isDraggedSource && !isDragTarget ? {
                                                                            backgroundColor: teacherColor.bg,
                                                                            borderColor: teacherColor.border,
                                                                            borderWidth: '1.5px'
                                                                        } : undefined}
                                                                        className={`p-1.5 border border-gray-300 transition select-none ${
                                                                            isDraggedSource
                                                                                ? 'opacity-40 border-2 border-dashed border-cyan-500 bg-cyan-50'
                                                                                : isDragTarget
                                                                                    ? assign
                                                                                        ? 'bg-amber-100 border-2 border-dashed border-amber-500 scale-[1.03]'
                                                                                        : 'bg-emerald-100 border-2 border-dashed border-emerald-500 scale-[1.03]'
                                                                                    : isRepeatedSubject
                                                                                        ? 'bg-amber-100/90 hover:bg-amber-200/90 border-2 border-amber-500 font-bold cursor-grab active:cursor-grabbing'
                                                                                        : assign
                                                                                            ? teacherColor
                                                                                                ? 'cursor-grab active:cursor-grabbing'
                                                                                                : 'hover:bg-cyan-50 cursor-grab active:cursor-grabbing'
                                                                                            : 'hover:bg-gray-50 cursor-pointer'
                                                                        }`}
                                                                    >
                                                                        {assign ? (
                                                                            <div className="flex flex-col items-center justify-center p-0.5">
                                                                                <p 
                                                                                    className={`font-black text-xs leading-tight ${isRepeatedSubject ? 'text-amber-950 font-black' : 'text-cyan-900'}`}
                                                                                    style={teacherColor ? { color: teacherColor.text } : undefined}
                                                                                >
                                                                                    {assign.subject}
                                                                                </p>
                                                                                <span 
                                                                                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md mt-0.5 inline-flex items-center gap-1 shadow-2xs leading-tight ${isRepeatedSubject ? 'text-amber-900' : ''}`}
                                                                                    style={teacherColor ? {
                                                                                        backgroundColor: teacherColor.accent,
                                                                                        color: '#ffffff'
                                                                                    } : {
                                                                                        backgroundColor: '#f3f4f6',
                                                                                        color: '#4b5563'
                                                                                    }}
                                                                                >
                                                                                    {assign.teacher}
                                                                                </span>
                                                                                {isRepeatedSubject && (
                                                                                    <span className="inline-flex items-center gap-0.5 text-[9px] bg-amber-600 text-white px-1 py-0.2 rounded font-black mt-0.5">
                                                                                        <Repeat size={8} /> مكرر ({repeatInfo.count})
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-gray-300">-</span>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ----------------------------------------------------
    // Tab 2: Class Subject Quotas Editor
    // ----------------------------------------------------
    const renderQuotasEditorTab = () => {
        return (
            <div className="space-y-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900">تحديد أنصبة وحصص المواد للشعب الدراسية</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            حدد عدد الحصص الأسبوعية لكل مادة مسندة. تُهمل المواد غير المسندة لمدرس، ويتم اعتماد النصاب الذي يحدده مدير المدرسة بدقة دون فرض عدد حصص معين.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handleApplyStandardTemplate(selectedClassId)}
                            className="px-3.5 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                        >
                            <Sparkles size={16} />
                            <span>تطبيق المنهاج القياسي على هذه الشعبة</span>
                        </button>
                        <button
                            onClick={() => handleApplyStandardTemplate()}
                            className="px-3.5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-1.5"
                        >
                            <Layers size={16} />
                            <span>تطبيق على كافة الشعب</span>
                        </button>
                    </div>
                </div>

                {/* Class selector */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {classes.map(c => {
                        const q = classQuotas[c.id] || {};
                        const total = c.subjects.reduce((acc, s) => acc + (q[s.id] !== undefined ? q[s.id] : getDefaultQuotaForSubject(s.name, settings.schoolLevel)), 0);
                        const isSelected = c.id === selectedClassId;

                        return (
                            <button
                                key={c.id}
                                onClick={() => setSelectedClassId(c.id)}
                                className={`px-4 py-2.5 rounded-xl border text-right transition flex-shrink-0 flex items-center gap-3 ${
                                    isSelected
                                        ? 'bg-cyan-700 text-white border-cyan-800 shadow-sm'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <span className="font-bold text-xs">{c.stage} ({c.section})</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                    isSelected 
                                        ? 'bg-cyan-900 text-cyan-100' 
                                        : total === weeklyCapacity 
                                            ? 'bg-emerald-100 text-emerald-800' 
                                            : total > weeklyCapacity 
                                                ? 'bg-rose-100 text-rose-800' 
                                                : 'bg-amber-100 text-amber-800'
                                }`}>
                                    {total} / {weeklyCapacity} حصة
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Subject Quotas Table for the Selected Class */}
                {selectedClassData && (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                            <div>
                                <h4 className="font-bold text-gray-900 text-base">
                                    أنصبة مواد: {selectedClassData.stage} - شعبة {selectedClassData.section}
                                </h4>
                                <p className="text-xs text-gray-500">
                                    مجموع الحصص الأسبوعية المحددة: <strong className={selectedClassTotalQuota === weeklyCapacity ? 'text-emerald-600' : selectedClassTotalQuota > weeklyCapacity ? 'text-rose-600' : 'text-amber-600'}>{selectedClassTotalQuota}</strong> من أصل {weeklyCapacity} حصة
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs px-3 py-1 rounded-lg font-bold ${
                                    selectedClassTotalQuota === weeklyCapacity
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : selectedClassTotalQuota > weeklyCapacity
                                            ? 'bg-rose-100 text-rose-800'
                                            : 'bg-amber-100 text-amber-800'
                                }`}>
                                    {selectedClassTotalQuota === weeklyCapacity ? 'الجدول مكتمل النصاب' : selectedClassTotalQuota > weeklyCapacity ? 'يتجاوز السعة بـ ' + (selectedClassTotalQuota - weeklyCapacity) : 'متبقي ' + (weeklyCapacity - selectedClassTotalQuota) + ' حصة'}
                                </span>
                            </div>
                        </div>

                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {selectedClassData.subjects.map(subj => {
                                const currentQuota = classQuotas[selectedClassData.id]?.[subj.id] !== undefined
                                    ? classQuotas[selectedClassData.id][subj.id]
                                    : getDefaultQuotaForSubject(subj.name, settings.schoolLevel);

                                const assignedTeacher = teachers.find(t => 
                                    t.assignments?.some(a => a.classId === selectedClassData.id && a.subjectId === subj.id)
                                );

                                return (
                                    <div
                                        key={subj.id}
                                        className="p-3.5 rounded-xl border border-gray-200 bg-white hover:border-cyan-300 transition flex items-center justify-between shadow-2xs"
                                    >
                                        <div>
                                            <p className="font-bold text-gray-900 text-sm">{subj.name}</p>
                                            <p className="text-[11px] text-gray-500 mt-0.5">
                                                المدرس: {assignedTeacher ? <strong className="text-cyan-800">{assignedTeacher.name}</strong> : <span className="text-amber-600">غير مسند</span>}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 p-1 rounded-xl">
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateQuota(selectedClassData.id, subj.id, -1)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 font-bold"
                                            >
                                                <Minus size={14} />
                                            </button>
                                            <span className="w-8 text-center font-black text-cyan-900 text-sm">
                                                {currentQuota}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateQuota(selectedClassData.id, subj.id, 1)}
                                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-cyan-700 hover:bg-gray-100 font-bold"
                                            >
                                                <Plus size={14} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // ----------------------------------------------------
    // ----------------------------------------------------
    // Tab 3: Teacher Constraints & Days Off
    // ----------------------------------------------------
    const renderTeacherConstraintsTab = () => {
        return (
            <div className="space-y-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
                    <h3 className="text-xl font-bold text-gray-900">إدارة تفرغ المدرسين والتفريغ الجزئي للحصص</h3>
                    <p className="text-xs text-gray-500 mt-1">
                        يمكنك تحديد أيام التفرغ الكامل لكل مدرس، أو تحديد <strong>تفريغ جزئي لحصص محددة</strong> في اليوم الواحد (مثل تفريغ الحصة الأولى أو الأخيرة في يوم معين أو جميع الأيام) بحيث يتجنب نظام التوليد الذكي إسناد حصص له في تلك الأوقات.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {teachers.map(teacher => {
                        const constraint = teacherConstraints[teacher.id] || {
                            teacherId: teacher.id,
                            teacherName: teacher.name,
                            offDays: [],
                            maxDailyPeriods: 5
                        };

                        // Calculate total periods assigned to this teacher across all classes
                        let totalAssignedPeriods = 0;
                        const teacherClassesMap: string[] = [];

                        classes.forEach(c => {
                            const q = classQuotas[c.id] || {};
                            c.subjects.forEach(s => {
                                const isAssigned = teacher.assignments?.some(a => a.classId === c.id && a.subjectId === s.id);
                                if (isAssigned) {
                                    const count = q[s.id] !== undefined ? q[s.id] : getDefaultQuotaForSubject(s.name, settings.schoolLevel);
                                    totalAssignedPeriods += count;
                                    const classKey = `${c.stage} ${c.section}`;
                                    if (!teacherClassesMap.includes(classKey)) {
                                        teacherClassesMap.push(classKey);
                                    }
                                }
                            });
                        });

                        const offDays = Array.isArray(constraint.offDays) ? constraint.offDays : [];
                        const activeDays = (Array.isArray(config?.activeDays) && config.activeDays.length > 0) ? config.activeDays : DEFAULT_ACTIVE_DAYS;
                        const workingDays = activeDays.filter(d => !offDays.includes(d));
                        const unavailablePeriodsMap = constraint.unavailablePeriods || {};
                        const totalPartialOffCount: number = Object.values(unavailablePeriodsMap).reduce<number>(
                            (acc, pArr: any) => acc + (Array.isArray(pArr) ? pArr.length : 0),
                            0
                        );

                        return (
                            <div
                                key={teacher.id}
                                className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4 hover:border-cyan-300 transition"
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h4 className="font-bold text-base text-gray-900">{teacher.name}</h4>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            الشعب المسندة: {teacherClassesMap.length > 0 ? teacherClassesMap.join('، ') : 'لم يتم إسناد شعب'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {totalPartialOffCount > 0 && (
                                            <span className="text-[11px] px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg font-bold flex items-center gap-1">
                                                <Ban size={12} className="text-amber-600" />
                                                {totalPartialOffCount} حصة مفرغة جزئياً
                                            </span>
                                        )}
                                        <span className="text-xs px-2.5 py-1 bg-cyan-50 border border-cyan-200 text-cyan-900 rounded-lg font-bold">
                                            نصاب: {totalAssignedPeriods} حصة
                                        </span>
                                    </div>
                                </div>

                                {/* Section 1: Full Days Off */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-2">
                                        أيام التفرغ الكامل (إجازة اليوم بالكامل بدون أي حصة):
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {config.activeDays.map(day => {
                                            const isOff = offDays.includes(day);
                                            return (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    onClick={() => handleToggleTeacherOffDay(teacher.id, day)}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
                                                        isOff
                                                            ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                                                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                                    }`}
                                                >
                                                    {isOff && <Check size={14} />}
                                                    <span>{DAYS_ARABIC[day] || day}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Section 2: Partial Day Off (Per-Period Unavailability) */}
                                <div className="p-3.5 bg-amber-50/40 rounded-xl border border-amber-100 space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div>
                                            <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                                                <Clock size={14} className="text-amber-700" />
                                                التفريغ الجزئي للحصص في اليوم الواحد
                                            </span>
                                            <p className="text-[11px] text-gray-500 mt-0.5">
                                                حدد الحصص التي يُفرغ منها المدرس (كالحصة الأولى أو الأخيرة) لعدم إسناد درس له فيها:
                                            </p>
                                        </div>

                                        {/* Global Presets */}
                                        <div className="flex flex-wrap items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handleSetTeacherGlobalUnavailablePreset(teacher.id, 'first')}
                                                className="px-2 py-1 bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-lg text-[10px] font-bold transition shadow-2xs"
                                                title="تفريغ الحصة الأولى في جميع أيام الدوام"
                                            >
                                                ⚡ الأولى بالكل
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleSetTeacherGlobalUnavailablePreset(teacher.id, 'last')}
                                                className="px-2 py-1 bg-white hover:bg-amber-100 border border-amber-200 text-amber-900 rounded-lg text-[10px] font-bold transition shadow-2xs"
                                                title="تفريغ الحصة الأخيرة في جميع أيام الدوام"
                                            >
                                                ⚡ الأخيرة بالكل
                                            </button>
                                            {totalPartialOffCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetTeacherGlobalUnavailablePreset(teacher.id, 'clear')}
                                                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 rounded-lg text-[10px] font-bold transition shadow-2xs"
                                                    title="إلغاء جميع التفريغات الجزئية لهذا المدرس"
                                                >
                                                    مسح التفريغ
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Per-Day Period Selectors */}
                                    <div className="space-y-2 pt-1">
                                        {workingDays.length === 0 ? (
                                            <div className="p-2 text-center text-xs text-rose-600 font-semibold bg-rose-50/50 rounded-lg border border-rose-200">
                                                المدرس مفرغ في جميع أيام الأسبوع
                                            </div>
                                        ) : (
                                            workingDays.map(day => {
                                                const dayTotalPeriods = getPeriodsForDay(day, config);
                                                const dayUnavailableList = getTeacherUnavailablePeriodsOnDay(constraint, day);

                                                return (
                                                    <div
                                                        key={day}
                                                        className="p-2.5 bg-white rounded-xl border border-amber-200/70 shadow-2xs space-y-2"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-xs font-bold text-gray-800">
                                                                    {DAYS_ARABIC[day] || day}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400">
                                                                    ({dayTotalPeriods} حصص)
                                                                </span>
                                                                {dayUnavailableList.length > 0 && (
                                                                    <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded font-bold">
                                                                        مفرغ من {dayUnavailableList.length} حصة
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Day quick buttons */}
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSetTeacherDayUnavailablePreset(teacher.id, day, 'first')}
                                                                    className="px-1.5 py-0.5 text-[10px] bg-gray-50 hover:bg-amber-100 border border-gray-200 rounded text-gray-700 font-semibold transition"
                                                                >
                                                                    الأولى
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSetTeacherDayUnavailablePreset(teacher.id, day, 'last')}
                                                                    className="px-1.5 py-0.5 text-[10px] bg-gray-50 hover:bg-amber-100 border border-gray-200 rounded text-gray-700 font-semibold transition"
                                                                >
                                                                    الأخيرة
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSetTeacherDayUnavailablePreset(teacher.id, day, 'both')}
                                                                    className="px-1.5 py-0.5 text-[10px] bg-gray-50 hover:bg-amber-100 border border-gray-200 rounded text-gray-700 font-semibold transition"
                                                                >
                                                                    1 + الأخيرة
                                                                </button>
                                                                {dayUnavailableList.length > 0 && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleSetTeacherDayUnavailablePreset(teacher.id, day, 'clear')}
                                                                        className="px-1.5 py-0.5 text-[10px] bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded text-rose-700 font-semibold transition"
                                                                        title="مسح تفريغ هذا اليوم"
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Period Chips */}
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {Array.from({ length: dayTotalPeriods }, (_, pIdx) => {
                                                                const periodNumber = pIdx + 1;
                                                                const isPeriodUnavailable = dayUnavailableList.includes(periodNumber);

                                                                return (
                                                                    <button
                                                                        key={periodNumber}
                                                                        type="button"
                                                                        onClick={() => handleToggleTeacherUnavailablePeriod(teacher.id, day, periodNumber)}
                                                                        className={`px-2 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1 ${
                                                                            isPeriodUnavailable
                                                                                ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                                                                                : 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                                                                        }`}
                                                                        title={isPeriodUnavailable ? `مفرغ من الحصة ${periodNumber} (انقر للإلغاء)` : `متاح للحصة ${periodNumber} (انقر للتفريغ)`}
                                                                    >
                                                                        {isPeriodUnavailable ? (
                                                                            <>
                                                                                <Ban size={12} className="text-amber-100" />
                                                                                <span>مفرغ (حصة {periodNumber})</span>
                                                                            </>
                                                                        ) : (
                                                                            <span>حصة {periodNumber}</span>
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>

                                {/* Section 3: Max daily limit */}
                                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                                    <span className="text-gray-600">الحد الأقصى للحصص في اليوم الواحد:</span>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            min="1"
                                            max={config.periodsPerDay}
                                            value={constraint.maxDailyPeriods || 5}
                                            onChange={(e) => handleUpdateTeacherMaxDaily(teacher.id, parseInt(e.target.value) || 4)}
                                            className="w-14 p-1.5 border border-gray-300 rounded-lg text-center font-bold text-gray-800"
                                        />
                                        <span className="text-gray-500">حصة</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ----------------------------------------------------
    // Tab 4: General Settings
    // ----------------------------------------------------
    const renderGeneralSettingsTab = () => {
        const hasCustomDailyPeriods = Boolean(config.dailyPeriods && Object.keys(config.dailyPeriods).length > 0);
        const totalCapacity = getTotalWeeklyCapacity(config);
        const isCapacitySufficient = classQuotaDetails.maxQuota === 0 || totalCapacity >= classQuotaDetails.maxQuota;

        return (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-6 max-w-4xl">
                <div>
                    <h3 className="text-xl font-bold text-gray-900">إعدادات الجدول العامة</h3>
                    <p className="text-xs text-gray-500 mt-1">
                        تحديد أيام الدوام الأسبوعية وتخصيص عدد الحصص لكل يوم على حدة وقواعد التوزيع الذكي.
                    </p>
                </div>

                {/* Quota vs Capacity Intelligence Overview Card */}
                <div className={`p-4 rounded-2xl border transition-all ${
                    isCapacitySufficient
                        ? 'bg-gradient-to-r from-teal-50/70 via-cyan-50/50 to-emerald-50/70 border-teal-200 text-teal-950'
                        : 'bg-rose-50 border-rose-200 text-rose-950'
                }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className={`p-2.5 rounded-xl ${isCapacitySufficient ? 'bg-teal-700 text-white' : 'bg-rose-600 text-white'}`}>
                                {isCapacitySufficient ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
                            </div>
                            <div>
                                <h4 className="font-black text-sm">
                                    {isCapacitySufficient ? 'سعة الجدول متوافقة مع نصاب جميع الشعب (بما فيها الشعبة الأكثر حصصاً)' : 'تنبيه: سعة الجدول أقل من النصاب المطلوب لأكبر شعبة'}
                                </h4>
                                <p className="text-xs text-gray-600 mt-0.5">
                                    أعلى نصاب شعبة في المدرسة: <strong className="text-gray-900 font-bold">{classQuotaDetails.maxQuota} حصة</strong> {classQuotaDetails.maxClassName ? `(${classQuotaDetails.maxClassName})` : ''} | إجمالي السعة المتاحة: <strong className="text-gray-900 font-bold">{totalCapacity} حصة أسبوعياً</strong>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-center">
                            <span className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                                isCapacitySufficient 
                                    ? 'bg-white text-teal-800 border-teal-200 shadow-2xs' 
                                    : 'bg-white text-rose-800 border-rose-200 shadow-2xs'
                            }`}>
                                {isCapacitySufficient ? '✓ متوافق ومكتمل' : '❌ عجز في السعة'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Active School Days */}
                <div className="space-y-3">
                    <label className="block text-sm font-bold text-gray-800">
                        أيام الدوام الأسبوعية المعتمدة في المدرسة:
                    </label>
                    <div className="flex flex-wrap gap-2.5">
                        {ALL_POSSIBLE_DAYS.map(day => {
                            const currentActiveDays = (Array.isArray(config?.activeDays) && config.activeDays.length > 0) ? config.activeDays : DEFAULT_ACTIVE_DAYS;
                            const isSelected = currentActiveDays.includes(day);
                            return (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => {
                                        const nextDays = isSelected
                                            ? currentActiveDays.filter(d => d !== day)
                                            : [...currentActiveDays, day];
                                        if (nextDays.length === 0) {
                                            alert("يجب اختيار يوم واحد على الأقل للدوام.");
                                            return;
                                        }
                                        const prospectiveConfig: GeneralScheduleConfig = {
                                            ...config,
                                            activeDays: nextDays
                                        };
                                        if (!checkCapacityReduction(prospectiveConfig)) {
                                            return; // Rejected due to dropping below minimum stage quota
                                        }
                                        setConfig(prospectiveConfig);
                                        setHasUnsavedChanges(true);
                                    }}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition flex items-center gap-2 ${
                                        isSelected
                                            ? 'bg-cyan-700 text-white border-cyan-800 shadow-xs'
                                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                    }`}
                                >
                                    {isSelected && <Check size={16} />}
                                    <span>{DAYS_ARABIC[day] || day}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Periods Per Day Configuration (Uniform vs Variable per Day) */}
                <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <label className="block text-sm font-bold text-gray-800">
                                نظام عدد الحصص اليومية:
                            </label>
                            <p className="text-xs text-gray-500 mt-0.5">
                                يمكنك تعيين عدد حصص موحد أو تخصيص عدد حصص مختلف لكل يوم (مثلاً 6 حصص للأحد والثلاثاء، و5 حصص للإثنين والأربعاء والخميس).
                            </p>
                        </div>

                        {/* Mode Selector Buttons */}
                        <div className="flex items-center gap-1.5 p-1 bg-gray-100 rounded-xl self-start sm:self-auto border border-gray-200">
                            <button
                                type="button"
                                onClick={() => {
                                    const prospectiveConfig: GeneralScheduleConfig = {
                                        ...config,
                                        dailyPeriods: undefined
                                    };
                                    if (!checkCapacityReduction(prospectiveConfig)) {
                                        return;
                                    }
                                    setConfig(prospectiveConfig);
                                    setHasUnsavedChanges(true);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                    !hasCustomDailyPeriods
                                        ? 'bg-white text-cyan-800 shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                موحد لجميع الأيام
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const initialDaily: Record<string, number> = {};
                                    config.activeDays.forEach(d => {
                                        initialDaily[d] = config.periodsPerDay || DEFAULT_PERIODS_PER_DAY;
                                    });
                                    const prospectiveConfig: GeneralScheduleConfig = {
                                        ...config,
                                        dailyPeriods: initialDaily
                                    };
                                    if (!checkCapacityReduction(prospectiveConfig)) {
                                        return;
                                    }
                                    setConfig(prospectiveConfig);
                                    setHasUnsavedChanges(true);
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                    hasCustomDailyPeriods
                                        ? 'bg-cyan-700 text-white shadow-xs'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                مخصص لكل يوم منفصل
                            </button>
                        </div>
                    </div>

                    {!hasCustomDailyPeriods ? (
                        /* Uniform Periods */
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
                            <span className="text-xs font-bold text-gray-700 block">
                                اختر عدد الحصص الموحد لكافة أيام الأسبوع:
                            </span>
                            <div className="flex items-center gap-3">
                                {[4, 5, 6, 7, 8].map(num => (
                                    <button
                                        key={num}
                                        type="button"
                                        onClick={() => {
                                            const prospectiveConfig: GeneralScheduleConfig = {
                                                ...config,
                                                periodsPerDay: num,
                                                dailyPeriods: undefined
                                            };
                                            if (!checkCapacityReduction(prospectiveConfig)) {
                                                return; // Rejected
                                            }
                                            setConfig(prospectiveConfig);
                                            setHasUnsavedChanges(true);
                                        }}
                                        className={`w-12 h-12 rounded-xl font-black text-sm border transition flex items-center justify-center ${
                                            config.periodsPerDay === num
                                                ? 'bg-cyan-700 text-white border-cyan-800 shadow-md scale-105'
                                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                                        }`}
                                    >
                                        {num}
                                    </button>
                                ))}
                                <span className="text-xs font-bold text-cyan-800 mr-2 bg-cyan-50 px-3 py-1.5 rounded-xl border border-cyan-200">
                                    السعة الأسبوعية للشعبة: {totalCapacity} حصة
                                </span>
                            </div>
                        </div>
                    ) : (
                        /* Per-Day Customized Periods */
                        <div className="p-4 bg-gradient-to-br from-cyan-50/50 via-white to-blue-50/40 rounded-2xl border border-cyan-200 space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-cyan-900 flex items-center gap-1.5">
                                    <Clock size={16} className="text-cyan-700" />
                                    تحديد عدد الحصص لكل يوم على حدة:
                                </span>
                                <span className="text-xs font-black text-cyan-900 bg-cyan-100/90 px-3 py-1 rounded-xl border border-cyan-300">
                                    إجمالي السعة الأسبوعية: {totalCapacity} حصة
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {config.activeDays.map(day => {
                                    const currentPeriods = getPeriodsForDay(day, config);
                                    return (
                                        <div
                                            key={day}
                                            className="p-3.5 bg-white rounded-xl border border-cyan-100 shadow-2xs flex items-center justify-between gap-3 hover:border-cyan-300 transition"
                                        >
                                            <div>
                                                <p className="font-bold text-gray-900 text-sm">
                                                    {DAYS_ARABIC[day] || day}
                                                </p>
                                                <p className="text-[11px] text-gray-500 mt-0.5">
                                                    {currentPeriods} حصص لهذا اليوم
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                {[4, 5, 6, 7, 8].map(num => (
                                                    <button
                                                        key={num}
                                                        type="button"
                                                        onClick={() => {
                                                            const nextDaily = { ...(config.dailyPeriods || {}) };
                                                            config.activeDays.forEach(d => {
                                                                if (nextDaily[d] === undefined) {
                                                                    nextDaily[d] = config.periodsPerDay || DEFAULT_PERIODS_PER_DAY;
                                                                }
                                                            });
                                                            nextDaily[day] = num;
                                                            const prospectiveConfig: GeneralScheduleConfig = {
                                                                ...config,
                                                                dailyPeriods: nextDaily
                                                            };
                                                            if (!checkCapacityReduction(prospectiveConfig)) {
                                                                return; // Rejected
                                                            }
                                                            setConfig(prospectiveConfig);
                                                            setHasUnsavedChanges(true);
                                                        }}
                                                        className={`w-7 h-8 rounded-lg font-black text-xs transition flex items-center justify-center ${
                                                            currentPeriods === num
                                                                ? 'bg-cyan-700 text-white shadow-xs scale-105'
                                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                        }`}
                                                    >
                                                        {num}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {/* Distribution Preferences */}
                <div className="space-y-3 pt-4 border-t border-gray-100">
                    <label className="block text-sm font-bold text-gray-800">
                        خيارات وقواعد التوزيع الذكي:
                    </label>

                    <div className="space-y-2 text-xs">
                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.preferBalancedTeacherLoad}
                                onChange={(e) => {
                                    setConfig(prev => ({ ...prev, preferBalancedTeacherLoad: e.target.checked }));
                                    setHasUnsavedChanges(true);
                                }}
                                className="w-4 h-4 text-cyan-600 rounded"
                            />
                            <div>
                                <p className="font-bold text-gray-900">توزيع حصص المدرس بشكل متوازن على مدار أيام دوامه</p>
                                <p className="text-gray-500 mt-0.5">تجنب ضغط حصص المدرس في يوم واحد وتوزيعها بانتظام لتجنب الإرهاق.</p>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.maxConsecutiveSameSubject === 1}
                                onChange={(e) => {
                                    setConfig(prev => ({ ...prev, maxConsecutiveSameSubject: e.target.checked ? 1 : 2 }));
                                    setHasUnsavedChanges(true);
                                }}
                                className="w-4 h-4 text-cyan-600 rounded"
                            />
                            <div>
                                <p className="font-bold text-gray-900">حصة واحدة يومياً للمادة الواحدة (إلا للضرورة والنصاب المرتفع)</p>
                                <p className="text-gray-500 mt-0.5">يضمن تنوع المواد الدراسية يومياً للشعبة وعدم تكرار المادة في نفس اليوم.</p>
                            </div>
                        </label>

                        <label className="flex items-center gap-3 p-3 bg-amber-50/70 rounded-xl border border-amber-200 hover:border-amber-300 transition cursor-pointer">
                            <input
                                type="checkbox"
                                checked={config.singleSportsCourt ?? false}
                                onChange={(e) => {
                                    setConfig(prev => ({ ...prev, singleSportsCourt: e.target.checked }));
                                    setHasUnsavedChanges(true);
                                }}
                                className="w-4 h-4 text-amber-600 rounded"
                            />
                            <div>
                                <p className="font-bold text-gray-900 flex items-center gap-2">
                                    <span>قيد ساحة رياضية واحدة (منع درسين رياضة في نفس التوقيت)</span>
                                    <span className="text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-black">مورد مشترك</span>
                                </p>
                                <p className="text-gray-600 mt-0.5">يمنع وضع درسين تربية رياضية في نفس الحصة بالمدرسة بغض النظر عن الصف أو الشعبة أو المدرس، لتفادي ازدحام الساحة الرياضية المدرسية المشتركة.</p>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
        );
    };

    // ----------------------------------------------------
    // Publish Modal: Broadcast to Teachers & Students + Telegram
    // ----------------------------------------------------
    const renderPublishModal = () => {
        if (!showPublishModal) return null;

        const totalStudentsCount = classes.reduce((sum, c) => sum + (c.students || []).length, 0);
        const telegramStudentsCount = classes.reduce((sum, c) => {
            return sum + (c.students || []).filter(s => s && s.telegramChatId && s.telegramChatId.trim()).length;
        }, 0);

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto" dir="rtl">
                <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-2xl w-full p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-gray-100 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 to-teal-500 text-white flex items-center justify-center shadow-md">
                                <Send size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-gray-900">
                                    نشر وتعميم الجدول الدراسي الأسبوعي
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    إتاحة الجداول في بوابات المدرسين والطلبة وإرسال إشعارات فورية عبر التليكرام.
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                if (!isPublishing) {
                                    setShowPublishModal(false);
                                    setPublishResult(null);
                                }
                            }}
                            disabled={isPublishing}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Publication Target Selection */}
                    <div className="space-y-2.5">
                        <label className="block text-xs font-bold text-gray-700">
                            حدد جهة نشر وتعميم الجدول:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            {/* All */}
                            <button
                                type="button"
                                onClick={() => setPublishTarget('all')}
                                className={`p-3.5 rounded-2xl border text-right transition flex flex-col justify-between gap-2 ${
                                    publishTarget === 'all'
                                        ? 'bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-500 ring-2 ring-teal-500/20 shadow-xs'
                                        : 'bg-white border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className={`p-2 rounded-xl ${publishTarget === 'all' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                        <Users size={18} />
                                    </div>
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                        publishTarget === 'all' ? 'border-teal-600 bg-teal-600' : 'border-gray-300'
                                    }`}>
                                        {publishTarget === 'all' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                </div>
                                <div>
                                    <p className="font-bold text-xs text-gray-900">للجميع (المدرسين والطلبة)</p>
                                    <p className="text-[10px] text-gray-500 mt-0.5">تحديث بوابات المدرسين والطلبة والتليكرام معاً</p>
                                </div>
                            </button>

                            {/* Teachers Only */}
                            <button
                                type="button"
                                onClick={() => setPublishTarget('teachers')}
                                className={`p-3.5 rounded-2xl border text-right transition flex flex-col justify-between gap-2 ${
                                    publishTarget === 'teachers'
                                        ? 'bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-500 ring-2 ring-cyan-500/20 shadow-xs'
                                        : 'bg-white border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className={`p-2 rounded-xl ${publishTarget === 'teachers' ? 'bg-cyan-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                        <GraduationCap size={18} />
                                    </div>
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                        publishTarget === 'teachers' ? 'border-cyan-600 bg-cyan-600' : 'border-gray-300'
                                    }`}>
                                        {publishTarget === 'teachers' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                </div>
                                <div>
                                    <p className="font-bold text-xs text-gray-900">للمدرسين فقط</p>
                                    <p className="text-[10px] text-gray-500 mt-0.5">إتاحة الجدول للكادر التعليمي دون إظهاره للطلبة</p>
                                </div>
                            </button>

                            {/* Students Only */}
                            <button
                                type="button"
                                onClick={() => setPublishTarget('students')}
                                className={`p-3.5 rounded-2xl border text-right transition flex flex-col justify-between gap-2 ${
                                    publishTarget === 'students'
                                        ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                                        : 'bg-white border-gray-200 hover:border-gray-300'
                                }`}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className={`p-2 rounded-xl ${publishTarget === 'students' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                        <BookOpen size={18} />
                                    </div>
                                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                        publishTarget === 'students' ? 'border-emerald-600 bg-emerald-600' : 'border-gray-300'
                                    }`}>
                                        {publishTarget === 'students' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                    </div>
                                </div>
                                <div>
                                    <p className="font-bold text-xs text-gray-900">للطلاب فقط</p>
                                    <p className="text-[10px] text-gray-500 mt-0.5">تحديث بوابة الطلبة وإرسال إشعارات التليكرام</p>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Publication Stats Overview */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className={`p-3.5 rounded-2xl border text-center transition ${
                            publishTarget === 'teachers' || publishTarget === 'all'
                                ? 'bg-cyan-50/70 border-cyan-200 ring-1 ring-cyan-400/30'
                                : 'bg-gray-50/70 border-gray-200 opacity-60'
                        }`}>
                            <p className="text-xs text-cyan-800 font-bold">المدرسين المستفيدين</p>
                            <p className="text-2xl font-black text-cyan-900 mt-1">{teachers.length}</p>
                            <p className="text-[10px] text-cyan-600">
                                {publishTarget === 'students' ? 'غير مشمولين بالنشر' : 'في بوابتهم الخاصة'}
                            </p>
                        </div>
                        <div className={`p-3.5 rounded-2xl border text-center transition ${
                            publishTarget === 'students' || publishTarget === 'all'
                                ? 'bg-emerald-50/70 border-emerald-200 ring-1 ring-emerald-400/30'
                                : 'bg-gray-50/70 border-gray-200 opacity-60'
                        }`}>
                            <p className="text-xs text-emerald-800 font-bold">الشعب والصفوف</p>
                            <p className="text-2xl font-black text-emerald-900 mt-1">{classes.length}</p>
                            <p className="text-[10px] text-emerald-600">
                                {publishTarget === 'teachers' ? 'مخفي عن بوابة الطلبة' : `${totalStudentsCount} طالب مسجل`}
                            </p>
                        </div>
                        <div className={`p-3.5 rounded-2xl border text-center transition ${
                            publishTarget === 'students' || publishTarget === 'all'
                                ? 'bg-blue-50/70 border-blue-200 ring-1 ring-blue-400/30'
                                : 'bg-gray-50/70 border-gray-200 opacity-60'
                        }`}>
                            <p className="text-xs text-blue-800 font-bold">مشتركو التليكرام</p>
                            <p className="text-2xl font-black text-blue-900 mt-1">{telegramStudentsCount}</p>
                            <p className="text-[10px] text-blue-600">
                                {publishTarget === 'teachers' ? 'معطل (للمدرسين فقط)' : 'يملكون Chat ID'}
                            </p>
                        </div>
                    </div>

                    {/* Publication Options */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                تاريخ أو موعد سريان الجدول:
                            </label>
                            <input
                                type="text"
                                value={customPublishEffectiveDate}
                                onChange={(e) => setCustomPublishEffectiveDate(e.target.value)}
                                placeholder="مثال: اعتباراً من الأحد ٢٠٢٦/٣/٢٩"
                                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:border-cyan-500 outline-hidden transition"
                            />
                        </div>

                        {/* Telegram Broadcast Toggle (Only if students are included) */}
                        {publishTarget !== 'teachers' && (
                            <div className="p-4 bg-gradient-to-br from-blue-50/70 via-white to-sky-50/60 rounded-2xl border border-blue-200 space-y-3">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                                            <Bot size={20} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">
                                                إرسال إشعار تليكرام فوري لكل طالب بجدول شعبته
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                سيتم إرسال رسالة منسقة تحتوي الحصص اليومية واسم المادة لكل طالب مسجل بالـ Chat ID.
                                            </p>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={sendTelegramToStudents}
                                        onChange={(e) => setSendTelegramToStudents(e.target.checked)}
                                        className="w-5 h-5 text-blue-600 rounded-lg"
                                    />
                                </label>

                                {sendTelegramToStudents && (
                                    <div className="pt-3 border-t border-blue-100/80 space-y-2">
                                        <label className="block text-xs font-bold text-blue-950">
                                            رمز البوت (Telegram Bot Token):
                                        </label>
                                        <input
                                            type="password"
                                            value={telegramBotTokenInput}
                                            onChange={(e) => setTelegramBotTokenInput(e.target.value)}
                                            placeholder="مثال: 123456789:ABCdefGhIJKlmNoPQRstUVwxyZ"
                                            className="w-full px-3.5 py-2 bg-white border border-blue-200 rounded-xl text-xs font-mono text-gray-900 focus:border-blue-500 outline-hidden"
                                        />
                                        {telegramStudentsCount === 0 && (
                                            <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
                                                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                                                لا يوجد طلاب لديهم معرف تليكرام (Chat ID) مسجل حالياً. سيتم النشر على المنصة فقط.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Progress Indicator */}
                    {isPublishing && publishProgress && (
                        <div className="p-4 bg-cyan-50 rounded-2xl border border-cyan-200 space-y-2.5">
                            <div className="flex justify-between text-xs font-bold text-cyan-900">
                                <span>{publishProgress.statusMessage}</span>
                                <span>{publishProgress.current} / {publishProgress.total}</span>
                            </div>
                            <div className="w-full bg-cyan-200 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="bg-cyan-600 h-2.5 rounded-full transition-all duration-300"
                                    style={{
                                        width: `${publishProgress.total > 0 ? (publishProgress.current / publishProgress.total) * 100 : 10}%`
                                    }}
                                />
                            </div>
                            <div className="flex justify-between text-[11px] text-cyan-700">
                                <span>ناجح: {publishProgress.successCount}</span>
                                <span>فشل: {publishProgress.failCount}</span>
                            </div>
                        </div>
                    )}

                    {/* Results Report */}
                    {publishResult && (
                        <div className={`p-4 rounded-2xl border ${
                            publishResult.success 
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                                : 'bg-rose-50 border-rose-200 text-rose-900'
                        } space-y-2`}>
                            <div className="flex items-center gap-2">
                                {publishResult.success ? (
                                    <CheckCircle2 size={20} className="text-emerald-600" />
                                ) : (
                                    <AlertTriangle size={20} className="text-rose-600" />
                                )}
                                <p className="font-bold text-sm">{publishResult.message}</p>
                            </div>

                            {sendTelegramToStudents && publishResult.telegramSent > 0 && (
                                <p className="text-xs text-emerald-700 font-medium mr-7">
                                    تم إرسال إشعارات التليكرام بنجاح إلى ({publishResult.telegramSent}) طالب.
                                </p>
                            )}

                            {publishResult.errors.length > 0 && (
                                <div className="mt-2 text-xs bg-white/70 p-2.5 rounded-xl border border-rose-200 text-rose-800 space-y-1">
                                    <p className="font-bold">تنبيهات:</p>
                                    {publishResult.errors.map((err, idx) => (
                                        <p key={idx}>• {err}</p>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => {
                                setShowPublishModal(false);
                                setPublishResult(null);
                            }}
                            disabled={isPublishing}
                            className="px-5 py-2.5 text-gray-700 hover:bg-gray-100 rounded-xl text-sm font-bold transition"
                        >
                            {publishResult ? 'إغلاق' : 'إلغاء'}
                        </button>

                        <button
                            type="button"
                            onClick={handlePublishSchedule}
                            disabled={isPublishing}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 active:scale-95 text-white font-black rounded-xl shadow-lg transition-all text-sm disabled:opacity-50"
                        >
                            <Send size={18} className={isPublishing ? 'animate-spin' : ''} />
                            <span>{isPublishing ? 'جاري النشر والإرسال...' : 'تأكيد النشر والتعميم الآن'}</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
            {/* Header */}
            <div className="bg-gradient-to-r from-cyan-900 via-cyan-800 to-blue-900 text-white p-6 rounded-3xl shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
                        <CalendarClock className="w-8 h-8 text-cyan-300" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
                            الجدول المدرسي الأسبوعي الذكي
                        </h1>
                        <p className="text-xs sm:text-sm text-cyan-200 mt-1">
                            توليد وتوزيع الحصص الأسبوعية آلياً مع المنع الصارم لتضارب المدرسين واحترام أيام التفرغ
                        </p>
                    </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-3 flex-wrap w-full md:w-auto">
                    {publishedInfo && (
                        <div className="hidden lg:flex items-center gap-2 px-3.5 py-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 text-xs font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span>
                                منشور: {publishedInfo.publishTarget === 'teachers' ? 'للمدرسين فقط' : publishedInfo.publishTarget === 'students' ? 'للطلاب فقط' : 'للجميع'}
                            </span>
                        </div>
                    )}

                    <button
                        onClick={() => {
                            setShowPublishModal(true);
                            setPublishResult(null);
                        }}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 hover:from-teal-600 hover:to-cyan-700 active:scale-95 text-white font-black rounded-xl shadow-lg transition-all text-sm"
                        title="نشر الجدول إلى بوابات المدرسين وبوابات الطلاب وإرسال إشعارات تليكرام"
                    >
                        <Send size={18} />
                        <span>نشر الجدول</span>
                    </button>

                    <button
                        onClick={handleGenerateSchedule}
                        disabled={isGenerating}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-black rounded-xl shadow-lg transition-all text-sm"
                    >
                        <Sparkles size={18} className={isGenerating ? 'animate-spin' : ''} />
                        <span>{isGenerating ? 'جاري التوليد الذكي...' : 'توليد الجدول تلقائياً'}</span>
                    </button>

                    <button
                        onClick={handleSaveAll}
                        disabled={isSaving}
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all ${
                            hasUnsavedChanges
                                ? 'bg-cyan-500 hover:bg-cyan-400 text-white animate-pulse'
                                : 'bg-white/20 hover:bg-white/30 text-white'
                        }`}
                    >
                        <Save size={18} />
                        <span>{isSaving ? 'جاري الحفظ...' : 'حفظ التعديلات'}</span>
                    </button>

                    <button
                        onClick={handleClearSchedule}
                        className="p-2.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl transition"
                        title="تفريغ الجدول"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-200 bg-white rounded-2xl p-1.5 shadow-2xs overflow-x-auto gap-1">
                <button
                    onClick={() => setActiveTab('schedule_view')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                        activeTab === 'schedule_view'
                            ? 'bg-cyan-700 text-white shadow-xs'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                >
                    <Calendar size={18} />
                    <span>عرض وتحرير الجدول</span>
                    {conflicts.length > 0 && (
                        <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold">
                            {conflicts.length}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('quotas_editor')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                        activeTab === 'quotas_editor'
                            ? 'bg-cyan-700 text-white shadow-xs'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                >
                    <BookOpen size={18} />
                    <span>أنصبة وحصص المواد للشعب</span>
                </button>

                <button
                    onClick={() => setActiveTab('teacher_constraints')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                        activeTab === 'teacher_constraints'
                            ? 'bg-cyan-700 text-white shadow-xs'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                >
                    <UserCheck size={18} />
                    <span>أيام تفرغ المدرسين</span>
                </button>

                <button
                    onClick={() => setActiveTab('general_settings')}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                        activeTab === 'general_settings'
                            ? 'bg-cyan-700 text-white shadow-xs'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                >
                    <Sliders size={18} />
                    <span>إعدادات الجدول</span>
                </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'schedule_view' && renderScheduleViewTab()}
            {activeTab === 'quotas_editor' && renderQuotasEditorTab()}
            {activeTab === 'teacher_constraints' && renderTeacherConstraintsTab()}
            {activeTab === 'general_settings' && renderGeneralSettingsTab()}

            {/* Modals */}
            {renderConflictModal()}
            {renderUnassignedLessonsModal()}
            {renderClearScheduleConfirmModal()}
            {renderEditCellModal()}
            {renderDragConflictAlertModal()}
            {renderStageScheduleModal()}
            {renderPublishModal()}
            {renderCapacityAlertModal()}

            {/* Teacher Color Management Modal */}
            <TeacherColorModal
                isOpen={showTeacherColorModal}
                onClose={() => setShowTeacherColorModal(false)}
                teachers={teachers}
                teacherColors={teacherColors}
                enableTeacherColors={enableTeacherColors}
                onUpdateTeacherColor={handleUpdateTeacherColor}
                onResetAllToDefault={handleResetAllColorsToDefault}
                onClearAllColors={handleClearAllColors}
                onToggleEnableColors={handleToggleEnableTeacherColors}
                onSave={handleSaveTeacherColors}
                isSaving={isSavingColors}
            />
        </div>
    );
}
