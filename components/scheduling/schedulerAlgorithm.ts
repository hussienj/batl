import type { ClassData, User, Subject, SchoolSettings } from '../../types.ts';

export interface ClassSubjectQuota {
    subjectId: string;
    subjectName: string;
    periodsCount: number;
    teacherId?: string;
    teacherName?: string;
}

export interface TeacherConstraint {
    teacherId: string;
    teacherName: string;
    offDays: string[]; // e.g. ['Saturday', 'Tuesday']
    unavailablePeriods?: Record<string, number[]>; // e.g. { 'Monday': [1], 'Tuesday': [6], 'Wednesday': [1, 6] } (1-based period numbers)
    maxDailyPeriods?: number; // e.g. 4 or 5
    preferredPeriods?: ('early' | 'late' | 'any')[];
}

/**
 * Checks if a teacher is unavailable (either full-day off or partial-day period off)
 */
export function isTeacherUnavailableAt(
    constraint: TeacherConstraint | undefined,
    day: string,
    period: number
): boolean {
    if (!constraint) return false;
    // 1. Full day off
    if (Array.isArray(constraint.offDays) && constraint.offDays.includes(day)) {
        return true;
    }
    // 2. Partial period off on this day
    if (constraint.unavailablePeriods && Array.isArray(constraint.unavailablePeriods[day])) {
        if (constraint.unavailablePeriods[day].includes(period)) {
            return true;
        }
    }
    return false;
}

/**
 * Returns list of partial unavailable periods for a teacher on a specific day (empty if full-day off)
 */
export function getTeacherUnavailablePeriodsOnDay(
    constraint: TeacherConstraint | undefined,
    day: string
): number[] {
    if (!constraint) return [];
    if (Array.isArray(constraint.offDays) && constraint.offDays.includes(day)) {
        return [];
    }
    if (constraint.unavailablePeriods && Array.isArray(constraint.unavailablePeriods[day])) {
        return constraint.unavailablePeriods[day];
    }
    return [];
}

export interface GeneralScheduleConfig {
    activeDays: string[]; // e.g. ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday']
    periodsPerDay: number; // e.g. 6 (default/uniform count)
    dailyPeriods?: Record<string, number>; // customized count per day, e.g. { 'Sunday': 6, 'Wednesday': 5 }
    maxConsecutiveSameSubject?: number; // default 1 or 2
    preferBalancedTeacherLoad?: boolean;
    singleSportsCourt?: boolean; // When true, restricts to max 1 sports lesson across the whole school at any given time
}

export interface ScheduleCellAssignment {
    subject: string;
    teacher: string;
    subjectId: string;
    teacherId: string;
    classId: string;
    stage: string;
    section: string;
}

// schedule[day][period - 1].assignments[classId]
export interface SchedulePeriodData {
    period: number;
    assignments: Record<string, ScheduleCellAssignment>;
}

export type MasterScheduleData = Record<string, SchedulePeriodData[]>;

export interface ScheduleConflict {
    type: 'teacher_double_booking' | 'teacher_off_day' | 'capacity_exceeded' | 'unassigned_periods' | 'missing_teacher' | 'teacher_overload' | 'class_schedule_gap' | 'duplicate_subject_same_day' | 'sports_court_conflict';
    message: string;
    teacherId?: string;
    teacherName?: string;
    classId?: string;
    className?: string;
    day?: string;
    period?: number;
    subjectName?: string;
    details?: string;
}

export interface GenerationResult {
    success: boolean;
    schedule: MasterScheduleData;
    conflicts: ScheduleConflict[];
    placedCount: number;
    totalRequiredCount: number;
    unassignedItems: {
        classId: string;
        className: string;
        subjectName: string;
        teacherName: string;
        count: number;
    }[];
    statistics: {
        totalClasses: number;
        totalTeachers: number;
        totalPeriodsPlaced: number;
        coveragePercentage: number;
        generationTimeMs: number;
    };
}

export const DAYS_ARABIC: Record<string, string> = {
    'Sunday': 'الأحد',
    'Monday': 'الإثنين',
    'Tuesday': 'الثلاثاء',
    'Wednesday': 'الأربعاء',
    'Thursday': 'الخميس',
    'Friday': 'الجمعة',
    'Saturday': 'السبت'
};

export const ALL_POSSIBLE_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Saturday'];
export const DEFAULT_ACTIVE_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];
export const DEFAULT_PERIODS_PER_DAY = 6;

/**
 * Returns the exact number of periods configured for a given day.
 */
export function getPeriodsForDay(day: string, config?: GeneralScheduleConfig | null): number {
    if (config?.dailyPeriods && typeof config.dailyPeriods[day] === 'number' && config.dailyPeriods[day] > 0) {
        return config.dailyPeriods[day];
    }
    if (typeof config?.periodsPerDay === 'number' && config.periodsPerDay > 0) {
        return config.periodsPerDay;
    }
    return DEFAULT_PERIODS_PER_DAY;
}

/**
 * Returns the total weekly period capacity for a class based on active days and daily periods.
 */
export function getTotalWeeklyCapacity(config?: GeneralScheduleConfig | null): number {
    const activeDays = (Array.isArray(config?.activeDays) && config.activeDays.length > 0) ? config.activeDays : DEFAULT_ACTIVE_DAYS;
    return activeDays.reduce((sum, day) => sum + getPeriodsForDay(day, config), 0);
}

/**
 * Returns the maximum number of daily periods across all active days.
 */
export function getMaxDailyPeriods(config?: GeneralScheduleConfig | null): number {
    const activeDays = (Array.isArray(config?.activeDays) && config.activeDays.length > 0) ? config.activeDays : DEFAULT_ACTIVE_DAYS;
    if (activeDays.length === 0) return DEFAULT_PERIODS_PER_DAY;
    return Math.max(...activeDays.map(day => getPeriodsForDay(day, config)));
}

/**
 * Helper to identify Physical Education / Sports subjects across various naming conventions.
 */
export function isSportsSubject(subjectName?: string): boolean {
    if (!subjectName) return false;
    const clean = subjectName.trim().toLowerCase();
    return clean.includes('رياضة') || clean.includes('رياضية') || clean.includes('بدنية') || clean.includes('pe') || clean.includes('sport');
}

/**
 * Standard Iraqi Curriculum Quotas (Fallback when no quota set)
 */
export const STANDARD_CURRICULUM_QUOTAS = {
    'primary': {
        'تربية إسلامية': 2,
        'لغة عربية': 6,
        'لغة إنكليزية': 4,
        'رياضيات': 5,
        'علوم': 4,
        'اجتماعيات': 3,
        'تربية فنية': 2,
        'تربية رياضية': 2,
        'نشاط / حاسوب': 2
    },
    'intermediate': {
        'تربية إسلامية': 2,
        'لغة عربية': 5,
        'لغة إنكليزية': 5,
        'رياضيات': 5,
        'علوم / أحياء': 4,
        'كيمياء / فيزياء': 3,
        'اجتماعيات (تاريخ/جغرافية/وطنية)': 3,
        'حاسوب': 1,
        'تربية فنية': 1,
        'تربية رياضية': 1
    },
    'secondary': {
        'تربية إسلامية': 2,
        'لغة عربية': 4,
        'لغة إنكليزية': 4,
        'رياضيات': 5,
        'أحياء': 4,
        'كيمياء': 4,
        'فيزياء': 4,
        'فرنسي / لغة ثانية': 1,
        'حاسوب': 1,
        'تربية رياضية': 1
    }
};

/**
 * Helper to match subject name to standard default quotas
 */
export function getDefaultQuotaForSubject(subjectName: string, schoolLevel?: string): number {
    const cleanName = (subjectName || '').trim();
    const schoolLevelStr = typeof schoolLevel === 'string' ? schoolLevel : '';
    const levelKey = schoolLevelStr.includes('ابتدائ') 
        ? 'primary' 
        : schoolLevelStr.includes('اعداد') 
            ? 'secondary' 
            : 'intermediate';

    const quotaMap = STANDARD_CURRICULUM_QUOTAS[levelKey] || STANDARD_CURRICULUM_QUOTAS.intermediate;

    for (const [key, quota] of Object.entries(quotaMap)) {
        if (cleanName.includes(key) || key.includes(cleanName)) {
            return quota;
        }
    }
    
    // Generic fallback based on standard subject weights
    if (cleanName.includes('عرب') || cleanName.includes('رياضيات') || cleanName.includes('انكليز') || cleanName.includes('انجليز')) {
        return 5;
    }
    if (cleanName.includes('علوم') || cleanName.includes('اجتماع')) {
        return 3;
    }
    if (cleanName.includes('اسلام') || cleanName.includes('كيمياء') || cleanName.includes('فيزياء') || cleanName.includes('احياء')) {
        return 2;
    }
    return 1;
}

/**
 * Validates pre-conditions and reports structural conflicts prior to or after scheduling.
 * NOTE: Unassigned subjects are omitted, and quotas are purely determined by what the principal sets.
 */
