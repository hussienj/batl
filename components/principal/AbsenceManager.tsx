import React, { useState, useEffect, useMemo } from 'react';
import * as ReactDOM from 'react-dom/client';
import type { User, SchoolSettings, ClassData, Student, AbsenceStatus } from '../../types.ts';
import { db } from '../../lib/firebase.ts';
import { Calendar, ListChecks, Printer, AlertTriangle, Loader2, PlayCircle, X, Send, CheckCircle2, MessageSquare, Bot, Users, Bell, Info, Search, FileText } from 'lucide-react';
import MonthlyAbsenceReportPDF from './MonthlyAbsenceReportPDF.tsx';
import AbsenceWarningLetterPDF from './AbsenceWarningLetterPDF.tsx';
import { sendTelegramNotification, TelegramConfig } from '../../lib/telegram.ts';

declare const jspdf: any;
declare const html2canvas: any;

interface AbsenceManagerProps {
    principal: User;
    settings: SchoolSettings;
    classes: ClassData[];
}

interface AbsenceItem {
    status: AbsenceStatus;
    lessons: number;
}

const STATUS_CYCLE: AbsenceStatus[] = ['present', 'absent', 'excused', 'runaway'];
const STATUS_INFO: Record<AbsenceStatus, { text: string; color: string }> = {
    present: { text: 'حاضر', color: 'bg-green-500 hover:bg-green-600' },
    absent: { text: 'غائب', color: 'bg-red-500 hover:bg-red-600' },
    excused: { text: 'مجاز', color: 'bg-yellow-500 hover:bg-yellow-600 text-gray-900' },
    runaway: { text: 'هارب', color: 'bg-blue-600 hover:bg-blue-700' },
};

const parseAbsenceValue = (val: any): AbsenceItem => {
    if (!val) return { status: 'present', lessons: 0 };
    if (typeof val === 'string') {
        if (val.startsWith('runaway_') || val.startsWith('runaway:')) {
            const lessons = parseInt(val.split(/[_\:]/)[1], 10) || 1;
            return { status: 'runaway', lessons };
        }
        if (val === 'runaway') return { status: 'runaway', lessons: 1 };
        return { status: val as AbsenceStatus, lessons: 0 };
    }
    if (typeof val === 'object') {
        const status = (val.status as AbsenceStatus) || 'present';
        const lessons = typeof val.lessons === 'number' ? val.lessons : (status === 'runaway' ? 1 : 0);
        return { status, lessons };
    }
    return { status: 'present', lessons: 0 };
};

