import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase.ts';
import type { User, BehaviorDeduction, SchoolSettings, DisciplineRecord, DisciplineArchiveLog, DisciplineSettings, Student, ClassData } from '../../types.ts';
import { ShieldAlert, ShieldCheck, ShieldBan, FileText, Printer, FileDown, RotateCcw, Sparkles, Clock, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';
import { DEFAULT_DISCIPLINE_MAX_POINTS, DEFAULT_DISCIPLINE_CRITERIA } from '../../constants.ts';
import DisciplineReportModal from '../discipline/DisciplineReportModal.tsx';
import { exportDisciplineWordDocument } from '../discipline/DisciplineWordExporter.ts';

interface StudentBehaviorViewProps {
    currentUser: User;
    deductions?: BehaviorDeduction[];
}

export default function StudentBehaviorView({ currentUser }: StudentBehaviorViewProps) {
    const principalId = currentUser.principalId || 'principal_al_hamza';
    const studentId = currentUser.id;

    const [settings, setSettings] = useState<SchoolSettings | null>(null);
    const [disciplineSettings, setDisciplineSettings] = useState<DisciplineSettings>({
        maxPoints: DEFAULT_DISCIPLINE_MAX_POINTS,
        criteria: DEFAULT_DISCIPLINE_CRITERIA
    });
    const [records, setRecords] = useState<DisciplineRecord[]>([]);
    const [archiveLogs, setArchiveLogs] = useState<DisciplineArchiveLog[]>([]);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isExportingWord, setIsExportingWord] = useState(false);
    const [classData, setClassData] = useState<ClassData | undefined>(undefined);

    useEffect(() => {
        if (!principalId) return;

        // Load Settings
        db.ref(`settings/${principalId}`).get().then(snapshot => {
            if (snapshot.exists()) setSettings(snapshot.val());
        });

        // Load Discipline Settings (maxPoints)
        db.ref(`discipline_settings/${principalId}`).on('value', snapshot => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                setDisciplineSettings({
                    maxPoints: data.maxPoints || DEFAULT_DISCIPLINE_MAX_POINTS,
                    criteria: Array.isArray(data.criteria) ? data.criteria : DEFAULT_DISCIPLINE_CRITERIA
                });
            }
        });

        // Load Discipline Records for this student
        const recordsRef = db.ref(`discipline_records/${principalId}/${studentId}`);
        const recordsCb = (snapshot: any) => {
            const data = snapshot.val() || {};
            const list = Object.values(data) as DisciplineRecord[];
            list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            setRecords(list);
        };
        recordsRef.on('value', recordsCb);

        // Load Archive Logs for this student
        const archivesRef = db.ref(`discipline_archives/${principalId}/${studentId}`);
        const archivesCb = (snapshot: any) => {
            const data = snapshot.val() || {};
            const list = Object.values(data) as DisciplineArchiveLog[];
            list.sort((a, b) => new Date(b.archivedAt).getTime() - new Date(a.archivedAt).getTime());
            setArchiveLogs(list);
        };
        archivesRef.on('value', archivesCb);

        // Load Student's class
        db.ref(`classes/${principalId}`).once('value', snapshot => {
            const data = snapshot.val() || {};
            const allCls = Object.values(data) as ClassData[];
            const found = allCls.find(c => (c.students || []).some(s => s.id === studentId));
            if (found) setClassData(found);
        });

        return () => {
            recordsRef.off('value', recordsCb);
            archivesRef.off('value', archivesCb);
        };
    }, [principalId, studentId]);

    const maxPoints = disciplineSettings.maxPoints || DEFAULT_DISCIPLINE_MAX_POINTS;
    const activeRecords = useMemo(() => records.filter(r => r.status !== 'archived'), [records]);
    const totalDeductions = useMemo(() => activeRecords.reduce((sum, r) => sum + r.pointsDeducted, 0), [activeRecords]);
    const currentPoints = Math.max(0, maxPoints - totalDeductions);
    const isZero = currentPoints === 0;

    const dummyStudentObj: Student = {
        id: currentUser.id,
        name: currentUser.name,
        examId: (currentUser as any).examId || (currentUser as any).username || '',
        studentAccessCode: (currentUser as any).studentAccessCode,
        photoUrl: (currentUser as any).photoUrl
    };

    const handleExportWord = async () => {
        if (!settings) return;
        setIsExportingWord(true);
        try {
            await exportDisciplineWordDocument({
                student: dummyStudentObj,
                classData,
                settings,
                records,
                maxPoints,
                currentPoints
            });
        } catch (e) {
            console.error('Word export failed:', e);
        } finally {
            setIsExportingWord(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header / Score Banner */}
            <div className={`p-6 sm:p-8 rounded-3xl text-white shadow-xl transition-all ${
                isZero
                    ? 'bg-gradient-to-r from-red-700 via-rose-800 to-red-900 border-2 border-red-500'
                    : currentPoints >= 7
                    ? 'bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 border border-emerald-700'
                    : 'bg-gradient-to-r from-amber-800 via-yellow-900 to-slate-900 border border-amber-700'
            }`}>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4 text-center sm:text-right">
                        <div className="p-4 bg-white/10 rounded-2xl border border-white/20">
                            {isZero ? (
                                <ShieldAlert className="w-10 h-10 text-red-300 animate-bounce" />
                            ) : currentPoints >= 7 ? (
                                <ShieldCheck className="w-10 h-10 text-emerald-300" />
                            ) : (
                                <AlertTriangle className="w-10 h-10 text-amber-300" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl sm:text-2xl font-black">
                                رصيد نقاط الانضباط والسلوك المدرسي
                            </h2>
                            <p className="text-xs sm:text-sm text-slate-200 mt-1">
                                {isZero
                                    ? '⚠️ تم استنفاد كامل رصيد النقاط - يرجى مراجعة معاونية شؤون الطلبة مع ولي الأمر'
                                    : currentPoints >= 7
                                    ? 'سلوكك ممتاز ومنضبط، استمر في الحفاظ على هذا المستوى'
                                    : 'انتبه لملاحظات المدرسين وتجنب الخصومات الإضافية'}
                            </p>
                        </div>
                    </div>

                    <div className="text-center bg-black/30 backdrop-blur-sm px-6 py-4 rounded-2xl border border-white/10">
                        <div className="text-3xl sm:text-5xl font-black tracking-tight">
                            {currentPoints} <span className="text-lg sm:text-2xl font-normal text-slate-300">/ {maxPoints}</span>
                        </div>
                        <div className="text-xs text-slate-300 font-bold mt-1">
                            {isZero ? 'استنفدت النقاط (0/10)' : 'نقاط الانضباط الحالية'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <div className="text-xs sm:text-sm text-slate-700 font-bold">
                    إجمالي المخالفات والخصومات النشطة: <span className="text-red-600 font-black">{totalDeductions} مخالفات</span>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleExportWord}
                        disabled={isExportingWord}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
                    >
                        <FileDown size={16} />
                        <span>{isExportingWord ? 'جاري التحميل...' : 'تحميل تقرير Word'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsReportModalOpen(true)}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                    >
                        <Eye size={16} />
                        <span>معاينة التقرير الرسمي</span>
                    </button>
                </div>
            </div>

            {/* Archived Chances / Resets (if any) */}
            {archiveLogs.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 space-y-3">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                        <Sparkles className="w-5 h-5 text-amber-600" />
                        <h3>سجل الفرص الجديدة وتصفير المخالفات السابقة:</h3>
                    </div>

                    <div className="space-y-2">
                        {archiveLogs.map(log => (
                            <div key={log.id} className="bg-white p-3.5 rounded-2xl border border-amber-200 text-xs text-slate-800 space-y-1">
                                <div className="flex items-center justify-between font-bold">
                                    <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md">
                                        🎉 تم منحك فرصة جديدة برصيد ({log.grantedPoints}) نقاط كاملة
                                    </span>
                                    <span className="text-slate-400 font-mono">
                                        {new Date(log.archivedAt).toLocaleDateString('ar-EG')}
                                    </span>
                                </div>
                                <p className="text-slate-700 font-medium pt-1">
                                    <b>السبب المسجل من الإدارة:</b> {log.reason}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                    تمت الأرشفة بواسطة: {log.archivedByName} (تمت أرشفة {log.previousTotalDeductions} نقطة سابقة)
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Violations Table */}
            <div className="bg-white p-5 sm:p-7 rounded-3xl shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-red-600" />
                        سجل المخالفات والتأشيرات المرصودة
                    </h3>
                    <span className="text-xs text-slate-500 font-semibold">
                        {activeRecords.length} مخالفة نشطة
                    </span>
                </div>

                {activeRecords.length > 0 ? (
                    <div className="space-y-2.5">
                        {activeRecords.map((rec, index) => (
                            <div key={rec.id || index} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-1 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-0.5 rounded-lg border border-red-200">
                                            خصم (-{rec.pointsDeducted}) نقطة
                                        </span>
                                        <span className="font-bold text-indigo-900 text-xs">
                                            المادة: {rec.subjectName || 'عام'}
                                        </span>
                                        <span className="text-slate-500 text-xs font-medium">
                                            (المدرس / الموثق: {rec.teacherName})
                                        </span>
                                    </div>

                                    <h4 className="font-bold text-sm text-slate-900 pt-0.5">
                                        {rec.criterionTitle}
                                    </h4>

                                    {rec.notes && (
                                        <p className="text-xs text-slate-600 bg-white p-2 rounded-xl border border-slate-200">
                                            ملاحظة المدرس: {rec.notes}
                                        </p>
                                    )}
                                </div>

                                <div className="text-left font-mono text-xs text-slate-400 flex-shrink-0">
                                    <div>{new Date(rec.timestamp).toLocaleDateString('ar-EG')}</div>
                                    <div className="text-[10px]">{new Date(rec.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                        <p className="text-slate-700 font-bold text-sm">سجلك نظيف تماماً! لا توجد أي مخالفات نشطة.</p>
                    </div>
                )}
            </div>

            {/* Official Report Modal */}
            {isReportModalOpen && settings && (
                <DisciplineReportModal
                    isOpen={isReportModalOpen}
                    onClose={() => setIsReportModalOpen(false)}
                    student={dummyStudentObj}
                    classData={classData}
                    settings={settings}
                    records={records}
                    maxPoints={maxPoints}
                    currentPoints={currentPoints}
                    studentPhotoUrl={(currentUser as any).photoUrl}
                    currentUser={currentUser}
                />
            )}
        </div>
    );
}