export function validateScheduleFeasibility(
    classes: ClassData[],
    teachers: User[],
    classQuotas: Record<string, Record<string, number>>, // classId -> { subjectId: count }
    teacherConstraints: Record<string, TeacherConstraint>,
    config: GeneralScheduleConfig
): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const activeDays = (Array.isArray(config?.activeDays) && config.activeDays.length > 0) ? config.activeDays : DEFAULT_ACTIVE_DAYS;
    const totalWeeklySlots = getTotalWeeklyCapacity(config);
    const safeClasses = Array.isArray(classes) ? classes : [];
    const safeTeachers = Array.isArray(teachers) ? teachers : [];
    const safeConstraints = teacherConstraints || {};

    // 1. Check Class Capacities (only for assigned subjects)
    safeClasses.forEach(cls => {
        const quotas = (classQuotas && classQuotas[cls.id]) || {};
        let totalAssignedPeriods = 0;

        (cls.subjects || []).forEach(subj => {
            const assignedTeacher = safeTeachers.find(t => 
                t && t.role === 'teacher' && 
                Array.isArray(t.assignments) &&
                t.assignments.some(a => a && a.classId === cls.id && a.subjectId === subj.id)
            );
            if (!assignedTeacher) return; // Skip unassigned

            const count = quotas[subj.id] !== undefined 
                ? quotas[subj.id] 
                : getDefaultQuotaForSubject(subj.name);
            totalAssignedPeriods += count;
        });

        if (totalAssignedPeriods > totalWeeklySlots) {
            conflicts.push({
                type: 'capacity_exceeded',
                classId: cls.id,
                className: `${cls.stage || ''} ${cls.section || ''}`.trim(),
                message: `مجموع الحصص المطلوبة للشعبة (${totalAssignedPeriods} حصة) يتجاوز سعة الأسبوع (${totalWeeklySlots} حصة).`,
                details: `سيتم توزيع أول ${totalWeeklySlots} حصة تلقائياً.`
            });
        }
    });

    // 2. Check Teacher Workload vs Available Days
    const teacherAssignmentsMap = new Map<string, { teacher: User; totalPeriods: number; subjects: string[] }>();
    
    safeTeachers.forEach(t => {
        if (t && t.role === 'teacher') {
            teacherAssignmentsMap.set(t.id, { teacher: t, totalPeriods: 0, subjects: [] });
        }
    });

    safeClasses.forEach(cls => {
        const quotas = (classQuotas && classQuotas[cls.id]) || {};
        (cls.subjects || []).forEach(subj => {
            const assignedTeacher = safeTeachers.find(t => 
                t && t.role === 'teacher' && 
                Array.isArray(t.assignments) &&
                t.assignments.some(a => a && a.classId === cls.id && a.subjectId === subj.id)
            );

            // Skip unassigned subjects completely
            if (!assignedTeacher) return;

            const count = quotas[subj.id] !== undefined 
                ? quotas[subj.id] 
                : getDefaultQuotaForSubject(subj.name);

            if (count > 0) {
                const tData = teacherAssignmentsMap.get(assignedTeacher.id);
                if (tData) {
                    tData.totalPeriods += count;
                    if (subj.name && !tData.subjects.includes(subj.name)) {
                        tData.subjects.push(subj.name);
                    }
                }
            }
        });
    });

    teacherAssignmentsMap.forEach((data, teacherId) => {
        const constraint = safeConstraints[teacherId];
        const offDays = Array.isArray(constraint?.offDays) ? constraint.offDays : [];
        const availableDays = activeDays.filter(d => !offDays.includes(d));

        if (availableDays.length === 0 && data.totalPeriods > 0) {
            conflicts.push({
                type: 'teacher_overload',
                teacherId,
                teacherName: data.teacher.name,
                message: `المدرس (${data.teacher.name}) لديه ${data.totalPeriods} حصة، ولكن جميع أيامه محددة كيوم تفرغ!`,
                details: 'يرجى إلغاء بعض أيام التفرغ لتوزيع حصصه بانتظام.'
            });
        } else if (availableDays.length > 0) {
            const maxPossibleTeacherSlots = availableDays.reduce((acc, d) => {
                const dayPeriods = getPeriodsForDay(d, config);
                const partialOffCount = getTeacherUnavailablePeriodsOnDay(constraint, d).length;
                const effectivePeriods = Math.max(0, dayPeriods - partialOffCount);
                const maxDaily = (typeof constraint?.maxDailyPeriods === 'number' && constraint.maxDailyPeriods > 0) 
                    ? Math.min(constraint.maxDailyPeriods, effectivePeriods)
                    : effectivePeriods;
                return acc + maxDaily;
            }, 0);

            if (data.totalPeriods > maxPossibleTeacherSlots) {
                conflicts.push({
                    type: 'teacher_overload',
                    teacherId,
                    teacherName: data.teacher.name,
                    message: `نصاب المدرس (${data.teacher.name}) يبلغ (${data.totalPeriods} حصة) ويتجاوز الطاقة الاستيعابية (${maxPossibleTeacherSlots} حصة) في ${availableDays.length} أيام دوام مع مراعاة التفرغات الجزئية.`,
                    details: `يُفضل تقليل أيام التفرغ أو الحصص المفرغة، أو زيادة الحد الأقصى اليومي للحصص.`
                });
            }
        }
    });

    return conflicts;
}

/**
 * Single-pass deterministic/perturbed Schedule Generator Engine
 */
