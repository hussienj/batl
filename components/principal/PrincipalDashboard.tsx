import React, { useState, useMemo, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import type { User, ClassData, TeacherAssignment, SchoolSettings } from '../../types.ts';
import { Plus, UserPlus, Copy, Check, Trash2, Edit, Edit2, Save, X, Download, Loader2, Shield, PlayCircle, GraduationCap, Users, ShieldCheck, ListChecks, Compass, FileSpreadsheet, FileText, Table, Sparkles, BookOpen, Search, RotateCcw, AlertTriangle } from 'lucide-react';
import TeacherCodesPDF from './TeacherCodesPDF.tsx';
import { db } from '../../lib/firebase.ts';
import { GRADE_LEVELS, compareClasses } from '../../constants.ts';
import TeacherScheduleTableModal from './TeacherScheduleTableModal.tsx';
import {
    buildTeacherTableData,
    exportTeachersToExcel,
    exportTeachersToWord
} from './TeacherTableExporter.ts';
import { exportSubjectCommitteesPDF } from './SubjectCommitteesExporter.tsx';

declare const jspdf: any;
declare const html2canvas: any;

interface PrincipalDashboardProps {
    principal: User;
    classes: ClassData[];
    users: User[];
    settings?: SchoolSettings;
    addUser: (user: Omit<User, 'id' | 'assignments'> & { assignments: TeacherAssignment[] }) => User;
    updateUser: (userId: string, updater: (user: User) => User) => void;
    deleteUser: (userId: string) => void;
}

const generateCode = (length: number) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

export default function PrincipalDashboard({ principal, classes, users, settings, addUser, updateUser, deleteUser }: PrincipalDashboardProps) {
    const [newUserName, setNewUserName] = useState('');
    const [newUserRole, setNewUserRole] = useState<'teacher' | 'counselor' | 'assistant'>('teacher');
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
    const [assignedStages, setAssignedStages] = useState<string[]>([]);
    const [advisorClassId, setAdvisorClassId] = useState<string>('');
    const [isExportingCodes, setIsExportingCodes] = useState(false);
    const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
    const [isTeacherTableModalOpen, setIsTeacherTableModalOpen] = useState(false);
    const [isExportingWord, setIsExportingWord] = useState(false);
    const [isExportingExcel, setIsExportingExcel] = useState(false);
    const [isExportingCommitteesPDF, setIsExportingCommitteesPDF] = useState(false);
    const [exportProgressMsg, setExportProgressMsg] = useState('');
    const [classQuotas, setClassQuotas] = useState<Record<string, Record<string, number>>>({});

    // Search and Inline Edit State
    const [searchTerm, setSearchTerm] = useState('');
    const [editingTeacherNameId, setEditingTeacherNameId] = useState<string | null>(null);
    const [editingTeacherNameValue, setEditingTeacherNameValue] = useState('');

    useEffect(() => {
        if (!principal?.id) return;
        const quotasRef = db.ref(`schedule_quotas/${principal.id}`);
        quotasRef.get().then(snap => {
            if (snap.exists()) {
                setClassQuotas(snap.val() || {});
            }
        }).catch(err => {
            console.error('Error fetching schedule quotas:', err);
        });
    }, [principal?.id]);

    const staff = users.filter(u => (u.role === 'teacher' || u.role === 'counselor' || u.role === 'assistant') && u.principalId === principal.id);
    const teachersAndStaff = staff.sort((a, b) => a.name.localeCompare(b.name, 'ar-IQ'));
    
    const teachersList = useMemo(() => staff.filter(u => u.role === 'teacher'), [staff]);
    const teachersCount = teachersList.length;
    const counselorsCount = staff.filter(u => u.role === 'counselor').length;
    const assistantsCount = staff.filter(u => u.role === 'assistant').length;

    // Filtered staff based on search query
    const filteredStaff = useMemo(() => {
        if (!searchTerm.trim()) return teachersAndStaff;
        const query = searchTerm.trim().toLowerCase();
        return teachersAndStaff.filter(u => 
            u.name.toLowerCase().includes(query) ||
            (u.code && u.code.toLowerCase().includes(query))
        );
    }, [teachersAndStaff, searchTerm]);

    const teacherTableData = useMemo(() => {
        return buildTeacherTableData(teachersList, classes, classQuotas, settings?.schoolLevel);
    }, [teachersList, classes, classQuotas, settings?.schoolLevel]);

    const totalWeeklyPeriods = useMemo(() => {
        return teacherTableData.reduce((sum, r) => sum + r.weeklyPeriods, 0);
    }, [teacherTableData]);

    const handleQuickExportExcel = () => {
        if (teacherTableData.length === 0) {
            alert('لا يوجد مدرسين لتصدير جدولهم.');
            return;
        }
        try {
            setIsExportingExcel(true);
            exportTeachersToExcel(teacherTableData, settings);
        } catch (err) {
            console.error('Export Excel error:', err);
            alert('حدث خطأ أثناء تصدير ملف Excel.');
        } finally {
            setIsExportingExcel(false);
        }
    };

    const handleQuickExportWord = async () => {
        if (teacherTableData.length === 0) {
            alert('لا يوجد مدرسين لتصدير جدولهم.');
            return;
        }
        try {
            setIsExportingWord(true);
            await exportTeachersToWord(teacherTableData, settings);
        } catch (err) {
            console.error('Export Word error:', err);
            alert('حدث خطأ أثناء تصدير ملف Word.');
        } finally {
            setIsExportingWord(false);
        }
    };

    const handleExportCommitteesPDF = async () => {
        if (teachersList.length === 0) {
            alert('لا يوجد مدرسين لتصدير نصاب لجانهم.');
            return;
        }
        try {
            setIsExportingCommitteesPDF(true);
            await exportSubjectCommitteesPDF(teachersList, classes, settings, msg => {
                setExportProgressMsg(msg);
            });
        } catch (err) {
            console.error('Export committees PDF error:', err);
            alert('حدث خطأ أثناء تصدير ملف PDF لنصاب اللجان.');
        } finally {
            setIsExportingCommitteesPDF(false);
            setExportProgressMsg('');
        }
    };

    const handleClearAllAssignments = async () => {
        if (teachersList.length === 0) {
            alert('لا يوجد مدرسين مسجلين في المدرسة.');
            return;
        }

        const confirmMessage = 
            '⚠️ تحذير إداري:\n\n' +
            'هل أنت متأكد من رغبتك في مسح وتفريغ جميع المواد والشعب المسندة لكافة المدرسين دفعة واحدة؟\n\n' +
            '• سيتم تصفير نصاب ومواد جميع المدرسين لتصبح فارغة وجاهزة لإعادة التوزيع.\n' +
            '• لن يتم حذف أي حساب أو رقم سري للمدرسين.\n\n' +
            'هل ترغب بالمتابعة؟';

        if (!window.confirm(confirmMessage)) {
            return;
        }

        try {
            const updates: Record<string, any> = {};

            teachersList.forEach(t => {
                // Clear assignments in RTDB
                updates[`users/${t.id}/assignments`] = [];
                updates[`users/${t.id}/advisorClassId`] = null;

                if (t.advisorClassId) {
                    updates[`classes/${t.advisorClassId}/advisorTeacherId`] = null;
                }
            });

            await db.ref().update(updates);
            alert('✅ تم تفريغ ومسح جميع المواد والشعب المسندة لكافة المدرسين بنجاح.');
        } catch (err) {
            console.error('Error clearing assignments:', err);
            // Fallback to updating individually if batch update encounters any issue
            try {
                for (const t of teachersList) {
                    await db.ref(`users/${t.id}/assignments`).set([]);
                    await db.ref(`users/${t.id}/advisorClassId`).remove();
                    if (t.advisorClassId) {
                        await db.ref(`classes/${t.advisorClassId}/advisorTeacherId`).remove().catch(() => {});
                    }
                }
                alert('✅ تم تفريغ ومسح جميع المواد والشعب المسندة لكافة المدرسين بنجاح.');
            } catch (fallbackErr) {
                console.error('Fallback clearing assignments error:', fallbackErr);
                alert('حدث خطأ أثناء تفريغ المواد المسندة. يرجى التحقق من الاتصال.');
            }
        }
    };

    const handleStartEditName = (user: User) => {
        setEditingTeacherNameId(user.id);
        setEditingTeacherNameValue(user.name);
    };

    const handleCancelEditName = () => {
        setEditingTeacherNameId(null);
        setEditingTeacherNameValue('');
    };

    const handleSaveTeacherName = (userId: string) => {
        const trimmed = editingTeacherNameValue.trim();
        if (!trimmed) {
            alert('اسم المدرس لا يمكن أن يكون فارغاً.');
            return;
        }
        updateUser(userId, u => ({ ...u, name: trimmed }));
        setEditingTeacherNameId(null);
        setEditingTeacherNameValue('');
    };

    const sortedClassesForModal = useMemo(() => {
        return [...classes].sort(compareClasses);
    }, [classes]);

    const handleAddUser = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newUserName.trim()) return;

        addUser({
            name: newUserName.trim(),
            role: newUserRole,
            code: generateCode(7),
            principalId: principal.id,
            assignments: [],
            assignedStages: []
        } as any);

        setNewUserName('');
        setNewUserRole('teacher');
    };

    const handleEditAssignments = (user: User) => {
        setEditingUser(user);
        if (user.role === 'assistant') {
            setAssignedStages(user.assignedStages || []);
        } else {
            setAssignments(user.assignments || []);
            setAdvisorClassId(user.advisorClassId || '');
        }
    };
    
    const handleAssignmentChange = (classId: string, subjectId: string, isChecked: boolean) => {
        setAssignments(prev => {
            if (isChecked) {
                return [...prev, { classId, subjectId }];
            } else {
                return prev.filter(a => !(a.classId === classId && a.subjectId === subjectId));
            }
        });
    };

    const handleStageAssignmentChange = (stage: string, isChecked: boolean) => {
        setAssignedStages(prev => {
            if (isChecked) return [...prev, stage];
            return prev.filter(s => s !== stage);
        });
    };

    const handleSaveAssignments = async () => {
        if (!editingUser) return;
        if (editingUser.role === 'assistant') {
            updateUser(editingUser.id, user => ({ ...user, assignedStages }));
        } else {
            const taughtClassIds = assignments.map(a => a.classId);
            const validAdvisorClassId = taughtClassIds.includes(advisorClassId) ? advisorClassId : '';

            updateUser(editingUser.id, user => ({ 
                ...user, 
                assignments, 
                advisorClassId: validAdvisorClassId 
            }));

            try {
                await db.ref(`users/${editingUser.id}/advisorClassId`).set(validAdvisorClassId || null);
                if (editingUser.advisorClassId && editingUser.advisorClassId !== validAdvisorClassId) {
                    await db.ref(`classes/${editingUser.advisorClassId}/advisorTeacherId`).remove();
                }
                if (validAdvisorClassId) {
                    await db.ref(`classes/${validAdvisorClassId}/advisorTeacherId`).set(editingUser.id);
                }
            } catch (err) {
                console.error("Error syncing advisor class:", err);
            }
        }
        setEditingUser(null);
    };

    const copyToClipboard = (code: string) => {
        navigator.clipboard.writeText(code).then(() => {
            setCopiedCode(code);
            setTimeout(() => setCopiedCode(null), 2000);
        });
    };
    
    const handleExportCodes = async () => {
        const staffToExport = teachersAndStaff;
        if (staffToExport.length === 0) {
            alert("لا يوجد كادر لتصدير أرقامهم.");
            return;
        }
        setIsExportingCodes(true);

        const tempContainer = document.createElement('div');
        Object.assign(tempContainer.style, { position: 'absolute', left: '-9999px', top: '0' });
        document.body.appendChild(tempContainer);
        const root = ReactDOM.createRoot(tempContainer);

        const renderComponent = (component: React.ReactElement) => new Promise<void>(resolve => {
            root.render(component);
            setTimeout(resolve, 500);
        });

        try {
            await document.fonts.ready;
            await renderComponent(<TeacherCodesPDF teachers={staffToExport} />);

            const pdfElement = tempContainer.children[0] as HTMLElement;
            const canvas = await html2canvas(pdfElement, { scale: 2, useCORS: true });
            const imgData = canvas.toDataURL('image/png');

            const { jsPDF } = jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            pdf.addImage(imgData, 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, 'FAST');
            pdf.save(`staff_codes_${principal.schoolName}.pdf`);
        } catch (error) {
            console.error("PDF Export Error:", error);
            alert("حدث خطأ أثناء تصدير الأرقام السرية.");
        } finally {
            root.unmount();
            if (document.body.contains(tempContainer)) {
                document.body.removeChild(tempContainer);
            }
            setIsExportingCodes(false);
        }
    };
    
    const getRoleName = (role: string) => {
        if (role === 'teacher') return 'مدرس';
        if (role === 'counselor') return 'مرشد تربوي';
        if (role === 'assistant') return 'معاون شؤون طلبة';
        return '';
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-lg">
             {isVideoModalOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-[100] p-4"
                    onClick={() => setIsVideoModalOpen(false)}
                >
                    <div 
                        className="bg-black p-2 rounded-lg shadow-xl w-full max-w-4xl relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button 
                            onClick={() => setIsVideoModalOpen(false)}
                            className="absolute -top-3 -right-3 bg-white text-black rounded-full p-2 z-10 shadow-lg hover:scale-110 transition-transform"
                            aria-label="Close video"
                        >
                            <X size={24} />
                        </button>
                        <div className="relative w-full" style={{ paddingTop: '56.25%' }}> {/* 16:9 Aspect Ratio */}
                            <iframe
                                src="https://www.facebook.com/plugins/video.php?href=https%3A%2F%2Fwww.facebook.com%2F61578356680977%2Fvideos%2F643783455430949%2F&show_text=false&autoplay=1&mute=0"
                                className="absolute top-0 left-0 w-full h-full"
                                style={{ border: 'none', overflow: 'hidden' }}
                                title="Facebook video player"
                                frameBorder="0"
                                allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                                allowFullScreen={true}>
                            </iframe>
                        </div>
                    </div>
                </div>
            )}
            <h2 className="text-3xl font-bold text-gray-800 mb-6 border-b pb-4">لوحة تحكم المدير</h2>
             <div className="mb-6">
                <button
                    onClick={() => setIsVideoModalOpen(true)}
                    className="w-full flex items-center gap-4 p-3 bg-red-100 rounded-lg hover:bg-red-200 transition-all duration-300 hover:shadow-md text-red-700"
                >
                    <PlayCircle className="w-12 h-12 text-red-600" />
                    <div>
                        <h4 className="font-bold text-red-800">طريقة اضافة المدرس مع جولة سريعة</h4>
                        <p className="text-sm text-red-600">شاهد عرض الفيديو التوضيحي للخطوات بالتفصيل.</p>
                    </div>
                </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1">
                    <h3 className="text-xl font-bold text-gray-700 mb-4">إضافة كادر جديد</h3>
                    <form onSubmit={handleAddUser} className="space-y-4 bg-gray-50 p-4 rounded-lg border">
                        <div>
                            <label className="block text-md font-medium text-gray-700 mb-2">اسم الكادر</label>
                            <input
                                type="text"
                                value={newUserName}
                                onChange={(e) => setNewUserName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                                placeholder="الاسم الكامل"
                                required
                            />
                        </div>
                         <div>
                            <label className="block text-md font-medium text-gray-700 mb-2">الدور</label>
                            <select
                                value={newUserRole}
                                onChange={(e) => setNewUserRole(e.target.value as any)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white"
                            >
                                <option value="teacher">مدرس</option>
                                <option value="counselor">مرشد تربوي</option>
                                <option value="assistant">معاون شؤون طلبة</option>
                            </select>
                        </div>
                        <button type="submit" className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-cyan-600 text-white font-semibold rounded-lg hover:bg-cyan-700">
                            <Plus size={20} />
                            <span>إضافة</span>
                        </button>
                    </form>
                    <div className="mt-6 space-y-4">
                        <button 
                            onClick={handleExportCodes}
                            disabled={isExportingCodes}
                            className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400 shadow-xs"
                        >
                            {isExportingCodes ? <Loader2 className="animate-spin" /> : <Download size={20} />}
                            {isExportingCodes ? "جاري التصدير..." : "تصدير أرقام الدخول"}
                        </button>

                        {/* Official Teacher Table Exporter Card */}
                        <div className="bg-linear-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-4 rounded-xl shadow-md border border-indigo-800/40">
                            <div className="flex items-center gap-2 mb-2 text-cyan-300 font-bold">
                                <BookOpen className="w-5 h-5" />
                                <h4 className="text-sm font-black">جدول المدرسين والمواد والحصص</h4>
                            </div>
                            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
                                يتضمن: التسلسل، اسم المدرس، الصفوف، المواد، الشعب، ومجموع الحصص الأسبوعية.
                            </p>
                            
                            <div className="space-y-2">
                                <button
                                    onClick={() => setIsTeacherTableModalOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-bold rounded-lg text-xs shadow transition cursor-pointer"
                                >
                                    <Table className="w-4 h-4 text-cyan-200" />
                                    <span>عرض ومعاينة جدول المدرسين</span>
                                </button>
                                
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <button
                                        onClick={handleQuickExportExcel}
                                        disabled={isExportingExcel}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-lg text-xs shadow-xs transition disabled:opacity-50 cursor-pointer"
                                        title="تصدير بصيغة Excel (.xlsx)"
                                    >
                                        {isExportingExcel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                                        <span>تصدير Excel</span>
                                    </button>

                                    <button
                                        onClick={handleQuickExportWord}
                                        disabled={isExportingWord}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white font-bold rounded-lg text-xs shadow-xs transition disabled:opacity-50 cursor-pointer"
                                        title="تصدير بصيغة Word (.docx)"
                                    >
                                        {isExportingWord ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                                        <span>تصدير Word</span>
                                    </button>
                                </div>

                                {/* Subject Committees PDF Export Button */}
                                <div className="pt-2 border-t border-indigo-900/80">
                                    <button
                                        onClick={handleExportCommitteesPDF}
                                        disabled={isExportingCommitteesPDF}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 active:from-red-700 active:to-rose-800 text-white font-bold rounded-lg text-xs shadow-md transition cursor-pointer disabled:opacity-50"
                                        title="تصدير ملف PDF جاهز للتحميل لكافة لجان الاختصاص التخصصية وتوزيع الشعب والحصص"
                                    >
                                        {isExportingCommitteesPDF ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-yellow-300" />
                                        ) : (
                                            <FileText className="w-4 h-4 text-yellow-300" />
                                        )}
                                        <span className="text-yellow-100">
                                            {isExportingCommitteesPDF
                                                ? (exportProgressMsg || 'جاري تصدير PDF...')
                                                : 'تصدير نصاب الحصص حسب اللجان (PDF)'}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Reset All Assignments Action */}
                        <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200">
                            <div className="flex items-center gap-2 text-rose-800 font-bold text-xs mb-1.5">
                                <AlertTriangle className="w-4 h-4 text-rose-600" />
                                <span>إعادة تعيين وتصفير المواد</span>
                            </div>
                            <p className="text-[11px] text-rose-700 leading-relaxed mb-2.5">
                                تفريغ كافة الحصص والشعب المسندة لجميع المدرسين دفعة واحدة مع الاحتفاظ بحساباتهم.
                            </p>
                            <button
                                onClick={handleClearAllAssignments}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-lg text-xs shadow-xs transition cursor-pointer"
                                title="مسح وتفريغ المواد المسندة لجميع المدرسين"
                            >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>تفريغ المواد المسندة لكافة المدرسين</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2">
                    <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                        <h3 className="text-xl font-bold text-gray-700">قائمة الكادر ({staff.length})</h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsTeacherTableModalOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs rounded-lg border border-indigo-200 transition shadow-2xs"
                                title="عرض جدول الحصص والمواد والشعب لجميع المدرسين"
                            >
                                <Table className="w-3.5 h-3.5 text-indigo-600" />
                                <span>جدول الحصص والمواد ({totalWeeklyPeriods} حصة)</span>
                            </button>
                            <div className="flex flex-wrap gap-2 text-sm font-semibold">
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">مدرسين: {teachersCount}</span>
                                <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">مرشدين: {counselorsCount}</span>
                                <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded">معاونين: {assistantsCount}</span>
                            </div>
                        </div>
                    </div>

                    {/* Search Bar for Teachers */}
                    <div className="mb-4">
                        <div className="relative">
                            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-400">
                                <Search size={18} />
                            </div>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="بحث عن اسم المدرس أو الرمز السري..."
                                className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-semibold text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 hover:text-gray-600"
                                    title="مسح البحث"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                        {searchTerm.trim() && (
                            <div className="flex justify-between items-center text-xs text-gray-600 mt-1.5 px-1">
                                <span>نتائج البحث عن: <strong className="text-cyan-700">"{searchTerm}"</strong></span>
                                <span className="font-bold bg-cyan-50 text-cyan-800 px-2 py-0.5 rounded-full border border-cyan-200">
                                    تم العثور على: {filteredStaff.length} من أصل {staff.length}
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                        {filteredStaff.length > 0 ? filteredStaff.map(t => (
                            <div key={t.id} className="p-4 bg-gray-50 rounded-lg border hover:border-gray-300 transition flex justify-between items-center">
                                <div className="flex-1 mr-2">
                                    <div className="flex items-center gap-2">
                                        {t.role === 'teacher' ? <Users size={16} className="text-blue-600 shrink-0"/> : (t.role === 'assistant' ? <Shield size={16} className="text-amber-600 shrink-0" /> : <GraduationCap size={16} className="text-purple-600 shrink-0"/>)}
                                        
                                        {editingTeacherNameId === t.id ? (
                                            <div className="flex items-center gap-2 flex-1 max-w-md" onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={editingTeacherNameValue}
                                                    onChange={(e) => setEditingTeacherNameValue(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleSaveTeacherName(t.id);
                                                        if (e.key === 'Escape') handleCancelEditName();
                                                    }}
                                                    className="px-2.5 py-1 text-base font-bold bg-white border-2 border-cyan-500 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-500 text-gray-900 flex-1"
                                                    placeholder="اسم المدرس الجديد..."
                                                />
                                                <button
                                                    onClick={() => handleSaveTeacherName(t.id)}
                                                    className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-xs transition"
                                                    title="حفظ الاسم الجديد"
                                                >
                                                    <Check size={16} />
                                                </button>
                                                <button
                                                    onClick={handleCancelEditName}
                                                    className="p-1.5 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-md shadow-xs transition"
                                                    title="إلغاء"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-lg text-gray-900">{t.name}</p>
                                                <button
                                                    onClick={() => handleStartEditName(t)}
                                                    className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                                                    title="تعديل اسم المدرس"
                                                >
                                                    <Edit2 size={15} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${t.role === 'teacher' ? 'bg-blue-200 text-blue-800' : (t.role === 'assistant' ? 'bg-amber-200 text-amber-800' : 'bg-purple-200 text-purple-800')}`}>
                                            {getRoleName(t.role)}
                                        </span>
                                        {t.role === 'teacher' && t.advisorClassId && (() => {
                                            const advClass = classes.find(c => c.id === t.advisorClassId);
                                            return advClass ? (
                                                <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 border border-emerald-200">
                                                    <Compass size={12} />
                                                    مرشد: {advClass.stage} ({advClass.section})
                                                </span>
                                            ) : null;
                                        })()}
                                        <code className="bg-gray-200 text-gray-800 font-mono px-2 py-0.5 rounded text-sm">{t.code}</code>
                                        <button onClick={() => copyToClipboard(t.code)} className="p-1 text-gray-500 hover:text-cyan-600">
                                            {copiedCode === t.code ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {(t.role === 'teacher' || t.role === 'assistant') && (
                                        <button onClick={() => handleEditAssignments(t)} className="p-2 text-white bg-yellow-500 rounded-md hover:bg-yellow-600" title={t.role === 'teacher' ? "تعيين مواد" : "تعيين مراحل"}>
                                            {t.role === 'assistant' ? <ShieldCheck size={18}/> : <Shield size={18}/>}
                                        </button>
                                    )}
                                    <button onClick={() => deleteUser(t.id)} className="p-2 text-white bg-red-500 rounded-md hover:bg-red-600" title="حذف"><Trash2 size={18}/></button>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center text-gray-500 py-12 bg-gray-50 rounded-xl border border-dashed">
                                {searchTerm.trim() ? (
                                    <div className="space-y-2">
                                        <p className="font-bold text-gray-700">لم يتم العثور على أي كادر يطابق البحث: "{searchTerm}"</p>
                                        <button
                                            onClick={() => setSearchTerm('')}
                                            className="px-3 py-1.5 bg-cyan-100 text-cyan-800 text-xs font-bold rounded-lg hover:bg-cyan-200 transition"
                                        >
                                            إلغاء البحث وعرض الكل
                                        </button>
                                    </div>
                                ) : (
                                    <p>لم يتم إضافة أي كادر بعد.</p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {editingUser && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-4xl h-[80vh] flex flex-col">
                        <h3 className="text-xl font-bold mb-4">
                            {editingUser.role === 'assistant' ? `تعيين مراحل للمعاون: ${editingUser.name}` : `تعيين مواد للمدرس: ${editingUser.name}`}
                        </h3>
                        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                            {editingUser.role === 'assistant' ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {GRADE_LEVELS.map(stage => (
                                        <label key={stage} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border hover:bg-cyan-50 cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={assignedStages.includes(stage)}
                                                onChange={e => handleStageAssignmentChange(stage, e.target.checked)}
                                                className="h-5 w-5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                                            />
                                            <span className="font-bold text-gray-700">{stage}</span>
                                        </label>
                                    ))}
                                </div>
                            ) : (
                                <>
                                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 mb-4">
                                        <div className="flex items-center gap-2 text-emerald-900 font-bold mb-1">
                                            <Compass className="w-5 h-5 text-emerald-600" />
                                            <span>تعيين المدرس كمرشد صف (إرشاد تربوي للشعبة)</span>
                                        </div>
                                        <p className="text-xs text-emerald-700 mb-2">
                                            وفقاً للتعليمات: تقتصر خيارات تعيين مرشد الصف حصراً على الشعب التي يدرس فيها المدرس.
                                        </p>
                                        <select
                                            value={advisorClassId}
                                            onChange={(e) => setAdvisorClassId(e.target.value)}
                                            className="w-full md:w-2/3 px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500"
                                        >
                                            <option value="">-- بدون إرشاد (غير مكلف بإرشاد شعبة) --</option>
                                            {classes
                                                .filter(cls => assignments.some(a => a.classId === cls.id))
                                                .map(cls => (
                                                    <option key={cls.id} value={cls.id}>
                                                        مرشد لشعبة: {cls.stage} - ({cls.section})
                                                    </option>
                                                ))
                                            }
                                        </select>
                                    </div>

                                    {sortedClassesForModal.map(cls => (
                                        <div key={cls.id} className="p-3 bg-gray-50 rounded-lg border">
                                            <h4 className="font-semibold text-lg">{cls.stage} - {cls.section}</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                                                {cls.subjects.map(subj => (
                                                    <label key={subj.id} className="flex items-center gap-2 p-2 rounded hover:bg-gray-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={assignments.some(a => a.classId === cls.id && a.subjectId === subj.id)}
                                                            onChange={e => handleAssignmentChange(cls.id, subj.id, e.target.checked)}
                                                            className="h-4 w-4 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                                                        />
                                                        <span>{subj.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                        <div className="mt-6 flex justify-end gap-3 pt-4 border-t">
                            <button onClick={() => setEditingUser(null)} className="px-4 py-2 bg-gray-200 rounded-md flex items-center gap-2"><X size={18} /> إلغاء</button>
                            <button onClick={handleSaveAssignments} className="px-4 py-2 bg-green-600 text-white rounded-md flex items-center gap-2"><Save size={18} /> حفظ</button>
                        </div>
                    </div>
                </div>
            )}

            <TeacherScheduleTableModal
                isOpen={isTeacherTableModalOpen}
                onClose={() => setIsTeacherTableModalOpen(false)}
                teachers={teachersList}
                classes={classes}
                classQuotas={classQuotas}
                settings={settings}
            />
        </div>
    );
}