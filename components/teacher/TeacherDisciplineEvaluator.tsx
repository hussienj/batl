import React, { useState, useEffect, useMemo } from 'react';
import type { Teacher, ClassData, Student, DisciplineCriterion, DisciplineRecord, DisciplineSettings, SchoolSettings, DisciplineArchiveLog } from '../../types.ts';
import { db } from '../../lib/firebase.ts';
import { DEFAULT_DISCIPLINE_CRITERIA, DEFAULT_DISCIPLINE_MAX_POINTS } from '../../constants.ts';
import { 
    ShieldAlert, AlertTriangle, CheckCircle2, Search, UserCheck, 
    Clock, BookOpen, Send, FileText, ChevronLeft, Sparkles, Filter, 
    Info, Eye, Flame, ShieldX, User as UserIcon, RotateCcw, FileDown, 
    Calendar, Check, X, ShieldCheck, HelpCircle, Loader2, HardDrive, Zap, Database
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import DisciplineReportModal from '../discipline/DisciplineReportModal.tsx';
import { exportDisciplineWordDocument } from '../discipline/DisciplineWordExporter.ts';
import { 
    loadLocalPhotos, saveBulkPhotosLocally, getCachedPhotoSync, 
    populateMemoryCache, getLocalPhotoStats 
} from '../../lib/photoStorage.ts';

interface TeacherDisciplineEvaluatorProps {
    teacher: Teacher;
    classes: ClassData[];
    settings: SchoolSettings;
}

type EvaluatorTab = 'evaluate' | 'archive' | 'summary_reports';

export default function TeacherDisciplineEvaluator({ teacher, classes, settings }: TeacherDisciplineEvaluatorProps) {
    const principalId = teacher.principalId || 'principal_al_hamza';

    // Classes assigned to this teacher exclusively
    const assignedClasses = useMemo(() => {
        const assignments = teacher.assignments || [];
        const classIds = new Set(assignments.map(a => a.classId));
        if (teacher.advisorClassId) classIds.add(teacher.advisorClassId);
        
        return classes.filter(c => classIds.has(c.id));
    }, [classes, teacher.assignments, teacher.advisorClassId]);

    const [selectedClassId, setSelectedClassId] = useState<string>(assignedClasses[0]?.id || '');
    const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
    const [activeTab, setActiveTab] = useState<EvaluatorTab>('evaluate');

    // Discipline Settings & Criteria (Cached for instant 0ms load)
    const [disciplineSettings, setDisciplineSettings] = useState<DisciplineSettings>(() => {
        try {
            const cached = localStorage.getItem(`cached_discipline_settings_${principalId}`);
            if (cached) return JSON.parse(cached);
        } catch {}
        return {
            maxPoints: DEFAULT_DISCIPLINE_MAX_POINTS,
            criteria: DEFAULT_DISCIPLINE_CRITERIA
        };
    });

    // All discipline records for this principal (Cached for instant load)
    const [allRecords, setAllRecords] = useState<Record<string, DisciplineRecord[]>>(() => {
        try {
            const cached = localStorage.getItem(`cached_discipline_records_${principalId}`);
            if (cached) return JSON.parse(cached);
        } catch {}
        return {};
    });

    const [archiveLogs, setArchiveLogs] = useState<DisciplineArchiveLog[]>(() => {
        try {
            const cached = localStorage.getItem(`cached_discipline_archives_${principalId}`);
            if (cached) return JSON.parse(cached);
        } catch {}
        return [];
    });

    const [studentPhotos, setStudentPhotos] = useState<Record<string, string>>(() => {
        try {
            const cached = localStorage.getItem(`cached_discipline_photos_${principalId}`);
            if (cached) return JSON.parse(cached);
        } catch {}
        return {};
    });

    const [localPhotoCount, setLocalPhotoCount] = useState<number>(() => {
        return getLocalPhotoStats(principalId).count;
    });
    const [isSyncingPhotos, setIsSyncingPhotos] = useState(false);
    const [notificationToast, setNotificationToast] = useState<{
        type: 'success' | 'warning' | 'error' | 'info';
        message: string;
    } | null>(null);

    // Auto-dismiss notification toast
    useEffect(() => {
        if (!notificationToast) return;
        const timer = setTimeout(() => {
            setNotificationToast(null);
        }, 4500);
        return () => clearTimeout(timer);
    }, [notificationToast]);

    const [isLoading, setIsLoading] = useState(false);
    const [syncState, setSyncState] = useState<'cached' | 'syncing' | 'synced'>('cached');
    const [showCacheInfo, setShowCacheInfo] = useState(false);

    // Active Selection State for Logging & Daily Tracking
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [selectedCriterionId, setSelectedCriterionId] = useState<string>('');
    const [customNotes, setCustomNotes] = useState<string>('');
    const [violationDate, setViolationDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchStudent, setSearchStudent] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'today' | 'zero' | 'deducted' | 'clean'>('all');

    // Report & Preview Modal States
    const [reportStudent, setReportStudent] = useState<Student | null>(null);
    const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
    const [isExportingWord, setIsExportingWord] = useState(false);

    // Sync student photos from Firebase to local IndexedDB (non-blocking)
    const syncPhotosFromFirebase = async (isManual = false) => {
        if (isSyncingPhotos || !principalId) return;
        setIsSyncingPhotos(true);
        try {
            const photosMap: Record<string, string> = {};

            const subSnap = await db.ref(`student_submissions/${principalId}`).once('value');
            const subData = subSnap.val() || {};
            Object.keys(subData).forEach(k => {
                const sub = subData[k];
                const photo = sub?.studentPhoto || sub?.formData?.studentPhoto;
                if (photo) {
                    if (sub.studentId) photosMap[sub.studentId] = photo;
                    if (sub.studentName) photosMap[sub.studentName.trim()] = photo;
                    if (sub.examId) photosMap[sub.examId] = photo;
                    photosMap[k] = photo;
                }
            });

            const savedSnap = await db.ref(`student_saved_forms/${principalId}`).once('value');
            const savedData = savedSnap.val() || {};
            Object.keys(savedData).forEach(k => {
                const form = savedData[k];
                const photo = form?.studentPhoto || form?.formData?.studentPhoto;
                if (photo) {
                    if (form.studentId) photosMap[form.studentId] = photo;
                    if (form.studentName) photosMap[form.studentName.trim()] = photo;
                    photosMap[k] = photo;
                }
            });

            if (Object.keys(photosMap).length > 0) {
                const savedCount = await saveBulkPhotosLocally(principalId, photosMap);
                setStudentPhotos(prev => ({ ...prev, ...photosMap }));
                populateMemoryCache(photosMap);
                setLocalPhotoCount(savedCount);
                if (isManual) {
                    setNotificationToast({
                        type: 'success',
                        message: `✅ تم حفظ وتخزين (${savedCount}) صورة طالب في الذاكرة المحلية للجهاز بنجاح.`
                    });
                }
            } else if (isManual) {
                setNotificationToast({
                    type: 'info',
                    message: 'لم يتم العثور على صور جديدة مسجلة بالاستمارات.'
                });
            }
        } catch (err) {
            console.error('Error syncing student photos:', err);
            if (isManual) {
                setNotificationToast({
                    type: 'error',
                    message: 'تعذر الاتصال لتحميل الصور، تم استخدام الصور المحفوظة محلياً.'
                });
            }
        } finally {
            setIsSyncingPhotos(false);
        }
    };

    // Load student photos from local IndexedDB on mount (instant 0ms)
    useEffect(() => {
        if (!principalId) return;
        let isMounted = true;

        loadLocalPhotos(principalId).then(localMap => {
            if (!isMounted) return;
            if (localMap && Object.keys(localMap).length > 0) {
                setStudentPhotos(prev => ({ ...prev, ...localMap }));
                populateMemoryCache(localMap);
                setLocalPhotoCount(Object.keys(localMap).length);
            } else {
                // If no photos exist in IndexedDB yet, initiate a silent background sync
                syncPhotosFromFirebase(false);
            }
        });

        return () => {
            isMounted = false;
        };
    }, [principalId]);

    // Load Discipline Settings from Firebase
    useEffect(() => {
        if (!principalId) return;
        const settingsRef = db.ref(`discipline_settings/${principalId}`);
        const cb = (snapshot: any) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const updated: DisciplineSettings = {
                    maxPoints: data.maxPoints || DEFAULT_DISCIPLINE_MAX_POINTS,
                    criteria: Array.isArray(data.criteria) && data.criteria.length > 0 ? data.criteria : DEFAULT_DISCIPLINE_CRITERIA
                };
                setDisciplineSettings(updated);
                try {
                    localStorage.setItem(`cached_discipline_settings_${principalId}`, JSON.stringify(updated));
                } catch {}
            } else {
                setDisciplineSettings({
                    maxPoints: DEFAULT_DISCIPLINE_MAX_POINTS,
                    criteria: DEFAULT_DISCIPLINE_CRITERIA
                });
            }
        };
        settingsRef.on('value', cb);
        return () => settingsRef.off('value', cb);
    }, [principalId]);

    // Load Discipline Records & Archives in Realtime with local storage persistence
    useEffect(() => {
        if (!principalId) return;
        setSyncState('syncing');

        const recordsRef = db.ref(`discipline_records/${principalId}`);
        const recordsCb = (snapshot: any) => {
            const data = snapshot.val() || {};
            const recordsByStudent: Record<string, DisciplineRecord[]> = {};
            Object.keys(data).forEach(studentId => {
                const list = Object.values(data[studentId] || {}) as DisciplineRecord[];
                list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                recordsByStudent[studentId] = list;
            });
            setAllRecords(recordsByStudent);
            setSyncState('synced');
            setIsLoading(false);
            try {
                localStorage.setItem(`cached_discipline_records_${principalId}`, JSON.stringify(recordsByStudent));
            } catch {}
        };
        recordsRef.on('value', recordsCb);

        const archivesRef = db.ref(`discipline_archives/${principalId}`);
        const archivesCb = (snapshot: any) => {
            const data = snapshot.val() || {};
            const allArchives: DisciplineArchiveLog[] = [];
            Object.keys(data).forEach(studentId => {
                const logs = Object.values(data[studentId] || {}) as DisciplineArchiveLog[];
                allArchives.push(...logs);
            });
            allArchives.sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());
            setArchiveLogs(allArchives);
            try {
                localStorage.setItem(`cached_discipline_archives_${principalId}`, JSON.stringify(allArchives));
            } catch {}
        };
        archivesRef.on('value', archivesCb);

        return () => {
            recordsRef.off('value', recordsCb);
            archivesRef.off('value', archivesCb);
        };
    }, [principalId]);

    // Ensure selectedClassId is valid
    useEffect(() => {
        if (assignedClasses.length > 0 && !assignedClasses.some(c => c.id === selectedClassId)) {
            setSelectedClassId(assignedClasses[0].id);
        }
    }, [assignedClasses, selectedClassId]);

    // Currently selected class
    const currentClass = useMemo(() => {
        if (assignedClasses.length === 0) return null;
        return assignedClasses.find(c => c.id === selectedClassId) || assignedClasses[0] || null;
    }, [selectedClassId, assignedClasses]);

    // Subjects taught by teacher in this class
    const availableSubjects = useMemo(() => {
        if (!currentClass) return [];
        const assignments = (teacher.assignments || []).filter(a => a.classId === currentClass.id);
        const subjectIds = new Set(assignments.map(a => a.subjectId));
        const classSubjects = currentClass.subjects || [];
        const matched = classSubjects.filter(s => subjectIds.has(s.id));
        return matched.length > 0 ? matched : classSubjects;
    }, [currentClass, teacher.assignments]);

    // Ensure selectedSubjectId is set
    useEffect(() => {
        if (availableSubjects.length > 0 && (!selectedSubjectId || !availableSubjects.some(s => s.id === selectedSubjectId))) {
            setSelectedSubjectId(availableSubjects[0].id);
        }
    }, [availableSubjects, selectedSubjectId]);

    // Helper: calculate student points
    const maxPoints = disciplineSettings.maxPoints || DEFAULT_DISCIPLINE_MAX_POINTS;

    const getStudentDisciplineData = (studentId: string) => {
        const records = allRecords[studentId] || [];
        const active = records.filter(r => r.status !== 'archived');
        const totalDeductions = active.reduce((sum, r) => sum + r.pointsDeducted, 0);
        const currentPoints = Math.max(0, maxPoints - totalDeductions);
        return {
            records,
            activeRecords: active,
            totalDeductions,
            currentPoints,
            isZero: currentPoints === 0
        };
    };

    // Helper to get student photo
    const getStudentPhoto = (student: Student): string | null => {
        if (!student) return null;
        if (student.photoUrl && typeof student.photoUrl === 'string' && !student.photoUrl.includes('GckSf3v')) return student.photoUrl;
        if (student.id && studentPhotos[student.id]) return studentPhotos[student.id];
        if (student.name && studentPhotos[student.name.trim()]) return studentPhotos[student.name.trim()];
        if (student.examId && studentPhotos[String(student.examId)]) return studentPhotos[String(student.examId)];

        // Instant synchronous lookup from IndexedDB memory cache (0ms)
        const fromMem = (student.id ? getCachedPhotoSync(student.id) : null) || 
                        (student.name ? getCachedPhotoSync(student.name.trim()) : null) || 
                        (student.examId ? getCachedPhotoSync(String(student.examId)) : null);
        if (fromMem) return fromMem;

        return null;
    };

    // Filter students
    const todayDateStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    const filteredStudents = useMemo(() => {
        if (!currentClass?.students) return [];
        return currentClass.students.filter(s => {
            if (!s) return false;
            const searchLower = searchStudent.toLowerCase().trim();
            const matchesSearch = !searchLower || 
                (s.name && s.name.toLowerCase().includes(searchLower)) ||
                (s.examId && String(s.examId).toLowerCase().includes(searchLower)) ||
                (s.studentAccessCode && String(s.studentAccessCode).toLowerCase().includes(searchLower));

            if (!matchesSearch) return false;

            const { currentPoints, totalDeductions, activeRecords } = getStudentDisciplineData(s.id);

            if (statusFilter === 'today') {
                return activeRecords.some(r => {
                    const rDate = r.violationDate || (r.timestamp ? r.timestamp.split('T')[0] : '');
                    return rDate === todayDateStr;
                });
            }
            if (statusFilter === 'zero') return currentPoints === 0;
            if (statusFilter === 'deducted') return totalDeductions > 0;
            if (statusFilter === 'clean') return totalDeductions === 0;

            return true;
        });
    }, [currentClass, searchStudent, statusFilter, allRecords, maxPoints, todayDateStr]);

    // Active Criteria
    const activeCriteria = useMemo(() => {
        return (disciplineSettings.criteria || DEFAULT_DISCIPLINE_CRITERIA).filter(c => c.isActive !== false);
    }, [disciplineSettings.criteria]);

    // Handle Submit Violation / Deduction - Instant Local Update + Parallel Background Sync
    const handleLogViolation = async () => {
        if (!selectedStudent || !currentClass) {
            setNotificationToast({
                type: 'warning',
                message: 'يرجى تحديد الطالب والتأكد من اختيار الشعبة الدراسية.'
            });
            return;
        }

        const criterion = activeCriteria.find(c => c.id === selectedCriterionId);
        if (!criterion && !customNotes.trim()) {
            setNotificationToast({
                type: 'warning',
                message: 'يرجى اختيار سبب المخالفة أو كتابة ملاحظة توضيحية.'
            });
            return;
        }

        const currentSubject = availableSubjects.find(s => s.id === selectedSubjectId);
        const criterionTitle = criterion ? criterion.title : 'ملاحظة سلوكية خاصة';
        const pointsDeducted = criterion ? (criterion.deductionPoints || 1) : 1;
        const targetDate = violationDate || new Date().toISOString().split('T')[0];
        const notesToSave = customNotes.trim();

        const newRecord: DisciplineRecord = {
            id: uuidv4(),
            principalId,
            studentId: selectedStudent.id,
            studentName: selectedStudent.name,
            studentCode: selectedStudent.examId || selectedStudent.studentAccessCode,
            classId: currentClass.id,
            stage: currentClass.stage,
            section: currentClass.section,
            subjectId: currentSubject?.id || '',
            subjectName: currentSubject?.name || 'عام',
            teacherId: teacher.id,
            teacherName: teacher.name,
            teacherRole: 'مدرس المادة',
            criterionId: criterion?.id || 'custom',
            criterionTitle,
            pointsDeducted,
            notes: notesToSave,
            violationDate: targetDate,
            timestamp: new Date().toISOString(),
            status: 'active'
        };

        // 1. OPTIMISTIC UPDATE: Update UI state immediately in 0 milliseconds!
        setAllRecords(prev => {
            const currentList = prev[selectedStudent.id] || [];
            const updatedList = [newRecord, ...currentList];
            const updatedAll = { ...prev, [selectedStudent.id]: updatedList };
            try {
                localStorage.setItem(`cached_discipline_records_${principalId}`, JSON.stringify(updatedAll));
            } catch {}
            return updatedAll;
        });

        // 2. Clear inputs immediately so user can continue without delay
        setCustomNotes('');
        setSelectedCriterionId('');

        // 3. Show instant animated confirmation toast
        setNotificationToast({
            type: 'success',
            message: `⚡ تم رصد المخالفة وتحديث الخصم فورياً (-${pointsDeducted} نقطة) للطالب (${selectedStudent.name}).`
        });

        // 4. Calculate if 0 points reached
        const studentActive = (allRecords[selectedStudent.id] || []).filter(r => r.status !== 'archived');
        const prevTotalDeductions = studentActive.reduce((sum, r) => sum + r.pointsDeducted, 0);
        const newTotalDeducted = prevTotalDeductions + pointsDeducted;
        const newPoints = Math.max(0, maxPoints - newTotalDeducted);

        setIsSubmitting(true);

        try {
            // 5. Parallel background sync to Firebase without sequential waiting
            const syncPromises = [
                // Save to Firebase discipline records
                db.ref(`discipline_records/${principalId}/${selectedStudent.id}/${newRecord.id}`).set(newRecord),

                // Backward compatibility save
                db.ref(`behavior_deductions/${principalId}/${selectedStudent.id}/${newRecord.id}`).set({
                    id: newRecord.id,
                    principalId,
                    studentId: selectedStudent.id,
                    classId: currentClass.id,
                    pointsDeducted,
                    reason: `${criterionTitle}${notesToSave ? ' - ' + notesToSave : ''} (${currentSubject?.name || 'عام'} - ${teacher.name})`,
                    timestamp: newRecord.timestamp
                }),

                // Send in-app notification to student
                db.ref(`student_notifications/${principalId}/${selectedStudent.id}`).push({
                    studentId: selectedStudent.id,
                    message: `تنبيه انضباط وسلوك: تم خصم (${pointsDeducted}) نقطة من رصيد سلوكك في مادة (${currentSubject?.name || 'عام'}) بواسطة الأستاذ (${teacher.name}) بسبب: ${criterionTitle}`,
                    timestamp: new Date().toISOString(),
                    isRead: false
                })
            ];

            if (newPoints === 0) {
                // Trigger alert record for assistant
                syncPromises.push(
                    db.ref(`discipline_zero_alerts/${principalId}/${selectedStudent.id}`).set({
                        studentId: selectedStudent.id,
                        studentName: selectedStudent.name,
                        classId: currentClass.id,
                        stage: currentClass.stage,
                        section: currentClass.section,
                        triggeredAt: new Date().toISOString(),
                        lastTeacher: teacher.name,
                        lastSubject: currentSubject?.name || 'عام'
                    })
                );
            }

            await Promise.all(syncPromises);
        } catch (error) {
            console.error('Failed to sync discipline record to cloud:', error);
            setNotificationToast({
                type: 'warning',
                message: 'تم حفظ المخالفة محلياً، وهناك بطء في مزامنة السحابة. سيتم تأكيدها تلقائياً.'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Class Archive notices (for students in the teacher's assigned classes only)
    const assignedClassIds = useMemo(() => new Set(assignedClasses.map(c => c.id)), [assignedClasses]);

    const teacherClassArchives = useMemo(() => {
        return archiveLogs.filter(a => assignedClassIds.has(a.classId));
    }, [archiveLogs, assignedClassIds]);

    const handleSingleExportWord = async (student: Student) => {
        setIsExportingWord(true);
        try {
            const sRecords = allRecords[student.id] || [];
            const active = sRecords.filter(r => r.status !== 'archived');
            const totalDeductions = active.reduce((sum, r) => sum + r.pointsDeducted, 0);
            const currentPoints = Math.max(0, maxPoints - totalDeductions);

            await exportDisciplineWordDocument({
                student,
                classData: currentClass,
                settings,
                records: sRecords,
                maxPoints,
                currentPoints
            });
        } catch (e) {
            console.error('Word export failed:', e);
            alert('حدث خطأ أثناء تصدير مستند Word.');
        } finally {
            setIsExportingWord(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
            {/* Header Banner */}
            <div className="bg-gradient-to-l from-slate-900 via-indigo-950 to-slate-900 text-white p-6 sm:p-7 rounded-3xl shadow-xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-5">
                <div className="flex items-center gap-4 text-center sm:text-right">
                    <div className="p-3.5 bg-red-500/20 text-red-400 rounded-2xl border border-red-500/30">
                        <ShieldAlert className="w-9 h-9" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl sm:text-2xl font-black">نظام انضباط وتقييم سلوك الطلاب</h1>
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                                خاص بشعب المدرس
                            </span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                            رصد المخالفات وفق معايير معاونية شؤون الطلبة، متابعة سجل مخالفات باقي المدرسين، والاطلاع على أرشيف الفرص والتقارير الرسمية.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-center bg-black/40 px-5 py-3 rounded-2xl border border-white/10">
                        <div className="text-xs text-slate-300 font-bold">رصيد البداية</div>
                        <div className="text-2xl font-black text-amber-300">{maxPoints} نقاط</div>
                    </div>
                </div>
            </div>

            {/* Nav Tabs Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
                    <button
                        type="button"
                        onClick={() => setActiveTab('evaluate')}
                        className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                            activeTab === 'evaluate'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        <ShieldAlert size={16} />
                        <span>تأشير ومتابعة السلوك</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('archive')}
                        className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                            activeTab === 'archive'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        <RotateCcw size={16} />
                        <span>أرشيف الفرص وتصفير المخالفات ({teacherClassArchives.length})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('summary_reports')}
                        className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                            activeTab === 'summary_reports'
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'text-slate-700 hover:bg-slate-200'
                        }`}
                    >
                        <FileText size={16} />
                        <span>كشف تقارير الشعبة</span>
                    </button>
                </div>

                {/* Class & Subject Selector */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                        assignedClasses.length === 0
                            ? 'bg-slate-100 border-slate-300 opacity-75 cursor-not-allowed'
                            : 'bg-white border-slate-200 shadow-2xs'
                    }`}>
                        <span className="text-xs font-bold text-slate-500">الشعبة:</span>
                        <select
                            value={selectedClassId}
                            disabled={assignedClasses.length === 0}
                            onChange={e => {
                                setSelectedClassId(e.target.value);
                                setSelectedStudent(null);
                            }}
                            className="bg-transparent font-bold text-xs sm:text-sm text-indigo-950 focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                            {assignedClasses.length > 0 ? (
                                assignedClasses.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.stage} - الشعبة ({c.section})
                                    </option>
                                ))
                            ) : (
                                <option value="">لم يتم إسناد شعب لك بعد</option>
                            )}
                        </select>
                    </div>

                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                        assignedClasses.length === 0 || availableSubjects.length === 0
                            ? 'bg-slate-100 border-slate-300 opacity-75 cursor-not-allowed'
                            : 'bg-white border-slate-200 shadow-2xs'
                    }`}>
                        <span className="text-xs font-bold text-slate-500">المادة:</span>
                        <select
                            value={selectedSubjectId}
                            disabled={assignedClasses.length === 0 || availableSubjects.length === 0}
                            onChange={e => setSelectedSubjectId(e.target.value)}
                            className="bg-transparent font-bold text-xs sm:text-sm text-indigo-950 focus:outline-none cursor-pointer disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                            {availableSubjects.length > 0 ? (
                                availableSubjects.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))
                            ) : (
                                <option value="">لا توجد مواد مسندة</option>
                            )}
                        </select>
                    </div>
                </div>
            </div>

            {/* Realtime / Local Cache Sync Banner */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-50 via-slate-50 to-emerald-50 rounded-2xl border border-indigo-100/80 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="font-bold text-slate-800 flex items-center gap-1">
                        <Zap size={13} className="text-amber-500" />
                        <span>تحميل وقيد فوري للبيانات (0 ثانية)</span>
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="font-semibold text-indigo-900 bg-indigo-100/70 border border-indigo-200 px-2 py-0.5 rounded-lg flex items-center gap-1">
                        <HardDrive size={12} className="text-indigo-600" />
                        <span>الصور محفوظة محلياً: {localPhotoCount} صورة</span>
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => syncPhotosFromFirebase(true)}
                        disabled={isSyncingPhotos}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                        title="تحديث وتخزين صور الطلاب في الذاكرة المحلية للجهاز"
                    >
                        {isSyncingPhotos ? (
                            <>
                                <Loader2 size={12} className="animate-spin text-indigo-600" />
                                <span>جاري حفظ الصور...</span>
                            </>
                        ) : (
                            <>
                                <Database size={12} className="text-indigo-600" />
                                <span>تحديث صور الطلاب محلياً</span>
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowCacheInfo(!showCacheInfo)}
                        className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer transition-colors p-1"
                    >
                        <Info size={14} />
                        <span>تفاصيل التخزين</span>
                    </button>
                </div>
            </div>

            {showCacheInfo && (
                <div className="p-3.5 bg-indigo-950 text-white rounded-2xl text-xs space-y-2 shadow-md animate-in fade-in duration-200">
                    <div className="flex items-center justify-between font-bold">
                        <span className="flex items-center gap-1.5 text-indigo-300">
                            <Sparkles size={14} />
                            نظام التخزين المحلي الفوري وسرعة الرصد:
                        </span>
                        <button type="button" onClick={() => setShowCacheInfo(false)} className="text-slate-400 hover:text-white cursor-pointer">
                            <X size={14} />
                        </button>
                    </div>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                        • <strong>تخزين الصور محلياً (IndexedDB):</strong> يتم الاحتفاظ بصور جميع الطلاب في الذاكرة المحلية لجهازك مباشرة حتى تعمل فوراً دون الحاجة لتنزيلها من السحابة في كل مرة.
                    </p>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                        • <strong>الرصد الفوري (0 ثانية):</strong> عند النقر على "تأكيد رصد المخالفة وتحديث الخصم التراكمي"، يتم تحديث رصيد الطالب فورياً أمامك في أجزاء من الثانية دون انتظار تنزيل الصور أو إبطاء المتصفح، وتجري المزامنة السحابية في الخلفية بالتوازي.
                    </p>
                </div>
            )}

            {/* If no classes are assigned */}
            {assignedClasses.length === 0 ? (
                <div className="bg-white p-8 sm:p-12 rounded-3xl border-2 border-amber-200 text-center space-y-4 shadow-sm bg-gradient-to-b from-amber-50/50 to-white">
                    <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner border border-amber-200">
                        <AlertTriangle className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5">
                        <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
                            لم يتم إسناد أي شعبة لتدريسك بعد
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                            عزيزي المدرس، لم تسند إليك إدارة المدرسة أي صفوف أو مواد دراسية حتى الآن. تم تعطيل أزرار وقوائم اختيار الشعب لحين قيام الإدارة بتوزيع الحصص والشعب عليك.
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100/90 text-amber-900 text-xs font-bold rounded-xl border border-amber-300">
                        <ShieldAlert size={16} className="text-amber-700" />
                        <span>يرجى التواصل مع إدارة المدرسة لإسناد المواد والشعب المخصصة لك للبدء بالتقييم ورصد السلوك.</span>
                    </div>
                </div>
            ) : (
                <>
                    {/* TAB 1: Evaluation & Violation Tracking */}
                    {activeTab === 'evaluate' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Students Column (6 cols) */}
                    <div className="lg:col-span-6 space-y-3">
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                    <UserCheck className="text-indigo-600 w-4 h-4" />
                                    طلاب الشعبة ({currentClass?.students?.length || 0})
                                </h3>
                                <span className="text-xs text-slate-400 font-semibold">
                                    تأشير يومي وخصم تراكمي
                                </span>
                            </div>

                            {/* Search Bar */}
                            <div className="relative">
                                <Search className="absolute right-3 top-3 text-slate-400 w-4 h-4" />
                                <input
                                    type="text"
                                    value={searchStudent}
                                    onChange={e => setSearchStudent(e.target.value)}
                                    placeholder="ابحث باسم الطالب أو الرقم الامتحاني..."
                                    className="w-full pl-3 pr-9 py-2 border rounded-xl text-xs sm:text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            {/* Status Filter Chips */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('all')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        statusFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                    }`}
                                >
                                    الكل ({currentClass?.students?.length || 0})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('today')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                        statusFilter === 'today' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                    }`}
                                >
                                    <Calendar size={12} />
                                    <span>مخالفات اليوم</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('zero')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                        statusFilter === 'zero' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
                                    }`}
                                >
                                    <Flame size={12} />
                                    <span>مستنفدون (0)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('deducted')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        statusFilter === 'deducted' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                                    }`}
                                >
                                    عليهم مخالفات
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStatusFilter('clean')}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        statusFilter === 'clean' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                    }`}
                                >
                                    سجل نظيف (10)
                                </button>
                            </div>
                        </div>

                        {/* Students Scrollable List */}
                        <div className="max-h-[64vh] overflow-y-auto space-y-2.5 pr-0.5">
                            {filteredStudents.length > 0 ? (
                                filteredStudents.map((student, idx) => {
                                    const { currentPoints, totalDeductions, isZero, activeRecords } = getStudentDisciplineData(student.id);
                                    const isSelected = selectedStudent?.id === student.id;
                                    const photo = getStudentPhoto(student);
                                    const hasTodayInfraction = activeRecords.some(r => {
                                        const rDate = r.violationDate || (r.timestamp ? r.timestamp.split('T')[0] : '');
                                        return rDate === todayDateStr;
                                    });

                                    return (
                                        <div
                                            key={student.id}
                                            onClick={() => setSelectedStudent(student)}
                                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                                isSelected
                                                    ? 'bg-indigo-600 text-white shadow-md border-indigo-600'
                                                    : isZero
                                                    ? 'bg-red-50 border-red-300 text-slate-900 hover:bg-red-100/70 shadow-2xs'
                                                    : 'bg-white border-slate-200 text-slate-800 hover:border-indigo-300 hover:shadow-2xs'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                {/* Student Photo / Avatar */}
                                                <div 
                                                    onClick={(e) => {
                                                        if (photo) {
                                                            e.stopPropagation();
                                                            setPreviewPhotoUrl(photo);
                                                        }
                                                    }}
                                                    className={`w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 border ${
                                                        isSelected ? 'border-white/40' : 'border-slate-200'
                                                    } bg-slate-100 flex items-center justify-center relative group`}
                                                >
                                                    {photo ? (
                                                        <img 
                                                            src={photo} 
                                                            alt={student.name} 
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                                        />
                                                    ) : (
                                                        <UserIcon className={`w-5 h-5 ${isSelected ? 'text-white/60' : 'text-slate-400'}`} />
                                                    )}
                                                </div>

                                                <div>
                                                    <h4 className="font-bold text-sm leading-tight flex items-center gap-2">
                                                        <span>{student.name}</span>
                                                        {hasTodayInfraction && (
                                                            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-md font-bold">
                                                                سُجل اليوم
                                                            </span>
                                                        )}
                                                        {isZero && (
                                                            <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                                                                استنفد النقاط (0)
                                                            </span>
                                                        )}
                                                    </h4>
                                                    <div className={`flex items-center gap-2 text-xs mt-1 ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                                                        <span>الرقم: {student.examId || student.studentAccessCode || '—'}</span>
                                                        <span>•</span>
                                                        <span>{activeRecords.length} مخالفة نشطة ({totalDeductions} نقاط)</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {/* Score Badge */}
                                                <div className={`px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1 ${
                                                    isSelected
                                                        ? 'bg-white text-indigo-900 shadow-2xs'
                                                        : isZero
                                                        ? 'bg-red-600 text-white shadow-2xs animate-pulse'
                                                        : currentPoints >= 7
                                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                                                }`}>
                                                    <span>{currentPoints}</span>
                                                    <span className="text-[10px] font-normal">/ {maxPoints}</span>
                                                </div>

                                                {/* Open Official Report Modal */}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setReportStudent(student);
                                                    }}
                                                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                                                        isSelected
                                                            ? 'bg-white/20 hover:bg-white/30 text-white'
                                                            : 'bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600'
                                                    }`}
                                                    title="عرض التقرير الرسمي الشامل وتصدير PDF / Word"
                                                >
                                                    <Eye size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6">
                                    <p className="text-slate-500 text-sm">لا يوجد طلاب مطابقين لمعايير البحث الحالية.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action & Student Details Column (6 cols) */}
                    <div className="lg:col-span-6 space-y-4">
                        {selectedStudent ? (
                            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                                {/* Student Profile Header */}
                                <div className="flex items-center justify-between border-b pb-3 gap-3">
                                    <div className="flex items-center gap-3">
                                        <div 
                                            onClick={() => {
                                                const p = getStudentPhoto(selectedStudent);
                                                if (p) setPreviewPhotoUrl(p);
                                            }}
                                            className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 border-2 border-indigo-200 flex-shrink-0 cursor-pointer relative group"
                                        >
                                            {getStudentPhoto(selectedStudent) ? (
                                                <img 
                                                    src={getStudentPhoto(selectedStudent)!} 
                                                    alt={selectedStudent.name} 
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                                />
                                            ) : (
                                                <UserIcon className="w-7 h-7 text-slate-400 m-auto mt-3" />
                                            )}
                                        </div>
                                        <div>
                                            <span className="text-[11px] font-bold text-indigo-600 block">الطالب المحدد:</span>
                                            <h3 className="font-black text-slate-900 text-base">{selectedStudent.name}</h3>
                                            <p className="text-xs text-slate-500">
                                                {currentClass ? `${currentClass.stage} - الشعبة (${currentClass.section})` : '—'} • الرقم الامتحاني: {selectedStudent.examId || '—'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="text-left flex flex-col items-end">
                                        {(() => {
                                            const { currentPoints, isZero } = getStudentDisciplineData(selectedStudent.id);
                                            return (
                                                <span className={`px-3 py-1.5 rounded-xl text-xs font-black ${
                                                    isZero ? 'bg-red-600 text-white animate-pulse' : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                                                }`}>
                                                    الرصيد: {currentPoints} / {maxPoints}
                                                </span>
                                            );
                                        })()}

                                        <button
                                            type="button"
                                            onClick={() => setReportStudent(selectedStudent)}
                                            className="mt-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                                        >
                                            <FileText size={12} />
                                            <span>التقرير الرسمي</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Form: Log New Daily Violation */}
                                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                                            <Calendar size={15} className="text-indigo-600" />
                                            <span>تاريخ المخالفة اليومية:</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setViolationDate(new Date().toISOString().split('T')[0])}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                                    violationDate === new Date().toISOString().split('T')[0]
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-white text-slate-700 border border-slate-200'
                                                }`}
                                            >
                                                اليوم
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const d = new Date();
                                                    d.setDate(d.getDate() - 1);
                                                    setViolationDate(d.toISOString().split('T')[0]);
                                                }}
                                                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                                    (() => {
                                                        const d = new Date();
                                                        d.setDate(d.getDate() - 1);
                                                        return violationDate === d.toISOString().split('T')[0];
                                                    })()
                                                        ? 'bg-indigo-600 text-white'
                                                        : 'bg-white text-slate-700 border border-slate-200'
                                                }`}
                                            >
                                                أمس
                                            </button>
                                            <input
                                                type="date"
                                                value={violationDate}
                                                onChange={e => setViolationDate(e.target.value)}
                                                className="p-1 border rounded-lg text-xs bg-white text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-bold text-slate-800">
                                            حدد معيار المخالفة المرصودة (خصم تراكمي):
                                        </label>
                                        <span className="text-[11px] text-slate-500 font-medium">
                                            المادة: <b className="text-indigo-700">{availableSubjects.find(s => s.id === selectedSubjectId)?.name || 'عام'}</b>
                                        </span>
                                    </div>

                                    {/* Criteria Selection List */}
                                    <div className="max-h-48 overflow-y-auto space-y-1.5 border rounded-xl p-2 bg-white">
                                        {activeCriteria.map(crit => {
                                            const isChosen = selectedCriterionId === crit.id;
                                            return (
                                                <button
                                                    key={crit.id}
                                                    type="button"
                                                    onClick={() => setSelectedCriterionId(crit.id)}
                                                    className={`w-full text-right p-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                                                        isChosen
                                                            ? 'bg-red-600 text-white shadow-2xs'
                                                            : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200'
                                                    }`}
                                                >
                                                    <span>{crit.title}</span>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                                                        isChosen ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'
                                                    }`}>
                                                        -{crit.deductionPoints || 1} نقطة
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Custom Notes */}
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                            ملاحظات تفصيلية أو سبب مخصص:
                                        </label>
                                        <textarea
                                            value={customNotes}
                                            onChange={e => setCustomNotes(e.target.value)}
                                            rows={2}
                                            placeholder="اكتب تفاصيل إضافية عن الواقعة أو الموقف..."
                                            className="w-full p-2.5 border rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    {/* Inline Instant Toast Notification */}
                                    {notificationToast && (
                                        <div className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 shadow-xs transition-all animate-in fade-in slide-in-from-top-1 ${
                                            notificationToast.type === 'success'
                                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                                                : notificationToast.type === 'error'
                                                ? 'bg-rose-50 text-rose-800 border border-rose-300'
                                                : notificationToast.type === 'warning'
                                                ? 'bg-amber-50 text-amber-800 border border-amber-300'
                                                : 'bg-indigo-50 text-indigo-800 border border-indigo-300'
                                        }`}>
                                            <div className="flex items-center gap-2">
                                                {notificationToast.type === 'success' && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}
                                                {notificationToast.type === 'error' && <AlertTriangle size={16} className="text-rose-600 shrink-0" />}
                                                {notificationToast.type === 'warning' && <AlertTriangle size={16} className="text-amber-600 shrink-0" />}
                                                {notificationToast.type === 'info' && <Info size={16} className="text-indigo-600 shrink-0" />}
                                                <span className="leading-snug">{notificationToast.message}</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setNotificationToast(null)}
                                                className="p-1 text-slate-400 hover:text-slate-700 rounded-md shrink-0 cursor-pointer"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    )}

                                    {/* Submit Violation Button */}
                                    <button
                                        type="button"
                                        onClick={handleLogViolation}
                                        disabled={isSubmitting || (!selectedCriterionId && !customNotes.trim())}
                                        className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-yellow-300 border-2 border-red-700 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed font-black text-sm sm:text-base"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin text-yellow-300" />
                                                <span className="text-yellow-300 font-black">جاري تأكيد المزامنة...</span>
                                            </>
                                        ) : (
                                            <>
                                                <ShieldAlert size={18} className="text-yellow-300 shrink-0" />
                                                <span className="text-yellow-300 font-black">تأكيد رصد المخالفة وتحديث الخصم التراكمي</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Cumulative History Breakdown from ALL teachers */}
                                <div className="space-y-2 border-t pt-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                            <Clock size={14} className="text-indigo-600" />
                                            <span>سجل مخالفات الطالب التراكمية من كافة المدرسين:</span>
                                        </h4>
                                        <span className="text-[11px] text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg font-bold">
                                            إجمالي الخصم التراكمي: -{getStudentDisciplineData(selectedStudent.id).totalDeductions} نقاط
                                        </span>
                                    </div>

                                    <div className="max-h-56 overflow-y-auto space-y-2 pr-0.5">
                                        {(allRecords[selectedStudent.id] || []).length > 0 ? (
                                            (allRecords[selectedStudent.id] || []).map((rec, i) => {
                                                const vDate = rec.violationDate || (rec.timestamp ? rec.timestamp.split('T')[0] : '');
                                                // Count how many times this criterion was repeated across active records
                                                const repeatCount = (allRecords[selectedStudent.id] || []).filter(
                                                    r => r.status !== 'archived' && r.criterionTitle === rec.criterionTitle
                                                ).length;

                                                return (
                                                    <div 
                                                        key={rec.id || i}
                                                        className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                                                            rec.status === 'archived' 
                                                                ? 'bg-slate-50 border-slate-200 opacity-60' 
                                                                : 'bg-red-50/60 border-red-200'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between font-bold">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-red-800">
                                                                    {rec.criterionTitle} (-{rec.pointsDeducted} نقطة)
                                                                </span>
                                                                {repeatCount > 1 && rec.status !== 'archived' && (
                                                                    <span className="bg-rose-200 text-rose-900 text-[10px] px-1.5 py-0.2 rounded font-black">
                                                                        تكرر {repeatCount} مرات
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                                                                <Calendar size={11} className="text-indigo-600" />
                                                                <span>{vDate || new Date(rec.timestamp).toLocaleDateString('ar-EG')}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 text-[11px] text-slate-600 font-medium">
                                                            <span>المادة: <b>{rec.subjectName || 'عام'}</b></span>
                                                            <span>•</span>
                                                            <span>المدرس: <b>{rec.teacherName}</b></span>
                                                            {rec.status === 'archived' && (
                                                                <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-bold mr-auto">
                                                                    (مؤرشفة - تصفير سلوك)
                                                                </span>
                                                            )}
                                                        </div>

                                                        {rec.notes && (
                                                            <p className="text-[11px] text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200 mt-1">
                                                                ملاحظة: {rec.notes}
                                                            </p>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed text-xs text-slate-500">
                                                لا توجد أي مخالفات مسجلة على هذا الطالب من أي مدرس.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white p-10 rounded-2xl shadow-sm border border-slate-200 text-center space-y-3">
                                <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                                    <UserCheck size={28} />
                                </div>
                                <h3 className="font-bold text-slate-800 text-base">اختر طالباً من القائمة للبدء</h3>
                                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                                    بمجرد النقر على اسم الطالب، ستظهر صورته وسجل المخالفات المسجلة له من باقي المدرسين، مع إمكانية تأشير مخالفة يومية وخصم النقاط تراكمياً.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: Archives of Granted Chances & Resets */}
            {activeTab === 'archive' && (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-5">
                    <div className="flex items-center justify-between border-b pb-4">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-amber-500" />
                                <span>أرشيف الفرص الجديدة وتصفير المخالفات السلوكية (لشعب المدرس)</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                                قائمة الطلاب في الشعب المخصصة لك والذين حصلوا على فرصة ثانية وتصفير لمخالفاتهم السابقة بقرار من إدارة المدرسة
                            </p>
                        </div>
                        <span className="text-xs bg-amber-100 text-amber-900 px-3 py-1 rounded-full font-bold">
                            {teacherClassArchives.length} عملية تصفير
                        </span>
                    </div>

                    {teacherClassArchives.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {teacherClassArchives.map(log => {
                                const photo = studentPhotos[log.studentId] || studentPhotos[log.studentName.trim()];
                                return (
                                    <div key={log.id} className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-amber-200 flex-shrink-0 flex items-center justify-center">
                                                    {photo ? (
                                                        <img src={photo} alt={log.studentName} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <UserIcon className="w-5 h-5 text-amber-600" />
                                                    )}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-sm text-slate-900">{log.studentName}</h4>
                                                    <span className="text-xs text-slate-500 font-mono">
                                                        {new Date(log.archivedAt).toLocaleDateString('ar-EG')}
                                                    </span>
                                                </div>
                                            </div>

                                            <span className="bg-emerald-100 text-emerald-800 text-xs font-black px-2.5 py-1 rounded-xl border border-emerald-300">
                                                تم منحه ({log.grantedPoints}) نقاط
                                            </span>
                                        </div>

                                        <div className="bg-white p-3 rounded-xl border border-amber-200 text-xs text-slate-700 space-y-1">
                                            <p><b>سبب تصفير السلوك:</b> {log.reason}</p>
                                            <p className="text-[11px] text-slate-400">
                                                المسؤول المنفذ: {log.archivedByName} (تمت أرشفة {log.previousTotalDeductions} نقاط سابقة)
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                            <h4 className="font-bold text-slate-800 text-sm">لا توجد أي سجلات تصفير سابقة في شعبك</h4>
                            <p className="text-xs text-slate-500 mt-1">تظهر هنا أية فرصة جديدة يتم منحها للطلاب بعد استدعاء أولياء الأمور.</p>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: Summary & Official Reports for Current Class */}
            {activeTab === 'summary_reports' && (
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-indigo-600" />
                                <span>كشف الانضباط الشامل وتقارير الشعبة: {currentClass ? `${currentClass.stage} - (${currentClass.section})` : '—'}</span>
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">
                                معاينة وطباعة تقارير الانضباط الفردية وتصديرها بصيغة Word أو PDF
                            </p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs">
                            <thead className="bg-slate-100 text-slate-700 font-bold border-b">
                                <tr>
                                    <th className="p-3">#</th>
                                    <th className="p-3">صورة الطالب</th>
                                    <th className="p-3">اسم الطالب</th>
                                    <th className="p-3">الرقم الامتحاني</th>
                                    <th className="p-3">رصيد الانضباط</th>
                                    <th className="p-3">المخالفات النشطة</th>
                                    <th className="p-3 text-center">إجراءات التقرير الرسمي</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {currentClass?.students?.map((s, idx) => {
                                    const { currentPoints, totalDeductions, isZero } = getStudentDisciplineData(s.id);
                                    const photo = getStudentPhoto(s);

                                    return (
                                        <tr key={s.id} className={`hover:bg-slate-50/80 transition ${isZero ? 'bg-red-50/70' : ''}`}>
                                            <td className="p-3 font-bold text-slate-500">{idx + 1}</td>
                                            <td className="p-3">
                                                <div 
                                                    onClick={() => photo && setPreviewPhotoUrl(photo)}
                                                    className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center cursor-pointer"
                                                >
                                                    {photo ? (
                                                        <img src={photo} alt={s.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <UserIcon className="w-4 h-4 text-slate-400" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 font-bold text-slate-900">
                                                <div className="flex items-center gap-2">
                                                    <span>{s.name}</span>
                                                    {isZero && (
                                                        <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                                                            استنفد النقاط
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 font-mono text-indigo-700">{s.examId || '—'}</td>
                                            <td className="p-3">
                                                <span className={`px-2.5 py-1 rounded-lg font-black text-xs ${
                                                    isZero
                                                        ? 'bg-red-600 text-white animate-pulse'
                                                        : currentPoints >= 7
                                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                                                }`}>
                                                    {currentPoints} / {maxPoints}
                                                </span>
                                            </td>
                                            <td className="p-3 font-bold text-red-600">{totalDeductions} مخالفات</td>
                                            <td className="p-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setReportStudent(s)}
                                                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                                                    >
                                                        <Eye size={14} />
                                                        <span>معاينة وتصدير التقرير (PDF)</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleSingleExportWord(s)}
                                                        disabled={isExportingWord}
                                                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition shadow-2xs disabled:opacity-50"
                                                    >
                                                        <FileDown size={14} />
                                                        <span>تحميل Word</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            </>
            )}

            {/* Photo Preview Modal */}
            {previewPhotoUrl && (
                <div 
                    onClick={() => setPreviewPhotoUrl(null)}
                    className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 cursor-pointer"
                >
                    <div className="relative max-w-md w-full bg-white rounded-3xl p-4 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => setPreviewPhotoUrl(null)}
                            className="absolute top-4 left-4 p-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-full cursor-pointer"
                        >
                            <X size={18} />
                        </button>
                        <h4 className="text-center font-bold text-slate-900 mb-3 text-sm">صورة الطالب من استمارة المعلومات</h4>
                        <div className="w-full h-80 rounded-2xl overflow-hidden border bg-slate-100 flex items-center justify-center">
                            <img src={previewPhotoUrl} alt="صورة الطالب" className="w-full h-full object-contain" />
                        </div>
                    </div>
                </div>
            )}

            {/* Discipline Official Report Modal */}
            {reportStudent && (
                <DisciplineReportModal
                    isOpen={!!reportStudent}
                    onClose={() => setReportStudent(null)}
                    student={reportStudent}
                    classData={currentClass}
                    settings={settings}
                    records={allRecords[reportStudent.id] || []}
                    maxPoints={maxPoints}
                    currentPoints={getStudentDisciplineData(reportStudent.id).currentPoints}
                    studentPhotoUrl={getStudentPhoto(reportStudent) || undefined}
                    currentUser={teacher}
                />
            )}
        </div>
    );
}