export function generateWeeklyScheduleSinglePass(
    classes: ClassData[],
    teachers: User[],
    classQuotas: Record<string, Record<string, number>>,
    teacherConstraints: Record<string, TeacherConstraint>,
    config: GeneralScheduleConfig,
    seedOffset = 0,
    dayOrderShift = 0
): GenerationResult {
    const startTime = performance.now();
    const baseActiveDays = (Array.isArray(config?.activeDays) && config.activeDays.length > 0) ? config.activeDays : DEFAULT_ACTIVE_DAYS;
    // Rotate/shift active days order slightly based on dayOrderShift to explore diverse permutations
    const activeDays = dayOrderShift === 0 
        ? [...baseActiveDays] 
        : [...baseActiveDays.slice(dayOrderShift % baseActiveDays.length), ...baseActiveDays.slice(0, dayOrderShift % baseActiveDays.length)];

    const safeClasses = Array.isArray(classes) ? classes : [];
    const safeTeachers = Array.isArray(teachers) ? teachers : [];
    const safeConstraints = teacherConstraints || {};

    // 1. Initial Schedule Grid Setup: schedule[day][periodIndex]
    const schedule: MasterScheduleData = {};
    baseActiveDays.forEach(day => {
        const dayPeriods = getPeriodsForDay(day, config);
        schedule[day] = Array.from({ length: dayPeriods }, (_, pIndex) => ({
            period: pIndex + 1,
            assignments: {}
        }));
    });

    if (safeClasses.length === 0) {
        return {
            success: true,
            schedule,
            conflicts: [],
            placedCount: 0,
            totalRequiredCount: 0,
            unassignedItems: [],
            statistics: {
                totalClasses: 0,
                totalTeachers: 0,
                totalPeriodsPlaced: 0,
                coveragePercentage: 100,
                generationTimeMs: 0
            }
        };
    }

    // 2. Prepare tasks ONLY for assigned subjects with quota > 0
    interface ScheduleTask {
        id: string;
        classId: string;
        stage: string;
        section: string;
        subjectId: string;
        subjectName: string;
        teacherId: string;
        teacherName: string;
        quotaIndex: number;
        totalQuota: number;
        priority: number; // Higher is harder to place
    }

    const tasksToPlace: ScheduleTask[] = [];
    const unassignedItemsMap = new Map<string, { classId: string; className: string; subjectName: string; teacherName: string; count: number }>();
    let totalRequiredCount = 0;

    safeClasses.forEach(cls => {
        const quotas = (classQuotas && classQuotas[cls.id]) || {};
        (cls.subjects || []).forEach(subj => {
            // Find directly assigned teacher
            const assignedTeacher = safeTeachers.find(t => 
                t && t.role === 'teacher' && 
                Array.isArray(t.assignments) &&
                t.assignments.some(a => a && a.classId === cls.id && a.subjectId === subj.id)
            );

            // User Rule: Unassigned subjects MUST NOT be added to the schedule
            if (!assignedTeacher) {
                return;
            }

            const quotaCount = quotas[subj.id] !== undefined 
                ? quotas[subj.id] 
                : getDefaultQuotaForSubject(subj.name);

            if (quotaCount <= 0) {
                return;
            }

            totalRequiredCount += quotaCount;

            const tConstraint = safeConstraints[assignedTeacher.id];
            const offDays = Array.isArray(tConstraint?.offDays) ? tConstraint.offDays : [];
            const availableDays = baseActiveDays.filter(d => !offDays.includes(d)).length;
            let totalPartialOffPeriods = 0;
            baseActiveDays.forEach(d => {
                if (!offDays.includes(d)) {
                    totalPartialOffPeriods += getTeacherUnavailablePeriodsOnDay(tConstraint, d).length;
                }
            });

            // Priority Calculation:
            // 1. Assigned teachers with fewer available days and more partial off periods (Strict constraint first)
            // 2. High weekly quota subjects (Math, Arabic, English)
            const teacherAssignmentsCount = Array.isArray(assignedTeacher.assignments) ? assignedTeacher.assignments.length : 0;
            // Introduce deterministic pseudo-random jitter when seedOffset > 0 to explore diverse orderings
            const jitter = seedOffset > 0 ? (((cls.id.charCodeAt(0) * 17 + subj.id.charCodeAt(0) * 31 + seedOffset * 43) % 11) - 5) : 0;
            const priority = (7 - availableDays) * 25 + totalPartialOffPeriods * 10 + quotaCount * 6 + teacherAssignmentsCount * 2 + jitter;

            for (let i = 0; i < quotaCount; i++) {
                tasksToPlace.push({
                    id: `${cls.id}_${subj.id}_${assignedTeacher.id}_${i}`,
                    classId: cls.id,
                    stage: cls.stage || '',
                    section: cls.section || '',
                    subjectId: subj.id,
                    subjectName: subj.name,
                    teacherId: assignedTeacher.id,
                    teacherName: assignedTeacher.name,
                    quotaIndex: i,
                    totalQuota: quotaCount,
                    priority
                });
            }
        });
    });

    // Sort tasks using Round-Robin across subjects:
    // Distribute 1st period of all subjects first across days, then 2nd period, etc.
    // Within each quotaIndex round, prioritize harder tasks (teachers with off-days, high workload)
    tasksToPlace.sort((a, b) => {
        if (a.quotaIndex !== b.quotaIndex) {
            return a.quotaIndex - b.quotaIndex;
        }
        return b.priority - a.priority;
    });

    // State Trackers
    const teacherOccupied: Record<string, Record<string, Record<number, boolean>>> = {};
    const teacherDailyLoad: Record<string, Record<string, number>> = {};
    const classOccupied: Record<string, Record<string, Record<number, boolean>>> = {};
    const classSubjectDailyCount: Record<string, Record<string, Record<string, number>>> = {};
    const sportsOccupied: Record<string, Record<number, boolean>> = {};

    const initTrackers = () => {
        safeTeachers.forEach(t => {
            if (!t) return;
            teacherOccupied[t.id] = {};
            teacherDailyLoad[t.id] = {};
            baseActiveDays.forEach(day => {
                teacherOccupied[t.id][day] = {};
                teacherDailyLoad[t.id][day] = 0;
            });
        });

        safeClasses.forEach(c => {
            if (!c) return;
            classOccupied[c.id] = {};
            classSubjectDailyCount[c.id] = {};
            baseActiveDays.forEach(day => {
                classOccupied[c.id][day] = {};
                classSubjectDailyCount[c.id][day] = {};
            });
        });

        baseActiveDays.forEach(day => {
            sportsOccupied[day] = {};
        });
    };

    initTrackers();

    let placedCount = 0;
    const failedTasks: ScheduleTask[] = [];

    // Helper: evaluates slot fitness score
    const evaluateSlotScore = (
        task: ScheduleTask,
        day: string,
        period: number,
        dayIndex: number
    ): number => {
        let score = 100;

        // 1. Check Class clash (Hard constraint)
        if (classOccupied[task.classId]?.[day]?.[period]) {
            return -Infinity;
        }

        // 2. Respect Teacher Off Days & Partial Period Unavailability (Hard constraint)
        const tConstraint = safeConstraints[task.teacherId];
        if (isTeacherUnavailableAt(tConstraint, day, period)) {
            return -Infinity;
        }

        // 3. Check Teacher clash (Hard constraint)
        if (teacherOccupied[task.teacherId]?.[day]?.[period]) {
            return -Infinity;
        }

        // 4. Single Sports Court Resource Constraint (Hard constraint if enabled)
        if (config?.singleSportsCourt && isSportsSubject(task.subjectName)) {
            if (sportsOccupied[day]?.[period]) {
                return -Infinity;
            }
        }

        // 5. Check Teacher daily maximum load
        const dayPeriods = getPeriodsForDay(day, config);
        const maxDaily = (typeof tConstraint?.maxDailyPeriods === 'number' && tConstraint.maxDailyPeriods > 0)
            ? tConstraint.maxDailyPeriods 
            : dayPeriods;
        const currentDailyLoad = teacherDailyLoad[task.teacherId]?.[day] || 0;
        if (currentDailyLoad >= maxDaily) {
            score -= 600;
        }

        // Teacher balance across days
        score -= currentDailyLoad * 25;

        // 5. Contiguous Class Schedule (NO GAPS RULE):
        // Lessons for a class on any day MUST start from period 1 and be strictly consecutive.
        const currentClassDayPeriods: number[] = [];
        for (let p = 1; p <= dayPeriods; p++) {
            if (classOccupied[task.classId]?.[day]?.[p]) {
                currentClassDayPeriods.push(p);
            }
        }

        let firstFreePeriodForClass = 1;
        while (firstFreePeriodForClass <= dayPeriods && currentClassDayPeriods.includes(firstFreePeriodForClass)) {
            firstFreePeriodForClass++;
        }

        if (currentClassDayPeriods.length === 0) {
            // First lesson of the day for this class: MUST be Period 1!
            if (period === 1) {
                score += 500;
            } else {
                score -= 4000 * period;
            }
        } else {
            // Class already has lessons on this day:
            if (period === firstFreePeriodForClass) {
                score += 600;
            } else if (period > firstFreePeriodForClass) {
                score -= 5000 * (period - firstFreePeriodForClass);
            } else {
                score += 700;
            }
        }

        // Class daily distribution balance (spread lessons evenly across days)
        score -= currentClassDayPeriods.length * 35;

        // 6. STRICT Subject Repetition Avoidance in same class on same day:
        const subjectSameDayCount = classSubjectDailyCount[task.classId]?.[day]?.[task.subjectId] || 0;
        const maxAllowedPerDay = Math.ceil((task.totalQuota || 1) / (baseActiveDays.length || 5));

        if (subjectSameDayCount >= maxAllowedPerDay) {
            score -= 150000;
        } else if (subjectSameDayCount > 0) {
            score -= 30000;
        }

        // 7. Time-of-day pedagogical preferences
        const taskSubjName = task.subjectName || '';
        const isCoreSubject = ['رياضيات', 'لغة عربية', 'لغة إنكليزية', 'فيزياء', 'كيمياء', 'علوم'].some(s => taskSubjName.includes(s));
        const isLightSubject = ['فنية', 'رياضة', 'حاسوب', 'نشاط'].some(s => taskSubjName.includes(s));

        if (isCoreSubject && period <= 3) {
            score += 30;
        } else if (isLightSubject && period >= 4) {
            score += 20;
        }

        // 8. Dynamic hash spread to prevent deterministic clumping
        score += ((dayIndex * 7 + period * 13 + seedOffset * 19 + (task.classId || '').charCodeAt(0) + (task.subjectId || '').charCodeAt(0)) % 17);

        return score;
    };

    // Slot distribution loop
    for (const task of tasksToPlace) {
        let bestSlot: { day: string; period: number; score: number } | null = null;

        for (let dIdx = 0; dIdx < activeDays.length; dIdx++) {
            const day = activeDays[dIdx];
            const dayPeriods = getPeriodsForDay(day, config);
            for (let period = 1; period <= dayPeriods; period++) {
                const score = evaluateSlotScore(task, day, period, dIdx);
                if (score > -Infinity) {
                    if (!bestSlot || score > bestSlot.score) {
                        bestSlot = { day, period, score };
                    }
                }
            }
        }

        if (bestSlot) {
            // Assign slot
            const { day, period } = bestSlot;
            const periodData = schedule[day][period - 1];

            periodData.assignments[task.classId] = {
                subject: task.subjectName,
                teacher: task.teacherName,
                subjectId: task.subjectId,
                teacherId: task.teacherId,
                classId: task.classId,
                stage: task.stage,
                section: task.section
            };

            // Update Trackers
            if (!teacherOccupied[task.teacherId]) teacherOccupied[task.teacherId] = {};
            if (!teacherOccupied[task.teacherId][day]) teacherOccupied[task.teacherId][day] = {};
            teacherOccupied[task.teacherId][day][period] = true;
            teacherDailyLoad[task.teacherId][day] = (teacherDailyLoad[task.teacherId][day] || 0) + 1;

            if (!classOccupied[task.classId]) classOccupied[task.classId] = {};
            if (!classOccupied[task.classId][day]) classOccupied[task.classId][day] = {};
            classOccupied[task.classId][day][period] = true;

            if (!classSubjectDailyCount[task.classId]) classSubjectDailyCount[task.classId] = {};
            if (!classSubjectDailyCount[task.classId][day]) classSubjectDailyCount[task.classId][day] = {};
            classSubjectDailyCount[task.classId][day][task.subjectId] = (classSubjectDailyCount[task.classId][day][task.subjectId] || 0) + 1;

            if (isSportsSubject(task.subjectName)) {
                if (!sportsOccupied[day]) sportsOccupied[day] = {};
                sportsOccupied[day][period] = true;
            }

            placedCount++;
        } else {
            failedTasks.push(task);
        }
    }

    // 3. Second-chance filling for any remaining unplaced tasks
    if (failedTasks.length > 0) {
        for (const unplaced of [...failedTasks]) {
            let resolved = false;

            for (const day of activeDays) {
                const tConstraint = safeConstraints[unplaced.teacherId];
                const dayPeriods = getPeriodsForDay(day, config);

                for (let p = 1; p <= dayPeriods; p++) {
                    if (isTeacherUnavailableAt(tConstraint, day, p)) continue;

                    if (config?.singleSportsCourt && isSportsSubject(unplaced.subjectName) && sportsOccupied[day]?.[p]) {
                        continue;
                    }

                    if (!classOccupied[unplaced.classId]?.[day]?.[p]) {
                        if (!teacherOccupied[unplaced.teacherId]?.[day]?.[p]) {
                            schedule[day][p - 1].assignments[unplaced.classId] = {
                                subject: unplaced.subjectName,
                                teacher: unplaced.teacherName,
                                subjectId: unplaced.subjectId,
                                teacherId: unplaced.teacherId,
                                classId: unplaced.classId,
                                stage: unplaced.stage,
                                section: unplaced.section
                            };
                            if (!teacherOccupied[unplaced.teacherId]) teacherOccupied[unplaced.teacherId] = {};
                            if (!teacherOccupied[unplaced.teacherId][day]) teacherOccupied[unplaced.teacherId][day] = {};
                            teacherOccupied[unplaced.teacherId][day][p] = true;

                            if (!classOccupied[unplaced.classId]) classOccupied[unplaced.classId] = {};
                            if (!classOccupied[unplaced.classId][day]) classOccupied[unplaced.classId][day] = {};
                            classOccupied[unplaced.classId][day][p] = true;

                            if (isSportsSubject(unplaced.subjectName)) {
                                if (!sportsOccupied[day]) sportsOccupied[day] = {};
                                sportsOccupied[day][p] = true;
                            }

                            placedCount++;
                            resolved = true;
                            const idx = failedTasks.indexOf(unplaced);
                            if (idx !== -1) failedTasks.splice(idx, 1);
                            break;
                        }
                    }
                }
                if (resolved) break;
            }
        }
    }

    // 4. Automated Post-Generation Gap Compaction Pass
    const { schedule: compactedSchedule } = compactScheduleGaps(
        schedule,
        safeClasses,
        safeTeachers,
        safeConstraints,
        baseActiveDays,
        config
    );

    baseActiveDays.forEach(day => {
        schedule[day] = compactedSchedule[day];
    });

    // 5. Automated Subject Duplicate Swaps Resolution Pass
    const { schedule: optimizedDuplicatesSchedule } = resolveSubjectDuplicateSwaps(
        schedule,
        safeClasses,
        safeTeachers,
        safeConstraints,
        baseActiveDays,
        config
    );

    baseActiveDays.forEach(day => {
        schedule[day] = optimizedDuplicatesSchedule[day];
    });

    // Aggregate remaining unassigned items if any
    failedTasks.forEach(ft => {
        const key = `${ft.classId}_${ft.subjectId}_${ft.teacherId}`;
        const existing = unassignedItemsMap.get(key);
        if (existing) {
            existing.count += 1;
        } else {
            unassignedItemsMap.set(key, {
                classId: ft.classId,
                className: `${ft.stage || ''} ${ft.section || ''}`.trim(),
                subjectName: ft.subjectName,
                teacherName: ft.teacherName,
                count: 1
            });
        }
    });

    // 6. Verify Final Schedule for Conflicts
    const postConflicts = findScheduleConflicts(schedule, safeClasses, safeTeachers, safeConstraints, baseActiveDays, config);
    const endTime = performance.now();
    const unassignedItems = Array.from(unassignedItemsMap.values());

    return {
        success: failedTasks.length === 0,
        schedule,
        conflicts: postConflicts,
        placedCount,
        totalRequiredCount,
        unassignedItems,
        statistics: {
            totalClasses: safeClasses.length,
            totalTeachers: safeTeachers.filter(t => t && t.role === 'teacher').length,
            totalPeriodsPlaced: placedCount,
            coveragePercentage: totalRequiredCount > 0 ? Math.round((placedCount / totalRequiredCount) * 100) : 100,
            generationTimeMs: Math.round(endTime - startTime)
        }
    };
}

