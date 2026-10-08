import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../../lib/firebase.ts';
import type { User, SchoolSettings, ClassData, Student, BehaviorDeduction, StudentNotification, DisciplineCriterion, DisciplineSettings, DisciplineRecord, DisciplineArchiveLog } from '../../types.ts';
import { 
    Loader2, ShieldBan, Send, AlertTriangle, CheckCircle2, Trash2, 
    Users, Bot, X, Bell, History, Plus, Settings as SettingsIcon, 
    FileText, RotateCcw, Sparkles, Filter, Search, Eye, Flame, 
    Check, Edit3, ShieldAlert, Award, UserCheck, BookOpen, Clock,
    Info, Calendar, User as UserIcon, HardDrive, Database, Zap
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { sendTelegramNotification, TelegramConfig } from '../../lib/telegram.ts';
import { DEFAULT_DISCIPLINE_CRITERIA, DEFAULT_DISCIPLINE_MAX_POINTS } from '../../constants.ts';
import DisciplineReportModal from '../discipline/DisciplineReportModal.tsx';
import { loadLocalPhotos, saveBulkPhotosLocally, getCachedPhotoSync, populateMemoryCache, getLocalPhotoStats } from '../../lib/photoStorage.ts';

interface BehaviorManagerProps {
    principal: User;
    settings: SchoolSettings;
    classes: ClassData[];
}

export default function BehaviorManager({ principal, settings, classes }: BehaviorManagerProps) {
    const principalId = principal.id || 'principal_al_hamza';

    // Tabs: 'daily' | 'zero_alerts' | 'criteria_settings' | 'archive_logs'
    const [activeTab, setActiveTab] = useState<'daily' | 'zero_alerts' | 'criteria_settings' | 'archive_logs'>('daily');

    // Selection States
    const [selectedStage, setSelectedStage] = useState('');
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterZeroOnly, setFilterZeroOnly] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'all' | 'today' | 'zero' | 'deducted' | 'clean'>('all');
    const [showCacheInfo, setShowCacheInfo] = useState(false);

    // Discipline Settings State (Cached for 0ms load)
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
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    // Records & Data State (Cached for 0ms load)
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
    const [localPhotoCount, setLocalPhotoCount] = useState<number>(0);
    const [isSyncingPhotos, setIsSyncingPhotos] = useState(false);
    const [notificationToast, setNotificationToast] = useState<{ type: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Auto-dismiss toast
    useEffect(() => {
        if (!notificationToast) return;
        const t = setTimeout(() => setNotificationToast(null), 5000);
        return () => clearTimeout(t);
    }, [notificationToast]);

    // Load Local Photos from IndexedDB asynchronously (0ms UI freeze)
    useEffect(() => {
        let isMounted = true;
        loadLocalPhotos(principalId).then(cached => {
            if (isMounted && Object.keys(cached).length > 0) {
                setStudentPhotos(prev => ({ ...prev, ...cached }));
                const stats = getLocalPhotoStats(principalId);
                if (isMounted) setLocalPhotoCount(stats.count);
            } else if (isMounted) {
                // If no local photos stored yet, trigger background sync
                syncPhotosFromFirebase(false);
            }
        });
        return () => { isMounted = false; };
    }, [principalId]);

    // Background non-blocking sync of student photos to IndexedDB
    const syncPhotosFromFirebase = useCallback(async (manual = false) => {
        setIsSyncingPhotos(true);
        try {
            const snapshot = await db.ref(`student_submissions/${principalId}`).once('value');
            const data = snapshot.val() || {};
            const photosMap: Record<string, string> = {};

            Object.keys(data).forEach(k => {
                const sub = data[k];
                if (sub?.studentPhoto && typeof sub.studentPhoto === 'string' && !sub.studentPhoto.includes('GckSf3v')) {
                    photosMap[k] = sub.studentPhoto;
                    if (sub.studentName) photosMap[sub.studentName.trim()] = sub.studentPhoto;
                    if (sub.studentCode) photosMap[String(sub.studentCode)] = sub.studentPhoto;
                    if (sub.examId) photosMap[String(sub.examId)] = sub.studentPhoto;
                }
            });

            if (Object.keys(photosMap).length > 0) {
                await saveBulkPhotosLocally(principalId, photosMap);
                populateMemoryCache(photosMap);
                setStudentPhotos(prev => ({ ...prev, ...photosMap }));
                const stats = getLocalPhotoStats(principalId);
                setLocalPhotoCount(stats.count);
                if (manual) {
                    setNotificationToast({
                        type: 'success',
                        message: `✅ تم حفظ وتحديث (${stats.count}) صورة طالب محلياً بنجاح.`
                    });
                }
            } else if (manual) {
                setNotificationToast({
                    type: 'info',
                    message: 'لم يتم العثور على صور جديدة في السحابة لحفظها.'
                });
            }
        } catch (error) {
            console.error('Failed to sync student photos locally:', error);
            if (manual) {
                setNotificationToast({
                    type: 'error',
                    message: 'تعذر مزامنة الصور محلياً، يرجى المحاولة لاحقاً.'
                });
            }
        } finally {
            setIsSyncingPhotos(false);
        }
    }, [principalId]);

    // Deduction / Flagging Form State with Daily Date
    const [violationDate, setViolationDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [selectedCriterionId, setSelectedCriterionId] = useState('');
    const [deductionAmount, setDeductionAmount] = useState<number>(1);
    const [customReason, setCustomReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New Criterion Form State
    const [isAddingCriterion, setIsAddingCriterion] = useState(false);
    const [newCritTitle, setNewCritTitle] = useState('');
    const [newCritDesc, setNewCritDesc] = useState('');
    const [newCritCategory, setNewCritCategory] = useState<DisciplineCriterion['category']>('سلوكي');
    const [newCritPoints, setNewCritPoints] = useState<number>(1);

    // Telegram State
    const [sendIndividualTelegram, setSendIndividualTelegram] = useState(true);
    const [sendGroupTelegram, setSendGroupTelegram] = useState(true);
    const [customGroupChatId, setCustomGroupChatId] = useState(settings?.telegramDefaultChatId || '');
    const [isSendingTelegram, setIsSendingTelegram] = useState(false);
    const [telegramLogModal, setTelegramLogModal] = useState<{ open: boolean; title: string; logs: string[] } | null>(null);

    // Report & Archive Modals
    const [reportStudent, setReportStudent] = useState<{ student: Student; classData?: ClassData } | null>(null);
    const [archiveTargetStudent, setArchiveTargetStudent] = useState<{ student: Student; classData?: ClassData } | null>(null);
    const [archiveReasonText, setArchiveReasonText] = useState('حضور ولي أمر الطالب وتوقيع تعهد خطي بالالتزام التام بالنظام المدرسي');
    const [isArchiving, setIsArchiving] = useState(false);

    // Keep customGroupChatId synchronized if settings change
    useEffect(() => {
        if (settings?.telegramDefaultChatId) {
            setCustomGroupChatId(prev => prev || settings.telegramDefaultChatId || '');
        }
    }, [settings?.telegramDefaultChatId]);

    const telegramConfig: TelegramConfig = useMemo(() => ({
        botToken: settings?.telegramBotToken,
        defaultChatId: customGroupChatId || settings?.telegramDefaultChatId,
        enabled: settings?.telegramEnabled
    }), [settings, customGroupChatId]);

    // Load Settings, Records, Archives with Local Cache
    useEffect(() => {
        // 1. Load Discipline Settings
        const settingsRef = db.ref(`discipline_settings/${principalId}`);
        const settingsCb = (snapshot: any) => {
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
        settingsRef.on('value', settingsCb);

        // 2. Load Discipline Records
        const recordsRef = db.ref(`discipline_records/${principalId}`);
        const recordsCb = (snapshot: any) => {
            const data = snapshot.val() || {};
            const recordsByStudent: Record<string, DisciplineRecord[]> = {};
            Object.keys(data).forEach(studentId => {
                recordsByStudent[studentId] = Object.values(data[studentId] || {});
            });
            setAllRecords(recordsByStudent);
            setIsLoading(false);
            try {
                localStorage.setItem(`cached_discipline_records_${principalId}`, JSON.stringify(recordsByStudent));
            } catch {}
        };
        recordsRef.on('value', recordsCb);

        // 3. Load Archives
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
            settingsRef.off('value', settingsCb);
            recordsRef.off('value', recordsCb);
            archivesRef.off('value', archivesCb);
        };
    }, [principalId]);

    const maxPoints = disciplineSettings.maxPoints || DEFAULT_DISCIPLINE_MAX_POINTS;
    const selectedClass = useMemo(() => classes.find(c => c.id === selectedClassId), [classes, selectedClassId]);
    const studentLabel = settings.schoolLevel === 'ابتدائية' ? 'التلميذ' : 'الطالب';

    // Helper: calculate student stats
    const getStudentData = (studentId: string) => {
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

    // Helper to get student photo (0ms Instant memory check)
    const getStudentPhoto = (student: Student): string | null => {
        if (!student) return null;
        if (student.photoUrl && typeof student.photoUrl === 'string' && !student.photoUrl.includes('GckSf3v')) return student.photoUrl;
        if (student.id && studentPhotos[student.id]) return studentPhotos[student.id];
        if (student.name && studentPhotos[student.name.trim()]) return studentPhotos[student.name.trim()];
        if (student.examId && studentPhotos[String(student.examId)]) return studentPhotos[String(student.examId)];

        // Fast synchronous check from IndexedDB memory cache
        const fromMem = (student.id ? getCachedPhotoSync(student.id) : null) || 
                        (student.name ? getCachedPhotoSync(student.name.trim()) : null) || 
                        (student.examId ? getCachedPhotoSync(String(student.examId)) : null);
        if (fromMem) return fromMem;

        return null;
    };

    // Calculate all students across school who are currently at 0 points
    const zeroPointsStudents = useMemo(() => {
        const list: { student: Student; classData: ClassData; currentPoints: number; totalDeductions: number; activeRecords: DisciplineRecord[] }[] = [];
        classes.forEach(c => {
            (c.students || []).forEach(s => {
                const data = getStudentData(s.id);
                if (data.isZero && data.totalDeductions > 0) {
                    list.push({
                        student: s,
                        classData: c,
                        currentPoints: data.currentPoints,
                        totalDeductions: data.totalDeductions,
                        activeRecords: data.activeRecords
                    });
                }
            });
        });
        return list;
    }, [classes, allRecords, maxPoints]);

    // Active Criteria list
    const activeCriteria = useMemo(() => {
        return (disciplineSettings.criteria || DEFAULT_DISCIPLINE_CRITERIA).filter(c => c.isActive !== false);
    }, [disciplineSettings.criteria]);

    const todayDateStr = useMemo(() => new Date().toISOString().split('T')[0], []);

    // Filter students for the current selected class
    const filteredStudents = useMemo(() => {
        if (!selectedClass?.students) return [];
        return selectedClass.students.filter(s => {
            if (!s) return false;
            const searchLower = searchQuery.toLowerCase().trim();
            const matchesSearch = !searchLower || 
                (s.name && s.name.toLowerCase().includes(searchLower)) ||
                (s.examId && String(s.examId).toLowerCase().includes(searchLower)) ||
                (s.studentAccessCode && String(s.studentAccessCode).toLowerCase().includes(searchLower));
            if (!matchesSearch) return false;

            const { isZero, totalDeductions, currentPoints, activeRecords } = getStudentData(s.id);

            if (statusFilter === 'today') {
                return activeRecords.some(r => {
                    const rDate = r.violationDate || (r.timestamp ? r.timestamp.split('T')[0] : '');
                    return rDate === todayDateStr;
                });
            }
            if (statusFilter === 'zero' || filterZeroOnly) {
                return isZero && totalDeductions > 0;
            }
            if (statusFilter === 'deducted') {
                return totalDeductions > 0;
            }
            if (statusFilter === 'clean') {
                return totalDeductions === 0 && currentPoints === maxPoints;
            }
            return true;
        });
    }, [selectedClass, searchQuery, statusFilter, filterZeroOnly, allRecords, maxPoints, todayDateStr]);

    // Handle Max Points Update
    const handleUpdateMaxPoints = async (newMax: number) => {
        if (newMax < 1 || newMax > 100) return;
        setIsSavingSettings(true);
        try {
            await db.ref(`discipline_settings/${principalId}/maxPoints`).set(newMax);
            setDisciplineSettings(prev => ({ ...prev, maxPoints: newMax }));
            alert(`✅ تم تحديث مجموع نقاط الانضباط الأساسية إلى (${newMax}) نقاط لجميع الطلبة بنجاح.`);
        } catch (error) {
            console.error('Failed to update max points:', error);
            alert('حدث خطأ أثناء حفظ النقاط.');
        } finally {
            setIsSavingSettings(false);
        }
    };

    // Handle Add New Criterion
    const handleAddCriterion = async () => {
        if (!newCritTitle.trim()) {
            alert('يرجى كتابة عنوان المعيار.');
            return;
        }

        const newCriterion: DisciplineCriterion = {
            id: 'crit_' + uuidv4().slice(0, 8),
            title: newCritTitle.trim(),
            description: newCritDesc.trim(),
            category: newCritCategory,
            deductionPoints: Number(newCritPoints) || 1,
            isActive: true,
            isDefault: false,
            createdAt: new Date().toISOString(),
            createdByName: principal.name
        };

        const updatedCriteria = [...(disciplineSettings.criteria || DEFAULT_DISCIPLINE_CRITERIA), newCriterion];

        try {
            await db.ref(`discipline_settings/${principalId}/criteria`).set(updatedCriteria);
            setDisciplineSettings(prev => ({ ...prev, criteria: updatedCriteria }));
            setNewCritTitle('');
            setNewCritDesc('');
            setIsAddingCriterion(false);
            alert('✅ تم إضافة معيار الانضباط الجديد بنجاح.');
        } catch (error) {
            console.error('Failed to add criterion:', error);
            alert('حدث خطأ أثناء إضافة المعيار.');
        }
    };

    // Handle Toggle or Delete Criterion
    const handleToggleCriterion = async (critId: string) => {
        const updated = (disciplineSettings.criteria || DEFAULT_DISCIPLINE_CRITERIA).map(c => 
            c.id === critId ? { ...c, isActive: !c.isActive } : c
        );
        await db.ref(`discipline_settings/${principalId}/criteria`).set(updated);
        setDisciplineSettings(prev => ({ ...prev, criteria: updated }));
    };

    const handleDeleteCriterion = async (critId: string) => {
        if (!confirm('هل أنت متأكد من حذف هذا المعيار؟')) return;
        const updated = (disciplineSettings.criteria || DEFAULT_DISCIPLINE_CRITERIA).filter(c => c.id !== critId);
        await db.ref(`discipline_settings/${principalId}/criteria`).set(updated);
        setDisciplineSettings(prev => ({ ...prev, criteria: updated }));
    };

    // Handle Reset Criteria to Default
    const handleResetCriteriaDefaults = async () => {
        if (!confirm('هل تريد إعادة تعيين معايير الانضباط إلى القائمة الافتراضية المعتمدة؟')) return;
        await db.ref(`discipline_settings/${principalId}/criteria`).set(DEFAULT_DISCIPLINE_CRITERIA);
        setDisciplineSettings(prev => ({ ...prev, criteria: DEFAULT_DISCIPLINE_CRITERIA }));
        alert('تمت استعادة المعايير الافتراضية بنجاح.');
    };

    // Handle Deduction & Incident Logging with Daily Violation Date & Instant Local Optimistic Update
    const handleDeduct = async (mode: 'save_and_notify' | 'save_only' = 'save_and_notify') => {
        if (!selectedStudentId || !selectedClass) {
            setNotificationToast({
                type: 'warning',
                message: 'يرجى اختيار طالب أولاً.'
            });
            return;
        }

        const student = selectedClass.students.find(s => s.id === selectedStudentId);
        if (!student) return;

        const chosenCrit = activeCriteria.find(c => c.id === selectedCriterionId);
        if (!chosenCrit && !customReason.trim()) {
            setNotificationToast({
                type: 'warning',
                message: 'يرجى اختيار معيار المخالفة أو كتابة السبب.'
            });
            return;
        }

        const reasonTitle = chosenCrit ? chosenCrit.title : customReason.trim();
        const points = chosenCrit ? (chosenCrit.deductionPoints || 1) : (deductionAmount || 1);
        const targetNotes = customReason.trim();
        const targetDate = violationDate || new Date().toISOString().split('T')[0];

        const newRecord: DisciplineRecord = {
            id: uuidv4(),
            principalId,
            studentId: selectedStudentId,
            studentName: student.name,
            studentCode: student.examId || student.studentAccessCode,
            classId: selectedClass.id,
            stage: selectedClass.stage,
            section: selectedClass.section,
            subjectName: 'إدارة ومعاونية شؤون الطلبة',
            teacherId: principal.id,
            teacherName: principal.name,
            teacherRole: principal.role === 'assistant' ? 'معاون شؤون الطلبة' : 'مدير المدرسة',
            criterionId: chosenCrit?.id || 'custom',
            criterionTitle: reasonTitle,
            pointsDeducted: points,
            notes: targetNotes,
            violationDate: targetDate,
            timestamp: new Date().toISOString(),
            status: 'active'
        };

        // 1. OPTIMISTIC UPDATE: Update UI state instantly in 0 milliseconds!
        setAllRecords(prev => {
            const currentList = prev[selectedStudentId] || [];
            const updatedList = [newRecord, ...currentList];
            const updatedAll = { ...prev, [selectedStudentId]: updatedList };
            try {
                localStorage.setItem(`cached_discipline_records_${principalId}`, JSON.stringify(updatedAll));
            } catch {}
            return updatedAll;
        });

        // 2. Clear inputs immediately
        setCustomReason('');
        setSelectedCriterionId('');

        // 3. Show instant confirmation toast
        setNotificationToast({
            type: 'success',
            message: `⚡ تم رصد المخالفة وتحديث الخصم فورياً (-${points} نقطة) للطالب (${student.name}).`
        });

        // 4. Calculate if 0 points reached
        const sData = getStudentData(selectedStudentId);
        const newTotalDeducted = sData.totalDeductions + points;
        const newCurrentPoints = Math.max(0, maxPoints - newTotalDeducted);

        setIsSubmitting(true);
        const logs: string[] = [];
        logs.push(`✅ تم رصد وخصم (${points}) نقاط فورياً للطالب (${student.name}).`);
        if (newCurrentPoints === 0) {
            logs.push(`⚠️ تنبيه: استنفد الطالب (${student.name}) كامل نقاط الانضباط (0/${maxPoints})! يتطلب استدعاء ولي الأمر.`);
        }

        try {
            // 5. Parallel background sync to Firebase
            const notifMsg = `تنبيه سلوك وانضباط (${newRecord.violationDate}): تم خصم (${points}) نقاط من رصيدك بواسطة (${principal.role === 'assistant' ? 'معاون شؤون الطلبة' : 'مدير المدرسة'}) بسبب: ${reasonTitle}`;

            await Promise.all([
                db.ref(`discipline_records/${principalId}/${selectedStudentId}/${newRecord.id}`).set(newRecord),
                db.ref(`behavior_deductions/${principalId}/${selectedStudentId}/${newRecord.id}`).set({
                    id: newRecord.id,
                    principalId,
                    studentId: selectedStudentId,
                    classId: selectedClass.id,
                    pointsDeducted: points,
                    reason: `${reasonTitle}${targetNotes && chosenCrit ? ' - ' + targetNotes : ''}`,
                    timestamp: newRecord.timestamp
                }),
                db.ref(`student_notifications/${principalId}/${selectedStudentId}`).push({
                    studentId: selectedStudentId,
                    message: notifMsg,
                    timestamp: new Date().toISOString(),
                    isRead: false
                })
            ]);

            // Handle Telegram Notifications in background
            if (mode === 'save_and_notify' && settings?.telegramBotToken?.trim()) {
                if (sendIndividualTelegram && student.telegramChatId?.trim()) {
                    const chatId = student.telegramChatId.trim();
                    const indMsg = 
                        `<b>⚠️ تنبيه انضباط وسلوك طالب</b>\n\n` +
                        `<b>اسم الطالب:</b> ${student.name}\n` +
                        `<b>الصف والشعبة:</b> ${selectedClass.stage} / ${selectedClass.section}\n` +
                        `<b>تاريخ المخالفة:</b> ${newRecord.violationDate}\n` +
                        `<b>نوع المخالفة:</b> ${reasonTitle}\n` +
                        `<b>الخصم:</b> خصم (${points}) نقطة (الرصيد المتبقي: ${newCurrentPoints}/${maxPoints})\n\n` +
                        `نسترعي انتباه ولي الأمر الموقر لمتابعة التزام الطالب بالأنظمة المدرسية.\n\n` +
                        `<i>إدارة المدرسة - معاونية شؤون الطلبة</i>`;

                    sendTelegramNotification(telegramConfig, chatId, indMsg).then(resInd => {
                        if (resInd.success) logs.push(`✅ تم إرسال إشعار تليكرام لولي أمر الطالب بنجاح.`);
                    }).catch(console.error);
                }

                if (sendGroupTelegram) {
                    const targetGroupId = customGroupChatId.trim() || settings?.telegramDefaultChatId?.trim();
                    if (targetGroupId) {
                        const groupMsg = 
                            `<b>📢 تنبيه انضباط مدرسي</b>\n\n` +
                            `<b>اسم الطالب:</b> ${student.name}\n` +
                            `<b>الصف والشعبة:</b> ${selectedClass.stage} - ${selectedClass.section}\n` +
                            `<b>المخالفة:</b> ${reasonTitle}\n` +
                            `<b>تاريخ المخالفة:</b> ${newRecord.violationDate}\n\n` +
                            `<i>إدارة المدرسة - معاونية شؤون الطلبة</i>`;
                        sendTelegramNotification(telegramConfig, targetGroupId, groupMsg).catch(console.error);
                    }
                }
            }

            if (mode === 'save_and_notify') {
                setTelegramLogModal({
                    open: true,
                    title: 'تقرير تسجيل المخالفة والإشعارات',
                    logs
                });
            }
        } catch (error) {
            console.error('Failed to record discipline deduction:', error);
            setNotificationToast({
                type: 'warning',
                message: 'تم حفظ الخصم محلياً، وسيتم المزامنة مع السحابة عند توفر اتصال مستقر.'
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle Archive & Reset (Grant New Chance)
    const handleArchiveAndReset = async (targetStudent: Student, reason: string) => {
        const studentId = targetStudent.id;
        const targetClass = classes.find(c => c.students?.some(s => s.id === studentId)) || selectedClass;
        if (!targetClass) return;

        const sData = getStudentData(studentId);
        const activeRecs = sData.activeRecords;

        if (activeRecs.length === 0) {
            alert('لا توجد مخالفات نشطة لأرشفتها لهذا الطالب.');
            return;
        }

        setIsArchiving(true);

        const archiveLogId = uuidv4();
        const archiveLog: DisciplineArchiveLog = {
            id: archiveLogId,
            studentId,
            studentName: targetStudent.name,
            classId: targetClass.id,
            stage: targetClass.stage,
            section: targetClass.section,
            archivedAt: new Date().toISOString(),
            archivedByUserId: principal.id,
            archivedByName: principal.name,
            previousTotalDeductions: sData.totalDeductions,
            recordsCount: activeRecs.length,
            reason,
            grantedPoints: maxPoints
        };

        try {
            // 1. Mark active records as archived in Firebase
            const updates: Record<string, any> = {};
            activeRecs.forEach(r => {
                updates[`discipline_records/${principalId}/${studentId}/${r.id}/status`] = 'archived';
                updates[`discipline_records/${principalId}/${studentId}/${r.id}/archivedAt`] = archiveLog.archivedAt;
                updates[`discipline_records/${principalId}/${studentId}/${r.id}/archivedByName`] = principal.name;
                updates[`discipline_records/${principalId}/${studentId}/${r.id}/archiveReason`] = reason;

                // Also update behavior_deductions
                updates[`behavior_deductions/${principalId}/${studentId}/${r.id}/status`] = 'archived';
            });

            // 2. Save archive log entry
            updates[`discipline_archives/${principalId}/${studentId}/${archiveLogId}`] = archiveLog;

            // 3. Remove zero alert
            updates[`discipline_zero_alerts/${principalId}/${studentId}`] = null;

            // 4. Send notification to student
            const studentNotifKey = db.ref(`student_notifications/${principalId}/${studentId}`).push().key;
            if (studentNotifKey) {
                updates[`student_notifications/${principalId}/${studentId}/${studentNotifKey}`] = {
                    studentId,
                    message: `🎉 تم منحك فرصة جديدة وتصفير المخالفات السابقة برصيد (${maxPoints}) نقاط كاملة من قبل معاونية شؤون الطلبة. السبب: ${reason}`,
                    timestamp: new Date().toISOString(),
                    isRead: false
                };
            }

            await db.ref().update(updates);

            alert(`✅ تمت أرشفة تقييمات الطالب (${targetStudent.name}) بنجاح ومنحه رصيد (${maxPoints}) نقاط كفرصة جديدة.`);
            setArchiveTargetStudent(null);
        } catch (error) {
            console.error('Failed to archive and reset:', error);
            alert('حدث خطأ أثناء أرشفة السجل.');
        } finally {
            setIsArchiving(false);
        }
    };

    // Delete single record
    const handleDeleteRecord = async (studentId: string, recordId: string) => {
        if (!confirm('هل أنت متأكد من حذف هذه المخالفة نهائياً من النظام؟')) return;
        try {
            await db.ref(`discipline_records/${principalId}/${studentId}/${recordId}`).remove();
            await db.ref(`behavior_deductions/${principalId}/${studentId}/${recordId}`).remove();
            alert('تم حذف المخالفة بنجاح.');
        } catch (error) {
            console.error('Failed to delete record:', error);
            alert('حدث خطأ أثناء الحذف.');
        }
    };

    return (
        <div className="bg-white p-4 sm:p-7 rounded-3xl shadow-xl space-y-6 border border-slate-100">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
                <div className="flex items-center gap-3.5">
                    <div className="p-3 bg-red-600 text-white rounded-2xl shadow-md">
                        <ShieldAlert className="w-8 h-8" />
                    </div>
                    <div>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                            نظام نقاط انضباط وسلوك الطلاب
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                            بوابة معاون شؤون الطلبة - الرصيد الأساسي الموحد: <b className="text-indigo-600">{maxPoints} نقاط</b>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {zeroPointsStudents.length > 0 && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('zero_alerts')}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs sm:text-sm font-black flex items-center gap-2 shadow-lg animate-pulse cursor-pointer"
                        >
                            <Flame size={16} />
                            <span>{zeroPointsStudents.length} طلاب وصلوا للصفر (0/{maxPoints})</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-2xl">
                <button
                    type="button"
                    onClick={() => setActiveTab('daily')}
                    className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        activeTab === 'daily'
                            ? 'bg-white text-indigo-950 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <UserCheck size={16} className={activeTab === 'daily' ? 'text-indigo-600' : ''} />
                    <span>المتابعة والتأشير اليومي</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('zero_alerts')}
                    className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        activeTab === 'zero_alerts'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-red-600'
                    }`}
                >
                    <ShieldAlert size={16} />
                    <span>تنبيهات استنفاد النقاط (0)</span>
                    {zeroPointsStudents.length > 0 && (
                        <span className="bg-white text-red-700 px-2 py-0.5 rounded-full text-xs font-black">
                            {zeroPointsStudents.length}
                        </span>
                    )}
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('criteria_settings')}
                    className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        activeTab === 'criteria_settings'
                            ? 'bg-white text-indigo-950 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <SettingsIcon size={16} className={activeTab === 'criteria_settings' ? 'text-indigo-600' : ''} />
                    <span>معايير الانضباط والنقاط</span>
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('archive_logs')}
                    className={`flex-1 min-w-[140px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                        activeTab === 'archive_logs'
                            ? 'bg-white text-indigo-950 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                    <History size={16} className={activeTab === 'archive_logs' ? 'text-indigo-600' : ''} />
                    <span>سجل الأرشيف والفرص ({archiveLogs.length})</span>
                </button>
            </div>

            {/* TAB 1: DAILY EVALUATION & LOGGING */}
            {activeTab === 'daily' && (
                <div className="space-y-6">
                    {/* Stage and Class Selectors */}
                    {/* Realtime / Local Cache Sync Banner */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-gradient-to-r from-indigo-50 via-slate-50 to-emerald-50 rounded-2xl border border-indigo-100/80 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="flex h-2.5 w-2.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                            </span>
                            <span className="font-bold text-slate-800">
                                ⚡ رصد فوري للخصم التراكمي (0 ثانية)
                            </span>
                            <span className="hidden sm:inline text-slate-400">•</span>
                            <span className="flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-lg text-[11px]">
                                <HardDrive size={13} className="text-emerald-700" />
                                {localPhotoCount > 0 ? (
                                    <span>صور الطلاب محفوظة محلياً ({localPhotoCount})</span>
                                ) : (
                                    <span>جاري تهيئة الصور محلياً...</span>
                                )}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => syncPhotosFromFirebase(true)}
                                disabled={isSyncingPhotos}
                                className="px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                                title="تحديث الصور المخزنة محلياً في ذاكرة جهازك"
                            >
                                {isSyncingPhotos ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin text-indigo-600" />
                                        <span>جاري حفظ الصور...</span>
                                    </>
                                ) : (
                                    <>
                                        <Database size={12} className="text-indigo-600" />
                                        <span>حفظ وتحديث الصور محلياً</span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setShowCacheInfo(!showCacheInfo)}
                                className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                                <Info size={14} />
                                <span>معلومات السرعة</span>
                            </button>
                        </div>
                    </div>

                    {/* Interactive Feedback Toast */}
                    {notificationToast && (
                        <div className={`p-3 rounded-2xl text-xs font-bold shadow-sm transition-all flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-2 ${
                            notificationToast.type === 'success' 
                                ? 'bg-emerald-50 text-emerald-900 border border-emerald-300' 
                                : notificationToast.type === 'error'
                                ? 'bg-red-50 text-red-900 border border-red-300'
                                : notificationToast.type === 'warning'
                                ? 'bg-amber-50 text-amber-900 border border-amber-300'
                                : 'bg-indigo-50 text-indigo-900 border border-indigo-300'
                        }`}>
                            <div className="flex items-center gap-2">
                                {notificationToast.type === 'success' ? (
                                    <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
                                ) : notificationToast.type === 'error' ? (
                                    <AlertTriangle size={16} className="text-red-600 flex-shrink-0" />
                                ) : (
                                    <Zap size={16} className="text-indigo-600 flex-shrink-0" />
                                )}
                                <span>{notificationToast.message}</span>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => setNotificationToast(null)} 
                                className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {showCacheInfo && (
                        <div className="p-3.5 bg-indigo-950 text-white rounded-2xl text-xs space-y-1.5 shadow-md animate-in fade-in duration-200">
                            <div className="flex items-center justify-between font-bold">
                                <span className="flex items-center gap-1.5 text-indigo-300">
                                    <Sparkles size={14} />
                                    تنبيه كفاءة وسرعة التحميل الفوري:
                                </span>
                                <button type="button" onClick={() => setShowCacheInfo(false)} className="text-slate-400 hover:text-white">
                                    <X size={14} />
                                </button>
                            </div>
                            <p className="text-slate-200 leading-relaxed text-[11px]">
                                يتم تخزين قوائم الطلاب والشعب ومعايير الانضباط محلياً في ذاكرة جهازك لفتحها فوراً دون انتظار، بينما تجري المزامنة السحابية الدائمة في الخلفية فور حدوث أي رصد جديد دون التأثير على سرعة الاستجابة أو دقة النتائج.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">المرحلة الدراسية:</label>
                            <select 
                                value={selectedStage} 
                                onChange={e => { setSelectedStage(e.target.value); setSelectedClassId(''); setSelectedStudentId(null); }} 
                                className="w-full p-2.5 border rounded-xl bg-white font-bold text-sm shadow-xs focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">-- اختر المرحلة الدراسية --</option>
                                {Array.from(new Set(classes.map(c => c.stage))).map(stage => (
                                    <option key={stage} value={stage}>{stage}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">الشعبة:</label>
                            <select 
                                value={selectedClassId} 
                                onChange={e => { setSelectedClassId(e.target.value); setSelectedStudentId(null); }} 
                                disabled={!selectedStage} 
                                className="w-full p-2.5 border rounded-xl bg-white font-bold text-sm shadow-xs focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                            >
                                <option value="">-- اختر الشعبة --</option>
                                {classes.filter(c => c.stage === selectedStage).map(c => (
                                    <option key={c.id} value={c.id}>{c.section}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="text-center py-12">
                            <Loader2 className="animate-spin mx-auto text-indigo-600 h-10 w-10 mb-2"/>
                            <p className="text-slate-500 font-semibold text-sm">جاري تحميل بيانات الانضباط...</p>
                        </div>
                    ) : selectedClass ? (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Students List Column (5 cols) */}
                            <div className="lg:col-span-5 space-y-3">
                                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-bold text-slate-800 text-xs sm:text-sm">
                                            طلاب ({selectedClass.stage} - {selectedClass.section}) ({selectedClass.students?.length || 0})
                                        </h3>
                                        <span className="text-[11px] text-slate-400 font-medium">
                                            تأشير يومي وخصم تراكمي
                                        </span>
                                    </div>

                                    {/* Search Input */}
                                    <div className="relative">
                                        <Search className="absolute right-2.5 top-2.5 text-slate-400 w-3.5 h-3.5" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder="ابحث باسم الطالب أو الرقم الامتحاني..."
                                            className="w-full pl-3 pr-8 py-1.5 border rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    {/* Status Filter Chips */}
                                    <div className="flex flex-wrap items-center gap-1 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('all')}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                                statusFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 border border-slate-200'
                                            }`}
                                        >
                                            الكل ({selectedClass.students?.length || 0})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('today')}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                                statusFilter === 'today' ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                            }`}
                                        >
                                            <Calendar size={11} />
                                            <span>مخالفات اليوم</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('zero')}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                                                statusFilter === 'zero' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 border border-red-200'
                                            }`}
                                        >
                                            <Flame size={11} />
                                            <span>مستنفدون (0)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('deducted')}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                                statusFilter === 'deducted' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200'
                                            }`}
                                        >
                                            عليهم مخالفات
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setStatusFilter('clean')}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                                statusFilter === 'clean' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                            }`}
                                        >
                                            سجل نظيف (10)
                                        </button>
                                    </div>
                                </div>

                                <div className="max-h-[62vh] overflow-y-auto space-y-2 pr-0.5">
                                    {filteredStudents.length > 0 ? (
                                        filteredStudents.map(student => {
                                            const { currentPoints, totalDeductions, isZero, activeRecords } = getStudentData(student.id);
                                            const isSelected = selectedStudentId === student.id;
                                            const photo = getStudentPhoto(student);
                                            const hasTodayInfraction = activeRecords.some(r => {
                                                const rDate = r.violationDate || (r.timestamp ? r.timestamp.split('T')[0] : '');
                                                return rDate === todayDateStr;
                                            });

                                            return (
                                                <div 
                                                    key={student.id} 
                                                    onClick={() => setSelectedStudentId(student.id)} 
                                                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                                                        isSelected 
                                                            ? 'bg-indigo-600 text-white shadow-md border-indigo-600' 
                                                            : isZero && totalDeductions > 0
                                                            ? 'bg-red-50 border-red-300 text-slate-900 hover:bg-red-100/80 shadow-xs'
                                                            : 'bg-white border-slate-200 hover:border-indigo-300 text-slate-800'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        {/* Avatar / Photo */}
                                                        <div className={`w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border ${
                                                            isSelected ? 'border-white/40' : 'border-slate-200'
                                                        } bg-slate-100 flex items-center justify-center`}>
                                                            {photo ? (
                                                                <img src={photo} alt={student.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <UserIcon className={`w-5 h-5 ${isSelected ? 'text-white/60' : 'text-slate-400'}`} />
                                                            )}
                                                        </div>

                                                        <div>
                                                            <h4 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                                                                <span>{student.name}</span>
                                                                {hasTodayInfraction && (
                                                                    <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded font-bold">
                                                                        سُجل اليوم
                                                                    </span>
                                                                )}
                                                                {isZero && totalDeductions > 0 && (
                                                                    <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                                                                        0 / {maxPoints}
                                                                    </span>
                                                                )}
                                                            </h4>
                                                            <p className={`text-xs mt-0.5 ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                                                                الخصومات التراكمية: {totalDeductions} نقاط ({activeRecords.length} مخالفة نشطة)
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        <div className={`px-2.5 py-1 rounded-xl text-xs font-black ${
                                                            isSelected
                                                                ? 'bg-white text-indigo-900'
                                                                : isZero && totalDeductions > 0
                                                                ? 'bg-red-600 text-white'
                                                                : currentPoints >= 7
                                                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                                : 'bg-amber-100 text-amber-800 border border-amber-300'
                                                        }`}>
                                                            {currentPoints} / {maxPoints}
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setReportStudent({ student, classData: selectedClass });
                                                            }}
                                                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                                                isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 hover:text-indigo-600'
                                                            }`}
                                                            title="استعراض التقرير النهائي واستدعاء ولي الأمر"
                                                        >
                                                            <Eye size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500">
                                            لا يوجد طلاب مطابقين لمعايير التصفية الحالية.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Action Form & Records Panel (7 cols) */}
                            <div className="lg:col-span-7 space-y-4">
                                {selectedStudentId ? (
                                    <div className="space-y-4">
                                        {/* Action Card */}
                                        {(() => {
                                            const currentStudent = selectedClass.students.find(s => s.id === selectedStudentId);
                                            if (!currentStudent) return null;
                                            const { currentPoints, totalDeductions, isZero, activeRecords } = getStudentData(selectedStudentId);
                                            const photo = getStudentPhoto(currentStudent);

                                            return (
                                                <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 shadow-xs space-y-4">
                                                    <div className="flex items-center justify-between border-b border-slate-200 pb-3 gap-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-12 h-12 rounded-2xl overflow-hidden bg-white border border-slate-200 flex-shrink-0 flex items-center justify-center">
                                                                {photo ? (
                                                                    <img src={photo} alt={currentStudent.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <UserIcon className="w-6 h-6 text-slate-400" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <span className="text-[11px] font-bold text-indigo-600 block">الطالب المحدد:</span>
                                                                <h3 className="text-base font-black text-slate-900">{currentStudent.name}</h3>
                                                                <p className="text-xs text-slate-500">
                                                                    الرقم: {currentStudent.examId || currentStudent.studentAccessCode || '—'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`px-3 py-1 rounded-xl text-xs font-black ${
                                                                isZero ? 'bg-red-600 text-white animate-pulse' : 'bg-indigo-100 text-indigo-900'
                                                            }`}>
                                                                الرصيد: {currentPoints} / {maxPoints}
                                                            </span>

                                                            {/* Direct Word / PDF Report Button */}
                                                            <button
                                                                type="button"
                                                                onClick={() => setReportStudent({ student: currentStudent, classData: selectedClass })}
                                                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                                            >
                                                                <FileText size={14} />
                                                                <span>تقرير استدعاء ولي الأمر</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Daily Date Selector Toolbar */}
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

                                                    {/* Violation Choice */}
                                                    <div className="space-y-2">
                                                        <label className="block text-xs font-bold text-slate-700">
                                                            حدد معيار السلوك غير المنضبط للخصم التراكمي (-1 نقطة):
                                                        </label>
                                                        <div className="max-h-48 overflow-y-auto space-y-1.5 border rounded-2xl p-2 bg-white">
                                                            {activeCriteria.map(crit => {
                                                                const isChosen = selectedCriterionId === crit.id;
                                                                return (
                                                                    <button
                                                                        key={crit.id}
                                                                        type="button"
                                                                        onClick={() => setSelectedCriterionId(crit.id)}
                                                                        className={`w-full text-right p-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                                                                            isChosen
                                                                                ? 'bg-red-600 text-white shadow-xs'
                                                                                : 'bg-slate-50 hover:bg-slate-100 text-slate-800'
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
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-700 mb-1">
                                                            ملاحظة تفصيلية / توضيح الموقف (اختياري):
                                                        </label>
                                                        <textarea
                                                            value={customReason}
                                                            onChange={e => setCustomReason(e.target.value)}
                                                            rows={2}
                                                            placeholder="اكتب أي تفاصيل إضافية للمخالفة..."
                                                            className="w-full p-2.5 border rounded-xl text-xs bg-white focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    {/* Deduction Buttons */}
                                                    <div className="flex flex-wrap gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeduct('save_and_notify')}
                                                            disabled={isSubmitting || (!selectedCriterionId && !customReason.trim())}
                                                            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                        >
                                                            <Send size={15} />
                                                            <span>{isSubmitting ? 'جاري الرصد...' : 'خصم تراكمي (-1) وإرسال إشعار تليكرام'}</span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeduct('save_only')}
                                                            disabled={isSubmitting || (!selectedCriterionId && !customReason.trim())}
                                                            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
                                                        >
                                                            <span>حفظ بالنظام فقط</span>
                                                        </button>

                                                        {activeRecords.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setArchiveTargetStudent({ student: currentStudent, classData: selectedClass })}
                                                                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-1 cursor-pointer"
                                                                title="أرشفة المخالفات السابقة ومنح فرصة جديدة"
                                                            >
                                                                <RotateCcw size={14} />
                                                                <span>أرشفة وفرصة جديدة</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* History of Student Violations (Cumulative breakdown from all teachers & assistant) */}
                                        <div className="bg-white border rounded-3xl p-5 shadow-xs space-y-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                                                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs sm:text-sm">
                                                    <Clock className="w-4 h-4 text-indigo-600" />
                                                    <h4>سجل المخالفات التراكمية بحق الطالب (من كافة المدرسين والإدارة)</h4>
                                                </div>
                                                <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-lg font-bold">
                                                    إجمالي الخصم التراكمي: -{getStudentData(selectedStudentId).totalDeductions} نقاط
                                                </span>
                                            </div>

                                            {(() => {
                                                const sRecs = (allRecords[selectedStudentId] || []).filter(r => r.status !== 'archived');
                                                if (sRecs.length === 0) {
                                                    return (
                                                        <p className="text-center text-slate-400 text-xs py-6 font-medium">
                                                            لا توجد مخالفات نشطة مسجلة على هذا الطالب.
                                                        </p>
                                                    );
                                                }

                                                return (
                                                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                                                        {sRecs.map(rec => {
                                                            const vDate = rec.violationDate || (rec.timestamp ? rec.timestamp.split('T')[0] : '');
                                                            const repeatCount = sRecs.filter(r => r.criterionTitle === rec.criterionTitle).length;

                                                            return (
                                                                <div key={rec.id} className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-start justify-between gap-3 text-xs">
                                                                    <div className="space-y-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-md">
                                                                                خصم ({rec.pointsDeducted}) نقطة
                                                                            </span>
                                                                            {repeatCount > 1 && (
                                                                                <span className="bg-rose-200 text-rose-900 text-[10px] px-1.5 py-0.2 rounded font-black">
                                                                                    تكرر {repeatCount} مرات
                                                                                </span>
                                                                            )}
                                                                            <span className="font-bold text-indigo-900">
                                                                                المادة: {rec.subjectName || 'عام'} (بواسطة: {rec.teacherName})
                                                                            </span>
                                                                        </div>
                                                                        <p className="font-bold text-slate-800">{rec.criterionTitle}</p>
                                                                        {rec.notes && <p className="text-slate-500 text-[11px]">ملاحظة: {rec.notes}</p>}
                                                                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                                                                            <span className="flex items-center gap-1">
                                                                                <Calendar size={10} className="text-indigo-600" />
                                                                                <span>تاريخ المخالفة: {vDate}</span>
                                                                            </span>
                                                                            <span>•</span>
                                                                            <span>وقت التسجيل: {new Date(rec.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                                                                        </div>
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteRecord(selectedStudentId, rec.id)}
                                                                        className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                                                                        title="حذف المخالفة"
                                                                    >
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center space-y-2">
                                        <ShieldBan className="w-12 h-12 text-slate-300 mx-auto" />
                                        <p className="font-bold text-slate-700 text-sm">حدد طالباً من القائمة للبدء بالتقييم أو إصدار تقرير</p>
                                        <p className="text-xs text-slate-400">تظهر المخالفات المسجلة من جميع مدرسي المواد تلقائياً في هذا السجل فور رصدها.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-slate-500 py-16 border-2 border-dashed rounded-3xl bg-slate-50">
                            <ShieldBan className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                            <p className="font-bold text-slate-700">يرجى اختيار مرحلة وشعبة لعرض قائمة الطلاب وسجل الانضباط.</p>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: ZERO POINTS ALERTS (STUDENTS REACHING 0 POINTS) */}
            {activeTab === 'zero_alerts' && (
                <div className="space-y-6">
                    <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white p-6 rounded-3xl shadow-lg flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-white/20 rounded-2xl">
                                <Flame className="w-8 h-8 text-white animate-bounce" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black">
                                    مركز تنبيهات استنفاد النقاط (0 / {maxPoints}) - استدعاء أولياء الأمور
                                </h3>
                                <p className="text-xs text-red-100 mt-1">
                                    الطلاب الذين استنفدوا كامل رصيد نقاط الانضباط المحددة ويتطلب استخراج تقرير استدعاء ولي الأمر وتوقيع التعهد
                                </p>
                            </div>
                        </div>

                        <span className="text-2xl font-black bg-white text-red-700 px-4 py-1.5 rounded-2xl shadow-md">
                            {zeroPointsStudents.length} طلاب
                        </span>
                    </div>

                    {zeroPointsStudents.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {zeroPointsStudents.map(({ student, classData, totalDeductions, activeRecords }) => {
                                const photo = getStudentPhoto(student);

                                return (
                                    <div key={student.id} className="bg-white border-2 border-red-200 rounded-3xl p-5 shadow-sm space-y-4 hover:border-red-400 transition-all">
                                        <div className="flex items-center gap-3">
                                            <div className="w-14 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0 flex items-center justify-center">
                                                {photo ? (
                                                    <img src={photo} alt={student.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                ) : (
                                                    <UserCheck className="w-6 h-6 text-slate-400" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-sm text-slate-900 truncate">{student.name}</h4>
                                                <p className="text-xs text-slate-500 font-semibold">{classData.stage} - {classData.section}</p>
                                                <span className="inline-block mt-1 bg-red-100 text-red-800 text-[11px] font-black px-2 py-0.5 rounded-md">
                                                    النقاط: 0 / {maxPoints} ({totalDeductions} خصم مسجل)
                                                </span>
                                            </div>
                                        </div>

                                        <div className="bg-slate-50 p-2.5 rounded-xl text-xs space-y-1 text-slate-700">
                                            <p className="font-semibold text-[11px] text-slate-500">آخر مخالفة مسجلة:</p>
                                            <p className="font-bold text-red-800 truncate">
                                                {activeRecords[activeRecords.length - 1]?.criterionTitle || 'مخالفة انضباط'}
                                            </p>
                                            <p className="text-[10px] text-slate-400">
                                                بواسطة: {activeRecords[activeRecords.length - 1]?.teacherName || 'المدرس'} ({activeRecords[activeRecords.length - 1]?.subjectName || 'عام'})
                                            </p>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => setReportStudent({ student, classData })}
                                                className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs"
                                            >
                                                <FileText size={14} />
                                                <span>استخراج التقرير</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setArchiveTargetStudent({ student, classData })}
                                                className="py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-xs"
                                            >
                                                <RotateCcw size={14} />
                                                <span>أرشفة وفرصة</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-12 text-center space-y-2">
                            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                            <h4 className="font-bold text-emerald-900 text-base">لا يوجد أي طالب مستنفد للنقاط حالياً</h4>
                            <p className="text-xs text-emerald-700">جميع طلبة المدرسة يملكون رصيد نقاط إيجابي ومنضبط.</p>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: DISCIPLINE CRITERIA & MAX POINTS MANAGEMENT */}
            {activeTab === 'criteria_settings' && (
                <div className="space-y-6">
                    {/* Max Points Setting Card */}
                    <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 rounded-3xl shadow-md flex flex-col md:flex-row items-center justify-between gap-6 border border-slate-800">
                        <div className="space-y-1">
                            <h3 className="text-lg font-black flex items-center gap-2">
                                <Award className="w-6 h-6 text-amber-400" />
                                إعداد مجموع نقاط الانضباط الممنوحة لجميع الطلبة
                            </h3>
                            <p className="text-xs text-slate-300">
                                القيمة الافتراضية هي 10 نقاط. يمكنك زيادتها أو تقليلها لجميع طلبة المدرسة دفعة واحدة.
                            </p>
                        </div>

                        <div className="flex items-center gap-3 bg-slate-800/90 p-2 rounded-2xl border border-slate-700">
                            {[10, 15, 20, 25, 50].map(val => (
                                <button
                                    key={val}
                                    type="button"
                                    onClick={() => handleUpdateMaxPoints(val)}
                                    disabled={isSavingSettings}
                                    className={`px-3.5 py-2 rounded-xl font-black text-xs sm:text-sm transition-all cursor-pointer ${
                                        maxPoints === val
                                            ? 'bg-amber-500 text-slate-950 shadow-md scale-105'
                                            : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                                    }`}
                                >
                                    {val} نقاط
                                </button>
                            ))}

                            <div className="flex items-center gap-1 pr-2 border-r border-slate-700">
                                <input
                                    type="number"
                                    min="1"
                                    max="100"
                                    value={maxPoints}
                                    onChange={e => handleUpdateMaxPoints(Number(e.target.value))}
                                    className="w-16 p-1.5 rounded-lg bg-slate-900 border border-slate-600 text-center font-black text-sm text-white"
                                />
                                <span className="text-xs text-slate-400">نقطة</span>
                            </div>
                        </div>
                    </div>

                    {/* Criteria List Management */}
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                                    <ShieldCheckIcon />
                                    معايير السلوك والانضباط المدرسي ({disciplineSettings.criteria?.length || 0})
                                </h3>
                                <p className="text-xs text-slate-500">
                                    هذه المعايير تظهر لجميع المدرسين في بواباتهم لتقييم الطلبة يومياً بسهولة
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsAddingCriterion(!isAddingCriterion)}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                                >
                                    <Plus size={16} />
                                    <span>إضافة معيار جديد</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={handleResetCriteriaDefaults}
                                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                                >
                                    استعادة الافتراضي
                                </button>
                            </div>
                        </div>

                        {/* Add New Criterion Modal / Form */}
                        {isAddingCriterion && (
                            <div className="bg-indigo-50/70 border border-indigo-200 rounded-3xl p-5 space-y-4">
                                <h4 className="font-bold text-indigo-950 text-sm flex items-center gap-2">
                                    <Plus size={16} className="text-indigo-600" />
                                    إضافة معيار انضباط مخصص جديد
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-slate-700 mb-1">
                                            عنوان المخالفة / المعيار:
                                        </label>
                                        <input
                                            type="text"
                                            value={newCritTitle}
                                            onChange={e => setNewCritTitle(e.target.value)}
                                            placeholder="مثلاً: مغادرة القاعة دون إذن، إحضار ألعاب إلكترونية..."
                                            className="w-full p-2.5 border rounded-xl text-xs sm:text-sm bg-white font-medium focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">
                                            تصنيف المعيار:
                                        </label>
                                        <select
                                            value={newCritCategory}
                                            onChange={e => setNewCritCategory(e.target.value as any)}
                                            className="w-full p-2.5 border rounded-xl text-xs sm:text-sm bg-white font-bold"
                                        >
                                            <option value="سلوكي">سلوكي</option>
                                            <option value="أكاديمي">أكاديمي</option>
                                            <option value="التزام ونظام">التزام ونظام</option>
                                            <option value="أخلاقي">أخلاقي</option>
                                            <option value="عام">عام</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-3">
                                        <label className="block text-xs font-bold text-slate-700 mb-1">
                                            وصف تفصيلي للمعيار (اختياري):
                                        </label>
                                        <input
                                            type="text"
                                            value={newCritDesc}
                                            onChange={e => setNewCritDesc(e.target.value)}
                                            placeholder="وصف مختصر لمساعدة المدرسين على تصنيف السلوك بدقة..."
                                            className="w-full p-2.5 border rounded-xl text-xs sm:text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddingCriterion(false)}
                                        className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-bold"
                                    >
                                        إلغاء
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAddCriterion}
                                        className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                                    >
                                        حفظ المعيار
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Criteria Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {(disciplineSettings.criteria || DEFAULT_DISCIPLINE_CRITERIA).map((crit, idx) => (
                                <div
                                    key={crit.id}
                                    className={`p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                                        crit.isActive !== false
                                            ? 'bg-white border-slate-200 shadow-xs'
                                            : 'bg-slate-50 border-slate-200 opacity-60'
                                    }`}
                                >
                                    <div className="space-y-1 flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-slate-400">{idx + 1}.</span>
                                            <h4 className="font-bold text-sm text-slate-900">{crit.title}</h4>
                                            <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md">
                                                {crit.category || 'سلوكي'}
                                            </span>
                                        </div>
                                        {crit.description && (
                                            <p className="text-xs text-slate-500 leading-relaxed">{crit.description}</p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <span className="text-xs font-black text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-lg">
                                            -{crit.deductionPoints || 1} نقطة
                                        </span>

                                        <button
                                            type="button"
                                            onClick={() => handleToggleCriterion(crit.id)}
                                            className={`p-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                                                crit.isActive !== false
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                    : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
                                            }`}
                                            title={crit.isActive !== false ? 'تعطيل المعيار' : 'تفعيل المعيار'}
                                        >
                                            {crit.isActive !== false ? <Check size={14} /> : <X size={14} />}
                                        </button>

                                        {!crit.isDefault && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteCriterion(crit.id)}
                                                className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer"
                                                title="حذف المعيار"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 4: ARCHIVE LOGS & GRANTED CHANCES */}
            {activeTab === 'archive_logs' && (
                <div className="space-y-4">
                    <div className="border-b pb-3 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                                <History className="w-5 h-5 text-indigo-600" />
                                سجل الأرشيف والفرص الجديدة الممنوحة للطلبة
                            </h3>
                            <p className="text-xs text-slate-500">
                                توثيق جميع الحالات التي تمت معالجتها وأرشفتها مع ذكر أسباب منح الفرص الجديدة
                            </p>
                        </div>

                        <span className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-xl font-bold">
                            إجمالي السجلات: {archiveLogs.length}
                        </span>
                    </div>

                    {archiveLogs.length > 0 ? (
                        <div className="border rounded-2xl overflow-hidden shadow-xs">
                            <table className="w-full text-right text-xs">
                                <thead className="bg-slate-900 text-white font-bold">
                                    <tr>
                                        <th className="p-3 text-center w-10">ت</th>
                                        <th className="p-3">اسم الطالب</th>
                                        <th className="p-3">الصف والشعبة</th>
                                        <th className="p-3">تاريخ الأرشفة</th>
                                        <th className="p-3">المخالفات المؤرشفة</th>
                                        <th className="p-3">سبب منح الفرصة الجديدة</th>
                                        <th className="p-3">المسؤول</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {archiveLogs.map((log, idx) => (
                                        <tr key={log.id || idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                            <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                                            <td className="p-3 font-bold text-indigo-950">{log.studentName}</td>
                                            <td className="p-3 font-semibold text-slate-700">{log.stage} - {log.section}</td>
                                            <td className="p-3 font-mono text-slate-500">
                                                {new Date(log.archivedAt).toLocaleDateString('ar-EG')}
                                            </td>
                                            <td className="p-3">
                                                <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-md font-bold text-[11px]">
                                                    {log.previousTotalDeductions} نقاط ({log.recordsCount} مخالفة)
                                                </span>
                                            </td>
                                            <td className="p-3 font-medium text-slate-800 max-w-xs">{log.reason}</td>
                                            <td className="p-3 font-bold text-slate-600">{log.archivedByName}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                            <History className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="text-slate-500 text-xs font-bold">لا يوجد سجلات أرشفة سابقة حتى الآن.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Discipline Report Modal (Word / PDF) */}
            {reportStudent && (
                <DisciplineReportModal
                    isOpen={!!reportStudent}
                    onClose={() => setReportStudent(null)}
                    student={reportStudent.student}
                    classData={reportStudent.classData}
                    settings={settings}
                    records={allRecords[reportStudent.student.id] || []}
                    maxPoints={maxPoints}
                    currentPoints={getStudentData(reportStudent.student.id).currentPoints}
                    studentPhotoUrl={getStudentPhoto(reportStudent.student) || undefined}
                    currentUser={principal}
                    onArchiveAndReset={handleArchiveAndReset}
                />
            )}

            {/* Archive & Grant New Chance Modal Dialog */}
            {archiveTargetStudent && (
                <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4">
                        <div className="flex items-center gap-3 text-amber-600 border-b pb-3">
                            <RotateCcw className="w-6 h-6" />
                            <h3 className="font-bold text-base text-slate-900">
                                أرشفة تقييمات الطالب ومنح فرصة جديدة
                            </h3>
                        </div>

                        <p className="text-xs text-slate-600 leading-relaxed">
                            سيتم أرشفة جميع المخالفات النشطة للطالب <b>({archiveTargetStudent.student.name})</b>، وإعادة تعيين رصيده إلى <b>({maxPoints} نقاط كاملة)</b>.
                            سيتم إرسال إشعار فوري للطالب ومدرسي الشعبة بهذا الإجراء والسبب المسجل.
                        </p>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                سبب الإجراء / سبب منح الفرصة الجديدة (تعهد ولي الأمر، تحسن السلوك، إلخ):
                            </label>
                            <textarea
                                value={archiveReasonText}
                                onChange={e => setArchiveReasonText(e.target.value)}
                                rows={3}
                                placeholder="اكتب سبب الأرشفة ومنح الفرصة..."
                                className="w-full p-3 border rounded-xl text-xs sm:text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 font-medium"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setArchiveTargetStudent(null)}
                                disabled={isArchiving}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold"
                            >
                                إلغاء
                            </button>

                            <button
                                type="button"
                                onClick={() => handleArchiveAndReset(archiveTargetStudent.student, archiveReasonText)}
                                disabled={isArchiving || !archiveReasonText.trim()}
                                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                                <Sparkles size={14} />
                                <span>{isArchiving ? 'جاري الأرشفة...' : 'تأكيد الأرشفة ومنح النقاط'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Telegram Result Modal */}
            {telegramLogModal && telegramLogModal.open && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
                        <div className="bg-slate-900 text-white p-4 flex justify-between items-center">
                            <div className="flex items-center gap-2 font-bold text-base">
                                <Send size={18} className="text-cyan-400" />
                                <span>{telegramLogModal.title}</span>
                            </div>
                            <button 
                                onClick={() => setTelegramLogModal(null)}
                                className="p-1 hover:bg-slate-800 rounded-full transition-colors cursor-pointer text-slate-300 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2 text-xs sm:text-sm">
                            {telegramLogModal.logs.map((log, index) => (
                                <div 
                                    key={index} 
                                    className={`p-2.5 rounded-xl border font-medium text-right ${
                                        log.startsWith('✅') ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                        log.startsWith('❌') ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                        log.startsWith('⚠️') ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                        'bg-slate-50 text-slate-700 border-slate-200'
                                    }`}
                                >
                                    {log}
                                </div>
                            ))}
                        </div>

                        <div className="bg-slate-100 p-4 text-center border-t">
                            <button 
                                onClick={() => setTelegramLogModal(null)}
                                className="px-6 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors cursor-pointer text-xs"
                            >
                                إغلاق
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ShieldCheckIcon() {
    return <CheckCircle2 className="w-5 h-5 text-indigo-600" />;
}
