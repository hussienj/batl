import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { User, ClassData, AdvisorGuidanceItem, AdvisorChatMessage } from '../../types.ts';
import { Compass, MessageCircle, Send, ShieldCheck, Bell, Sparkles, UserCheck, AlertCircle, FileText, Lock, MessageSquare, Clock } from 'lucide-react';
import { db } from '../../lib/firebase.ts';

interface ClassAdvisorGuidanceViewProps {
    currentUser: User;
    classes: ClassData[];
}

interface NoteItem {
    id: string;
    studentId: string;
    studentName: string;
    category: string;
    content: string;
    createdAt: number;
    createdByName: string;
    sentToStudent?: boolean;
}

export default function ClassAdvisorGuidanceView({ currentUser, classes }: ClassAdvisorGuidanceViewProps) {
    const [activeTab, setActiveTab] = useState<'general' | 'private_notes' | 'secret_consultation'>('general');
    
    // Data states
    const [generalGuidance, setGeneralGuidance] = useState<AdvisorGuidanceItem[]>([]);
    const [privateGuidance, setPrivateGuidance] = useState<AdvisorGuidanceItem[]>([]);
    const [studentNotes, setStudentNotes] = useState<NoteItem[]>([]);
    const [chatMessages, setChatMessages] = useState<AdvisorChatMessage[]>([]);
    
    const [newMessage, setNewMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const principalId = currentUser.principalId || 'principal_al_hamza';

    // Find student's class
    const studentClass = useMemo(() => {
        if (currentUser.classId) {
            const found = classes.find(c => c.id === currentUser.classId);
            if (found) return found;
        }
        return classes.find(c => c.students?.some(s => s.id === currentUser.id)) || null;
    }, [classes, currentUser]);

    // Scroll chat to bottom
    useEffect(() => {
        if (activeTab === 'secret_consultation') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, activeTab]);

    // Fetch General Guidance for the student's class
    useEffect(() => {
        if (!studentClass || !principalId) return;

        const genRef = db.ref(`advisor_general_guidance/${principalId}/${studentClass.id}`);
        const handleVal = (snap: any) => {
            const val = snap.val();
            if (val) {
                const list: AdvisorGuidanceItem[] = Object.values(val);
                list.sort((a, b) => b.createdAt - a.createdAt);
                setGeneralGuidance(list);
            } else {
                setGeneralGuidance([]);
            }
        };

        genRef.on('value', handleVal);
        return () => { genRef.off('value', handleVal); };
    }, [studentClass, principalId]);

    // Fetch Private Guidance & Sent Notes for this specific student
    useEffect(() => {
        if (!studentClass || !currentUser.id || !principalId) return;

        // Private guidance directed to student
        const privRef = db.ref(`advisor_student_guidance/${principalId}/${currentUser.id}`);
        const handlePrivVal = (snap: any) => {
            const val = snap.val();
            if (val) {
                const list: AdvisorGuidanceItem[] = Object.values(val);
                list.sort((a, b) => b.createdAt - a.createdAt);
                setPrivateGuidance(list);
            } else {
                setPrivateGuidance([]);
            }
        };
        privRef.on('value', handlePrivVal);

        // Saved notes sent to student
        const notesRef = db.ref(`advisor_notes/${principalId}/${studentClass.id}`);
        const handleNotesVal = (snap: any) => {
            const val = snap.val();
            if (val) {
                const allNotes: NoteItem[] = Object.values(val);
                const forMe = allNotes.filter(n => n.studentId === currentUser.id && n.sentToStudent);
                forMe.sort((a, b) => b.createdAt - a.createdAt);
                setStudentNotes(forMe);
            } else {
                setStudentNotes([]);
            }
        };
        notesRef.on('value', handleNotesVal);

        return () => {
            privRef.off('value', handlePrivVal);
            notesRef.off('value', handleNotesVal);
        };
    }, [studentClass, currentUser.id, principalId]);

    // Fetch Secret Consultation Chat with Class Advisor
    useEffect(() => {
        if (!currentUser.id || !principalId) return;

        const chatMessagesRef = db.ref(`advisor_private_messages/${principalId}/${currentUser.id}`);
        const handleChatVal = (snap: any) => {
            const val = snap.val();
            if (val) {
                const msgs: AdvisorChatMessage[] = Object.values(val);
                msgs.sort((a, b) => a.timestamp - b.timestamp);
                setChatMessages(msgs);

                // Mark unread messages from advisor as read
                msgs.forEach(m => {
                    if (m.senderRole === 'advisor' && !m.read) {
                        db.ref(`advisor_private_messages/${principalId}/${currentUser.id}/${m.id}/read`).set(true);
                    }
                });
                db.ref(`advisor_private_chats/${principalId}/${currentUser.id}/unreadByStudent`).set(false);
            } else {
                setChatMessages([]);
            }
        };

        chatMessagesRef.on('value', handleChatVal);
        return () => { chatMessagesRef.off('value', handleChatVal); };
    }, [currentUser.id, principalId]);

    // Send secret consultation message to advisor
    const handleSendSecretMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!newMessage.trim() || isSending || !studentClass) return;

        setIsSending(true);
        const msgText = newMessage.trim();
        const msgId = db.ref().child(`advisor_private_messages/${principalId}/${currentUser.id}`).push().key || `msg_${Date.now()}`;
        const timestamp = Date.now();

        const chatMessage: AdvisorChatMessage = {
            id: msgId,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderRole: 'student',
            text: msgText,
            timestamp,
            read: false
        };

        try {
            // Update messages
            await db.ref(`advisor_private_messages/${principalId}/${currentUser.id}/${msgId}`).set(chatMessage);

            // Update chat metadata for advisor list
            await db.ref(`advisor_private_chats/${principalId}/${currentUser.id}`).set({
                id: currentUser.id,
                studentId: currentUser.id,
                studentName: currentUser.name,
                classId: studentClass.id,
                stage: studentClass.stage,
                section: studentClass.section,
                lastMessageText: msgText,
                lastMessageTimestamp: timestamp,
                unreadByAdvisor: true,
                unreadByStudent: false
            });

            setNewMessage('');
        } catch (err) {
            console.error("Error sending message to advisor:", err);
            alert("حدث خطأ أثناء إرسال الرسالة.");
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-red-700 via-rose-800 to-amber-900 text-white rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-64 h-64 bg-yellow-400/10 rounded-full blur-3xl -ml-20 -mt-20 pointer-events-none"></div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-yellow-400/20 text-yellow-200 text-xs font-bold rounded-full mb-3 border border-yellow-300/30">
                            <Compass className="w-4 h-4 text-yellow-300" />
                            <span>توجيهات واستشارات مرشد الصف</span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                            بوابة الإرشاد التربوي الخاصة بك
                        </h2>
                        <p className="text-rose-100 mt-2 text-sm sm:text-base flex items-center gap-2">
                            <span>الشعبة: {studentClass ? `${studentClass.stage} - (${studentClass.section})` : (currentUser.stage || 'شعبتك')}</span>
                            <span>•</span>
                            <span>تواصل سري ومباشر مع مرشد الصف</span>
                        </p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 text-center w-full md:w-auto">
                        <div className="flex items-center gap-2 text-yellow-300 font-bold text-sm justify-center mb-1">
                            <Lock className="w-4 h-4" />
                            <span>خصوصية تامة</span>
                        </div>
                        <p className="text-xs text-rose-100 leading-relaxed max-w-xs">
                            الاستشارات الخاصة والملاحظات الموجهة لك محمية وسرية تماماً بينك وبين مرشد الصف.
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
                <button
                    onClick={() => setActiveTab('general')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        activeTab === 'general'
                            ? 'bg-red-600 text-yellow-300 shadow-md border border-red-500'
                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                >
                    <Compass className="w-4 h-4" />
                    <span>توجيهات الشعبة العامة ({generalGuidance.length})</span>
                </button>

                <button
                    onClick={() => setActiveTab('private_notes')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        activeTab === 'private_notes'
                            ? 'bg-red-600 text-yellow-300 shadow-md border border-red-500'
                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                >
                    <FileText className="w-4 h-4" />
                    <span>توجيهاتي وملاحظاتي الخاصة ({privateGuidance.length + studentNotes.length})</span>
                </button>

                <button
                    onClick={() => setActiveTab('secret_consultation')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                        activeTab === 'secret_consultation'
                            ? 'bg-red-600 text-yellow-300 shadow-md border border-red-500'
                            : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                    }`}
                >
                    <Lock className="w-4 h-4" />
                    <span>الاستشارات والتواصل السري مع المرشد</span>
                </button>
            </div>

            {/* TAB 1: GENERAL CLASS GUIDANCE */}
            {activeTab === 'general' && (
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 space-y-4">
                    <div className="border-b pb-3">
                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Sparkles className="w-5 h-5 text-amber-500" />
                            <span>التوجيهات والإرشادات العامة لطلاب الشعبة</span>
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            التوجيهات التربوية والدراسية الموجهة من مرشد الصف لكافة طلاب الشعبة.
                        </p>
                    </div>

                    {generalGuidance.length > 0 ? (
                        <div className="space-y-4">
                            {generalGuidance.map(item => (
                                <div key={item.id} className="p-5 bg-gradient-to-br from-amber-50/60 to-orange-50/40 border border-amber-200/80 rounded-2xl space-y-3">
                                    <div className="flex justify-between items-start gap-2 border-b border-amber-200/60 pb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                                            <h4 className="font-bold text-gray-900 text-base">{item.title}</h4>
                                        </div>
                                        <span className="text-xs text-gray-500 font-semibold flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5" />
                                            {new Date(item.createdAt).toLocaleDateString('ar-IQ')}
                                        </span>
                                    </div>

                                    <p className="text-sm text-gray-800 leading-relaxed font-medium whitespace-pre-wrap">
                                        {item.content}
                                    </p>

                                    <div className="text-xs text-amber-800 font-bold flex items-center gap-1.5 pt-1">
                                        <ShieldCheck className="w-4 h-4 text-amber-600" />
                                        <span>مرشد الصف: {item.advisorTeacherName}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-gray-400 font-medium">
                            لا توجد توجيهات عامة مسجلة للشعبة حالياً.
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: PRIVATE GUIDANCE & NOTES */}
            {activeTab === 'private_notes' && (
                <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 space-y-6">
                    <div className="border-b pb-3">
                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-red-600" />
                            <span>الملاحظات والتوجيهات الخاصة بك</span>
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            جميع التوجيهات والملاحظات الإرشادية المرسلة لك خصيصاً من مرشد الصف.
                        </p>
                    </div>

                    {/* Section: Direct Private Guidance */}
                    {privateGuidance.length > 0 && (
                        <div className="space-y-3">
                            <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2 text-rose-700">
                                <AlertCircle className="w-4 h-4" />
                                <span>التوجيهات المباشرة الموجهة لك</span>
                            </h4>
                            <div className="space-y-3">
                                {privateGuidance.map(item => (
                                    <div key={item.id} className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
                                        <div className="flex justify-between items-center border-b border-rose-200/80 pb-1.5">
                                            <span className="font-bold text-rose-900">{item.title}</span>
                                            <span className="text-xs text-rose-600 font-bold">
                                                {new Date(item.createdAt).toLocaleDateString('ar-IQ')}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-800 font-medium leading-relaxed">
                                            {item.content}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Section: Guidance Notes Sent to Student */}
                    <div className="space-y-3">
                        <h4 className="font-bold text-gray-800 text-sm flex items-center gap-2 text-emerald-800">
                            <UserCheck className="w-4 h-4" />
                            <span>الملاحظات الإرشادية المسجلة</span>
                        </h4>

                        {studentNotes.length > 0 ? (
                            <div className="space-y-3">
                                {studentNotes.map(n => (
                                    <div key={n.id} className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2">
                                        <div className="flex justify-between items-center border-b border-emerald-200/80 pb-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs bg-emerald-200 text-emerald-900 font-bold px-2.5 py-0.5 rounded-full">
                                                    تنسيق: {n.category}
                                                </span>
                                            </div>
                                            <span className="text-xs text-emerald-700 font-bold">
                                                {new Date(n.createdAt).toLocaleDateString('ar-IQ')}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-800 font-medium leading-relaxed">
                                            {n.content}
                                        </p>
                                        <div className="text-xs text-gray-500 font-semibold text-left">
                                            المسجل: {n.createdByName}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            privateGuidance.length === 0 && (
                                <div className="text-center py-12 text-gray-400 font-medium">
                                    لا توجد ملاحظات أو توجيهات خاصة مسجلة باسمك حتى الآن.
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: SECRET CONSULTATION CHAT */}
            {activeTab === 'secret_consultation' && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden flex flex-col h-[550px]">
                    <div className="p-4 bg-gradient-to-r from-red-700 to-rose-800 text-white flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-yellow-400 text-red-900 flex items-center justify-center font-extrabold shadow">
                                <Lock className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-base">استشارة سرية مع مرشد الصف</h3>
                                <p className="text-xs text-rose-100">تواصل آمن ومحمي ومباشر بينك وبين مرشد صفك</p>
                            </div>
                        </div>
                        <span className="text-xs bg-white/20 px-2.5 py-1 rounded-full font-bold">
                            محمية بسريّة
                        </span>
                    </div>

                    {/* Messages Container */}
                    <div className="flex-1 p-4 overflow-y-auto bg-gray-50 space-y-3">
                        {chatMessages.length > 0 ? (
                            chatMessages.map(msg => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.senderRole === 'student' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-xs sm:max-w-md p-3.5 rounded-2xl shadow-sm text-sm ${
                                            msg.senderRole === 'student'
                                                ? 'bg-red-600 text-white rounded-br-none'
                                                : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'
                                        }`}
                                    >
                                        <p className="font-bold text-xs mb-1 opacity-80">
                                            {msg.senderRole === 'student' ? 'أنت (الطالب)' : `مرشد الصف (${msg.senderName})`}
                                        </p>
                                        <p className="leading-relaxed whitespace-pre-wrap font-medium">{msg.text}</p>
                                        <span className={`text-[10px] block mt-1 text-left ${msg.senderRole === 'student' ? 'text-red-200' : 'text-gray-400'}`}>
                                            {new Date(msg.timestamp).toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-16 space-y-3">
                                <MessageSquare className="w-12 h-12 text-gray-300 mx-auto" />
                                <p className="text-gray-500 text-sm font-bold">لم تقم بإرسال أي استشارة أو رسالة سرية بعد.</p>
                                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                                    يمكنك كتابة مشكلتك أو استفسارك الخاص هنا، وسيتلقاها مرشد صفك مباشرة ويرد عليها بخصوصية تامة.
                                </p>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input bar */}
                    <form onSubmit={handleSendSecretMessage} className="p-3 bg-white border-t border-gray-200 flex items-center gap-2">
                        <input
                            type="text"
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            placeholder="اكتب استشارتك أو رسالتك السرية لمرشد الصف هنا..."
                            className="flex-1 p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-none text-sm font-medium"
                        />
                        <button
                            type="submit"
                            disabled={!newMessage.trim() || isSending}
                            className="px-5 py-3 bg-red-600 hover:bg-red-700 text-yellow-300 rounded-xl font-bold text-sm shadow transition flex items-center gap-2 disabled:bg-gray-300 disabled:text-gray-500"
                        >
                            <Send className="w-4 h-4" />
                            <span>إرسال</span>
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
}
