
import React, { useState, useMemo, useEffect } from 'react';
import type { User, ClassData, TeacherSubmission, TeacherSubjectGrade, SchoolSettings, Student, Teacher, SubjectGrade } from '../../types.ts';
import TeacherGradeSheet from '../teacher/TeacherGradeSheet.tsx';
import { calculateStudentResult } from '../../lib/gradeCalculator.ts';
import { db } from '../../lib/firebase.ts';
import { Eye, ArrowLeft, Lock, Unlock, CheckCircle, AlertCircle, Loader2, SendHorizontal, Zap } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface ReceiveTeacherLogProps {
    principal: User;
    classes: ClassData[];
    settings: SchoolSettings;
    users: User[];
}

const DEFAULT_TEACHER_GRADE: TeacherSubjectGrade = {
    firstSemMonth1: null,
    firstSemMonth2: null,
    midYear: null,
    secondSemMonth1: null,
    secondSemMonth2: null,
    finalExam: null,
    october: null,
    november: null,
    december: null,
    january: null,
    february: null,
    march: null,
    april: null,
};

export default function ReceiveTeacherLog({ principal, classes, settings, users }: ReceiveTeacherLogProps) {
    const [submissions, setSubmissions] = useState<TeacherSubmission[]>([]);
    const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');
    const [selectedSubmission, setSelectedSubmission] = useState<TeacherSubmission | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSyncingAll, setIsSyncingAll] = useState(false);
    const [lockFilterStage, setLockFilterStage] = useState<string>('');

    useEffect(() => {
        const submissionsRef = db.ref('teacher_submissions');
        const callback = (snapshot: any) => {
            const data = snapshot.val();
            const allSubmissions: TeacherSubmission[] = data ? Object.values(data) : [];
            const principalTeacherIds = new Set(users.filter(u => u.principalId === principal.id).map(u => u.id));
            const relevantSubmissions = allSubmissions.filter(sub => principalTeacherIds.has(sub.teacherId));
            setSubmissions(relevantSubmissions);
        };
        submissionsRef.on('value', callback);
        return () => submissionsRef.off('value', callback);
    }, [principal.id, users]);

    const teachers = useMemo(() => users.filter(u => u.role === 'teacher' && u.principalId === principal.id), [users, principal.id]);
    
    const latestSubmissions = useMemo(() => {
        const latest = new Map<string, TeacherSubmission>();
        (submissions || []).forEach(sub => {
            const key = `${sub.teacherId}-${sub.classId}-${sub.subjectId}`;
            const existing = latest.get(key);
            if (!existing || new Date(sub.submittedAt) > new Date(existing.submittedAt)) {
                latest.set(key, sub);
            }
        });
        return Array.from(latest.values()).sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    }, [submissions]);

    const filteredSubmissions = useMemo(() => {
        if (!selectedTeacherId) {
            return latestSubmissions;
        }
        return latestSubmissions.filter(sub => sub.teacherId === selectedTeacherId);
    }, [selectedTeacherId, latestSubmissions]);

    const handleToggleLock = async (lockField: keyof SchoolSettings) => {
        try {
            const currentVal = !!settings[lockField];
            await db.ref(`settings/${principal.id}/${lockField}`).set(!currentVal);
        } catch (error) {
            console.error("Lock update failed:", error);
        }
    };

    const handleToggleClassLock = async (classId: string, lockField: 'lockS1' | 'lockS2') => {
        try {
            const cls = classes.find(c => c.id === classId);
            if (!cls) return;
            const currentVal = !!(cls as any)[lockField];
            await db.ref(`classes/${classId}/${lockField}`).set(!currentVal);
        } catch (error) {
            console.error("Class lock update failed:", error);
        }
    };

    const handleToggleStageLock = async (stage: string, lockField: 'lockS1' | 'lockS2', lock: boolean) => {
        try {
            const stageClasses = classes.filter(c => c.stage === stage && c.principalId === principal.id);
            const updates: Record<string, any> = {};
            stageClasses.forEach(c => {
                updates[`classes/${c.id}/${lockField}`] = lock;
            });
            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
            }
        } catch (error) {
            console.error("Stage lock update failed:", error);
        }
    };

    const handleBulkPushToTeachers = async () => {
        if (!confirm("تحذير: سيتم اعتماد وإرسال جميع درجات نصف السنة والدرجة النهائية الموجودة حالياً في جميع الشعب الدراسية إلى كافة سجلات المدرسين المعنيين وتوليد سجلات استلام رسمية لكل مادة. هل أنت متأكد من استمرار المزامنة الكلية؟")) {
            return;
        }

        setIsSyncingAll(true);
        const updates: Record<string, any> = {};
        const timestamp = new Date().toISOString();
        let totalUpdates = 0;

        try {
            const principalTeachers = users.filter(u => u.role === 'teacher' && u.principalId === principal.id);
            const principalClasses = classes.filter(c => c.principalId === principal.id);

            for (const classData of principalClasses) {
                if (!classData.subjects || !classData.students) continue;

                for (const subject of classData.subjects) {
                    const subjectTeacher = principalTeachers.find(t => 
                        t.assignments?.some((a: any) => a.classId === classData.id && a.subjectId === subject.id)
                    );

                    if (!subjectTeacher) continue;

                    const teacherSubmissionGrades: Record<string, any> = {};
                    let hasAnyData = false;

                    classData.students.forEach((student, sIdx) => {
                        const masterGrades = (student.grades?.[subject.name] || {}) as SubjectGrade;
                        
                        // Calculate the grades to get averages and pursuit
                        const { finalCalculatedGrades } = calculateStudentResult(student, classData.subjects, settings, classData);
                        const calculated = finalCalculatedGrades[subject.name];

                        // Prepare grades to push
                        const gradesToPush: TeacherSubjectGrade = {
                            firstSemMonth1: masterGrades.october ?? null,
                            firstSemMonth2: masterGrades.november ?? null,
                            midYear: masterGrades.midYear ?? null,
                            secondSemMonth1: masterGrades.february ?? null,
                            secondSemMonth2: masterGrades.march ?? null,
                            finalExam: masterGrades.finalExam1st ?? null,
                            october: masterGrades.october ?? null,
                            november: masterGrades.november ?? null,
                            december: masterGrades.december ?? null,
                            january: masterGrades.january ?? null,
                            february: masterGrades.february ?? null,
                            march: masterGrades.march ?? null,
                            april: masterGrades.april ?? null,
                            firstTerm: masterGrades.firstTerm ?? null,
                            secondTerm: masterGrades.secondTerm ?? null,
                            annualPursuit: calculated?.annualPursuit ?? null
                        };

                        hasAnyData = true;
                        const teacherGradesPath = `classes/${classData.id}/students/${sIdx}/teacherGrades/${subject.name}`;
                        
                        Object.entries(gradesToPush).forEach(([key, value]) => {
                            updates[`${teacherGradesPath}/${key}`] = value;
                        });

                        teacherSubmissionGrades[student.id] = gradesToPush;
                    });

                    if (hasAnyData) {
                        const submissionId = uuidv4();
                        const submission: TeacherSubmission = {
                            id: submissionId,
                            teacherId: subjectTeacher.id,
                            classId: classData.id,
                            subjectId: subject.id,
                            submittedAt: timestamp,
                            grades: teacherSubmissionGrades as any
                        };
                        updates[`teacher_submissions/${submissionId}`] = submission;
                        totalUpdates++;
                    }
                }
            }

            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
                alert(`تمت المزامنة الكلية بنجاح. تم تحديث وإرسال ${totalUpdates} سجل دراسي لمدرسي المدرسة.`);
            } else {
                alert("لم يتم العثور على درجات في السجلات الرئيسية لإرسالها.");
            }
        } catch (error) {
            console.error("Bulk Push failed:", error);
            alert("حدث خطأ تقني أثناء المزامنة الكلية. يرجى التأكد من استقرار الاتصال.");
        } finally {
            setIsSyncingAll(false);
        }
    };

    const handleApproveGrades = async (semester: 1 | 2) => {
        const semesterLabel = semester === 1 ? 'الفصل الأول' : 'الفصل الثاني';
        if (!confirm(`هل أنت متأكد من اعتماد درجات ${semesterLabel}؟ سيتم تحديث سجلات الطلاب في الشعب بناءً على آخر السجلات المستلمة من المدرسين.`)) {
            return;
        }

        setIsProcessing(true);
        const updates: Record<string, any> = {};
        let updateCount = 0;

        try {
            for (const submission of latestSubmissions) {
                const classData = classes.find(c => c.id === submission.classId);
                if (!classData || !classData.students) continue;

                const subjectObj = (classData.subjects || []).find(s => s.id === submission.subjectId);
                if (!subjectObj) continue;

                if (submission.grades) {
                    Object.entries(submission.grades).forEach(([studentId, teacherGrade]: [string, any]) => {
                        const studentIndex = classData.students.findIndex(s => s.id === studentId);
                        if (studentIndex === -1) return;

                        const gradePath = `classes/${classData.id}/students/${studentIndex}/grades/${subjectObj.name}`;
                        const getVal = (v: any) => (v === null || v === undefined) ? null : Number(v);
                        const isPrimary5_6 = classData.stage === 'الخامس ابتدائي' || classData.stage === 'السادس ابتدائي';

                        if (semester === 1) {
                            let firstTerm = getVal(teacherGrade.firstTerm);
                            if (firstTerm === null) {
                                if (isPrimary5_6) {
                                    const months = [teacherGrade.october, teacherGrade.november, teacherGrade.december, teacherGrade.january].map(getVal).filter(v => v !== null);
                                    if (months.length > 0) {
                                        firstTerm = Math.round(months.reduce((a, b) => a + b!, 0) / months.length);
                                    }
                                } else {
                                    const m1 = getVal(teacherGrade.firstSemMonth1);
                                    const m2 = getVal(teacherGrade.firstSemMonth2);
                                    if (m1 !== null && m1 >= 0 && m2 !== null && m2 >= 0) {
                                        firstTerm = Math.round((m1 + m2) / 2);
                                    }
                                }
                            }
                            
                            const midYear = getVal(teacherGrade.midYear);

                            if (firstTerm !== null) {
                                updates[`${gradePath}/firstTerm`] = firstTerm;
                            }
                            if (midYear !== null) {
                                updates[`${gradePath}/midYear`] = midYear;
                            }
                        } else {
                            let secondTerm = getVal(teacherGrade.secondTerm);
                            if (secondTerm === null) {
                                if (isPrimary5_6) {
                                    const months = [teacherGrade.february, teacherGrade.march, teacherGrade.april].map(getVal).filter(v => v !== null);
                                    if (months.length > 0) {
                                        secondTerm = Math.round(months.reduce((a, b) => a + b!, 0) / months.length);
                                    }
                                } else {
                                    const m1 = getVal(teacherGrade.secondSemMonth1);
                                    const m2 = getVal(teacherGrade.secondSemMonth2);
                                    if (m1 !== null && m1 >= 0 && m2 !== null && m2 >= 0) {
                                        secondTerm = Math.round((m1 + m2) / 2);
                                    }
                                }
                            }

                            const finalExam = getVal(teacherGrade.finalExam);
                            const annualPursuit = getVal(teacherGrade.annualPursuit);

                            if (secondTerm !== null) {
                                updates[`${gradePath}/secondTerm`] = secondTerm;
                            }
                            if (finalExam !== null) {
                                updates[`${gradePath}/finalExam1st`] = finalExam;
                            }
                            if (annualPursuit !== null) {
                                updates[`${gradePath}/annualPursuit`] = annualPursuit;
                            }
                        }
                        updateCount++;
                    });
                }
            }

            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
                alert(`تم اعتماد درجات ${semesterLabel} بنجاح. تم تحديث ${updateCount} حقل درجة.`);
            } else {
                alert("لم يتم العثور على درجات مكتملة لاعتمادها في السجلات المستلمة.");
            }
        } catch (error) {
            console.error("Approval process failed:", error);
            alert("حدث خطأ تقني أثناء عملية الاعتماد.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleViewSubmission = (submission: TeacherSubmission) => {
        setSelectedSubmission(submission);
    };
    
    const getTeacherName = (teacherId: string) => users.find(u => u.id === teacherId)?.name || 'مدرس غير معروف';
    const getClassName = (classId: string) => {
        const cls = classes.find(c => c.id === classId);
        return cls ? `${cls.stage} - ${cls.section}` : 'شعبة محذوفة';
    }
    const getSubjectName = (classId: string, subjectId: string) => {
        const cls = classes.find(c => c.id === classId);
        const sub = (cls?.subjects || []).find(s => s.id === subjectId);
        return sub ? sub.name : 'مادة محذوفة';
    }

    const stages = useMemo(() => {
        const s = new Set<string>();
        classes.filter(c => c.principalId === principal.id).forEach(c => s.add(c.stage));
        return Array.from(s).sort();
    }, [classes, principal.id]);

    const lockFilteredClasses = useMemo(() => {
        if (!lockFilterStage) return [];
        return classes.filter(c => c.stage === lockFilterStage && c.principalId === principal.id);
    }, [lockFilterStage, classes, principal.id]);

    if (selectedSubmission) {
        const classData = classes.find(c => c.id === selectedSubmission.classId);
        const teacher = users.find(u => u.id === selectedSubmission.teacherId);

        if (!classData || !teacher) {
            return (
                <div className="bg-white p-8 rounded-xl shadow-lg text-center">
                    <p className="text-red-500">خطأ: لم يتم العثور على بيانات الصف أو المدرس لهذا السجل.</p>
                    <button onClick={() => setSelectedSubmission(null)} className="mt-4 px-4 py-2 bg-gray-300 rounded-lg flex items-center gap-2 mx-auto">
                        <ArrowLeft />
                        العودة
                    </button>
                </div>
            );
        }
        
        const subjectName = getSubjectName(classData.id, selectedSubmission.subjectId);
        const classDataWithGrades: ClassData = {
            ...classData,
            students: (classData.students || []).map((s: Student) => {
                const submittedGrades = (selectedSubmission.grades || {})[s.id] || {};
                return {
                    ...s,
                    teacherGrades: {
                        ...s.teacherGrades,
                        [subjectName]: { ...DEFAULT_TEACHER_GRADE, ...submittedGrades },
                    }
                };
            })
        };
        
        return (
            <div>
                 <button onClick={() => setSelectedSubmission(null)} className="mb-4 px-4 py-2 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 flex items-center gap-2">
                    <ArrowLeft />
                    العودة إلى قائمة السجلات
                </button>
                <TeacherGradeSheet 
                    classData={classDataWithGrades} 
                    teacher={teacher as Teacher} 
                    settings={settings} 
                    isReadOnly={true}
                    subjectId={selectedSubmission.subjectId}
                />
            </div>
        )
    }

    return (
        <div className="bg-white p-6 md:p-8 rounded-xl shadow-lg">
            {isSyncingAll && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex flex-col items-center justify-center text-white">
                    <Loader2 className="w-16 h-16 animate-spin mb-4" />
                    <p className="text-xl font-bold">جاري مزامنة درجات السجل الرئيسي مع جميع المدرسين...</p>
                    <p className="text-sm opacity-70">يرجى عدم إغلاق المتصفح حتى انتهاء العملية</p>
                </div>
            )}

            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-4 md:mb-0">استلام سجلات المدرسين</h2>
                <div className="flex items-center gap-2 w-full md:w-auto">
                     <label htmlFor="teacher-filter" className="font-semibold text-gray-700 whitespace-nowrap">فلترة بالمدرس:</label>
                    <select 
                        id="teacher-filter"
                        onChange={e => setSelectedTeacherId(e.target.value)} 
                        value={selectedTeacherId}
                        className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg bg-white"
                    >
                        <option value="">-- كل المدرسين --</option>
                        {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Control Toggles */}
                <div className="space-y-6">
                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                        <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                            <Lock size={18} className="text-red-500" /> التحكم العام في إرسال السجلات
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-white rounded-lg border shadow-sm">
                                <div>
                                    <p className="font-bold text-gray-800">إرسال درجات الفصل الأول</p>
                                    <p className="text-xs text-gray-500">يتضمن درجات الشهر الأول والثاني ونصف السنة</p>
                                </div>
                                <button 
                                    onClick={() => handleToggleLock('lockS1Submissions')}
                                    className={`px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 transition-colors ${settings.lockS1Submissions ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}
                                >
                                    {settings.lockS1Submissions ? <Lock size={14}/> : <Unlock size={14}/>}
                                    {settings.lockS1Submissions ? 'مغلق' : 'مفتوح'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-white rounded-lg border shadow-sm">
                                <div>
                                    <p className="font-bold text-gray-800">إرسال درجات الفصل الثاني</p>
                                    <p className="text-xs text-gray-500">يتضمن درجات الشهر الأول والثاني ونهاية السنة</p>
                                </div>
                                <button 
                                    onClick={() => handleToggleLock('lockS2Submissions')}
                                    className={`px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 transition-colors ${settings.lockS2Submissions ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}
                                >
                                    {settings.lockS2Submissions ? <Lock size={14}/> : <Unlock size={14}/>}
                                    {settings.lockS2Submissions ? 'مغلق' : 'مفتوح'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-white rounded-lg border shadow-sm">
                                <div>
                                    <p className="font-bold text-gray-800">إيقاف الإرسال تماماً</p>
                                    <p className="text-xs text-gray-500">يمنع إرسال أي سجلات من جميع المدرسين</p>
                                </div>
                                <button 
                                    onClick={() => handleToggleLock('lockAllSubmissions')}
                                    className={`px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 transition-colors ${settings.lockAllSubmissions ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                                >
                                    {settings.lockAllSubmissions ? <Lock size={14}/> : <Unlock size={14}/>}
                                    {settings.lockAllSubmissions ? 'مغلق تام' : 'تفعيل تام'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Granular Lock Management */}
                    <div className="bg-indigo-50 p-6 rounded-xl border border-indigo-200">
                        <h3 className="text-lg font-bold text-indigo-800 mb-4 flex items-center gap-2">
                            <Lock size={18} /> التحكم التفصيلي حسب المرحلة والشعبة
                        </h3>
                        <div className="mb-4">
                            <label className="block text-sm font-bold text-indigo-700 mb-1">اختر المرحلة للتحكم:</label>
                            <select 
                                value={lockFilterStage} 
                                onChange={e => setLockFilterStage(e.target.value)}
                                className="w-full px-3 py-2 border border-indigo-300 rounded-lg bg-white"
                            >
                                <option value="">-- اختر مرحلة --</option>
                                {stages.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        {lockFilterStage && (
                            <div className="space-y-4">
                                <div className="flex gap-2 mb-4">
                                    <button 
                                        onClick={() => handleToggleStageLock(lockFilterStage, 'lockS1', true)}
                                        className="flex-1 py-2 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600"
                                    >
                                        غلق ف1 للمرحلة
                                    </button>
                                    <button 
                                        onClick={() => handleToggleStageLock(lockFilterStage, 'lockS1', false)}
                                        className="flex-1 py-2 bg-green-500 text-white text-xs font-bold rounded-lg hover:bg-green-600"
                                    >
                                        فتح ف1 للمرحلة
                                    </button>
                                </div>
                                <div className="flex gap-2 mb-4">
                                    <button 
                                        onClick={() => handleToggleStageLock(lockFilterStage, 'lockS2', true)}
                                        className="flex-1 py-2 bg-red-700 text-white text-xs font-bold rounded-lg hover:bg-red-800"
                                    >
                                        غلق ف2 للمرحلة
                                    </button>
                                    <button 
                                        onClick={() => handleToggleStageLock(lockFilterStage, 'lockS2', false)}
                                        className="flex-1 py-2 bg-green-700 text-white text-xs font-bold rounded-lg hover:bg-green-800"
                                    >
                                        فتح ف2 للمرحلة
                                    </button>
                                </div>

                                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                    {lockFilteredClasses.map(c => (
                                        <div key={c.id} className="p-3 bg-white rounded-lg border flex items-center justify-between shadow-sm">
                                            <span className="font-bold text-gray-700">شعبة {c.section}</span>
                                            <div className="flex gap-2">
                                                <button 
                                                    onClick={() => handleToggleClassLock(c.id, 'lockS1')}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold ${c.lockS1 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}
                                                >
                                                    ف1: {c.lockS1 ? 'مغلق' : 'مفتوح'}
                                                </button>
                                                <button 
                                                    onClick={() => handleToggleClassLock(c.id, 'lockS2')}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold ${c.lockS2 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}
                                                >
                                                    ف2: {c.lockS2 ? 'مغلق' : 'مفتوح'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Bulk Sync & Approval Actions */}
                <div className="space-y-6">
                    <div className="bg-cyan-50 p-6 rounded-xl border border-cyan-200">
                        <h3 className="text-lg font-bold text-cyan-800 mb-4 flex items-center gap-2">
                            <CheckCircle size={18} /> اعتماد الدرجات النهائية (من المدرسين للرئيسي)
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button 
                                onClick={() => handleApproveGrades(1)}
                                disabled={isProcessing}
                                className="flex flex-col items-center justify-center gap-2 p-4 bg-white border-2 border-cyan-500 rounded-xl hover:bg-cyan-500 hover:text-white transition-all group disabled:opacity-50"
                            >
                                <span className="font-bold text-lg">اعتماد الفصل الأول</span>
                                <span className="text-xs opacity-70">نقل درجات ف1 + نصف السنة</span>
                            </button>
                            <button 
                                onClick={() => handleApproveGrades(2)}
                                disabled={isProcessing}
                                className="flex flex-col items-center justify-center gap-2 p-4 bg-white border-2 border-green-500 rounded-xl hover:bg-green-500 hover:text-white transition-all group disabled:opacity-50"
                            >
                                <span className="font-bold text-lg">اعتماد الفصل الثاني</span>
                                <span className="text-xs opacity-70">نقل درجات ف2 + نهاية السنة</span>
                            </button>
                        </div>
                    </div>

                    <div className="bg-amber-50 p-6 rounded-xl border border-amber-200">
                        <h3 className="text-lg font-bold text-amber-800 mb-2 flex items-center gap-2">
                            <Zap size={18} /> مزامنة كل السجلات (من الرئيسي للمدرسين)
                        </h3>
                        <p className="text-xs text-amber-700 mb-4 leading-relaxed">
                            هذا الخيار يرسل درجات نصف السنة والدرجة النهائية المثبتة في سجلات الشعب مباشرة إلى جميع سجلات المدرسين دفعة واحدة.
                        </p>
                        <button 
                            onClick={handleBulkPushToTeachers}
                            disabled={isSyncingAll}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-amber-600 text-white font-black text-xl rounded-xl hover:bg-amber-700 transition shadow-lg disabled:bg-gray-400"
                        >
                            {isSyncingAll ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
                            <span>اعتماد ومزامنة كل السجلات</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-xl font-bold text-gray-700 flex items-center gap-2">
                    <AlertCircle className="text-blue-500" /> قائمة السجلات المستلمة مؤخراً
                </h3>
                {filteredSubmissions.length > 0 ? (
                    filteredSubmissions.map(sub => (
                         <div key={sub.id} className="p-4 bg-gray-50 rounded-lg border flex flex-col sm:flex-row justify-between items-start sm:items-center hover:shadow-md transition-shadow">
                            <div>
                                <p className="font-bold text-lg text-gray-800">{getTeacherName(sub.teacherId)}</p>
                                <div className="text-sm text-gray-600 mt-1">
                                    <span className="font-semibold bg-gray-200 px-2 py-0.5 rounded">{getClassName(sub.classId)}</span>
                                    <span className="mx-2 text-gray-300">|</span>
                                    <span className="text-cyan-700 font-bold">{getSubjectName(sub.classId, sub.subjectId)}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 mt-2 sm:mt-0">
                                 <span className="text-xs text-gray-500 bg-white px-2 py-1 border rounded">
                                    أرسل في: {new Date(sub.submittedAt).toLocaleString('ar-EG')}
                                </span>
                                <button onClick={() => handleViewSubmission(sub)} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-lg hover:bg-blue-600 shadow-sm">
                                    <Eye size={16} />
                                    عرض وتدقيق
                                </button>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center p-12 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
                         <p className="text-xl text-gray-500 italic">لم يتم استلام أي سجلات جديدة حالياً.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
