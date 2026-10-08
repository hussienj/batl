import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { User, ClassData, Student, SchoolSettings, AdvisorGuidanceItem, AdvisorChatMessage, AdvisorPrivateChat, DisciplineRecord, DisciplineSettings } from '../../types.ts';
import { 
    Compass, Users, Search, Plus, Trash2, ClipboardList, CheckCircle2, 
    AlertCircle, UserCheck, ShieldCheck, Award, BookOpen, FileText, 
    Printer, MessageCircle, Send, Calendar, Sparkles, Filter, Lock, 
    BellRing, MessageSquare, Check, Eye, ShieldAlert, Flame
} from 'lucide-react';
import { db } from '../../lib/firebase.ts';
import { sendTelegramNotification } from '../../lib/telegram.ts';
import { DEFAULT_DISCIPLINE_CRITERIA, DEFAULT_DISCIPLINE_MAX_POINTS } from '../../constants.ts';
import DisciplineReportModal from '../discipline/DisciplineReportModal.tsx';

interface ClassAdvisorDashboardProps {
    teacher: User;
    classes: ClassData[];
    settings: SchoolSettings;
}

interface GuidanceNote {
    id: string;
    studentId: string;
    studentName: string;
    category: 'سلوكي' | 'مستوى دراسي' | 'غيابات' | 'تواصل مع ولي الأمر' | 'عام';
    content: string;
    createdAt: number;
    createdByName: string;
    sentToStudent?: boolean;
}

