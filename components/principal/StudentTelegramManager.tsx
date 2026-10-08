import React, { useState, useEffect, useMemo } from 'react';
import type { ClassData, SchoolSettings, User, Student } from '../../types.ts';
import { db } from '../../lib/firebase.ts';
import { 
    Send, Lock, Unlock, Search, Filter, CheckCircle2, XCircle, 
    ShieldAlert, Save, RefreshCw, Sparkles, UserCheck, UserX,
    MessageSquare, AlertCircle, Check, Users, Shield, Copy
} from 'lucide-react';

interface StudentTelegramManagerProps {
    classes: ClassData[];
    currentUser: User;
    settings: SchoolSettings;
}

interface StudentWithClass extends Student {
    classId: string;
    stage: string;
    section: string;
}

export default function StudentTelegramManager({ classes, currentUser, settings }: StudentTelegramManagerProps) {
    const principalId = currentUser.principalId || currentUser.id || 'principal_al_hamza';

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStage, setSelectedStage] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'linked' | 'unlinked' | 'locked' | 'unlocked'>('all');
    
    // Telegram Locks State
    const [lockAll, setLockAll] = useState<boolean>(false);
    const [lockedStudents, setLockedStudents] = useState<Record<string, boolean>>({});
    const [loadingLocks, setLoadingLocks] = useState<boolean>(true);

    // Editable Inputs State: studentId -> telegramChatId
    const [telegramInputs, setTelegramInputs] = useState<Record<string, string>>({});
    const [savingStudentId, setSavingStudentId] = useState<string | null>(null);
    const [successStudentId, setSuccessStudentId] = useState<string | null>(null);

    // Listen to telegram locks
    useEffect(() => {
        const locksRef = db.ref(`telegram_locks/${principalId}`);
        const callback = (snap: any) => {
            if (snap.exists()) {
                const val = snap.val();
                setLockAll(!!val.lockAll);
                setLockedStudents(val.lockedStudents || {});
            } else {
                setLockAll(false);
                setLockedStudents({});
            }
            setLoadingLocks(false);
        };
        locksRef.on('value', callback);
        return () => {
            locksRef.off('value', callback);
        };
    }, [principalId]);

    // Flatten all students with their class info
    const allStudentsList = useMemo(() => {
        const list: StudentWithClass[] = [];
        classes.forEach(c => {
            (c.students || []).forEach(s => {
                if (s && s.id) {
                    list.push({
                        ...s,
                        classId: c.id,
                        stage: c.stage,
                        section: c.section
                    });
                }
            });
        });
        return list;
    }, [classes]);

    // Populate telegramInputs on initial load or when student list changes
    useEffect(() => {
        const initialInputs: Record<string, string> = {};
        allStudentsList.forEach(s => {
            initialInputs[s.id] = s.telegramChatId || '';
        });
        setTelegramInputs(initialInputs);
    }, [allStudentsList]);

    // Available stages for filtering
    const stagesList = useMemo(() => {
        const set = new Set<string>();
        classes.forEach(c => {
            if (c.stage) set.add(`${c.stage} - ${c.section}`);
        });
        return Array.from(set);
    }, [classes]);

    // Filtered students list
    const filteredStudents = useMemo(() => {
        return allStudentsList.filter(s => {
            // Search
            const q = searchQuery.toLowerCase().trim();
            const matchesSearch = !q || 
                s.name.toLowerCase().includes(q) ||
                (s.examId && s.examId.toLowerCase().includes(q)) ||
                (s.studentAccessCode && s.studentAccessCode.toLowerCase().includes(q)) ||
                ((telegramInputs[s.id] || s.telegramChatId) && (telegramInputs[s.id] || s.telegramChatId || '').toLowerCase().includes(q));

            // Stage/Section Filter
            const classKey = `${s.stage} - ${s.section}`;
            const matchesStage = selectedStage === 'all' || classKey === selectedStage;

            // Lock / Link status filter
            const isLocked = lockAll || !!lockedStudents[s.id] || (!!s.name && !!lockedStudents[s.name.trim()]);
            const isLinked = !!s.telegramChatId && s.telegramChatId.trim() !== '';

            let matchesStatus = true;
            if (statusFilter === 'linked') matchesStatus = isLinked;
            else if (statusFilter === 'unlinked') matchesStatus = !isLinked;
            else if (statusFilter === 'locked') matchesStatus = isLocked;
            else if (statusFilter === 'unlocked') matchesStatus = !isLocked;

            return matchesSearch && matchesStage && matchesStatus;
        });
    }, [allStudentsList, searchQuery, selectedStage, statusFilter, lockAll, lockedStudents, telegramInputs]);

    // Statistics
    const stats = useMemo(() => {
        const total = allStudentsList.length;
        const linked = allStudentsList.filter(s => !!s.telegramChatId && s.telegramChatId.trim() !== '').length;
        const unlinked = total - linked;
        const locked = allStudentsList.filter(s => lockAll || !!lockedStudents[s.id] || (!!s.name && !!lockedStudents[s.name.trim()])).length;
        return { total, linked, unlinked, locked };
    }, [allStudentsList, lockAll, lockedStudents]);

    // Toggle global lock
    const handleToggleLockAll = async () => {
        const nextState = !lockAll;
        const msg = nextState 
            ? "هل أنت متأكد من قفل تعديل آيدي التليكرام عن جميع الطلاب؟ لن يستطيع أي طالب تغيير معرفه من حسابه." 
            : "هل أنت متأكد من إلغاء قفل تعديل آيدي التليكرام عن جميع الطلاب؟";
        if (window.confirm(msg)) {
            try {
                await db.ref(`telegram_locks/${principalId}/lockAll`).set(nextState);
            } catch (e) {
                alert("حدث خطأ أثناء تغيير حالة القفل العام.");
            }
        }
    };

    // Toggle individual student lock
    const handleToggleStudentLock = async (studentId: string, studentName: string) => {
        const isSingleLocked = !!lockedStudents[studentId] || !!lockedStudents[studentName.trim()];
        const nextLock = !isSingleLocked;
        try {
            await db.ref(`telegram_locks/${principalId}/lockedStudents/${studentId}`).set(nextLock ? true : null);
            if (studentName) {
                await db.ref(`telegram_locks/${principalId}/lockedStudents/${studentName.trim()}`).set(nextLock ? true : null);
            }
        } catch (e) {
            alert("حدث خطأ أثناء تغيير حالة قفل الطالب.");
        }
    };

    // Save individual student telegram chat ID
    const handleSaveTelegramId = async (student: StudentWithClass) => {
        const newChatId = (telegramInputs[student.id] || '').trim();
        setSavingStudentId(student.id);
        try {
            // Find class and student index
            const targetClass = classes.find(c => c.id === student.classId);
            if (targetClass && targetClass.students) {
                const studentIndex = targetClass.students.findIndex(s => s.id === student.id);
                if (studentIndex !== -1) {
                    await db.ref(`classes/${targetClass.id}/students/${studentIndex}/telegramChatId`).set(newChatId);
                }
            }

            // Also update student_saved_forms
            const studentKey = student.id || student.studentAccessCode || student.examId || 'default_student';
            await db.ref(`student_saved_forms/${principalId}/${studentKey}`).update({
                telegramChatId: newChatId,
                updatedAt: new Date().toISOString()
            }).catch(() => {});

            if (student.name) {
                await db.ref(`student_saved_forms/${principalId}/${student.name.trim()}`).update({
                    telegramChatId: newChatId,
                    updatedAt: new Date().toISOString()
                }).catch(() => {});
            }

            setSuccessStudentId(student.id);
            setTimeout(() => setSuccessStudentId(null), 3000);
        } catch (e) {
            console.error(e);
            alert("حدث خطأ أثناء حفظ معرف التليكرام للطالب.");
        } finally {
            setSavingStudentId(null);
        }
    };

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6" dir="rtl" style={{ fontFamily: "'Cairo', sans-serif" }}>
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-sky-800 via-blue-800 to-indigo-900 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border border-sky-600/30">
                <div className="flex items-center gap-4">
                    <div className="p-3.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-inner">
                        <Send className="w-8 h-8 text-sky-300" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-black">إدارة معرفات التليكرام للطلاب</h1>
                            <span className="px-3 py-0.5 bg-sky-500/30 border border-sky-300/40 text-sky-200 text-xs font-bold rounded-full">
                                معاون شؤون الطلبة
                            </span>
                        </div>
                        <p className="text-xs sm:text-sm text-sky-100 mt-1">
                            إدارة وربط Chat ID الخاص بالتليكرام للطلبة، والتحكم بقفل أو فتح إمكانية التعديل للطلاب.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 self-stretch md:self-auto justify-end">
                    <button
                        onClick={handleToggleLockAll}
                        className={`px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md flex items-center justify-center gap-2 ${
                            lockAll 
                                ? 'bg-amber-400 hover:bg-amber-300 text-amber-950 border border-amber-500' 
                                : 'bg-red-600 hover:bg-red-700 text-white'
                        }`}
                    >
                        {lockAll ? <Unlock size={18} /> : <Lock size={18} />}
                        <span>{lockAll ? 'إلغاء قفل التعديل عن الجميع' : 'قفل التعديل لجميع الطلاب 🔒'}</span>
                    </button>
                </div>
            </div>

            {/* Quick Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
                        <Users size={22} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500">إجمالي الطلاب</p>
                        <p className="text-xl font-black text-gray-800">{stats.total}</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="p-3 bg-green-100 text-green-700 rounded-xl">
                        <CheckCircle2 size={22} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500">مرتبط بالتليكرام</p>
                        <p className="text-xl font-black text-green-700">{stats.linked}</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
                        <XCircle size={22} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500">غير مرتبط بعد</p>
                        <p className="text-xl font-black text-amber-700">{stats.unlinked}</p>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="p-3 bg-red-100 text-red-700 rounded-xl">
                        <Lock size={22} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500">مقفل التعديل</p>
                        <p className="text-xl font-black text-red-700">{stats.locked}</p>
                    </div>
                </div>
            </div>

            {/* Global Lock Notice Banner if active */}
            {lockAll && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 text-amber-900 text-xs sm:text-sm font-bold flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-2">
                        <Lock className="w-5 h-5 text-amber-600 flex-shrink-0 animate-bounce" />
                        <span>تنبيه: تم قفل إمكانية إدخال أو تغيير معرف التليكرام لجميع الطلاب من قبل المعاون.</span>
                    </div>
                    <button
                        onClick={handleToggleLockAll}
                        className="px-3 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs rounded-lg font-bold transition flex items-center gap-1 border border-amber-400"
                    >
                        <Unlock size={14} />
                        <span>إلغاء القفل العام</span>
                    </button>
                </div>
            )}

            {/* Search and Filters Bar */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                <div className="flex-1 relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="بحث باسم الطالب، الرقم الامتحاني، رمز الدخول، أو الآيدي..."
                        className="w-full pr-9 pl-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Stage Dropdown */}
                    <div className="flex items-center gap-1">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <select
                            value={selectedStage}
                            onChange={(e) => setSelectedStage(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold text-gray-700 focus:ring-2 focus:ring-sky-500 focus:outline-none bg-white"
                        >
                            <option value="all">كل الصفوف والشعب ({allStudentsList.length})</option>
                            {stagesList.map(st => (
                                <option key={st} value={st}>{st}</option>
                            ))}
                        </select>
                    </div>

                    {/* Status Filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-xs font-bold text-gray-700 focus:ring-2 focus:ring-sky-500 focus:outline-none bg-white"
                    >
                        <option value="all">جميع الحالات</option>
                        <option value="linked">مرتبط فقط ✅</option>
                        <option value="unlinked">غير مرتبط فقط ⚠️</option>
                        <option value="locked">مقفل التعديل 🔒</option>
                        <option value="unlocked">مفتوح التعديل 🔓</option>
                    </select>
                </div>
            </div>

            {/* Students Table */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                    <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
                        <span>قائمة الطلاب ({filteredStudents.length})</span>
                    </h2>
                    <span className="text-xs text-gray-500 font-medium">
                        تحديث تلقائي وفوري عند إضافة الطالب لمعرفه بنفسه
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs sm:text-sm">
                        <thead className="bg-gray-100 text-gray-700 font-bold border-b border-gray-200">
                            <tr>
                                <th className="p-3">#</th>
                                <th className="p-3">اسم الطالب</th>
                                <th className="p-3">الصف والشعبة</th>
                                <th className="p-3">الرقم الامتحاني / الكود</th>
                                <th className="p-3">معرف التليكرام (Chat ID)</th>
                                <th className="p-3 text-center">حالة القفل للطالب</th>
                                <th className="p-3 text-center">إجراءات المعاون</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                            {filteredStudents.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center p-8 text-gray-500">
                                        لا توجد نتائج مطابقة للبحث أو الفلتر المحدد.
                                    </td>
                                </tr>
                            ) : (
                                filteredStudents.map((student, idx) => {
                                    const isLocked = lockAll || !!lockedStudents[student.id] || (!!student.name && !!lockedStudents[student.name.trim()]);
                                    const isSingleLocked = !!lockedStudents[student.id] || (!!student.name && !!lockedStudents[student.name.trim()]);
                                    const isLinked = !!student.telegramChatId && student.telegramChatId.trim() !== '';
                                    const currentInputVal = telegramInputs[student.id] ?? (student.telegramChatId || '');

                                    return (
                                        <tr key={student.id} className="hover:bg-sky-50/40 transition">
                                            <td className="p-3 font-bold text-gray-400">{idx + 1}</td>
                                            <td className="p-3 font-bold text-gray-900">
                                                <div className="flex items-center gap-2">
                                                    <span>{student.name}</span>
                                                    {isLinked ? (
                                                        <span className="w-2 h-2 rounded-full bg-green-500" title="مرتبط بالتليكرام"></span>
                                                    ) : (
                                                        <span className="w-2 h-2 rounded-full bg-amber-400" title="غير مرتبط"></span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 font-bold text-sky-800">
                                                <span className="bg-sky-100 text-sky-900 px-2.5 py-1 rounded-md text-xs border border-sky-200">
                                                    {student.stage} - {student.section}
                                                </span>
                                            </td>
                                            <td className="p-3 font-mono text-gray-600">
                                                {student.examId || student.studentAccessCode || '—'}
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-1.5">
                                                    <input
                                                        type="text"
                                                        value={currentInputVal}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            setTelegramInputs(prev => ({ ...prev, [student.id]: val }));
                                                        }}
                                                        placeholder="مثال: 589123456"
                                                        className="w-36 px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs font-mono dir-ltr focus:ring-2 focus:ring-sky-500 focus:outline-none bg-white"
                                                    />
                                                    {isLinked && (
                                                        <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-bold border border-green-300">
                                                            مرتبط
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => handleToggleStudentLock(student.id, student.name)}
                                                    disabled={lockAll}
                                                    title={lockAll ? 'القفل العام مفعل لجميع الطلاب' : 'انقر لتغيير حالة القفل لهذا الطالب'}
                                                    className={`px-3 py-1 rounded-full text-xs font-bold transition inline-flex items-center gap-1 border ${
                                                        lockAll
                                                            ? 'bg-amber-100 text-amber-900 border-amber-300 cursor-not-allowed opacity-80'
                                                            : isSingleLocked
                                                            ? 'bg-red-100 hover:bg-red-200 text-red-800 border-red-300'
                                                            : 'bg-green-100 hover:bg-green-200 text-green-800 border-green-300'
                                                    }`}
                                                >
                                                    {lockAll || isSingleLocked ? <Lock size={12} /> : <Unlock size={12} />}
                                                    <span>
                                                        {lockAll ? 'مقفل (عام)' : isSingleLocked ? 'مقفل 🔒' : 'مفتوح 🔓'}
                                                    </span>
                                                </button>
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => handleSaveTelegramId(student)}
                                                    disabled={savingStudentId === student.id}
                                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 mx-auto ${
                                                        successStudentId === student.id
                                                            ? 'bg-green-600 text-white'
                                                            : 'bg-sky-600 hover:bg-sky-700 text-white shadow-xs'
                                                    }`}
                                                >
                                                    {savingStudentId === student.id ? (
                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                    ) : successStudentId === student.id ? (
                                                        <Check className="w-3.5 h-3.5 text-white" />
                                                    ) : (
                                                        <Save className="w-3.5 h-3.5" />
                                                    )}
                                                    <span>{successStudentId === student.id ? 'تم الحفظ!' : 'حفظ'}</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