/**
 * Resolves duplicate subject occurrences in the same class on the same day
 * by performing intelligent swaps with lessons on other days where that subject
 * is not yet taught (or has fewer occurrences), ensuring no teacher clashes or off-day violations.
 */
export function resolveSubjectDuplicateSwaps(
    schedule: MasterScheduleData,
    classes: ClassData[],
    teachers: User[],
    teacherConstraints: Record<string, TeacherConstraint>,
    activeDays: string[],
    config: GeneralScheduleConfig
): { schedule: MasterScheduleData; swapsMade: number } {
    const safeDays = (Array.isArray(activeDays) && activeDays.length > 0) ? activeDays : DEFAULT_ACTIVE_DAYS;
    const safeClasses = Array.isArray(classes) ? classes : [];
    const safeConstraints = teacherConstraints || {};

    // Deep clone schedule
    const cloned: MasterScheduleData = {};
    safeDays.forEach(day => {
        const dayPeriods = getPeriodsForDay(day, config);
        cloned[day] = Array.from({ length: dayPeriods }, (_, pIndex) => {
            const existing = schedule?.[day]?.[pIndex];
            return {
                period: pIndex + 1,
                assignments: existing ? { ...existing.assignments } : {}
            };
        });
    });

    let swapsMade = 0;
    const maxPasses = 15;

    for (let pass = 0; pass < maxPasses; pass++) {
        let swappedInPass = false;

        for (const cls of safeClasses) {
            for (const day of safeDays) {
                const dayPeriods = getPeriodsForDay(day, config);

                // Count occurrences of each subject on this day for this class
                const subjectOccurrences: Record<string, { count: number; periods: number[]; subjectName: string; teacherId: string }> = {};

                for (let p = 1; p <= dayPeriods; p++) {
                    const assign = cloned[day]?.[p - 1]?.assignments?.[cls.id];
                    if (assign && assign.subjectId) {
                        if (!subjectOccurrences[assign.subjectId]) {
                            subjectOccurrences[assign.subjectId] = {
                                count: 0,
                                periods: [],
                                subjectName: assign.subject,
                                teacherId: assign.teacherId
                            };
                        }
                        subjectOccurrences[assign.subjectId].count++;
                        subjectOccurrences[assign.subjectId].periods.push(p);
                    }
                }

                // Identify duplicates exceeding quota/days limit
                for (const [subjId, data] of Object.entries(subjectOccurrences)) {
                    const quota = getDefaultQuotaForSubject(data.subjectName, cls.stage);
                    const maxAllowed = Math.ceil(quota / (safeDays.length || 5));

                    if (data.count > maxAllowed && data.count > 1) {
                        // Extra duplicate period to move (take the later period)
                        const periodToMove = data.periods[data.periods.length - 1];
                        const assignToMove = cloned[day]?.[periodToMove - 1]?.assignments?.[cls.id];
                        if (!assignToMove) continue;

                        const t1Id = assignToMove.teacherId;
                        const t1Constraint = safeConstraints[t1Id];

                        let resolved = false;

                        // Try finding an alternative day
                        for (const targetDay of safeDays) {
                            if (targetDay === day) continue;
                            const targetDayPeriods = getPeriodsForDay(targetDay, config);

                            // Count subject occurrences on targetDay
                            let countOnTargetDay = 0;
                            for (let tp = 1; tp <= targetDayPeriods; tp++) {
                                const a = cloned[targetDay]?.[tp - 1]?.assignments?.[cls.id];
                                if (a && a.subjectId === subjId) {
                                    countOnTargetDay++;
                                }
                            }
                            if (countOnTargetDay >= maxAllowed) continue;

                            // Try each period on targetDay
                            for (let tp = 1; tp <= targetDayPeriods; tp++) {
                                if (isTeacherUnavailableAt(t1Constraint, targetDay, tp)) continue;

                                // Check if t1 is busy on targetDay at tp with ANOTHER class
                                const t1BusyOnTargetDay = Object.entries(cloned[targetDay]?.[tp - 1]?.assignments || {}).some(
                                    ([otherCId, otherA]) => otherCId !== cls.id && otherA?.teacherId === t1Id
                                );
                                if (t1BusyOnTargetDay) continue;

                                const targetAssign = cloned[targetDay]?.[tp - 1]?.assignments?.[cls.id];

                                if (!targetAssign || !targetAssign.subjectId) {
                                    // Check single sports court constraint if moving sports to targetDay at tp
                                    if (config?.singleSportsCourt && isSportsSubject(assignToMove.subject)) {
                                        const sportsBusyOnTargetDay = Object.entries(cloned[targetDay]?.[tp - 1]?.assignments || {}).some(
                                            ([otherCId, otherA]) => otherCId !== cls.id && otherA && isSportsSubject(otherA.subject)
                                        );
                                        if (sportsBusyOnTargetDay) continue;
                                    }

                                    // Empty slot on targetDay: check teacher off-day and move
                                    cloned[targetDay][tp - 1].assignments[cls.id] = { ...assignToMove };
                                    delete cloned[day][periodToMove - 1].assignments[cls.id];
                                    swapsMade++;
                                    swappedInPass = true;
                                    resolved = true;
                                    break;
                                } else {
                                    // Target slot is occupied by targetAssign (subject s2, teacher t2)
                                    const t2Id = targetAssign.teacherId;
                                    const s2Id = targetAssign.subjectId;

                                    if (s2Id === subjId) continue;

                                    // Check sports court constraint for swapping
                                    if (config?.singleSportsCourt) {
                                        if (isSportsSubject(assignToMove.subject)) {
                                            const sportsBusyOnTargetDay = Object.entries(cloned[targetDay]?.[tp - 1]?.assignments || {}).some(
                                                ([otherCId, otherA]) => otherCId !== cls.id && otherA && isSportsSubject(otherA.subject)
                                            );
                                            if (sportsBusyOnTargetDay) continue;
                                        }
                                        if (isSportsSubject(targetAssign.subject)) {
                                            const sportsBusyOnDay = Object.entries(cloned[day]?.[periodToMove - 1]?.assignments || {}).some(
                                                ([otherCId, otherA]) => otherCId !== cls.id && otherA && isSportsSubject(otherA.subject)
                                            );
                                            if (sportsBusyOnDay) continue;
                                        }
                                    }

                                    const t2Constraint = safeConstraints[t2Id];
                                    if (isTeacherUnavailableAt(t2Constraint, day, periodToMove)) continue;

                                    // Check if t2 is busy on `day` at periodToMove with ANOTHER class
                                    const t2BusyOnDay = Object.entries(cloned[day]?.[periodToMove - 1]?.assignments || {}).some(
                                        ([otherCId, otherA]) => otherCId !== cls.id && otherA?.teacherId === t2Id
                                    );
                                    if (t2BusyOnDay) continue;

                                    // Check if moving s2 to `day` creates a duplicate of s2 on `day`
                                    let s2CountOnDay = 0;
                                    for (let p = 1; p <= dayPeriods; p++) {
                                        if (p === periodToMove) continue;
                                        const a = cloned[day]?.[p - 1]?.assignments?.[cls.id];
                                        if (a && a.subjectId === s2Id) s2CountOnDay++;
                                    }
                                    const s2Quota = getDefaultQuotaForSubject(targetAssign.subject, cls.stage);
                                    const s2MaxAllowed = Math.ceil(s2Quota / (safeDays.length || 5));
                                    if (s2CountOnDay >= s2MaxAllowed) continue;

                                    // Valid clean swap!
                                    cloned[day][periodToMove - 1].assignments[cls.id] = { ...targetAssign };
                                    cloned[targetDay][tp - 1].assignments[cls.id] = { ...assignToMove };
                                    swapsMade++;
                                    swappedInPass = true;
                                    resolved = true;
                                    break;
                                }
                            }
                            if (resolved) break;
                        }
                    }
                }
            }
        }

        if (!swappedInPass) break;
    }

    return { schedule: cloned, swapsMade };
}

/**
 * Calculates a penalty score for comparing candidate schedules in multi-attempt optimization.
 * Higher score = better schedule (fewer conflicts, more placed lessons).
 */