export default function ClassAdvisorDashboard({ teacher, classes, settings }: ClassAdvisorDashboardProps) {
    const [activeTab, setActiveTab] = useState<'students' | 'notes' | 'guidance_send' | 'secret_chat' | 'academic'>('students');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    
    // Form state for adding a guidance note
    const [noteStudentId, setNoteStudentId] = useState<string>('');
    const [noteCategory, setNoteCategory] = useState<GuidanceNote['category']>('عام');
    const [noteContent, setNoteContent] = useState<string>('');
    const [sendNoteToStudent, setSendNoteToStudent] = useState<boolean>(true);
    const [isSubmittingNote, setIsSubmittingNote] = useState<boolean>(false);

    // Form state for sending general/private guidance
    const [guidanceTargetType, setGuidanceTargetType] = useState<'general' | 'private'>('general');
    const [guidanceStudentId, setGuidanceStudentId] = useState<string>('');
    const [guidanceTitle, setGuidanceTitle] = useState<string>('');
    const [guidanceContent, setGuidanceContent] = useState<string>('');
    const [isSubmittingGuidance, setIsSubmittingGuidance] = useState<boolean>(false);

    // States for Chat/Consultations
    const [chats, setChats] = useState<AdvisorPrivateChat[]>([]);
    const [selectedChatStudent, setSelectedChatStudent] = useState<Student | null>(null);
    const [chatMessages, setChatMessages] = useState<AdvisorChatMessage[]>([]);
    const [replyText, setReplyText] = useState<string>('');
    const [isSendingReply, setIsSendingReply] = useState<boolean>(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Notes & Guidance lists from Firebase
    const [notes, setNotes] = useState<GuidanceNote[]>([]);
    const [generalGuidanceList, setGeneralGuidanceList] = useState<AdvisorGuidanceItem[]>([]);
    const [disciplineRecords, setDisciplineRecords] = useState<Record<string, DisciplineRecord[]>>({});
    const [disciplineMaxPoints, setDisciplineMaxPoints] = useState<number>(DEFAULT_DISCIPLINE_MAX_POINTS);
    const [reportStudent, setReportStudent] = useState<Student | null>(null);

    // Find class where teacher is advisor
    const advisorClass = useMemo(() => {
        if (!teacher) return null;
        if (teacher.advisorClassId) {
            const found = classes.find(c => c.id === teacher.advisorClassId);
            if (found) return found;
        }
        return classes.find(c => c.advisorTeacherId === teacher.id) || null;
    }, [classes, teacher]);

    const principalId = teacher.principalId || 'principal_al_hamza';

    // Fetch discipline records & settings
    useEffect(() => {
        if (!principalId) return;

        db.ref(`discipline_settings/${principalId}/maxPoints`).on('value', snap => {
            if (snap.exists()) setDisciplineMaxPoints(snap.val() || DEFAULT_DISCIPLINE_MAX_POINTS);
        });

        const dRef = db.ref(`discipline_records/${principalId}`);
        const cb = (snap: any) => {
            const data = snap.val() || {};
            const res: Record<string, DisciplineRecord[]> = {};
            Object.keys(data).forEach(sId => {
                res[sId] = Object.values(data[sId] || {});
            });
            setDisciplineRecords(res);
        };
        dRef.on('value', cb);
        return () => {
            dRef.off('value', cb);
        };
    }, [principalId]);

    // Scroll chat to bottom
    useEffect(() => {
        if (activeTab === 'secret_chat' && selectedChatStudent) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, selectedChatStudent, activeTab]);

    // Fetch guidance notes for this class
    useEffect(() => {
        if (!advisorClass || !principalId) return;

        const notesRef = db.ref(`advisor_notes/${principalId}/${advisorClass.id}`);
        const handleValue = (snapshot: any) => {
            const data = snapshot.val();
            if (data) {
                const loaded: GuidanceNote[] = Object.values(data);
                loaded.sort((a, b) => b.createdAt - a.createdAt);
                setNotes(loaded);
            } else {
                setNotes([]);
            }
        };

        notesRef.on('value', handleValue);
        return () => { notesRef.off('value', handleValue); };
    }, [advisorClass, principalId]);

    // Fetch general guidance list
    useEffect(() => {
        if (!advisorClass || !principalId) return;

        const genRef = db.ref(`advisor_general_guidance/${principalId}/${advisorClass.id}`);
        const handleGen = (snapshot: any) => {
            const val = snapshot.val();
            if (val) {
                const list: AdvisorGuidanceItem[] = Object.values(val);
                list.sort((a, b) => b.createdAt - a.createdAt);
                setGeneralGuidanceList(list);
            } else {
                setGeneralGuidanceList([]);
            }
        };

        genRef.on('value', handleGen);
        return () => { genRef.off('value', handleGen); };
    }, [advisorClass, principalId]);

    // Fetch secret chats list for students in this class
    useEffect(() => {
        if (!advisorClass || !principalId) return;

        const chatsRef = db.ref(`advisor_private_chats/${principalId}`);
        const handleChats = (snapshot: any) => {
            const val = snapshot.val();
            if (val) {
                const allChats: AdvisorPrivateChat[] = Object.values(val);
                const classStudentIds = new Set((advisorClass.students || []).map(s => s.id));
                const filtered = allChats.filter(c => c.classId === advisorClass.id || classStudentIds.has(c.studentId));
                filtered.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
                setChats(filtered);
            } else {
                setChats([]);
            }
        };

        chatsRef.on('value', handleChats);
        return () => { chatsRef.off('value', handleChats); };
    }, [advisorClass, principalId]);

    // Fetch chat messages when a student chat is selected
    useEffect(() => {
        if (!selectedChatStudent || !principalId) return;

        const msgRef = db.ref(`advisor_private_messages/${principalId}/${selectedChatStudent.id}`);
        const handleMsgs = (snap: any) => {
            const val = snap.val();
            if (val) {
                const msgs: AdvisorChatMessage[] = Object.values(val);
                msgs.sort((a, b) => a.timestamp - b.timestamp);
                setChatMessages(msgs);

                // Mark unread by advisor as false
                db.ref(`advisor_private_chats/${principalId}/${selectedChatStudent.id}/unreadByAdvisor`).set(false);
            } else {
                setChatMessages([]);
            }
        };

        msgRef.on('value', handleMsgs);
        return () => { msgRef.off('value', handleMsgs); };
    }, [selectedChatStudent, principalId]);

    const students = useMemo(() => {
        if (!advisorClass) return [];
        return advisorClass.students || [];
    }, [advisorClass]);

    const filteredStudents = useMemo(() => {
        if (!searchQuery.trim()) return students;
        const q = searchQuery.toLowerCase().trim();
        return students.filter(s => 
            (s.name && s.name.toLowerCase().includes(q)) ||
            (s.examId && String(s.examId).toLowerCase().includes(q)) ||
            (s.studentAccessCode && String(s.studentAccessCode).toLowerCase().includes(q))
        );
    }, [students, searchQuery]);

    const filteredNotes = useMemo(() => {
        if (selectedCategory === 'all') return notes;
        return notes.filter(n => n.category === selectedCategory);
    }, [notes, selectedCategory]);

    // Telegram configuration
    const telegramConfig = useMemo(() => ({
        botToken: settings?.telegramBotToken,
        defaultChatId: settings?.telegramDefaultChatId,
        enabled: settings?.telegramEnabled
    }), [settings]);

    const handleSaveStudentTelegramChatId = async (studentId: string, chatId: string) => {
        if (!advisorClass) return;
        try {
            const updatedStudents = (advisorClass.students || []).map(s => {
                if (s.id === studentId) {
                    return { ...s, telegramChatId: chatId.trim() };
                }
                return s;
            });
            await db.ref(`classes/${advisorClass.id}/students`).set(updatedStudents);
            alert("تم حفظ معرف الشات في التليكرام للطالب بنجاح!");
        } catch (err) {
            console.error("Error saving Telegram ID:", err);
            alert("حدث خطأ أثناء حفظ معرف التليكرام.");
        }
    };

    // Total unread chats count
    const totalUnreadChats = useMemo(() => {
        return chats.filter(c => c.unreadByAdvisor).length;
    }, [chats]);

    // Add guidance note handler
    const handleAddNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!advisorClass || !noteStudentId || !noteContent.trim()) {
            alert("يرجى اختيار الطالب وكتابة تفاصيل الملاحظة.");
            return;
        }

        const student = students.find(s => s.id === noteStudentId);
        if (!student) return;

        setIsSubmittingNote(true);
        try {
            const noteId = db.ref().child(`advisor_notes/${principalId}/${advisorClass.id}`).push().key || `note_${Date.now()}`;
            const newNote: GuidanceNote = {
                id: noteId,
                studentId: student.id,
                studentName: student.name,
                category: noteCategory,
                content: noteContent.trim(),
                createdAt: Date.now(),
                createdByName: teacher.name,
                sentToStudent: sendNoteToStudent
            };

            await db.ref(`advisor_notes/${principalId}/${advisorClass.id}/${noteId}`).set(newNote);

            // If sent to student, notify student
            if (sendNoteToStudent) {
                await db.ref(`student_notifications/${principalId}/${student.id}`).push({
                    title: 'ملاحظة إرشادية جديدة من مرشد الصف',
                    message: `قام مرشد الصف (${teacher.name}) بإشعارك بملاحظة إرشادية جديدة: "${noteContent.trim()}"`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    type: 'advisor_note'
                });

                // Send Telegram Notification
                const targetChatId = student.telegramChatId || settings?.telegramDefaultChatId;
                const tgRes = await sendTelegramNotification(
                    telegramConfig,
                    targetChatId,
                    `<b>📌 ملاحظة إرشادية جديدة من مرشد الصف</b>\n` +
                    `<b>الطالب:</b> ${student.name}\n` +
                    `<b>المرشد:</b> الأستاذ/ة ${teacher.name}\n` +
                    `<b>التصنيف:</b> ${noteCategory}\n` +
                    `<b>الملاحظة:</b> ${noteContent.trim()}`
                );

                if (!tgRes.success) {
                    alert(`تم حفظ الملاحظة وإرسالها لبوابة الطالب، ولكن فشل الإرسال للتليكرام:\n${tgRes.error}`);
                } else {
                    alert("تم حفظ الملاحظة وإرسال إشعار للطالب وإرسالها عبر التليكرام بنجاح!");
                }
            } else {
                alert("تم حفظ الملاحظة الإرشادية بنجاح.");
            }

            setNoteContent('');
            setNoteStudentId('');
            setNoteCategory('عام');
            setSendNoteToStudent(true);
        } catch (err) {
            console.error("Error saving note:", err);
            alert("حدث خطأ أثناء حفظ الملاحظة.");
        } finally {
            setIsSubmittingNote(false);
        }
    };

    // Send existing note to student
    const handleSendExistingNoteToStudent = async (note: GuidanceNote) => {
        if (!advisorClass) return;
        try {
            await db.ref(`advisor_notes/${principalId}/${advisorClass.id}/${note.id}/sentToStudent`).set(true);

            // Push notification to student
            await db.ref(`student_notifications/${principalId}/${note.studentId}`).push({
                title: 'ملاحظة إرشادية جديدة من مرشد الصف',
                message: `قام مرشد الصف (${teacher.name}) بمشاركة ملاحظة إرشادية معك: "${note.content}"`,
                timestamp: new Date().toISOString(),
                read: false,
                type: 'advisor_note'
            });

            const targetStudent = students.find(s => s.id === note.studentId);
            const targetChatId = targetStudent?.telegramChatId || settings?.telegramDefaultChatId;
            const tgRes = await sendTelegramNotification(
                telegramConfig,
                targetChatId,
                `<b>📌 ملاحظة إرشادية مشاركة من مرشد الصف</b>\n` +
                `<b>الطالب:</b> ${note.studentName}\n` +
                `<b>المرشد:</b> الأستاذ/ة ${teacher.name}\n` +
                `<b>التصنيف:</b> ${note.category}\n` +
                `<b>الملاحظة:</b> ${note.content}`
            );

            if (!tgRes.success) {
                alert(`تم إرسال الملاحظة لبوابة الطالب، ولكن تعذر إرسالها للتليكرام:\n${tgRes.error}`);
            } else {
                alert(`تم إرسال الملاحظة للطالب (${note.studentName}) وإشعاره بها وعبر التليكرام!`);
            }
        } catch (err) {
            console.error("Error sending note to student:", err);
            alert("حدث خطأ أثناء إرسال الملاحظة للطالب.");
        }
    };

    const handleDeleteNote = async (noteId: string) => {
        if (!advisorClass) return;
        if (!confirm("هل أنت متأكد من حذف هذه الملاحظة الإرشادية؟")) return;

        try {
            await db.ref(`advisor_notes/${principalId}/${advisorClass.id}/${noteId}`).remove();
        } catch (err) {
            console.error("Error deleting note:", err);
            alert("حدث خطأ أثناء حذف الملاحظة.");
        }
    };

    // Handle sending General / Private Guidance
    const handleSendGuidance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!advisorClass || !guidanceTitle.trim() || !guidanceContent.trim()) {
            alert("يرجى كتابة عنوان ونص التوجيه.");
            return;
        }

        if (guidanceTargetType === 'private' && !guidanceStudentId) {
            alert("يرجى اختيار الطالب الموجه له التوجيه الخاص.");
            return;
        }

        setIsSubmittingGuidance(true);
        try {
            const timestamp = Date.now();
            const selectedStudent = students.find(s => s.id === guidanceStudentId);

            if (guidanceTargetType === 'general') {
                // General guidance to whole class
                const gId = db.ref().child(`advisor_general_guidance/${principalId}/${advisorClass.id}`).push().key || `gen_${timestamp}`;
                const guidanceItem: AdvisorGuidanceItem = {
                    id: gId,
                    classId: advisorClass.id,
                    title: guidanceTitle.trim(),
                    content: guidanceContent.trim(),
                    createdAt: timestamp,
                    advisorTeacherId: teacher.id,
                    advisorTeacherName: teacher.name
                };

                await db.ref(`advisor_general_guidance/${principalId}/${advisorClass.id}/${gId}`).set(guidanceItem);

                // Notify all students in class
                const notifPromises = students.map(st => 
                    db.ref(`student_notifications/${principalId}/${st.id}`).push({
                        title: `توجيه عام للشعبة: ${guidanceTitle.trim()}`,
                        message: `أرسل مرشد الصف (${teacher.name}) توجيهاً عاماً لجميع طلاب الشعبة: "${guidanceContent.trim()}"`,
                        timestamp: new Date().toISOString(),
                        read: false,
                        type: 'general_guidance'
                    })
                );
                await Promise.all(notifPromises);

                // Send Telegram Notification
                sendTelegramNotification(
                    telegramConfig,
                    settings?.telegramDefaultChatId,
                    `<b>📢 توجيه عام للشعبة (${advisorClass.stage} - ${advisorClass.section})</b>\n` +
                    `<b>مرشد الصف:</b> الأستاذ/ة ${teacher.name}\n` +
                    `<b>العنوان:</b> ${guidanceTitle.trim()}\n\n` +
                    `${guidanceContent.trim()}`
                );

                alert(`تم إرسال التوجيه العام لجميع طلاب الشعبة (${students.length} طالب) وإشعارهم وعبر التليكرام بنجاح!`);
            } else {
                // Private guidance to specific student
                const pId = db.ref().child(`advisor_student_guidance/${principalId}/${guidanceStudentId}`).push().key || `priv_${timestamp}`;
                const privateItem: AdvisorGuidanceItem = {
                    id: pId,
                    classId: advisorClass.id,
                    studentId: guidanceStudentId,
                    studentName: selectedStudent?.name,
                    title: guidanceTitle.trim(),
                    content: guidanceContent.trim(),
                    createdAt: timestamp,
                    advisorTeacherId: teacher.id,
                    advisorTeacherName: teacher.name
                };

                await db.ref(`advisor_student_guidance/${principalId}/${guidanceStudentId}/${pId}`).set(privateItem);

                // Notify target student
                await db.ref(`student_notifications/${principalId}/${guidanceStudentId}`).push({
                    title: `توجيه خاص من مرشد الصف: ${guidanceTitle.trim()}`,
                    message: `أرسل لك مرشد الصف (${teacher.name}) توجيهاً خاصاً: "${guidanceContent.trim()}"`,
                    timestamp: new Date().toISOString(),
                    read: false,
                    type: 'private_guidance'
                });

                // Send Telegram Notification
                const targetChatId = selectedStudent?.telegramChatId || settings?.telegramDefaultChatId;
                const tgRes = await sendTelegramNotification(
                    telegramConfig,
                    targetChatId,
                    `<b>🔒 توجيه خاص للطالب: ${selectedStudent?.name}</b>\n` +
                    `<b>مرشد الصف:</b> الأستاذ/ة ${teacher.name}\n` +
                    `<b>العنوان:</b> ${guidanceTitle.trim()}\n\n` +
                    `${guidanceContent.trim()}`
                );

                if (!tgRes.success) {
                    alert(`تم حفظ التوجيه في حساب الطالب، ولكن تعذر الإرسال للتليكرام:\n${tgRes.error}`);
                } else {
                    alert(`تم إرسال التوجيه الخاص للطالب (${selectedStudent?.name}) وإشعار به وعبر التليكرام بنجاح!`);
                }
            }

            setGuidanceTitle('');
            setGuidanceContent('');
            setGuidanceStudentId('');
        } catch (err) {
            console.error("Error sending guidance:", err);
            alert("حدث خطأ أثناء إرسال التوجيه.");
        } finally {
            setIsSubmittingGuidance(false);
        }
    };

    // Delete General Guidance
    const handleDeleteGeneralGuidance = async (gId: string) => {
        if (!advisorClass) return;
        if (!confirm("هل أنت متأكد من حذف هذا التوجيه العام؟")) return;
        try {
            await db.ref(`advisor_general_guidance/${principalId}/${advisorClass.id}/${gId}`).remove();
        } catch (err) {
            console.error(err);
        }
    };

    // Reply to Secret Consultation Message
    const handleSendReply = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!selectedChatStudent || !replyText.trim() || isSendingReply) return;

        setIsSendingReply(true);
        const text = replyText.trim();
        const msgId = db.ref().child(`advisor_private_messages/${principalId}/${selectedChatStudent.id}`).push().key || `reply_${Date.now()}`;
        const timestamp = Date.now();

        const msg: AdvisorChatMessage = {
            id: msgId,
            senderId: teacher.id,
            senderName: teacher.name,
            senderRole: 'advisor',
            text,
            timestamp,
            read: false
        };

        try {
            await db.ref(`advisor_private_messages/${principalId}/${selectedChatStudent.id}/${msgId}`).set(msg);

            // Update chat metadata
            await db.ref(`advisor_private_chats/${principalId}/${selectedChatStudent.id}`).update({
                lastMessageText: text,
                lastMessageTimestamp: timestamp,
                unreadByAdvisor: false,
                unreadByStudent: true
            });

            // Push notification to student
            await db.ref(`student_notifications/${principalId}/${selectedChatStudent.id}`).push({
                title: 'رد جديد من مرشد الصف على استشارتك',
                message: `قام مرشد الصف (${teacher.name}) بالرد على استشارتك السرية: "${text}"`,
                timestamp: new Date().toISOString(),
                read: false,
                type: 'secret_consultation_reply'
            });

            // Telegram Notification
            const targetChatId = selectedChatStudent.telegramChatId || settings?.telegramDefaultChatId;
            sendTelegramNotification(
                telegramConfig,
                targetChatId,
                `<b>💬 رد جديد من مرشد الصف على استشارتك السرية</b>\n` +
                `<b>الطالب:</b> ${selectedChatStudent.name}\n` +
                `<b>المرشد:</b> الأستاذ/ة ${teacher.name}\n` +
                `<b>الرد:</b> ${text}`
            );

            setReplyText('');
        } catch (err) {
            console.error("Error sending reply:", err);
            alert("حدث خطأ أثناء إرسال الرد.");
        } finally {
            setIsSendingReply(false);
        }
    };

    // Calculate class academic statistics summary
    const academicSummary = useMemo(() => {
        if (!advisorClass || students.length === 0) return { studentAverages: [], topStudents: [] };

        const studentAverages = students.map(s => {
            let totalGrade = 0;
            let count = 0;
            if (s.grades) {
                Object.values(s.grades).forEach((g: any) => {
                    const finalG = g?.finalExam1st ?? g?.annualPursuit;
                    if (finalG !== null && finalG !== undefined) {
                        totalGrade += Number(finalG);
                        count++;
                    }
                });
            }
            const avg = count > 0 ? (totalGrade / count) : 0;
            return { student: s, avg: Math.round(avg * 10) / 10 };
        });

        studentAverages.sort((a, b) => b.avg - a.avg);
        const topStudents = studentAverages.slice(0, 5).filter(a => a.avg > 0);

        return { studentAverages, topStudents };
    }, [advisorClass, students]);

    if (!advisorClass) {
        return (
            <div className="bg-white p-8 rounded-2xl shadow-xl text-center max-w-3xl mx-auto my-8 border border-gray-100">
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow">
                    <Compass className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">لوحة إشراف مرشد الصف</h2>
                <p className="text-gray-600 max-w-md mx-auto mb-6 leading-relaxed">
                    لم يتم تعيينك كمرشد لشعبة حالياً. يمكنك التواصل مع إدارة المدرسة لتعيينك كمرشد لإحدى الشعب التي تدرسها في المدرسة.
                </p>
                <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-red-800 text-sm font-semibold max-w-lg mx-auto flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 flex-shrink-0 text-red-600" />
                    <span>تتيح لك لوحة الإشراف متابعة طلاب الشعبة، إرسال التوجيهات العامة والخاصة، والتواصل السري مع الطلاب بشأن مشاكلهم.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Top Banner / Header */}
            <div className="bg-gradient-to-r from-red-700 via-rose-800 to-amber-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-64 h-64 bg-yellow-400/10 rounded-full blur-3xl -ml-20 -mt-20 pointer-events-none"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-yellow-400/20 text-yellow-200 text-xs font-bold rounded-full mb-3 border border-yellow-300/30">
                            <Compass className="w-4 h-4 text-yellow-300" />
                            <span>لوحة إشراف مرشد الصف</span>
                        </div>
                        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-yellow-300">
                            {advisorClass.stage} - ({advisorClass.section})
                        </h2>
                        <p className="text-rose-100 mt-2 text-sm sm:text-base flex items-center gap-2">
                            <span>المدرسة: {settings.schoolName}</span>
                            <span>•</span>
                            <span>المرشد: الاستاذ {teacher.name}</span>
                        </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full md:w-auto">
                        <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/10 text-center">
                            <p className="text-xs text-rose-200 font-semibold mb-0.5">عدد الطلاب</p>
                            <p className="text-2xl font-bold text-yellow-300">{students.length}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/10 text-center">
                            <p className="text-xs text-rose-200 font-semibold mb-0.5">الملاحظات</p>
                            <p className="text-2xl font-bold">{notes.length}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/10 text-center">
                            <p className="text-xs text-rose-200 font-semibold mb-0.5">توجيهات عامة</p>
                            <p className="text-2xl font-bold">{generalGuidanceList.length}</p>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md p-3.5 rounded-xl border border-white/10 text-center relative">
                            <p className="text-xs text-rose-200 font-semibold mb-0.5">استشارات سرية</p>
                            <p className="text-2xl font-bold text-yellow-300">{chats.length}</p>
                            {totalUnreadChats > 0 && (
                                <span className="absolute -top-2 -right-2 bg-yellow-400 text-red-900 text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow">
                                    {totalUnreadChats} جديد
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs - Highlighted with Red and Yellow styling for Class Advisor */}
            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
                <button
                    onClick={() => setActiveTab('students')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        activeTab === 'students'
                            ? 'bg-red-600 text-yellow-300 shadow-md border border-red-500'
                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                >
                    <Users className="w-4 h-4" />
                    <span>طلاب الشعبة ({students.length})</span>
                </button>

                <button
                    onClick={() => setActiveTab('notes')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        activeTab === 'notes'
                            ? 'bg-red-600 text-yellow-300 shadow-md border border-red-500'
                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                >
                    <ClipboardList className="w-4 h-4" />
                    <span>سجل الملاحظات والإشعارات ({notes.length})</span>
                </button>

                <button
                    onClick={() => setActiveTab('guidance_send')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        activeTab === 'guidance_send'
                            ? 'bg-red-600 text-yellow-300 shadow-md border border-red-500'
                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                >
                    <Send className="w-4 h-4" />
                    <span>إرسال التوجيهات (عامة وخاصة)</span>
                </button>

                <button
                    onClick={() => setActiveTab('secret_chat')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all relative ${
                        activeTab === 'secret_chat'
                            ? 'bg-red-600 text-yellow-300 shadow-md border border-red-500'
                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                >
                    <Lock className="w-4 h-4" />
                    <span>الاستشارات والتواصل السري</span>
                    {totalUnreadChats > 0 && (
                        <span className="bg-yellow-400 text-red-900 text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full ml-1">
                            {totalUnreadChats}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('academic')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        activeTab === 'academic'
                            ? 'bg-red-600 text-yellow-300 shadow-md border border-red-500'
                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                >
                    <Award className="w-4 h-4" />
                    <span>المستوى العلمي والأوائل</span>
                </button>
            </div>

            {/* TAB 1: STUDENTS ROSTER */}
            {activeTab === 'students' && (
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <UserCheck className="w-5 h-5 text-red-600" />
                                <span>قائمة طلاب شعبة ({advisorClass.stage} - {advisorClass.section})</span>
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                تعرض هذه القائمة الطلاب المسجلين في الشعبة التي تحت إشرافك كمرشد للصف.
                            </p>
                        </div>

                        <div className="relative w-full sm:w-72">
                            <Search className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="ابحث باسم الطالب أو الرقم..."
                                className="w-full pr-9 pl-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 bg-gray-50 font-medium"
                            />
                        </div>
                    </div>

                    {/* Telegram Info Box */}
                    <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-900 space-y-1.5">
                        <div className="flex items-center gap-2 font-bold text-sky-900 text-sm">
                            <Sparkles className="w-4 h-4 text-sky-600 flex-shrink-0" />
                            <span>تعليمات هامة لضمان وصول رسائل التليكرام الفردية للطالب:</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-sky-800 font-medium pl-1">
                            <li>
                                <b>السبب الأساسي لعدم الوصول باليوزرنيم:</b> قانون شركة تليكرام يمنع البوتات من إرسال رسائل خاصة بالأشخاص عبر اليوزرنيم (<code className="bg-sky-100 px-1 rounded font-mono">@username</code>) للحد من المزعجين، وتتطلب إدخال <b>الآيدي العددي الخاص بالحساب (Numeric Chat ID)</b> مثل: <code className="bg-white px-1.5 py-0.5 rounded border border-sky-300 font-mono text-sky-900">589123456</code>.
                            </li>
                            <li>
                                <b>كيف يحصل الطالب على رقمه العددي (Chat ID)؟</b>
                                <br />
                                يفتح الطالب التليكرام ويبحث عن بوت معرفة الآيدي: <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="underline font-bold text-sky-700 hover:text-sky-900">@userinfobot</a> أو <a href="https://t.me/rawdata_bot" target="_blank" rel="noreferrer" className="underline font-bold text-sky-700 hover:text-sky-900">@rawdata_bot</a> ويرسل له رسالة <code className="bg-sky-100 px-1 rounded font-mono">/start</code> وسيظهر له رقمه العددي (Id) فوراً.
                            </li>
                            <li>
                                <b>خطوة تفعيل البوت:</b> يجب أن يرسل الطالب كلمة <code className="bg-sky-100 px-1 rounded font-mono">/start</code> لبوت المدرسة أيضاً حتى يسمح للبوت بمراسلته.
                            </li>
                        </ul>
                    </div>

                    {filteredStudents.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                            <table className="w-full text-right text-sm">
                                <thead className="bg-red-50 text-red-900 font-bold border-b border-red-200">
                                    <tr>
                                        <th className="p-3">ت</th>
                                        <th className="p-3">اسم الطالب</th>
                                        <th className="p-3">الرقم الامتحاني</th>
                                        <th className="p-3">رمز الدخول السرّي</th>
                                        <th className="p-3">نقاط الانضباط</th>
                                        <th className="p-3">معرف التليكرام</th>
                                        <th className="p-3 text-center">إجراءات المرشد</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                                    {filteredStudents.map((s, idx) => {
                                        const sRecords = disciplineRecords[s.id] || [];
                                        const activeRecs = sRecords.filter(r => r.status !== 'archived');
                                        const totalDeducted = activeRecs.reduce((sum, r) => sum + r.pointsDeducted, 0);
                                        const currentPts = Math.max(0, disciplineMaxPoints - totalDeducted);
                                        const isZero = currentPts === 0;

                                        return (
                                            <tr key={s.id} className={`hover:bg-gray-50 transition ${isZero ? 'bg-red-50/70' : ''}`}>
                                                <td className="p-3 font-bold text-gray-500">{idx + 1}</td>
                                                <td className="p-3 font-bold text-gray-900">
                                                    <div className="flex items-center gap-2">
                                                        <span>{s.name}</span>
                                                        {isZero && (
                                                            <span className="bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                                                                استنفد النقاط (0)
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 font-mono text-indigo-700">{s.examId || '—'}</td>
                                                <td className="p-3">
                                                    {s.studentAccessCode ? (
                                                        <span className="bg-gray-100 text-gray-800 px-2.5 py-1 rounded font-mono text-xs font-bold border">
                                                            {s.studentAccessCode}
                                                        </span>
                                                    ) : '—'}
                                                </td>
                                                <td className="p-3">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black ${
                                                        isZero
                                                            ? 'bg-red-600 text-white animate-pulse'
                                                            : currentPts >= 7
                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                                                    }`}>
                                                        {currentPts} / {disciplineMaxPoints}
                                                    </span>
                                                </td>
                                                <td className="p-3">
                                                    {s.telegramChatId ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-800 text-xs font-mono font-bold rounded-md border border-green-300">
                                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                                            <span>{s.telegramChatId}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs font-medium italic">
                                                            غير مرتبط (معاون شؤون الطلبة)
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center flex items-center justify-center gap-1.5 flex-wrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => setReportStudent(s)}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-bold text-xs transition border border-blue-200 cursor-pointer"
                                                        title="كشف مخالفات الانضباط واستدعاء ولي الأمر (Word / PDF)"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" />
                                                        <span>تقرير الانضباط</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setNoteStudentId(s.id);
                                                            setActiveTab('notes');
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg font-bold text-xs transition border border-red-200 cursor-pointer"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        <span>ملاحظة</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedChatStudent(s);
                                                            setActiveTab('secret_chat');
                                                        }}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-lg font-bold text-xs transition border border-amber-200 cursor-pointer"
                                                    >
                                                        <Lock className="w-3.5 h-3.5 text-amber-600" />
                                                        <span>تواصل سري</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            لا يوجد طلاب مطابقون لخيارات البحث.
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: GUIDANCE NOTES & LOGS WITH SEND TO STUDENT OPTION */}
            {activeTab === 'notes' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Add note form */}
                    <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-lg border border-gray-100 h-fit space-y-4">
                        <div className="flex items-center gap-2 border-b pb-3 text-red-800 font-bold text-lg">
                            <Plus className="w-5 h-5 text-red-600" />
                            <h3>تسجيل ملاحظة إرشادية</h3>
                        </div>

                        <form onSubmit={handleAddNote} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">اختر الطالب</label>
                                <select
                                    value={noteStudentId}
                                    onChange={(e) => setNoteStudentId(e.target.value)}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-red-500 text-sm font-bold text-gray-800"
                                    required
                                >
                                    <option value="">-- اختر طالباً --</option>
                                    {students.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">تصنيف الملاحظة</label>
                                <select
                                    value={noteCategory}
                                    onChange={(e) => setNoteCategory(e.target.value as any)}
                                    className="w-full p-2.5 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-red-500 text-sm font-bold text-gray-800"
                                >
                                    <option value="عام">عام</option>
                                    <option value="سلوكي">ملاحظة سلوكية</option>
                                    <option value="مستوى دراسي">متابعة المستوى الدراسي</option>
                                    <option value="غيابات">متابعة الغيابات والتأخير</option>
                                    <option value="تواصل مع ولي الأمر">تواصل مع ولي الأمر</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">نص الملاحظة أو التوجيه</label>
                                <textarea
                                    value={noteContent}
                                    onChange={(e) => setNoteContent(e.target.value)}
                                    rows={4}
                                    placeholder="اكتب الملاحظة الإرشادية هنا..."
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm font-medium text-gray-800"
                                    required
                                ></textarea>
                            </div>

                            {/* Option to send note to student and notify him */}
                            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    id="sendNoteToStudent"
                                    checked={sendNoteToStudent}
                                    onChange={(e) => setSendNoteToStudent(e.target.checked)}
                                    className="mt-1 w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500 cursor-pointer"
                                />
                                <label htmlFor="sendNoteToStudent" className="text-xs font-bold text-red-900 cursor-pointer leading-relaxed">
                                    <span>إرسال هذه الملاحظة للطالب في بوابته وإشعاره بها مباشرة (اختياري)</span>
                                    <p className="text-[11px] font-normal text-red-700 mt-0.5">عند تفعيل الخيار، ستظهر الملاحظة في صفحة "توجيهات مرشد الصف" لدى الطالب مع إشعاره.</p>
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmittingNote}
                                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-yellow-300 rounded-lg font-bold text-sm shadow transition flex items-center justify-center gap-2 disabled:bg-gray-400"
                            >
                                <Send className="w-4 h-4" />
                                <span>حفظ وإرسال الملاحظة</span>
                            </button>
                        </form>
                    </div>

                    {/* Notes list */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100 space-y-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-3 border-b">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                    <ClipboardList className="w-5 h-5 text-red-600" />
                                    <span>سجل ملاحظات الإرشاد للشعبة</span>
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    الملاحظات المسجلة من قبلك كمرشد للصف لمتابعة الطلبة.
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <Filter className="w-4 h-4 text-gray-400" />
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="p-1.5 border border-gray-300 rounded-lg text-xs font-bold bg-gray-50 text-gray-800"
                                >
                                    <option value="all">الكل ({notes.length})</option>
                                    <option value="سلوكي">سلوكي</option>
                                    <option value="مستوى دراسي">مستوى دراسي</option>
                                    <option value="غيابات">غيابات</option>
                                    <option value="تواصل مع ولي الأمر">تواصل مع ولي الأمر</option>
                                    <option value="عام">عام</option>
                                </select>
                            </div>
                        </div>

                        {filteredNotes.length > 0 ? (
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                                {filteredNotes.map(n => (
                                    <div key={n.id} className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3 hover:border-red-300 transition">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-gray-900 text-base">{n.studentName}</span>
                                                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-red-100 text-red-800 border border-red-200">
                                                    {n.category}
                                                </span>

                                                {/* Sent Status Badge */}
                                                {n.sentToStudent ? (
                                                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                                        <Check className="w-3 h-3 text-emerald-600" />
                                                        <span>مرسلة للطالب ومُشعر بها</span>
                                                    </span>
                                                ) : (
                                                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                                        خاصة بالمرشد فقط
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-400">
                                                    {new Date(n.createdAt).toLocaleDateString('ar-IQ')}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteNote(n.id)}
                                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                                    title="حذف الملاحظة"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        <p className="text-sm text-gray-700 font-medium leading-relaxed bg-white p-3 rounded-lg border border-gray-100">
                                            {n.content}
                                        </p>

                                        {!n.sentToStudent && (
                                            <div className="flex justify-end pt-1">
                                                <button
                                                    onClick={() => handleSendExistingNoteToStudent(n)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-yellow-300 hover:bg-red-700 rounded-lg text-xs font-bold transition shadow-sm"
                                                >
                                                    <BellRing className="w-3.5 h-3.5" />
                                                    <span>إرسال للطالب الآن وإشعاره</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 text-gray-400">
                                لا توجد ملاحظات إرشادية مسجلة في هذا التصنيف.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: SEND GENERAL & PRIVATE GUIDANCE */}
            {activeTab === 'guidance_send' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Guidance Sending Form */}
                    <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-lg border border-gray-100 space-y-4 h-fit">
                        <div className="flex items-center gap-2 border-b pb-3 text-red-800 font-bold text-lg">
                            <Send className="w-5 h-5 text-red-600" />
                            <h3>إرسال توجيه إرشادي</h3>
                        </div>

                        <form onSubmit={handleSendGuidance} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">نوع التوجيه</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setGuidanceTargetType('general')}
                                        className={`py-2 px-3 rounded-lg text-xs font-bold transition border ${
                                            guidanceTargetType === 'general'
                                                ? 'bg-red-600 text-yellow-300 border-red-600'
                                                : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                                        }`}
                                    >
                                        توجيه عام للشعبة
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setGuidanceTargetType('private')}
                                        className={`py-2 px-3 rounded-lg text-xs font-bold transition border ${
                                            guidanceTargetType === 'private'
                                                ? 'bg-red-600 text-yellow-300 border-red-600'
                                                : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'
                                        }`}
                                    >
                                        توجيه خاص لطالب
                                    </button>
                                </div>
                            </div>

                            {guidanceTargetType === 'private' && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">اختر الطالب</label>
                                    <select
                                        value={guidanceStudentId}
                                        onChange={(e) => setGuidanceStudentId(e.target.value)}
                                        className="w-full p-2.5 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-red-500 text-sm font-bold text-gray-800"
                                        required
                                    >
                                        <option value="">-- اختر طالباً --</option>
                                        {students.map(s => (
                                            <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">عنوان التوجيه</label>
                                <input
                                    type="text"
                                    value={guidanceTitle}
                                    onChange={(e) => setGuidanceTitle(e.target.value)}
                                    placeholder="مثال: التزام بمواعيد الدوام، نصائح قبل الامتحانات..."
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm font-medium text-gray-800"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">نص التوجيه الإرشادي</label>
                                <textarea
                                    value={guidanceContent}
                                    onChange={(e) => setGuidanceContent(e.target.value)}
                                    rows={5}
                                    placeholder="اكتب التوجيه التربوي الإرشادي بالتفصيل..."
                                    className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 text-sm font-medium text-gray-800"
                                    required
                                ></textarea>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmittingGuidance}
                                className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-yellow-300 rounded-lg font-bold text-sm shadow transition flex items-center justify-center gap-2 disabled:bg-gray-400"
                            >
                                <Send className="w-4 h-4" />
                                <span>إرسال التوجيه وإشعار الطلاب</span>
                            </button>
                        </form>
                    </div>

                    {/* Archive of Sent General Guidance */}
                    <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-lg border border-gray-100 space-y-4">
                        <div className="border-b pb-3">
                            <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                <BookOpen className="w-5 h-5 text-red-600" />
                                <span>أرشيف التوجيهات العامة للشعبة ({generalGuidanceList.length})</span>
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                جميع التوجيهات العامة المرسلة لطلاب الشعبة والتي تظهر في بواباتهم.
                            </p>
                        </div>

                        {generalGuidanceList.length > 0 ? (
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                                {generalGuidanceList.map(item => (
                                    <div key={item.id} className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
                                        <div className="flex justify-between items-center border-b border-amber-200/80 pb-1.5">
                                            <span className="font-bold text-gray-900 text-base">{item.title}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-500">
                                                    {new Date(item.createdAt).toLocaleDateString('ar-IQ')}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteGeneralGuidance(item.id)}
                                                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                                    title="حذف التوجيه"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-800 font-medium leading-relaxed whitespace-pre-wrap">
                                            {item.content}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-16 text-gray-400">
                                لم تقم بإرسال توجيهات عامة للشعبة بعد.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 4: SECRET CONSULTATION & MESSAGING */}
            {activeTab === 'secret_chat' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px]">
                    {/* Conversations Sidebar List */}
                    <div className="md:col-span-1 bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden">
                        <div className="p-4 bg-red-700 text-yellow-300 font-bold flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Lock className="w-5 h-5 text-yellow-300" />
                                <span>الاستشارات والرسائل السرية</span>
                            </div>
                            <span className="text-xs bg-yellow-400 text-red-900 px-2 py-0.5 rounded-full font-extrabold">
                                {chats.length}
                            </span>
                        </div>

                        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                            {students.map(st => {
                                const chatInfo = chats.find(c => c.studentId === st.id);
                                const isSelected = selectedChatStudent?.id === st.id;
                                const hasUnread = chatInfo?.unreadByAdvisor;

                                return (
                                    <button
                                        key={st.id}
                                        onClick={() => setSelectedChatStudent(st)}
                                        className={`w-full p-3.5 text-right flex items-center justify-between transition ${
                                            isSelected ? 'bg-red-50 border-r-4 border-red-600' : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="space-y-0.5 max-w-[180px]">
                                            <p className={`text-sm font-bold truncate ${hasUnread ? 'text-red-700 font-extrabold' : 'text-gray-900'}`}>
                                                {st.name}
                                            </p>
                                            <p className="text-xs text-gray-500 truncate">
                                                {chatInfo?.lastMessageText || 'لا توجد محادثة بعد'}
                                            </p>
                                        </div>

                                        {hasUnread && (
                                            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse flex-shrink-0"></span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Chat Messages Panel */}
                    <div className="md:col-span-2 bg-white rounded-2xl shadow-lg border border-gray-100 flex flex-col overflow-hidden">
                        {selectedChatStudent ? (
                            <>
                                <div className="p-4 bg-gradient-to-r from-red-700 to-rose-800 text-white flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-yellow-400 text-red-900 flex items-center justify-center font-bold text-xs">
                                            {selectedChatStudent.name[0]}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-sm text-yellow-300">{selectedChatStudent.name}</h4>
                                            <p className="text-[11px] text-rose-100">محادثة واستشارة سرية ومحمية</p>
                                        </div>
                                    </div>

                                    <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-bold">
                                        الرقم الامتحاني: {selectedChatStudent.examId || '—'}
                                    </span>
                                </div>

                                <div className="flex-1 p-4 overflow-y-auto bg-gray-50 space-y-3">
                                    {chatMessages.length > 0 ? (
                                        chatMessages.map(msg => (
                                            <div
                                                key={msg.id}
                                                className={`flex ${msg.senderRole === 'advisor' ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-xs sm:max-w-md p-3.5 rounded-2xl shadow-sm text-sm ${
                                                        msg.senderRole === 'advisor'
                                                            ? 'bg-red-600 text-yellow-200 rounded-br-none font-medium'
                                                            : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none font-medium'
                                                    }`}
                                                >
                                                    <p className="font-bold text-xs mb-1 opacity-80">
                                                        {msg.senderRole === 'advisor' ? 'أنت (مرشد الصف)' : msg.senderName}
                                                    </p>
                                                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                                                    <span className={`text-[10px] block mt-1 text-left ${msg.senderRole === 'advisor' ? 'text-yellow-200/80' : 'text-gray-400'}`}>
                                                        {new Date(msg.timestamp).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-20 text-gray-400 space-y-2">
                                            <MessageSquare className="w-10 h-10 text-gray-300 mx-auto" />
                                            <p className="text-sm font-bold">لا توجد رسائل سابقة مع هذا الطالب.</p>
                                            <p className="text-xs text-gray-400">يمكنك بدء التواصل السري وطرح استفسار أو إرسال توجيه خاص للطالب.</p>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </div>

                                <form onSubmit={handleSendReply} className="p-3 bg-white border-t border-gray-200 flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={replyText}
                                        onChange={(e) => setReplyText(e.target.value)}
                                        placeholder={`اكتب ردك أو رسالتك السرية إلى (${selectedChatStudent.name})...`}
                                        className="flex-1 p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 text-sm font-medium"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!replyText.trim() || isSendingReply}
                                        className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-yellow-300 rounded-xl font-bold text-sm shadow transition flex items-center gap-1.5 disabled:bg-gray-300 disabled:text-gray-500"
                                    >
                                        <Send className="w-4 h-4" />
                                        <span>إرسال</span>
                                    </button>
                                </form>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-gray-400 space-y-3">
                                <Lock className="w-12 h-12 text-gray-300" />
                                <h4 className="font-bold text-gray-700 text-base">اختر طالباً من القائمة للبدء أو متابعة الاستشارة السرية</h4>
                                <p className="text-xs text-gray-400 max-w-sm">
                                    تتيح هذه الواجهة لمرشد الصف الاستماع إلى استشارات الطلاب ومشكلاتهم الخاصة والرد عليها بسرية وأمان.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 5: ACADEMIC SUMMARY */}
            {activeTab === 'academic' && (
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 space-y-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Award className="w-5 h-5 text-amber-500" />
                            <span>المستوى العلمي والأوائل على الشعبة</span>
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            ملخص بالأداء العلمي والطلاب الأوائل في شعبة ({advisorClass.stage} - {advisorClass.section}).
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Top Students */}
                        <div className="p-5 bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl space-y-3">
                            <h4 className="font-bold text-amber-900 text-lg flex items-center gap-2 border-b border-amber-200 pb-2">
                                <Sparkles className="w-5 h-5 text-amber-600" />
                                <span>الطلاب الأوائل على الشعبة</span>
                            </h4>

                            {academicSummary.topStudents.length > 0 ? (
                                <div className="space-y-2">
                                    {academicSummary.topStudents.map((item, index) => (
                                        <div key={item.student.id} className="flex justify-between items-center p-3 bg-white rounded-xl shadow-sm border border-amber-100 font-bold">
                                            <div className="flex items-center gap-3">
                                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-bold ${
                                                    index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-indigo-600'
                                                }`}>
                                                    {index + 1}
                                                </span>
                                                <span className="text-gray-900">{item.student.name}</span>
                                            </div>
                                            <span className="text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg text-sm">
                                                المعدل: {item.avg}%
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-amber-800 py-4 text-center">
                                    سيظهر ترتيب الأوائل بمجرد إدخال الدرجات من المدرسين.
                                </p>
                            )}
                        </div>

                        {/* Class Info & Guidance Tips */}
                        <div className="p-5 bg-red-50 border border-red-200 rounded-2xl space-y-3">
                            <h4 className="font-bold text-red-900 text-lg flex items-center gap-2 border-b border-red-200 pb-2">
                                <ShieldCheck className="w-5 h-5 text-red-600" />
                                <span>مهام وتوجيهات مرشد الصف</span>
                            </h4>
                            <ul className="space-y-2.5 text-xs font-semibold text-red-900 list-disc list-inside leading-relaxed">
                                <li>متابعة انضباط وحضور وغياب طلاب الشعبة بشكل يومي.</li>
                                <li>رصد المستويات الدراسية المتراجعة والتواصل مع المدرسين المعنيين.</li>
                                <li>التواصل المستمر مع أولياء الأمور وحل المشكلات السلوكية مبكراً.</li>
                                <li>تقديم الدعم النفسي والتربوي وتعزيز روح التعاون داخل الصف.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {/* Discipline Report Modal for Selected Student */}
            {reportStudent && advisorClass && (
                <DisciplineReportModal
                    isOpen={!!reportStudent}
                    onClose={() => setReportStudent(null)}
                    student={reportStudent}
                    classData={advisorClass}
                    settings={settings}
                    records={disciplineRecords[reportStudent.id] || []}
                    maxPoints={disciplineMaxPoints}
                    currentPoints={Math.max(0, disciplineMaxPoints - ((disciplineRecords[reportStudent.id] || []).filter(r => r.status !== 'archived').reduce((sum, r) => sum + r.pointsDeducted, 0)))}
                    studentPhotoUrl={reportStudent.photoUrl}
                    currentUser={teacher}
                />
            )}
        </div>
    );
}