export default function AbsenceManager({ principal, settings, classes }: AbsenceManagerProps) {
    const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    
    // Search in daily attendance
    const [studentSearchTerm, setStudentSearchTerm] = useState('');

    // Daily state
    const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [dailyAbsences, setDailyAbsences] = useState<Record<string, AbsenceItem>>({});
    const [isLoadingDaily, setIsLoadingDaily] = useState(false);

    // Telegram State
    const [sendIndividualTelegram, setSendIndividualTelegram] = useState(true);
    const [sendGroupTelegram, setSendGroupTelegram] = useState(true);
    const [customGroupChatId, setCustomGroupChatId] = useState(settings?.telegramDefaultChatId || '');
    const [isSendingTelegram, setIsSendingTelegram] = useState(false);
    const [telegramLogModal, setTelegramLogModal] = useState<{ open: boolean; title: string; logs: string[] } | null>(null);

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

    // Monthly & Full Year state
    const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [monthlyAbsences, setMonthlyAbsences] = useState<Record<string, Record<string, any>>>({});
    const [allClassAbsences, setAllClassAbsences] = useState<Record<string, Record<string, any>>>({});
    const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    
    const [isTutorialVisible, setIsTutorialVisible] = useState(false);

    const selectedClass = useMemo(() => classes.find(c => c.id === selectedClassId), [classes, selectedClassId]);
    const sortedStudents = useMemo(() => 
        [...(selectedClass?.students || [])].sort((a, b) => a.name.localeCompare(b.name, 'ar-IQ')),
    [selectedClass]);

    // Stable key for student IDs
    const studentIdsKey = useMemo(() => (sortedStudents || []).map(s => s.id).join(','), [sortedStudents]);

    // Filter students by search term in daily view
    const filteredStudents = useMemo(() => {
        if (!studentSearchTerm.trim()) return sortedStudents;
        const term = studentSearchTerm.trim().toLowerCase();
        return sortedStudents.filter(s => s.name.toLowerCase().includes(term));
    }, [sortedStudents, studentSearchTerm]);

    // Fetch all class absences across the entire academic year whenever class changes
    useEffect(() => {
        if (!selectedClassId) {
            setAllClassAbsences({});
            return;
        }
        const path = `absences/${principal.id}/${selectedClassId}`;
        db.ref(path).get().then(snapshot => {
            setAllClassAbsences(snapshot.val() || {});
        }).catch(console.error);
    }, [selectedClassId, principal.id]);
    
    // Effect for daily data
    useEffect(() => {
        if (!selectedClassId || !currentDate) {
            setDailyAbsences({});
            return;
        }
        setIsLoadingDaily(true);
        const [year, month, day] = currentDate.split('-');
        const path = `absences/${principal.id}/${selectedClassId}/${year}-${month}/${day}`;
        db.ref(path).get().then(snapshot => {
            const data = snapshot.val() || {};
            const initialAbsences: Record<string, AbsenceItem> = {};
            sortedStudents.forEach(student => {
                initialAbsences[student.id] = parseAbsenceValue(data[student.id]);
            });
            setDailyAbsences(initialAbsences);
        }).finally(() => setIsLoadingDaily(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedClassId, currentDate, principal.id, studentIdsKey]); 

    // Effect for monthly data
    useEffect(() => {
        if (activeTab !== 'monthly' || !selectedClassId || !currentMonth) {
            setMonthlyAbsences({});
            return;
        }
        setIsLoadingMonthly(true);
        const path = `absences/${principal.id}/${selectedClassId}/${currentMonth}`;
        db.ref(path).get().then(snapshot => {
            setMonthlyAbsences(snapshot.val() || {});
        }).finally(() => setIsLoadingMonthly(false));
    }, [activeTab, selectedClassId, currentMonth, principal.id]);

    // Daily summary counters (حاضر، غائب، مجاز، هارب)
    const dailyCounts = useMemo(() => {
        let present = 0;
        let absent = 0;
        let excused = 0;
        let runaway = 0;

        sortedStudents.forEach(student => {
            const item = dailyAbsences[student.id] || { status: 'present', lessons: 0 };
            if (item.status === 'present') present++;
            else if (item.status === 'absent') absent++;
            else if (item.status === 'excused') excused++;
            else if (item.status === 'runaway') runaway++;
        });

        return { present, absent, excused, runaway };
    }, [sortedStudents, dailyAbsences]);

    // Cumulative full-year totals for every student (كل 4 حصص هروب = يوم غياب واحد)
    const yearTotals = useMemo(() => {
        const totals: Record<string, {
            totalDays: number;
            absentDays: number;
            runawayLessons: number;
            runawayDays: number;
            excusedDays: number;
            warning: '' | 'تبليغ اولي' | 'تبليغ ثاني' | 'تبليغ نهائي';
        }> = {};

        sortedStudents.forEach(student => {
            let absentDays = 0;
            let runawayLessons = 0;
            let excusedDays = 0;

            Object.entries(allClassAbsences).forEach(([_mKey, monthDays]) => {
                if (!monthDays || typeof monthDays !== 'object') return;
                Object.values(monthDays).forEach(dailyData => {
                    if (!dailyData || typeof dailyData !== 'object') return;
                    const rec = parseAbsenceValue(dailyData[student.id]);
                    if (rec.status === 'absent') {
                        absentDays++;
                    } else if (rec.status === 'runaway') {
                        runawayLessons += (rec.lessons || 1);
                    } else if (rec.status === 'excused') {
                        excusedDays++;
                    }
                });
            });

            // Rule: Every 4 runaway lessons = 1 full day of absence
            const runawayDays = Math.floor(runawayLessons / 4);
            const totalDays = absentDays + runawayDays;

            let warning: '' | 'تبليغ اولي' | 'تبليغ ثاني' | 'تبليغ نهائي' = '';
            if (totalDays >= 21) {
                warning = 'تبليغ نهائي';
            } else if (totalDays >= 14) {
                warning = 'تبليغ ثاني';
            } else if (totalDays >= 7) {
                warning = 'تبليغ اولي';
            }

            totals[student.id] = {
                totalDays,
                absentDays,
                runawayLessons,
                runawayDays,
                excusedDays,
                warning
            };
        });

        return totals;
    }, [allClassAbsences, sortedStudents]);

    // Current month totals for table view
    const currentMonthTotals = useMemo(() => {
        const totals: Record<string, {
            absentDays: number;
            runawayLessons: number;
            runawayDays: number;
            totalDays: number;
        }> = {};

        sortedStudents.forEach(student => {
            let absentDays = 0;
            let runawayLessons = 0;

            Object.values(monthlyAbsences).forEach(dailyData => {
                if (!dailyData || typeof dailyData !== 'object') return;
                const rec = parseAbsenceValue(dailyData[student.id]);
                if (rec.status === 'absent') absentDays++;
                else if (rec.status === 'runaway') runawayLessons += (rec.lessons || 1);
            });

            const runawayDays = Math.floor(runawayLessons / 4);
            totals[student.id] = {
                absentDays,
                runawayLessons,
                runawayDays,
                totalDays: absentDays + runawayDays
            };
        });

        return totals;
    }, [monthlyAbsences, sortedStudents]);
    
    // Cycle status: present -> absent -> excused -> runaway -> present
    const handleStatusChange = (studentId: string) => {
        const current = dailyAbsences[studentId] || { status: 'present', lessons: 0 };
        const currentIndex = STATUS_CYCLE.indexOf(current.status);
        const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
        const nextStatus = STATUS_CYCLE[nextIndex];
        
        setDailyAbsences(prev => ({
            ...prev,
            [studentId]: {
                status: nextStatus,
                lessons: nextStatus === 'runaway' ? (prev[studentId]?.lessons || 1) : 0
            }
        }));
    };

    // Increase / decrease runaway lessons
    const handleRunawayLessonsChange = (studentId: string, delta: number) => {
        setDailyAbsences(prev => {
            const current = prev[studentId] || { status: 'runaway', lessons: 1 };
            const newLessons = Math.min(7, Math.max(1, (current.lessons || 1) + delta));
            return {
                ...prev,
                [studentId]: {
                    status: 'runaway',
                    lessons: newLessons
                }
            };
        });
    };

    const handleSaveDaily = async () => {
        if (!selectedClassId || !currentDate) return;
        const [year, month, day] = currentDate.split('-');
        const path = `absences/${principal.id}/${selectedClassId}/${year}-${month}/${day}`;
        
        const payload: Record<string, any> = {};
        sortedStudents.forEach(s => {
            const rec = dailyAbsences[s.id] || { status: 'present', lessons: 0 };
            if (rec.status === 'runaway') {
                payload[s.id] = { status: 'runaway', lessons: rec.lessons || 1 };
            } else {
                payload[s.id] = rec.status;
            }
        });

        await db.ref(path).set(payload);

        // Synchronize allClassAbsences in memory
        const monthKey = `${year}-${month}`;
        setAllClassAbsences(prev => ({
            ...prev,
            [monthKey]: {
                ...(prev[monthKey] || {}),
                [day]: payload
            }
        }));

        alert('تم حفظ الغيابات بنجاح.');
    };

    const handleExecuteAbsenceSaveAndTelegram = async (mode: 'save_only' | 'save_and_notify' | 'notify_individual_only' | 'notify_group_only') => {
        if (!selectedClassId || !currentDate || !selectedClass) return;

        const logs: string[] = [];
        const [year, month, day] = currentDate.split('-');
        const path = `absences/${principal.id}/${selectedClassId}/${year}-${month}/${day}`;

        const payload: Record<string, any> = {};
        sortedStudents.forEach(s => {
            const rec = dailyAbsences[s.id] || { status: 'present', lessons: 0 };
            if (rec.status === 'runaway') {
                payload[s.id] = { status: 'runaway', lessons: rec.lessons || 1 };
            } else {
                payload[s.id] = rec.status;
            }
        });

        // Save to DB if requested
        if (mode === 'save_only' || mode === 'save_and_notify') {
            await db.ref(path).set(payload);

            // Synchronize allClassAbsences in memory
            const monthKey = `${year}-${month}`;
            setAllClassAbsences(prev => ({
                ...prev,
                [monthKey]: {
                    ...(prev[monthKey] || {}),
                    [day]: payload
                }
            }));

            logs.push(`✅ تم حفظ سجل الغيابات في النظام بنجاح بتاريخ (${currentDate}).`);
        }

        if (mode === 'save_only') {
            setTelegramLogModal({
                open: true,
                title: 'حفظ الغيابات',
                logs
            });
            return;
        }

        // Get non-present students
        const nonPresentList = sortedStudents
            .map(s => ({ student: s, item: dailyAbsences[s.id] || { status: 'present', lessons: 0 } }))
            .filter(entry => entry.item.status !== 'present');

        if (nonPresentList.length === 0) {
            logs.push('ℹ️ جميع الطلاب حاضرون في هذا التاريخ، لا يوجد غيابات لإرسال إشعارات عنها.');
            setTelegramLogModal({
                open: true,
                title: 'تقرير إرسال التليكرام',
                logs
            });
            return;
        }

        if (!settings?.telegramBotToken?.trim()) {
            logs.push('❌ لم يتم إدخال توكن بوت التليكرام في إعدادات النظام. يرجى التوجه إلى صفحة (الإعدادات) وإدخال رمز البوت (Bot Token) لتفعيل الخدمة.');
            setTelegramLogModal({
                open: true,
                title: 'تنبيه إعدادات التليكرام',
                logs
            });
            return;
        }

        setIsSendingTelegram(true);

        const shouldSendIndividual = (mode === 'save_and_notify' && sendIndividualTelegram) || mode === 'notify_individual_only';
        const shouldSendGroup = (mode === 'save_and_notify' && sendGroupTelegram) || mode === 'notify_group_only';

        // 1. Send Individual Telegram Messages
        if (shouldSendIndividual) {
            logs.push('--- 📱 بدء إرسال الإشعارات الفردية للطلاب غير الحاضرين ---');
            let successCount = 0;
            let missingIdCount = 0;
            let failCount = 0;

            for (const entry of nonPresentList) {
                const { student, item } = entry;
                const statusName = item.status === 'runaway'
                    ? `هارب (${item.lessons || 1} حصة)`
                    : (STATUS_INFO[item.status]?.text || 'غائب');
                const chatId = student.telegramChatId?.trim();

                // Store in-app notification in Firebase
                try {
                    await db.ref(`student_notifications/${principal.id}/${student.id}`).push({
                        title: `تنبيه غياب يومي (${statusName})`,
                        message: `تم تسجيل حالة (${statusName}) بتاريخ ${currentDate} للشعبة (${selectedClass.stage} - ${selectedClass.section}).`,
                        timestamp: new Date().toISOString(),
                        read: false,
                        type: 'absence_alert'
                    });
                } catch (err) {
                    console.error('Error pushing in-app notification:', err);
                }

                if (!chatId) {
                    missingIdCount++;
                    logs.push(`⚠️ الطالب/ة (${student.name}): لم يقم بربط آيدي التليكرام (Chat ID) بعد.`);
                    continue;
                }

                const msg = 
                    `<b>⚠️ تنبيه غياب طالب</b>\n\n` +
                    `<b>اسم الطالب:</b> ${student.name}\n` +
                    `<b>المرحلة والشعبة:</b> ${selectedClass.stage} - ${selectedClass.section}\n` +
                    `<b>التاريخ:</b> ${currentDate}\n` +
                    `<b>حالة الحضور:</b> ${statusName}\n\n` +
                    `نسترعي انتباه ولي الأمر الموقر لمتابعة سبب غياب الطالب حرصاً على مستواه العلمي والتزامه بالدوام المدرسي.\n\n` +
                    `<i>إدارة المدرسة - معاونية شؤون الطلبة</i>`;

                const res = await sendTelegramNotification(telegramConfig, chatId, msg);
                if (res.success) {
                    successCount++;
                    logs.push(`✅ الطالب/ة (${student.name}): تم إرسال إشعار التليكرام الفردي بنجاح (ID: ${chatId}).`);
                } else {
                    failCount++;
                    logs.push(`❌ الطالب/ة (${student.name}): فشل الإرسال (${res.error})`);
                }
            }

            logs.push(`📊 حصيلة الإرسال الفردي: تم إرسال ${successCount} | ${missingIdCount} غير مرتبطين | ${failCount} فشل.`);
        }

        // 2. Send Group List Telegram Message
        if (shouldSendGroup) {
            logs.push('--- 📢 بدء إرسال قائمة الغيابات الجماعية إلى مجموعة التليكرام ---');
            const targetGroupId = customGroupChatId.trim() || settings?.telegramDefaultChatId?.trim();

            if (!targetGroupId) {
                logs.push('❌ لم يتم تحديد معرف مجموعة التليكرام (Group Chat ID). يرجى أدخال معرف المجموعة في الحقل المخصص.');
            } else {
                const groupMsg = 
                    `<b>📋 قائمة غيابات الطلاب اليومية</b>\n` +
                    `<b>المرحلة والشعبة:</b> ${selectedClass.stage} - ${selectedClass.section}\n` +
                    `<b>التاريخ:</b> ${currentDate}\n` +
                    `<b>العدد الكلي لغير الحاضرين:</b> ${nonPresentList.length} طالب/ة\n` +
                    `-----------------------------------\n` +
                    `<b>أسماء الطلاب الغائبين:</b>\n` +
                    nonPresentList.map((entry, idx) => {
                        const desc = entry.item.status === 'runaway' 
                            ? `هارب - ${entry.item.lessons || 1} حصص` 
                            : (STATUS_INFO[entry.item.status]?.text || 'غائب');
                        return `${idx + 1}. ${entry.student.name} (${desc})`;
                    }).join('\n') +
                    `\n-----------------------------------\n` +
                    `<i>إدارة المدرسة - معاونية شؤون الطلبة</i>`;

                const resGroup = await sendTelegramNotification(telegramConfig, targetGroupId, groupMsg);
                if (resGroup.success) {
                    logs.push(`✅ تم نشر قائمة الغيابات الجماعية لـ (${nonPresentList.length}) طالب بنجاح في المجموعة (${targetGroupId}).`);
                } else {
                    logs.push(`❌ فشل نشر القائمة الجماعية في المجموعة (${targetGroupId}): ${resGroup.error}`);
                }
            }
        }

        setIsSendingTelegram(false);
        setTelegramLogModal({
            open: true,
            title: 'تقرير إشعارات التليكرام والغيابات',
            logs
        });
    };

    const handleSendSingleStudentTelegram = async (student: Student) => {
        if (!selectedClass || !currentDate) return;
        const item = dailyAbsences[student.id] || { status: 'present', lessons: 0 };
        const statusName = item.status === 'runaway'
            ? `هارب (${item.lessons || 1} حصة)`
            : (STATUS_INFO[item.status]?.text || 'غائب');
        const chatId = student.telegramChatId?.trim();

        if (!chatId) {
            alert(`الطالب/ة (${student.name}) لم يقم بربط آيدي التليكرام (Chat ID) بعد. يمكنك إضافة آيدي التليكرام له من صفحة (إدارة تليكرام الطلبة).`);
            return;
        }

        if (!settings?.telegramBotToken?.trim()) {
            alert('لم يتم ضبط توكن بوت التليكرام في إعدادات النظام.');
            return;
        }

        setIsSendingTelegram(true);
        const msg = 
            `<b>⚠️ تنبيه غياب طالب</b>\n\n` +
            `<b>اسم الطالب:</b> ${student.name}\n` +
            `<b>المرحلة والشعبة:</b> ${selectedClass.stage} - ${selectedClass.section}\n` +
            `<b>التاريخ:</b> ${currentDate}\n` +
            `<b>حالة الحضور:</b> ${statusName}\n\n` +
            `نسترعي انتباه ولي الأمر الموقر لمتابعة سبب غياب الطالب حرصاً على مستواه العلمي والتزامه بالدوام المدرسي.\n\n` +
            `<i>إدارة المدرسة - معاونية شؤون الطلبة</i>`;

        const res = await sendTelegramNotification(telegramConfig, chatId, msg);
        setIsSendingTelegram(false);

        if (res.success) {
            alert(`تم إرسال إشعار التليكرام الفردي إلى الطالب (${student.name}) بنجاح!`);
        } else {
            alert(`فشل الإرسال إلى الطالب (${student.name}): ${res.error}`);
        }
    };

    const handleExport = async (type: 'report' | 'letter', student?: Student) => {
        setIsExporting(true);

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
            const { jsPDF } = jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            if (type === 'report' && selectedClass) {
                await renderComponent(
                    <MonthlyAbsenceReportPDF
                        settings={settings}
                        classData={selectedClass}
                        students={sortedStudents}
                        monthlyAbsences={monthlyAbsences}
                        currentMonthTotals={currentMonthTotals}
                        yearTotals={yearTotals}
                        month={currentMonth}
                    />
                );
            } else if (type === 'letter' && student && selectedClass) {
                const sYear = yearTotals[student.id] || { totalDays: 0, absentDays: 0, runawayLessons: 0, runawayDays: 0, warning: '' };
                await renderComponent(
                    <AbsenceWarningLetterPDF
                        settings={settings}
                        classData={selectedClass}
                        student={student}
                        totalAbsences={sYear.totalDays}
                        absentDays={sYear.absentDays}
                        runawayLessons={sYear.runawayLessons}
                        runawayDays={sYear.runawayDays}
                        warningType={sYear.warning || (sYear.totalDays >= 7 ? 'تبليغ اولي' : 'إشعار غياب')}
                        currentDate={currentDate}
                    />
                );
            } else {
                throw new Error("Invalid export configuration.");
            }
            
            const element = tempContainer.children[0] as HTMLElement;
            const canvas = await html2canvas(element, { scale: 2, useCORS: true });
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, 'FAST');
            
            const filename = type === 'letter' && student 
                ? `تبليغ-غياب-${student.name.replace(/\s+/g, '_')}.pdf`
                : `تقرير-الغيابات-${selectedClass.stage}-${selectedClass.section}.pdf`;
            pdf.save(filename);

        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء إنشاء ملف PDF. يرجى المحاولة مجدداً.");
        } finally {
            root.unmount();
            document.body.removeChild(tempContainer);
            setIsExporting(false);
        }
    };

    return (
        <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-gray-100" dir="rtl">
            {isExporting && (
                <div className="fixed inset-0 bg-black/60 z-50 flex flex-col items-center justify-center text-white gap-3">
                    <Loader2 className="h-14 w-14 animate-spin text-cyan-400"/>
                    <p className="font-bold text-lg">جاري تجهيز وطباعة التقرير الرسمي...</p>
                </div>
            )}
            
            {isTutorialVisible && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50 p-4"
                    onClick={() => setIsTutorialVisible(false)}
                >
                    <div 
                        className="bg-black p-2 rounded-lg shadow-xl w-full max-w-4xl relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button 
                            onClick={() => setIsTutorialVisible(false)}
                            className="absolute -top-3 -right-3 bg-white text-black rounded-full p-2 z-10 shadow-lg hover:scale-110 transition-transform cursor-pointer"
                            aria-label="Close video"
                        >
                            <X size={24} />
                        </button>
                        <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                            <iframe 
                                className="absolute top-0 left-0 w-full h-full"
                                src="https://www.youtube.com/embed/B6z29TlF9hE?autoplay=1"
                                title="شرح طريقة ادارة الغيابات" 
                                frameBorder="0" 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                                allowFullScreen
                            ></iframe>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 border-b pb-4 gap-3">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-800">إدارة الغيابات المدرسية</h2>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">
                        تسجيل الدوام اليومي، إحصاء الغيابات التراكمية للعام الدراسي، وإصدار التبليغات القانونية
                    </p>
                </div>
                <button
                    onClick={() => setIsTutorialVisible(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition shadow-sm hover:shadow active:scale-95 text-xs sm:text-sm"
                >
                    <PlayCircle size={18} />
                    شاهد العرض التوضيحي لطريقة ادارة الغيابات
                </button>
            </div>

            <div className="flex border-b border-gray-200 mb-5">
                <button 
                    onClick={() => setActiveTab('daily')} 
                    className={`px-5 py-2.5 font-bold text-sm transition-all flex items-center gap-2 ${
                        activeTab === 'daily' 
                            ? 'border-b-2 border-cyan-600 text-cyan-700 bg-cyan-50/50' 
                            : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <Calendar size={18} />
                    تسجيل الغياب اليومي
                </button>
                <button 
                    onClick={() => setActiveTab('monthly')} 
                    className={`px-5 py-2.5 font-bold text-sm transition-all flex items-center gap-2 ${
                        activeTab === 'monthly' 
                            ? 'border-b-2 border-cyan-600 text-cyan-700 bg-cyan-50/50' 
                            : 'text-gray-500 hover:text-gray-800'
                    }`}
                >
                    <ListChecks size={18} />
                    التقرير الشهري والتراكمي العام
                </button>
            </div>
            
            <div className="mb-5 bg-gray-50 p-3.5 rounded-xl border border-gray-200">
                <label className="font-bold text-sm text-gray-700 block mb-1">اختر الشعبة الدراسية:</label>
                <select 
                    value={selectedClassId} 
                    onChange={e => setSelectedClassId(e.target.value)} 
                    className="w-full md:w-1/2 p-2.5 bg-white border border-gray-300 rounded-lg font-bold text-gray-800 focus:ring-2 focus:ring-cyan-500 outline-none"
                >
                    <option value="">-- اختر شعبة للبدء --</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.stage} - {c.section}</option>)}
                </select>
            </div>

            {!selectedClassId && (
                <div className="text-center text-gray-500 p-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-base font-bold text-gray-600">يرجى اختيار الشعبة لعرض وتسجيل الغيابات.</p>
                </div>
            )}

            {selectedClassId && activeTab === 'daily' && (
                <div>
                    {/* Top Date & Info Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-3">
                            <label className="font-bold text-gray-700 text-sm">تاريخ الغياب:</label>
                            <input 
                                type="date" 
                                value={currentDate} 
                                onChange={e => setCurrentDate(e.target.value)} 
                                className="p-2 border border-gray-300 rounded-lg bg-white shadow-xs font-bold text-gray-800 focus:ring-2 focus:ring-cyan-500 outline-none"
                            />
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <span className="font-bold">الشعبة:</span>
                            <span className="bg-cyan-100 text-cyan-800 px-3 py-1 rounded-full font-black text-xs">
                                {selectedClass?.stage} - {selectedClass?.section}
                            </span>
                            <span className="font-bold mr-2">عدد الطلاب:</span>
                            <span className="bg-gray-200 text-gray-800 px-2.5 py-1 rounded-md font-bold text-xs">
                                {sortedStudents.length}
                            </span>
                        </div>
                    </div>

                    {/* Summary Cards: حاضر، غائب، مجاز، هارب (Matching User Mockup) */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 text-center shadow-xs">
                            <p className="text-xs font-bold text-emerald-700">حاضر</p>
                            <p className="text-2xl font-black text-emerald-800 mt-0.5">{dailyCounts.present}</p>
                        </div>
                        <div className="bg-rose-50/80 border border-rose-200 rounded-xl p-3 text-center shadow-xs">
                            <p className="text-xs font-bold text-rose-700">غائب</p>
                            <p className="text-2xl font-black text-rose-800 mt-0.5">{dailyCounts.absent}</p>
                        </div>
                        <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 text-center shadow-xs">
                            <p className="text-xs font-bold text-amber-700">مجاز</p>
                            <p className="text-2xl font-black text-amber-800 mt-0.5">{dailyCounts.excused}</p>
                        </div>
                        <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-3 text-center shadow-xs">
                            <p className="text-xs font-bold text-blue-700">هارب</p>
                            <p className="text-2xl font-black text-blue-800 mt-0.5">{dailyCounts.runaway}</p>
                        </div>
                    </div>

                    {/* Search Bar (Matching User Mockup) */}
                    <div className="relative mb-4">
                        <input
                            type="text"
                            value={studentSearchTerm}
                            onChange={e => setStudentSearchTerm(e.target.value)}
                            placeholder="ابحث عن اسم طالب في هذه الشعبة..."
                            className="w-full pr-10 pl-4 py-2.5 bg-white border border-gray-300 rounded-xl shadow-xs text-sm font-medium focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                        />
                        <Search className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        {studentSearchTerm && (
                            <button
                                type="button"
                                onClick={() => setStudentSearchTerm('')}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 cursor-pointer"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {isLoadingDaily ? (
                        <div className="text-center py-12">
                            <Loader2 className="animate-spin mx-auto text-cyan-600 h-10 w-10 mb-2"/>
                            <p className="text-gray-500 font-semibold">جاري تحميل سجل الغيابات...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="bg-white border border-gray-200 rounded-xl shadow-xs divide-y divide-gray-100 overflow-hidden">
                                <div className="bg-gray-100 px-4 py-3 flex justify-between items-center text-xs font-bold text-gray-600">
                                    <span>اسم الطالب ومعرف التليكرام</span>
                                    <span>حالة الدوام وإرسال سريع</span>
                                </div>

                                {filteredStudents.map(student => {
                                    const item = dailyAbsences[student.id] || { status: 'present', lessons: 0 };
                                    const status = item.status;
                                    const currentLessons = item.lessons || 1;
                                    const isLinked = !!student.telegramChatId && student.telegramChatId.trim() !== '';

                                    return (
                                        <div key={student.id} className="flex items-center justify-between p-3 hover:bg-gray-50 transition-colors">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-800 text-sm">{student.name}</span>
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    {isLinked ? (
                                                        <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 font-mono">
                                                            <Send size={10} className="text-emerald-600" />
                                                            آيدي: {student.telegramChatId}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                                                            غير مرتبط بالتليكرام
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {status !== 'present' && isLinked && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSendSingleStudentTelegram(student)}
                                                        disabled={isSendingTelegram}
                                                        title="إرسال إشعار تليكرام فردي فوري لهذا الطالب"
                                                        className="p-1.5 text-cyan-600 hover:text-cyan-800 hover:bg-cyan-50 rounded-lg transition-colors border border-cyan-200 cursor-pointer"
                                                    >
                                                        <Send size={16} />
                                                    </button>
                                                )}

                                                {/* Stepper for Runaway Lessons (Matching User Mockup) */}
                                                {status === 'runaway' && (
                                                    <div className="flex items-center bg-blue-50 border border-blue-300 rounded-lg px-2 py-1 text-blue-800 text-xs font-bold gap-1.5 shadow-xs">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRunawayLessonsChange(student.id, 1);
                                                            }}
                                                            className="w-5 h-5 flex items-center justify-center bg-white hover:bg-blue-100 rounded text-blue-700 font-extrabold border border-blue-200 transition active:scale-95 cursor-pointer"
                                                            title="زيادة عدد حصص الهروب"
                                                        >
                                                            +
                                                        </button>
                                                        <span className="min-w-[44px] text-center font-black">
                                                            {currentLessons} حصة
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRunawayLessonsChange(student.id, -1);
                                                            }}
                                                            className="w-5 h-5 flex items-center justify-center bg-white hover:bg-blue-100 rounded text-blue-700 font-extrabold border border-blue-200 transition active:scale-95 cursor-pointer"
                                                            title="إنقاص عدد حصص الهروب"
                                                        >
                                                            -
                                                        </button>
                                                    </div>
                                                )}

                                                {/* Main Status Cycle Button */}
                                                <button 
                                                    onClick={() => handleStatusChange(student.id)} 
                                                    className={`w-24 text-center py-1.5 text-white rounded-lg text-sm font-bold shadow-xs transition-transform active:scale-95 cursor-pointer ${STATUS_INFO[status].color}`}
                                                >
                                                    {STATUS_INFO[status].text}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {filteredStudents.length === 0 && (
                                    <div className="text-center py-8 text-gray-500 font-medium">
                                        لم يتم العثور على طالب يطابق البحث «{studentSearchTerm}».
                                    </div>
                                )}
                            </div>

                            {/* Telegram & Save Control Panel */}
                            <div className="bg-gradient-to-br from-slate-50 to-cyan-50/50 p-5 rounded-2xl border border-cyan-200/80 shadow-xs space-y-4">
                                <div className="flex items-center justify-between border-b border-cyan-200/60 pb-3">
                                    <div className="flex items-center gap-2">
                                        <Send className="text-cyan-600 h-5 w-5" />
                                        <h3 className="font-bold text-gray-800 text-base">خيارات الحفظ وإشعارات التليكرام</h3>
                                    </div>
                                    {settings?.telegramEnabled ? (
                                        <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-full border border-emerald-300 flex items-center gap-1">
                                            <CheckCircle2 size={13} />
                                            البوت مفعل
                                        </span>
                                    ) : (
                                        <span className="text-xs bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-full border border-amber-300 flex items-center gap-1">
                                            <AlertTriangle size={13} />
                                            التليكرام غير مفعّل في الإعدادات
                                        </span>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-200 cursor-pointer hover:border-cyan-300 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={sendIndividualTelegram} 
                                            onChange={e => setSendIndividualTelegram(e.target.checked)}
                                            className="mt-1 h-4 w-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                                        />
                                        <div>
                                            <span className="font-bold text-gray-800 text-sm block">إرسال إشعارات فردية للطلاب غير الحاضرين</span>
                                            <span className="text-xs text-gray-500">إرسال رسالة تليكرام خاصة لولي أمر كل طالب غائب أو هارب عبر Chat ID</span>
                                        </div>
                                    </label>

                                    <label className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-200 cursor-pointer hover:border-cyan-300 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={sendGroupTelegram} 
                                            onChange={e => setSendGroupTelegram(e.target.checked)}
                                            className="mt-1 h-4 w-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                                        />
                                        <div>
                                            <span className="font-bold text-gray-800 text-sm block">إرسال قائمة جماعية لمجموعة التليكرام</span>
                                            <span className="text-xs text-gray-500">نشر قائمة تحتوي على جميع أسماء الغائبين في مجموعة التليكرام</span>
                                        </div>
                                    </label>
                                </div>

                                {sendGroupTelegram && (
                                    <div className="bg-white p-3 rounded-xl border border-gray-200">
                                        <label className="block text-xs font-bold text-gray-700 mb-1">
                                            معرف القناة أو المجموعة في التليكرام (Group Chat ID):
                                        </label>
                                        <input 
                                            type="text" 
                                            dir="ltr"
                                            value={customGroupChatId} 
                                            onChange={e => setCustomGroupChatId(e.target.value)} 
                                            placeholder="مثلاً: -1001234567890 أو @school_group"
                                            className="w-full text-sm p-2 border border-gray-300 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-cyan-500 font-mono outline-none"
                                        />
                                        <p className="text-[11px] text-gray-500 mt-1">
                                            يمكنك ترك هذا الحقل كما هو لاستخدام معرف المجموعة الافتراضي المكتوب في إعدادات النظام.
                                        </p>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="pt-2 flex flex-wrap gap-3 justify-center">
                                    <button 
                                        onClick={() => handleExecuteAbsenceSaveAndTelegram('save_and_notify')} 
                                        disabled={isSendingTelegram}
                                        className="flex-1 min-w-[200px] px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 cursor-pointer"
                                    >
                                        {isSendingTelegram ? <Loader2 className="animate-spin h-5 w-5" /> : <Send size={18} />}
                                        <span>حفظ وإرسال إشعارات التليكرام</span>
                                    </button>

                                    <button 
                                        onClick={() => handleExecuteAbsenceSaveAndTelegram('save_only')} 
                                        disabled={isSendingTelegram}
                                        className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 cursor-pointer"
                                    >
                                        <span>حفظ في النظام فقط</span>
                                    </button>

                                    <button 
                                        onClick={() => handleExecuteAbsenceSaveAndTelegram('notify_group_only')} 
                                        disabled={isSendingTelegram}
                                        className="px-4 py-3 bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 text-sm cursor-pointer"
                                    >
                                        <Users size={16} />
                                        <span>إرسال القائمة الجماعية للمجموعة</span>
                                    </button>

                                    <button 
                                        onClick={() => handleExecuteAbsenceSaveAndTelegram('notify_individual_only')} 
                                        disabled={isSendingTelegram}
                                        className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 text-sm cursor-pointer"
                                    >
                                        <Bot size={16} />
                                        <span>إرسال الإشعارات الفردية فقط</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {selectedClassId && activeTab === 'monthly' && (
                <div>
                    {/* Header Controls for Monthly View */}
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-3">
                            <label className="font-bold text-gray-700 text-sm">الشهر المطلوب عرضه:</label>
                            <input 
                                type="month" 
                                value={currentMonth} 
                                onChange={e => setCurrentMonth(e.target.value)} 
                                className="p-2 border border-gray-300 rounded-lg bg-white shadow-xs font-bold text-gray-800 focus:ring-2 focus:ring-cyan-500 outline-none"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => handleExport('report')} 
                                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs transition transform hover:scale-105 text-sm cursor-pointer"
                            >
                                <Printer size={18}/>
                                <span>طباعة التقرير الشهري</span>
                            </button>
                        </div>
                    </div>

                    {/* Summary Rule Banner */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-900 flex items-start gap-2 shadow-xs">
                        <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div className="leading-relaxed">
                            <span className="font-black block text-sm mb-0.5">ضوابط احتساب الغيابات والتبليغات الرسمية:</span>
                            <span>• <strong>مجموع غيابات العام:</strong> يشمل جميع الغيابات التراكمية للطالب في كافة شهور العام الدراسي كاملاً، مع احتساب كل 4 حصص هروب بيوم غياب واحد.</span>
                            <br />
                            <span>• <strong>الملاحظات القانونية:</strong> (7 أيام غياب = <strong className="text-amber-800">تبليغ اولي</strong>) | (14 يوم غياب = <strong className="text-orange-800">تبليغ ثاني</strong>) | (21 يوم غياب = <strong className="text-red-700 font-black">تبليغ نهائي</strong>).</span>
                        </div>
                    </div>

                    {isLoadingMonthly ? (
                        <div className="text-center py-12">
                            <Loader2 className="animate-spin mx-auto text-cyan-600 h-10 w-10 mb-2"/>
                            <p className="text-gray-500 font-semibold">جاري تحميل سجل الغيابات الشهري والتراكمي...</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-gray-300 rounded-xl shadow-xs">
                            <table className="min-w-full border-collapse text-xs">
                                <thead className="bg-gray-100 border-b border-gray-300 font-bold text-gray-700">
                                    <tr>
                                        <th className="border-l border-gray-300 p-2 text-center w-8">ت</th>
                                        <th className="border-l border-gray-300 p-2 text-right min-w-[140px]">اسم الطالب</th>
                                        {Array.from({length: 31}, (_, i) => i + 1).map(day => (
                                            <th key={day} className="border-l border-gray-200 p-1 w-7 text-center text-[11px] font-semibold">{day}</th>
                                        ))}
                                        <th className="border-l border-gray-300 p-2 text-center bg-gray-50 w-20" title="مجموع غيابات هذا الشهر">غياب الشهر</th>
                                        <th className="border-l border-gray-300 p-2 text-center bg-amber-50 text-amber-900 w-28" title="مجموع الغيابات التراكمي لجميع شهور العام الدراسي (كل 4 حصص هروب = يوم غياب)">مجموع غيابات العام</th>
                                        <th className="border-l border-gray-300 p-2 text-center min-w-[110px]">الملاحظات</th>
                                        <th className="p-2 text-center w-24">إجراء</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {sortedStudents.map((student, idx) => {
                                        const sMonth = currentMonthTotals[student.id] || { absentDays: 0, runawayLessons: 0, runawayDays: 0, totalDays: 0 };
                                        const sYear = yearTotals[student.id] || { totalDays: 0, absentDays: 0, runawayLessons: 0, runawayDays: 0, warning: '' };
                                        
                                        return (
                                            <tr key={student.id} className="hover:bg-cyan-50/50 transition-colors">
                                                <td className="border-l border-gray-200 p-1.5 text-center font-medium text-gray-500">{idx + 1}</td>
                                                <td className="border-l border-gray-200 p-1.5 font-bold text-gray-800">{student.name}</td>
                                                {Array.from({length: 31}, (_, i) => i + 1).map(day => {
                                                    const dayStr = String(day).padStart(2, '0');
                                                    const raw = monthlyAbsences[dayStr]?.[student.id];
                                                    const rec = parseAbsenceValue(raw);
                                                    let symbol = '';
                                                    let colorClass = '';
                                                    if (rec.status === 'absent') {
                                                        symbol = 'غ';
                                                        colorClass = 'text-red-600 font-black';
                                                    } else if (rec.status === 'excused') {
                                                        symbol = 'م';
                                                        colorClass = 'text-amber-600 font-bold';
                                                    } else if (rec.status === 'runaway') {
                                                        symbol = rec.lessons > 1 ? `هـ${rec.lessons}` : 'هـ';
                                                        colorClass = 'text-blue-600 font-black';
                                                    }
                                                    return (
                                                        <td key={day} className={`border-l border-gray-100 p-1 text-center ${colorClass}`}>
                                                            {symbol}
                                                        </td>
                                                    );
                                                })}
                                                <td className="border-l border-gray-200 p-1.5 text-center font-bold text-gray-700 bg-gray-50">
                                                    {sMonth.totalDays}
                                                </td>
                                                <td className="border-l border-gray-200 p-1.5 text-center font-black bg-amber-50/80 text-amber-900">
                                                    <span className="text-sm">{sYear.totalDays} يوم</span>
                                                    {sYear.runawayLessons > 0 && (
                                                        <span className="block text-[10px] font-semibold text-blue-700 mt-0.5">
                                                            ({sYear.runawayLessons} حصة هروب)
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="border-l border-gray-200 p-1.5 text-center">
                                                    {sYear.warning === 'تبليغ نهائي' && (
                                                        <span className="inline-block px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-300 font-black text-xs shadow-xs animate-pulse">
                                                            تبليغ نهائي
                                                        </span>
                                                    )}
                                                    {sYear.warning === 'تبليغ ثاني' && (
                                                        <span className="inline-block px-2.5 py-1 rounded-full bg-orange-100 text-orange-800 border border-orange-300 font-bold text-xs">
                                                            تبليغ ثاني
                                                        </span>
                                                    )}
                                                    {sYear.warning === 'تبليغ اولي' && (
                                                        <span className="inline-block px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-bold text-xs">
                                                            تبليغ اولي
                                                        </span>
                                                    )}
                                                    {!sYear.warning && (
                                                        <span className="text-gray-400 font-semibold">-</span>
                                                    )}
                                                </td>
                                                <td className="p-1.5 text-center">
                                                    {sYear.totalDays > 0 ? (
                                                        <button 
                                                            onClick={() => handleExport('letter', student)} 
                                                            className="text-xs bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-lg font-bold shadow-xs transition transform hover:scale-105 cursor-pointer"
                                                            title="طباعة كتاب تبليغ رسمي لولي الأمر"
                                                        >
                                                            طباعة تبليغ
                                                        </button>
                                                    ) : (
                                                        <span className="text-gray-300 text-xs">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Telegram Log Modal */}
            {telegramLogModal && telegramLogModal.open && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200">
                        <div className="bg-cyan-700 text-white p-4 flex justify-between items-center">
                            <div className="flex items-center gap-2 font-bold text-lg">
                                <Send size={20} />
                                <span>{telegramLogModal.title}</span>
                            </div>
                            <button 
                                onClick={() => setTelegramLogModal(null)}
                                className="p-1 hover:bg-cyan-800 rounded-full transition-colors cursor-pointer"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-2 text-sm">
                            {telegramLogModal.logs.map((log, index) => (
                                <div 
                                    key={index} 
                                    className={`p-2.5 rounded-lg border font-medium text-right ${
                                        log.startsWith('✅') ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                                        log.startsWith('❌') ? 'bg-rose-50 text-rose-800 border-rose-200' :
                                        log.startsWith('⚠️') ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                        log.startsWith('---') ? 'font-bold text-cyan-800 border-transparent pt-3 pb-1 text-center' :
                                        'bg-gray-50 text-gray-700 border-gray-200'
                                    }`}
                                >
                                    {log}
                                </div>
                            ))}
                        </div>

                        <div className="bg-gray-100 p-4 text-center border-t">
                            <button 
                                onClick={() => setTelegramLogModal(null)}
                                className="px-6 py-2 bg-cyan-700 text-white font-bold rounded-xl hover:bg-cyan-800 transition-colors cursor-pointer"
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