function evaluateScheduleScore(result: GenerationResult): number {
    let score = result.placedCount * 10000 - (result.totalRequiredCount - result.placedCount) * 50000;
    
    result.conflicts.forEach(c => {
        if (c.type === 'teacher_double_booking') {
            score -= 100000;
        } else if (c.type === 'teacher_off_day') {
            score -= 100000;
        } else if (c.type === 'sports_court_conflict') {
            score -= 90000;
        } else if (c.type === 'class_schedule_gap') {
            score -= 30000;
        } else if (c.type === 'duplicate_subject_same_day') {
            score -= 5000;
        } else {
            score -= 10000;
        }
    });

    return score;
}

/**
 * Multi-Attempt Intelligent Schedule Optimizer
 * Runs multiple stochastic simulation trials with perturbed seeds and swap optimization,
 * choosing the solution that achieves maximum coverage and the minimum number of conflicts.
 */
export function generateOptimizedWeeklySchedule(
    classes: ClassData[],
    teachers: User[],
    classQuotas: Record<string, Record<string, number>>,
    teacherConstraints: Record<string, TeacherConstraint>,
    config: GeneralScheduleConfig,
    attemptsCount = 20
): GenerationResult {
    const startTime = performance.now();
    const activeDays = (Array.isArray(config?.activeDays) && config.activeDays.length > 0) ? config.activeDays : DEFAULT_ACTIVE_DAYS;

    let bestResult: GenerationResult | null = null;
    let bestScore = -Infinity;
    let bestConflictsCount = Infinity;

    for (let i = 0; i < attemptsCount; i++) {
        const dayShift = i % (activeDays.length || 1);
        const result = generateWeeklyScheduleSinglePass(
            classes,
            teachers,
            classQuotas,
            teacherConstraints,
            config,
            i,
            dayShift
        );

        const score = evaluateScheduleScore(result);
        const conflictsCount = result.conflicts.length;

        if (
            !bestResult ||
            conflictsCount < bestConflictsCount ||
            (conflictsCount === bestConflictsCount && score > bestScore) ||
            (result.placedCount > bestResult.placedCount)
        ) {
            bestResult = result;
            bestScore = score;
            bestConflictsCount = conflictsCount;

            // Perfect schedule found (0 conflicts and 100% placed)
            if (conflictsCount === 0 && result.placedCount === result.totalRequiredCount) {
                break;
            }
        }
    }

    const finalResult = bestResult || generateWeeklyScheduleSinglePass(
        classes,
        teachers,
        classQuotas,
        teacherConstraints,
        config
    );

    const endTime = performance.now();
    finalResult.statistics.generationTimeMs = Math.round(endTime - startTime);

    return finalResult;
}

/**
 * Main Schedule Generator Engine
 */
export function generateWeeklySchedule(
    classes: ClassData[],
    teachers: User[],
    classQuotas: Record<string, Record<string, number>>,
    teacherConstraints: Record<string, TeacherConstraint>,
    config: GeneralScheduleConfig
): GenerationResult {
    // Run an optimized 5-pass search by default
    return generateOptimizedWeeklySchedule(
        classes,
        teachers,
        classQuotas,
        teacherConstraints,
        config,
        5
    );
}

/**
 * Scans any schedule (newly generated or manually edited) and flags all conflicts.
 */
export function findScheduleConflicts(
    schedule: MasterScheduleData,
    classes: ClassData[],
    teachers: User[],
    teacherConstraints: Record<string, TeacherConstraint>,
    activeDays: string[],
    periodsPerDayOrConfig?: number | GeneralScheduleConfig
): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const safeDays = (Array.isArray(activeDays) && activeDays.length > 0) ? activeDays : DEFAULT_ACTIVE_DAYS;
    const safeClasses = Array.isArray(classes) ? classes : [];
    const safeConstraints = teacherConstraints || {};
    const configObj: GeneralScheduleConfig | null = typeof periodsPerDayOrConfig === 'object' && periodsPerDayOrConfig !== null
        ? periodsPerDayOrConfig
        : null;
    const fallbackPeriods = typeof periodsPerDayOrConfig === 'number' && periodsPerDayOrConfig > 0
        ? periodsPerDayOrConfig
        : DEFAULT_PERIODS_PER_DAY;

    safeDays.forEach(day => {
        const dayPeriods = configObj ? getPeriodsForDay(day, configObj) : fallbackPeriods;
        const periods = (schedule && schedule[day]) || [];
        periods.forEach(pData => {
            const periodNumber = pData.period;
            if (periodNumber > dayPeriods) return;
            const teacherClassesInPeriod = new Map<string, { classId: string; subjectName: string; teacherName: string }[]>();

            Object.entries(pData.assignments || {}).forEach(([classId, assignment]) => {
                if (!assignment || !assignment.teacherId) return;

                // 1. Check Teacher Double Booking (Clash)
                const list = teacherClassesInPeriod.get(assignment.teacherId) || [];
                list.push({ classId, subjectName: assignment.subject, teacherName: assignment.teacher });
                teacherClassesInPeriod.set(assignment.teacherId, list);

                // 2. Check Teacher Off Days & Partial Unavailability
                const constraint = safeConstraints[assignment.teacherId];
                if (isTeacherUnavailableAt(constraint, day, periodNumber)) {
                    const isFullDay = Array.isArray(constraint?.offDays) && constraint.offDays.includes(day);
                    const cls = safeClasses.find(c => c.id === classId);
                    const clsName = cls ? `${cls.stage || ''} ${cls.section || ''}`.trim() : classId;
                    conflicts.push({
                        type: 'teacher_off_day',
                        teacherId: assignment.teacherId,
                        teacherName: assignment.teacher,
                        day,
                        period: periodNumber,
                        className: clsName,
                        subjectName: assignment.subject,
                        message: isFullDay
                            ? `تعارض إجازة: المدرس (${assignment.teacher}) لديه حصة (${assignment.subject}) لشعبة (${clsName}) في يوم (${DAYS_ARABIC[day] || day}) الحصة (${periodNumber}) وهو يوم تفرغ كامل محدد له.`
                            : `تعارض تفريغ جزئي: المدرس (${assignment.teacher}) لديه حصة (${assignment.subject}) لشعبة (${clsName}) في يوم (${DAYS_ARABIC[day] || day}) الحصة (${periodNumber}) وهو مفرغ جزئياً من هذه الحصة.`
                    });
                }
            });

            // Flag Double Bookings
            teacherClassesInPeriod.forEach((classList, teacherId) => {
                if (classList.length > 1) {
                    const classNames = classList.map(c => {
                        const cls = safeClasses.find(cl => cl.id === c.classId);
                        return cls ? `${cls.stage || ''} ${cls.section || ''}`.trim() : c.classId;
                    }).join(' و ');

                    conflicts.push({
                        type: 'teacher_double_booking',
                        teacherId,
                        teacherName: classList[0].teacherName,
                        day,
                        period: periodNumber,
                        message: `تضارب مدرّس: الأستاذ (${classList[0].teacherName}) مسند له التدريس في أكثر من شعبة بنفس الوقت (يوم ${DAYS_ARABIC[day] || day} - الحصة ${periodNumber}) للشعب: [${classNames}].`
                    });
                }
            });

            // 3. Check Single Sports Court constraint across the entire school (if enabled)
            if (configObj?.singleSportsCourt) {
                const sportsClassesInPeriod: { classId: string; subjectName: string; teacherName: string }[] = [];
                Object.entries(pData.assignments || {}).forEach(([classId, assignment]) => {
                    if (assignment && isSportsSubject(assignment.subject)) {
                        sportsClassesInPeriod.push({
                            classId,
                            subjectName: assignment.subject,
                            teacherName: assignment.teacher
                        });
                    }
                });

                if (sportsClassesInPeriod.length > 1) {
                    const classNames = sportsClassesInPeriod.map(c => {
                        const cls = safeClasses.find(cl => cl.id === c.classId);
                        return cls ? `${cls.stage || ''} ${cls.section || ''}`.trim() : c.classId;
                    }).join(' و ');

                    conflicts.push({
                        type: 'sports_court_conflict',
                        day,
                        period: periodNumber,
                        message: `تزامن في ساحة الرياضة: تم وضع (${sportsClassesInPeriod.length}) حصص رياضة في نفس التوقيت (يوم ${DAYS_ARABIC[day] || day} - الحصة ${periodNumber}) للشعب: [${classNames}]. قيد (ساحة رياضية واحدة) يمنع تزامن أكثر من درس رياضة واحد في نفس الحصة بالمدرسة.`
                    });
                }
            }
        });

        // 4. Check for Mid-Day Gaps in Class Schedule (No gaps allowed between lessons)
        safeClasses.forEach(cls => {
            let lastAssignedPeriod = 0;
            const assignedPeriods: number[] = [];
            const subjectCounts: Record<string, { count: number; subjectName: string }> = {};

            for (let p = 1; p <= dayPeriods; p++) {
                const assign = schedule[day]?.[p - 1]?.assignments?.[cls.id];
                if (assign && assign.subjectId) {
                    assignedPeriods.push(p);
                    lastAssignedPeriod = p;

                    if (!subjectCounts[assign.subjectId]) {
                        subjectCounts[assign.subjectId] = { count: 0, subjectName: assign.subject };
                    }
                    subjectCounts[assign.subjectId].count++;
                }
            }

            // Check duplicate subjects on the same day
            Object.entries(subjectCounts).forEach(([subjId, { count, subjectName }]) => {
                const quota = getDefaultQuotaForSubject(subjectName, cls.stage);
                const maxAllowed = Math.ceil(quota / (safeDays.length || 5));
                if (count > maxAllowed && count > 1) {
                    conflicts.push({
                        type: 'duplicate_subject_same_day',
                        classId: cls.id,
                        className: `${cls.stage || ''} ${cls.section || ''}`.trim(),
                        day,
                        subjectName,
                        message: `تكرار المادة في نفس اليوم: شعبة (${cls.stage} ${cls.section}) مسند لها درس (${subjectName}) عدد (${count}) مرات في يوم (${DAYS_ARABIC[day] || day}). يجب عدم تكرار الدرس لنفس الشعبة في اليوم الواحد إلا عند الضرورة القصوى.`
                    });
                }
            });

            if (lastAssignedPeriod > 1) {
                const missingPeriods: number[] = [];
                for (let p = 1; p < lastAssignedPeriod; p++) {
                    if (!assignedPeriods.includes(p)) {
                        missingPeriods.push(p);
                    }
                }

                if (missingPeriods.length > 0) {
                    const missingText = missingPeriods.map(p => `الحصة ${p}`).join(' و ');
                    conflicts.push({
                        type: 'class_schedule_gap',
                        classId: cls.id,
                        className: `${cls.stage || ''} ${cls.section || ''}`.trim(),
                        day,
                        message: `فراغ بين الدروس: شعبة (${cls.stage} ${cls.section}) لديها (${missingText}) فارغة في يوم (${DAYS_ARABIC[day] || day}) تسبق الحصة (${lastAssignedPeriod}). يجب أن تكون الحصص متتالية بدون فراغات.`
                    });
                }
            }
        });
    });

    return conflicts;
}

export interface MoveValidationResult {
    valid: boolean;
    reason?: string;
    warning?: string;
    isSwap?: boolean;
}

/**
 * Validates a proposed manual drag-and-drop move or swap of a lesson.
 * Prevents teacher double-booking, teacher off-days, and warns/prevents duplicate subjects.
 */
export function validateMoveOrSwap(
    schedule: MasterScheduleData,
    source: { day: string; period: number; classId: string },
    target: { day: string; period: number; classId: string },
    classes: ClassData[],
    teachers: User[],
    teacherConstraints: Record<string, TeacherConstraint>,
    activeDays: string[],
    periodsPerDayOrConfig?: number | GeneralScheduleConfig
): MoveValidationResult {
    const safeClasses = Array.isArray(classes) ? classes : [];
    const safeConstraints = teacherConstraints || {};
    const configObj: GeneralScheduleConfig | null = typeof periodsPerDayOrConfig === 'object' && periodsPerDayOrConfig !== null
        ? periodsPerDayOrConfig
        : null;
    const fallbackPeriods = typeof periodsPerDayOrConfig === 'number' && periodsPerDayOrConfig > 0
        ? periodsPerDayOrConfig
        : DEFAULT_PERIODS_PER_DAY;

    const targetDayPeriods = configObj ? getPeriodsForDay(target.day, configObj) : fallbackPeriods;
    if (target.period > targetDayPeriods) {
        return {
            valid: false,
            reason: `تعذر النقل: يوم (${DAYS_ARABIC[target.day] || target.day}) محدد بعدد (${targetDayPeriods}) حصص فقط، ولا يمكن وضع درس في الحصة (${target.period}).`
        };
    }

    const sourceAssign = schedule?.[source.day]?.[source.period - 1]?.assignments?.[source.classId];
    if (!sourceAssign || !sourceAssign.subjectId) {
        return { valid: false, reason: 'لا توجد حصة في الخانة المحددة لنقلها.' };
    }

    // If dropped on the exact same cell
    if (source.day === target.day && source.period === target.period && source.classId === target.classId) {
        return { valid: true };
    }

    const targetAssign = schedule?.[target.day]?.[target.period - 1]?.assignments?.[target.classId];
    const isSwap = Boolean(targetAssign && targetAssign.subjectId);

    const sourceCls = safeClasses.find(c => c.id === source.classId);
    const targetCls = safeClasses.find(c => c.id === target.classId);
    const sourceClsName = sourceCls ? `${sourceCls.stage || ''} ${sourceCls.section || ''}`.trim() : source.classId;
    const targetClsName = targetCls ? `${targetCls.stage || ''} ${targetCls.section || ''}`.trim() : target.classId;

    // 1. Check Source Teacher Off-Days and Partial Unavailability on Target Day/Period
    const srcTConstraint = safeConstraints[sourceAssign.teacherId];
    if (isTeacherUnavailableAt(srcTConstraint, target.day, target.period)) {
        const isFull = Array.isArray(srcTConstraint?.offDays) && srcTConstraint.offDays.includes(target.day);
        return {
            valid: false,
            reason: isFull
                ? `تعذر النقل: الأستاذ (${sourceAssign.teacher}) لديه يوم تفرغ كامل في (${DAYS_ARABIC[target.day] || target.day})، ولا يمكن إسناد أي درس له في هذا اليوم.`
                : `تعذر النقل: الأستاذ (${sourceAssign.teacher}) مفرغ جزئياً من الحصة (${target.period}) في يوم (${DAYS_ARABIC[target.day] || target.day}).`
        };
    }

    // 2. Check Source Teacher Clash with other classes at (target.day, target.period)
    const targetPeriodAssignments = schedule?.[target.day]?.[target.period - 1]?.assignments || {};
    for (const [otherClsId, otherAssign] of Object.entries(targetPeriodAssignments)) {
        // Skip comparing against the cell we are replacing/swapping
        if (otherClsId === target.classId) continue;
        // If moving within same class on same day/period, skip
        if (source.day === target.day && source.period === target.period && otherClsId === source.classId) continue;

        if (otherAssign && otherAssign.teacherId === sourceAssign.teacherId) {
            const conflictCls = safeClasses.find(c => c.id === otherClsId);
            const conflictClsName = conflictCls ? `${conflictCls.stage || ''} ${conflictCls.section || ''}`.trim() : otherClsId;
            return {
                valid: false,
                reason: `تعذر النقل: الأستاذ (${sourceAssign.teacher}) مرتبط بتدريس شعبة (${conflictClsName}) في نفس التوقيت (${DAYS_ARABIC[target.day] || target.day} - الحصة ${target.period}).`
            };
        }
    }

    // 3. If SWAP: Check Target Teacher Constraints
    if (isSwap && targetAssign) {
        // Check Target Teacher Off-Days and Partial Unavailability on Source Day/Period
        const tgtTConstraint = safeConstraints[targetAssign.teacherId];
        if (isTeacherUnavailableAt(tgtTConstraint, source.day, source.period)) {
            const isFull = Array.isArray(tgtTConstraint?.offDays) && tgtTConstraint.offDays.includes(source.day);
            return {
                valid: false,
                reason: isFull
                    ? `تعذر التبديل: الأستاذ (${targetAssign.teacher}) لديه يوم تفرغ كامل في (${DAYS_ARABIC[source.day] || source.day})، ولا يمكن نقله لهذا اليوم.`
                    : `تعذر التبديل: الأستاذ (${targetAssign.teacher}) مفرغ جزئياً من الحصة (${source.period}) في يوم (${DAYS_ARABIC[source.day] || source.day}).`
            };
        }

        // Check Target Teacher Clash with other classes at (source.day, source.period)
        const sourcePeriodAssignments = schedule?.[source.day]?.[source.period - 1]?.assignments || {};
        for (const [otherClsId, otherAssign] of Object.entries(sourcePeriodAssignments)) {
            if (otherClsId === source.classId) continue;
            if (source.day === target.day && source.period === target.period && otherClsId === target.classId) continue;

            if (otherAssign && otherAssign.teacherId === targetAssign.teacherId) {
                const conflictCls = safeClasses.find(c => c.id === otherClsId);
                const conflictClsName = conflictCls ? `${conflictCls.stage || ''} ${conflictCls.section || ''}`.trim() : otherClsId;
                return {
                    valid: false,
                    reason: `تعذر التبديل: الأستاذ (${targetAssign.teacher}) مرتبط بتدريس شعبة (${conflictClsName}) في نفس التوقيت (${DAYS_ARABIC[source.day] || source.day} - الحصة ${source.period}).`
                };
            }
        }
    }

    // 4. Check Subject Duplication for the Class on Target Day (Prevent same subject repeating on same day)
    if (source.day !== target.day && source.classId === target.classId) {
        let countOnTargetDay = 0;
        for (let p = 1; p <= targetDayPeriods; p++) {
            if (p === target.period) continue; // Will be overwritten or swapped
            const assign = schedule?.[target.day]?.[p - 1]?.assignments?.[target.classId];
            if (assign && assign.subjectId === sourceAssign.subjectId) {
                countOnTargetDay++;
            }
        }

        const quota = getDefaultQuotaForSubject(sourceAssign.subject, sourceCls?.stage);
        const maxAllowedPerDay = Math.ceil(quota / (activeDays.length || 5));

        if (countOnTargetDay >= maxAllowedPerDay && countOnTargetDay >= 1) {
            return {
                valid: false,
                reason: `تعذر النقل: شعبة (${sourceClsName}) لديها بالفعل درس (${sourceAssign.subject}) في يوم (${DAYS_ARABIC[target.day] || target.day}). يُمنع تكرار نفس الدرس في نفس اليوم إلا عند الضرورة القصوى.`
            };
        }
    }

    // 5. Check Single Sports Court Resource Constraint (if enabled)
    if (configObj?.singleSportsCourt) {
        // If moving sports to target slot, check if any other class already has sports at target
        if (isSportsSubject(sourceAssign.subject)) {
            const targetPeriodAssignments = schedule?.[target.day]?.[target.period - 1]?.assignments || {};
            for (const [otherClsId, otherAssign] of Object.entries(targetPeriodAssignments)) {
                if (otherClsId === target.classId || otherClsId === source.classId) continue;
                if (otherAssign && isSportsSubject(otherAssign.subject)) {
                    const conflictCls = safeClasses.find(c => c.id === otherClsId);
                    const conflictClsName = conflictCls ? `${conflictCls.stage || ''} ${conflictCls.section || ''}`.trim() : otherClsId;
                    return {
                        valid: false,
                        reason: `تعذر النقل: تم تفعيل قيد (ساحة رياضية واحدة)، وتوجد شعبة أخرى (${conflictClsName}) لديها درس رياضة في نفس التوقيت (${DAYS_ARABIC[target.day] || target.day} - الحصة ${target.period}).`
                    };
                }
            }
        }

        // If SWAP: targetAssign moves to source slot, check if any other class has sports at source
        if (isSwap && targetAssign && isSportsSubject(targetAssign.subject)) {
            const sourcePeriodAssignments = schedule?.[source.day]?.[source.period - 1]?.assignments || {};
            for (const [otherClsId, otherAssign] of Object.entries(sourcePeriodAssignments)) {
                if (otherClsId === source.classId || otherClsId === target.classId) continue;
                if (otherAssign && isSportsSubject(otherAssign.subject)) {
                    const conflictCls = safeClasses.find(c => c.id === otherClsId);
                    const conflictClsName = conflictCls ? `${conflictCls.stage || ''} ${conflictCls.section || ''}`.trim() : otherClsId;
                    return {
                        valid: false,
                        reason: `تعذر التبديل: تم تفعيل قيد (ساحة رياضية واحدة)، وتوجد شعبة أخرى (${conflictClsName}) لديها درس رياضة في نفس التوقيت (${DAYS_ARABIC[source.day] || source.day} - الحصة ${source.period}).`
                    };
                }
            }
        }
    }

    return { valid: true, isSwap };
}

/**
 * Multi-pass Compaction Algorithm:
 * Ensures NO class has an empty period in the middle of their school day.
 * If a class has N lessons on a day, they MUST occupy periods 1, 2, ..., N.
 * Any empty periods must strictly be at the end of the day (periods N+1, ..., periodsPerDay).
 */
export function compactScheduleGaps(
    schedule: MasterScheduleData,
    classes: ClassData[],
    teachers: User[],
    teacherConstraints: Record<string, TeacherConstraint>,
    activeDays: string[],
    periodsPerDayOrConfig?: number | GeneralScheduleConfig
): { schedule: MasterScheduleData; compactedMovesCount: number } {
    let compactedMovesCount = 0;
    const safeDays = (Array.isArray(activeDays) && activeDays.length > 0) ? activeDays : DEFAULT_ACTIVE_DAYS;
    const safeClasses = Array.isArray(classes) ? classes : [];
    const safeConstraints = teacherConstraints || {};
    const configObj: GeneralScheduleConfig | null = typeof periodsPerDayOrConfig === 'object' && periodsPerDayOrConfig !== null
        ? periodsPerDayOrConfig
        : null;
    const fallbackPeriods = typeof periodsPerDayOrConfig === 'number' && periodsPerDayOrConfig > 0
        ? periodsPerDayOrConfig
        : DEFAULT_PERIODS_PER_DAY;

    // Deep clone schedule to avoid direct mutation side effects
    const clonedSchedule: MasterScheduleData = {};
    safeDays.forEach(day => {
        const dayPeriods = configObj ? getPeriodsForDay(day, configObj) : fallbackPeriods;
        clonedSchedule[day] = Array.from({ length: dayPeriods }, (_, pIndex) => {
            const existingPeriod = schedule?.[day]?.[pIndex];
            return {
                period: pIndex + 1,
                assignments: existingPeriod ? { ...existingPeriod.assignments } : {}
            };
        });
    });

    // Run up to 10 iterative compaction passes
    for (let pass = 0; pass < 10; pass++) {
        let movedInThisPass = false;

        for (const day of safeDays) {
            const dayPeriods = configObj ? getPeriodsForDay(day, configObj) : fallbackPeriods;
            for (const cls of safeClasses) {
                // Find all assigned periods for this class on this day
                const assignedMap: Record<number, ScheduleCellAssignment> = {};
                let maxPeriodWithLesson = 0;

                for (let p = 1; p <= dayPeriods; p++) {
                    const assign = clonedSchedule[day]?.[p - 1]?.assignments?.[cls.id];
                    if (assign && assign.subjectId) {
                        assignedMap[p] = assign;
                        maxPeriodWithLesson = p;
                    }
                }

                if (maxPeriodWithLesson <= 1) continue;

                // Look for gaps: an empty period before maxPeriodWithLesson
                for (let emptyP = 1; emptyP < maxPeriodWithLesson; emptyP++) {
                    if (!assignedMap[emptyP]) {
                        // Found a gap at emptyP!
                        // Try to find a lesson from later periods (emptyP + 1 .. maxPeriodWithLesson)
                        // whose teacher is free at emptyP
                        let resolvedGap = false;
                        for (let laterP = emptyP + 1; laterP <= maxPeriodWithLesson; laterP++) {
                            const candidate = assignedMap[laterP];
                            if (!candidate) continue;

                            const teacherId = candidate.teacherId;
                            const tConstraint = safeConstraints[teacherId];

                            // Check teacher off-day and partial unavailability at emptyP
                            if (isTeacherUnavailableAt(tConstraint, day, emptyP)) continue;

                            // Check if teacher is busy teaching another class at emptyP on this day
                            const teacherBusyAtEmptyP = Object.entries(clonedSchedule[day]?.[emptyP - 1]?.assignments || {}).some(
                                ([otherClassId, otherAssign]) => otherClassId !== cls.id && otherAssign?.teacherId === teacherId
                            );

                            if (teacherBusyAtEmptyP) continue;

                            // Check sports court constraint if candidate is sports
                            if (configObj?.singleSportsCourt && isSportsSubject(candidate.subject)) {
                                const sportsBusyAtEmptyP = Object.entries(clonedSchedule[day]?.[emptyP - 1]?.assignments || {}).some(
                                    ([otherClassId, otherAssign]) => otherClassId !== cls.id && otherAssign && isSportsSubject(otherAssign.subject)
                                );
                                if (sportsBusyAtEmptyP) continue;
                            }

                            // We can safely shift candidate to emptyP!
                            clonedSchedule[day][emptyP - 1].assignments[cls.id] = { ...candidate };
                            delete clonedSchedule[day][laterP - 1].assignments[cls.id];
                            assignedMap[emptyP] = candidate;
                            delete assignedMap[laterP];
                            compactedMovesCount++;
                            movedInThisPass = true;
                            resolvedGap = true;
                            break;
                        }

                        if (resolvedGap) {
                            // Re-evaluate maxPeriodWithLesson
                            maxPeriodWithLesson = 0;
                            for (let p = 1; p <= dayPeriods; p++) {
                                if (assignedMap[p]) maxPeriodWithLesson = p;
                            }
                        }
                    }
                }
            }
        }

        if (!movedInThisPass) break;
    }

    return { schedule: clonedSchedule, compactedMovesCount };
}

/**
 * Targeted Auto-Repair & Intelligent Rebalance Engine:
 * Takes the current schedule and attempts to place all deficit/unassigned lessons
 * by combining direct slot placement, augmenting chain swaps, and multi-seed annealing.
 */
export function autoRepairSchedule(
    currentSchedule: MasterScheduleData,
    classes: ClassData[],
    teachers: User[],
    classQuotas: Record<string, Record<string, number>>,
    teacherConstraints: Record<string, TeacherConstraint>,
    config: GeneralScheduleConfig
): {
    schedule: MasterScheduleData;
    success: boolean;
    placedCount: number;
    resolvedCount: number;
    remainingUnassigned: {
        classId: string;
        className: string;
        subjectName: string;
        teacherName: string;
        count: number;
    }[];
    conflicts: ScheduleConflict[];
} {
    const safeDays = (Array.isArray(config?.activeDays) && config.activeDays.length > 0) ? config.activeDays : DEFAULT_ACTIVE_DAYS;
    const safeClasses = Array.isArray(classes) ? classes : [];
    const safeTeachers = Array.isArray(teachers) ? teachers : [];
    const safeConstraints = teacherConstraints || {};

    // 1. Deep clone current schedule
    let cloned: MasterScheduleData = {};
    safeDays.forEach(day => {
        const dayPeriods = getPeriodsForDay(day, config);
        cloned[day] = Array.from({ length: dayPeriods }, (_, pIdx) => {
            const existing = currentSchedule?.[day]?.[pIdx];
            return {
                period: pIdx + 1,
                assignments: existing ? { ...existing.assignments } : {}
            };
        });
    });

    // 2. Identify missing / unassigned items from current schedule
    interface MissingTask {
        classId: string;
        stage: string;
        section: string;
        subjectId: string;
        subjectName: string;
        teacherId: string;
        teacherName: string;
    }

    const missingTasks: MissingTask[] = [];

    safeClasses.forEach(cls => {
        const clsQuotas = classQuotas[cls.id] || {};
        cls.subjects.forEach(subj => {
            const required = clsQuotas[subj.id] !== undefined
                ? clsQuotas[subj.id]
                : getDefaultQuotaForSubject(subj.name, cls.stage);

            if (required <= 0) return;

            let placed = 0;
            safeDays.forEach(day => {
                const dayPeriods = getPeriodsForDay(day, config);
                const pList = cloned[day] || [];
                for (let p = 0; p < Math.min(pList.length, dayPeriods); p++) {
                    const a = pList[p]?.assignments?.[cls.id];
                    if (a && (a.subjectId === subj.id || (!a.subjectId && a.subject === subj.name))) {
                        placed++;
                    }
                }
            });

            const deficit = required - placed;
            if (deficit > 0) {
                const assignedTeacher = safeTeachers.find(t => 
                    t && t.role === 'teacher' && 
                    Array.isArray(t.assignments) && 
                    t.assignments.some(a => a && a.classId === cls.id && a.subjectId === subj.id)
                );
                const teacherId = assignedTeacher ? assignedTeacher.id : '';
                const teacherName = assignedTeacher ? assignedTeacher.name : 'غير محدد';

                for (let k = 0; k < deficit; k++) {
                    missingTasks.push({
                        classId: cls.id,
                        stage: cls.stage,
                        section: cls.section,
                        subjectId: subj.id,
                        subjectName: subj.name,
                        teacherId,
                        teacherName
                    });
                }
            }
        });
    });

    const initialMissingCount = missingTasks.length;
    let resolvedCount = 0;

    if (initialMissingCount === 0) {
        const confs = findScheduleConflicts(cloned, safeClasses, safeTeachers, safeConstraints, safeDays, config);
        return {
            schedule: cloned,
            success: true,
            placedCount: 0,
            resolvedCount: 0,
            remainingUnassigned: [],
            conflicts: confs
        };
    }

    // 3. Step 1: Direct placement in empty slots
    const unplacedAfterDirect: MissingTask[] = [];

    for (const task of missingTasks) {
        let placed = false;
        const tConstraint = safeConstraints[task.teacherId];

        for (const day of safeDays) {
            const dayPeriods = getPeriodsForDay(day, config);

            // Check if class already has this subject on `day` (avoid repetition if possible)
            let classHasSubjectToday = false;
            for (let p = 1; p <= dayPeriods; p++) {
                const a = cloned[day]?.[p - 1]?.assignments?.[task.classId];
                if (a && a.subjectId === task.subjectId) {
                    classHasSubjectToday = true;
                    break;
                }
            }

            for (let p = 1; p <= dayPeriods; p++) {
                if (isTeacherUnavailableAt(tConstraint, day, p)) continue;

                const classAssign = cloned[day]?.[p - 1]?.assignments?.[task.classId];
                if (classAssign && classAssign.subjectId) continue; // slot occupied

                // Check teacher busy
                const teacherBusy = Object.entries(cloned[day]?.[p - 1]?.assignments || {}).some(
                    ([cId, a]) => cId !== task.classId && a?.teacherId === task.teacherId
                );
                if (teacherBusy) continue;

                // Check single sports court constraint
                if (config?.singleSportsCourt && isSportsSubject(task.subjectName)) {
                    const sportsBusy = Object.entries(cloned[day]?.[p - 1]?.assignments || {}).some(
                        ([cId, a]) => cId !== task.classId && a && isSportsSubject(a.subject)
                    );
                    if (sportsBusy) continue;
                }

                // Found a valid direct slot!
                if (!cloned[day][p - 1].assignments) cloned[day][p - 1].assignments = {};
                cloned[day][p - 1].assignments[task.classId] = {
                    subject: task.subjectName,
                    teacher: task.teacherName,
                    subjectId: task.subjectId,
                    teacherId: task.teacherId,
                    classId: task.classId,
                    stage: task.stage,
                    section: task.section
                };

                placed = true;
                resolvedCount++;
                break;
            }
            if (placed) break;
        }

        if (!placed) {
            unplacedAfterDirect.push(task);
        }
    }

    // 4. Step 2: Intelligent 2-way / 3-way Slot Swapping for remaining unplaced tasks
    const unplacedAfterSwaps: MissingTask[] = [];

    for (const task of unplacedAfterDirect) {
        let placed = false;
        const t1Id = task.teacherId;
        const t1Constraint = safeConstraints[t1Id];

        // Try swapping with another lesson in the same class on another day
        for (const day1 of safeDays) {
            const day1Periods = getPeriodsForDay(day1, config);

            for (let p1 = 1; p1 <= day1Periods; p1++) {
                if (isTeacherUnavailableAt(t1Constraint, day1, p1)) continue;

                // Check if t1 is free at (day1, p1)
                const t1BusyAtP1 = Object.entries(cloned[day1]?.[p1 - 1]?.assignments || {}).some(
                    ([cId, a]) => cId !== task.classId && a?.teacherId === t1Id
                );
                if (t1BusyAtP1) continue;

                // Check sports court constraint for task at (day1, p1)
                if (config?.singleSportsCourt && isSportsSubject(task.subjectName)) {
                    const sportsBusyAtP1 = Object.entries(cloned[day1]?.[p1 - 1]?.assignments || {}).some(
                        ([cId, a]) => cId !== task.classId && a && isSportsSubject(a.subject)
                    );
                    if (sportsBusyAtP1) continue;
                }

                // What is in task.classId at (day1, p1)?
                const currentAssignAtP1 = cloned[day1]?.[p1 - 1]?.assignments?.[task.classId];
                if (!currentAssignAtP1 || !currentAssignAtP1.subjectId) {
                    // Empty! Place directly
                    cloned[day1][p1 - 1].assignments[task.classId] = {
                        subject: task.subjectName,
                        teacher: task.teacherName,
                        subjectId: task.subjectId,
                        teacherId: task.teacherId,
                        classId: task.classId,
                        stage: task.stage,
                        section: task.section
                    };
                    placed = true;
                    resolvedCount++;
                    break;
                } else {
                    // There is another lesson (S2, T2) in this slot.
                    // Can we move (S2, T2) to another free slot (day2, p2) for task.classId?
                    const t2Id = currentAssignAtP1.teacherId;
                    const t2Constraint = safeConstraints[t2Id];

                    let swapFound = false;
                    for (const day2 of safeDays) {
                        if (day2 === day1) continue;
                        const day2Periods = getPeriodsForDay(day2, config);

                        for (let p2 = 1; p2 <= day2Periods; p2++) {
                            if (isTeacherUnavailableAt(t2Constraint, day2, p2)) continue;

                            const assignAtP2 = cloned[day2]?.[p2 - 1]?.assignments?.[task.classId];
                            if (assignAtP2 && assignAtP2.subjectId) continue; // occupied

                            const t2BusyAtP2 = Object.entries(cloned[day2]?.[p2 - 1]?.assignments || {}).some(
                                ([cId, a]) => cId !== task.classId && a?.teacherId === t2Id
                            );
                            if (t2BusyAtP2) continue;

                            // Check sports court constraint for moving currentAssignAtP1 to (day2, p2)
                            if (config?.singleSportsCourt && isSportsSubject(currentAssignAtP1.subject)) {
                                const sportsBusyAtP2 = Object.entries(cloned[day2]?.[p2 - 1]?.assignments || {}).some(
                                    ([cId, a]) => cId !== task.classId && a && isSportsSubject(a.subject)
                                );
                                if (sportsBusyAtP2) continue;
                            }

                            // We can move (S2, T2) to (day2, p2) and place task at (day1, p1)!
                            cloned[day2][p2 - 1].assignments[task.classId] = { ...currentAssignAtP1 };
                            cloned[day1][p1 - 1].assignments[task.classId] = {
                                subject: task.subjectName,
                                teacher: task.teacherName,
                                subjectId: task.subjectId,
                                teacherId: task.teacherId,
                                classId: task.classId,
                                stage: task.stage,
                                section: task.section
                            };
                            swapFound = true;
                            placed = true;
                            resolvedCount++;
                            break;
                        }
                        if (swapFound) break;
                    }
                    if (swapFound) break;
                }
            }
            if (placed) break;
        }

        if (!placed) {
            unplacedAfterSwaps.push(task);
        }
    }

    // 5. Step 3: If still unplaced and initial schedule had major gaps, run high-intensity 50-pass optimizer as fallback
    if (unplacedAfterSwaps.length > 0) {
        const fullOptimized = generateOptimizedWeeklySchedule(
            safeClasses,
            safeTeachers,
            classQuotas,
            safeConstraints,
            config,
            60
        );

        if (fullOptimized.unassignedItems.length < unplacedAfterSwaps.length) {
            cloned = fullOptimized.schedule;
            resolvedCount = initialMissingCount - fullOptimized.unassignedItems.reduce((acc, it) => acc + it.count, 0);
        }
    }

    // 6. Compact Gaps and Resolve Duplicate Subject Swaps
    const { schedule: compacted } = compactScheduleGaps(cloned, safeClasses, safeTeachers, safeConstraints, safeDays, config);
    const { schedule: duplicateOptimized } = resolveSubjectDuplicateSwaps(compacted, safeClasses, safeTeachers, safeConstraints, safeDays, config);

    // 7. Calculate remaining unassigned items
    const remainingMap = new Map<string, { classId: string; className: string; subjectName: string; teacherName: string; count: number }>();

    safeClasses.forEach(cls => {
        const clsQuotas = classQuotas[cls.id] || {};
        cls.subjects.forEach(subj => {
            const req = clsQuotas[subj.id] !== undefined
                ? clsQuotas[subj.id]
                : getDefaultQuotaForSubject(subj.name, cls.stage);

            if (req <= 0) return;

            let placedCount = 0;
            safeDays.forEach(day => {
                const dayPeriods = getPeriodsForDay(day, config);
                const pList = duplicateOptimized[day] || [];
                for (let p = 0; p < Math.min(pList.length, dayPeriods); p++) {
                    const a = pList[p]?.assignments?.[cls.id];
                    if (a && (a.subjectId === subj.id || (!a.subjectId && a.subject === subj.name))) {
                        placedCount++;
                    }
                }
            });

            const rem = req - placedCount;
            if (rem > 0) {
                const assignedTeacher = safeTeachers.find(t => 
                    t && t.role === 'teacher' && 
                    Array.isArray(t.assignments) && 
                    t.assignments.some(a => a && a.classId === cls.id && a.subjectId === subj.id)
                );
                const teacherId = assignedTeacher ? assignedTeacher.id : '';
                const teacherName = assignedTeacher ? assignedTeacher.name : 'غير محدد';
                const key = `${cls.id}_${subj.id}_${teacherId}`;
                remainingMap.set(key, {
                    classId: cls.id,
                    className: `${cls.stage} (${cls.section})`.trim(),
                    subjectName: subj.name,
                    teacherName,
                    count: rem
                });
            }
        });
    });

    const finalConflicts = findScheduleConflicts(duplicateOptimized, safeClasses, safeTeachers, safeConstraints, safeDays, config);
    const remainingUnassigned = Array.from(remainingMap.values());

    return {
        schedule: duplicateOptimized,
        success: remainingUnassigned.length === 0,
        placedCount: initialMissingCount - remainingUnassigned.reduce((s, it) => s + it.count, 0),
        resolvedCount: Math.max(0, resolvedCount),
        remainingUnassigned,
        conflicts: finalConflicts
    };
}
