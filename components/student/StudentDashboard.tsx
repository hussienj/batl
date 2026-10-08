import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Student, StudentEvaluation, EvaluationRating, Homework, HomeworkSubmission } from '../../types.ts';
import { Star, BarChart, X, Camera, Loader2, Smile, Clock, AlertTriangle, Lock, Send, CheckCircle2, HelpCircle, ExternalLink, Save, Sparkles, ShieldCheck } from 'lucide-react';

const RATING_MAP: Record<EvaluationRating, { value: number; color: string; }> = {
    'ممتاز': { value: 6, color: 'text-green-500' },
    'جيد جدا': { value: 5, color: 'text-cyan-500' },
    'جيد': { value: 4, color: 'text-teal-500' },
    'متوسط': { value: 3, color: 'text-blue-500' },
    'ضعيف': { value: 2, color: 'text-orange-500' },
    'ضعيف جدا': { value: 1, color: 'text-red-500' },
};

const INVERSE_RATING_MAP: Record<number, EvaluationRating> = {
    6: 'ممتاز',
    5: 'جيد جدا',
    4: 'جيد',
    3: 'متوسط',
    2: 'ضعيف',
    1: 'ضعيف جدا',
};

interface StudentDashboardProps {
    evaluations: StudentEvaluation[];
    studentData: Student | null;
    studentFormPhoto?: string | null;
    onPhotoUpdate: (photoBlob: Blob) => Promise<void>;
    onOpenMoodModal: () => void;
    activeHomeworks?: Homework[];
    submissions?: Record<string, HomeworkSubmission>;
    isFormLocked?: boolean;
    isTelegramLocked?: boolean;
    onUpdateTelegramChatId?: (chatId: string) => Promise<void>;
}

export default function StudentDashboard({ evaluations, studentData, studentFormPhoto, onPhotoUpdate, onOpenMoodModal, activeHomeworks = [], submissions = {}, isFormLocked = false, isTelegramLocked = false, onUpdateTelegramChatId }: StudentDashboardProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [telegramInput, setTelegramInput] = useState(studentData?.telegramChatId || '');
    const [isSavingTelegram, setIsSavingTelegram] = useState(false);
    const [showTelegramHelp, setShowTelegramHelp] = useState(false);
    const [telegramSuccessMsg, setTelegramSuccessMsg] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (studentData?.telegramChatId) {
            setTelegramInput(studentData.telegramChatId);
        }
    }, [studentData?.telegramChatId]);

    const displayPhoto = studentFormPhoto || 
        (studentData?.photoUrl && typeof studentData.photoUrl === 'string' && !studentData.photoUrl.includes("GckSf3v") ? studentData.photoUrl : null);

    const overallEvaluation = useMemo(() => {
        if (evaluations.length === 0) {
            return { text: 'لا يوجد تقييم حتى الآن', color: 'text-gray-500' };
        }
        const totalValue = evaluations.reduce((sum, e) => sum + (RATING_MAP[e.rating]?.value || 0), 0);
        const averageValue = Math.round(totalValue / evaluations.length);
        const ratingText = INVERSE_RATING_MAP[averageValue] || 'متوسط';
        
        return { text: ratingText, color: RATING_MAP[ratingText]?.color || 'text-gray-500' };
    }, [evaluations]);

    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isFormLocked) {
            alert("تم قفل التعديل وتغيير الصورة الشخصية من قبل إدارة المدرسة.");
            return;
        }

        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            await onPhotoUpdate(file);
        } catch (error) {
            console.error("Photo update failed:", error);
            alert("فشل تحديث الصورة.");
        } finally {
            setIsUploading(false);
        }
    };

    const upcomingDeadlines = useMemo(() => {
        const now = new Date();
        return activeHomeworks
            .filter(hw => {
                const sub = submissions[hw.id];
                if (sub) return false; // Already submitted

                const deadline = new Date(hw.deadline);
                const diffTime = deadline.getTime() - now.getTime();
                const diffDays = diffTime / (1000 * 60 * 60 * 24);
                
                return diffDays >= -1 && diffDays <= 3; // Due within next 3 days or just past
            })
            .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
    }, [activeHomeworks, submissions]);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile & Evaluation Card */}
                <div className="lg:col-span-1 bg-white p-8 rounded-xl shadow-lg text-center h-full">
                    <div className="w-40 h-40 mx-auto mb-4 relative group">
                        <img 
                            src={displayPhoto || "https://i.imgur.com/GckSf3v.jpeg"} 
                            alt="صورة الطالب" 
                            className="w-full h-full object-cover rounded-full border-4 border-cyan-500 bg-gray-200 shadow-md"
                        />
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handlePhotoChange}
                            accept="image/jpeg,image/png"
                            className="hidden"
                        />
                        <button
                            onClick={() => {
                                if (isFormLocked) {
                                    alert("تم قفل التعديل وتغيير الصورة الشخصية من قبل إدارة المدرسة.");
                                    return;
                                }
                                fileInputRef.current?.click();
                            }}
                            className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            disabled={isUploading}
                        >
                            {isUploading ? (
                                <Loader2 className="animate-spin" />
                            ) : isFormLocked ? (
                                <div className="flex flex-col items-center">
                                    <Lock size={28} />
                                    <span className="text-[10px] font-bold mt-1">مقفول</span>
                                </div>
                            ) : (
                                <>
                                    <Camera size={32} />
                                    <span className="absolute bottom-2 text-xs font-semibold">تغيير</span>
                                </>
                            )}
                        </button>
                    </div>

                    {isFormLocked && (
                        <div className="mb-3 inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-full border border-red-300 shadow-sm">
                            <Lock size={14} className="text-red-600" />
                            <span>التعديل والصورة مقفولة من الإدارة</span>
                        </div>
                    )}

                    <h1 className="text-3xl font-bold text-gray-800">{studentData?.name || 'اسم الطالب'}</h1>

                    <h2 className="text-xl font-semibold text-gray-600 mb-2 mt-6">تقييمك العام</h2>
                    <div className={`flex items-center justify-center gap-2 text-5xl font-bold ${overallEvaluation.color}`}>
                        <Star className="w-12 h-12" />
                        <span>{overallEvaluation.text}</span>
                    </div>
                    
                    <div className="flex flex-col gap-3 mt-8">
                        <button 
                            onClick={() => setIsModalOpen(true)}
                            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-cyan-600 text-white font-bold rounded-lg hover:bg-cyan-700 transition-transform transform hover:scale-105"
                        >
                            <BarChart size={20} />
                            عرض تقييمات المواد
                        </button>
                        <button 
                            onClick={onOpenMoodModal}
                            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-transform transform hover:scale-105"
                        >
                            <Smile size={20} />
                            تسجيل حالتي المزاجية
                        </button>
                    </div>
                </div>

                {/* Deadlines and Summary Section */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Direct Telegram Linking Card */}
                    <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-700 text-white p-6 rounded-2xl shadow-lg space-y-4 border border-sky-400/30">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl text-white shadow-inner">
                                    <Send className="w-7 h-7" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-xl text-white flex items-center gap-2">
                                        <span>ربط التليكرام المباشر</span>
                                        <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
                                    </h3>
                                    <p className="text-xs text-sky-100 mt-0.5">لاستلام الملاحظات والواجبات وتوجيهات مرشد الصف الفردية مباشرةً على حسابك</p>
                                </div>
                            </div>
                            {studentData?.telegramChatId ? (
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-green-500 text-white text-xs font-black rounded-full shadow-md">
                                        <CheckCircle2 size={16} />
                                        <span>مرتبط: {studentData.telegramChatId}</span>
                                    </span>
                                </div>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-400 text-amber-950 text-xs font-black rounded-full shadow-md animate-bounce">
                                    <ShieldCheck size={16} />
                                    <span>غير مرتبط بعد</span>
                                </span>
                            )}
                        </div>

                        {/* Direct Action Button & Interactive Form */}
                        <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/20 space-y-3.5">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                                <a
                                    href="https://t.me/userinfobot"
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-sky-800 font-black text-sm rounded-xl hover:bg-sky-50 transition-all shadow-md hover:shadow-lg active:scale-98 group"
                                >
                                    <Send className="w-4 h-4 text-sky-600 group-hover:translate-x-1 transition-transform" />
                                    <span>زر "ربط التليكرام المباشر" (استخراج الآيدي بنقرة واحدة)</span>
                                    <ExternalLink className="w-4 h-4 text-sky-500 opacity-70" />
                                </a>
                                <button
                                    type="button"
                                    onClick={() => setShowTelegramHelp(!showTelegramHelp)}
                                    className="px-4 py-3 bg-sky-900/50 hover:bg-sky-900 text-white text-xs font-bold rounded-xl transition border border-white/20 flex items-center justify-center gap-1.5"
                                >
                                    <HelpCircle size={16} />
                                    <span>طريقة الاستخراج؟</span>
                                </button>
                            </div>

                            {showTelegramHelp && (
                                <div className="p-3.5 bg-sky-950/60 rounded-xl text-xs text-sky-100 space-y-2 border border-sky-300/30">
                                    <p className="font-bold text-amber-300 text-sm flex items-center gap-1">
                                        <span>💡 خطوات ربط حسابك في التليكرام بثوانٍ:</span>
                                    </p>
                                    <ol className="list-decimal list-inside space-y-1 text-sky-100 font-medium leading-relaxed">
                                        <li>انقر على زر <b>"ربط التليكرام المباشر"</b> الأبيض أعلاه.</li>
                                        <li>سيُفتح لك بوت استخراج الآيدي (<code className="bg-white/20 px-1 py-0.5 rounded font-mono text-white">@userinfobot</code>) في التليكرام، اضغط على <b>Start / بدء</b>.</li>
                                        <li>سينسخ البوت لك رقم الآيدي العددي الخاص بك (مثل: <code className="bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded font-mono font-bold">589123456</code>).</li>
                                        <li>انسخ هذا الرقم، ثم ضعْه في المستطيل أدناه واضغط على <b>حفظ وتأكيد الآيدي</b>.</li>
                                    </ol>
                                </div>
                            )}

                            {/* Input and Save Form */}
                            <div className="space-y-1.5 pt-1">
                                <label className="block text-xs font-bold text-sky-100 flex items-center justify-between">
                                    <span>أدخل رقم الـ Chat ID الخاص بحسابك (مثال: 589123456):</span>
                                    {isTelegramLocked && (
                                        <span className="text-amber-300 font-black flex items-center gap-1 text-[11px]">
                                            <Lock size={12} /> التعديل مقفل من قبل المعاون
                                        </span>
                                    )}
                                </label>
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <input
                                        type="text"
                                        value={telegramInput}
                                        onChange={(e) => setTelegramInput(e.target.value)}
                                        disabled={isTelegramLocked}
                                        placeholder={isTelegramLocked ? "التعديل مقفل حالياً" : "ضع الآيدي هنا مثلاً: 589123456"}
                                        className="flex-1 px-3.5 py-2.5 bg-white text-gray-900 rounded-xl text-sm font-mono dir-ltr focus:outline-none focus:ring-2 focus:ring-amber-300 shadow-inner placeholder:text-gray-400 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
                                    />
                                    <button
                                        type="button"
                                        disabled={isTelegramLocked || isSavingTelegram || !telegramInput.trim()}
                                        onClick={async () => {
                                            if (!onUpdateTelegramChatId || isTelegramLocked) return;
                                            setIsSavingTelegram(true);
                                            try {
                                                await onUpdateTelegramChatId(telegramInput.trim());
                                                setTelegramSuccessMsg(true);
                                                setTimeout(() => setTelegramSuccessMsg(false), 5000);
                                            } catch (err) {
                                                alert("حدث خطأ أثناء حفظ معرف التليكرام.");
                                            } finally {
                                                setIsSavingTelegram(false);
                                            }
                                        }}
                                        className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-black text-xs rounded-xl transition disabled:opacity-50 disabled:bg-amber-400/50 flex items-center justify-center gap-1.5 shadow-md active:scale-98 disabled:cursor-not-allowed"
                                    >
                                        {isSavingTelegram ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Save className="w-4 h-4" />
                                        )}
                                        <span>حفظ وتأكيد الآيدي</span>
                                    </button>
                                </div>
                                {isTelegramLocked && (
                                    <div className="p-2.5 bg-red-900/60 border border-red-300/40 rounded-xl text-xs text-red-100 font-bold flex items-center gap-2 mt-2">
                                        <Lock className="w-4 h-4 text-amber-300 flex-shrink-0" />
                                        <span>تنبيه: تم قفل إمكانية إدخال أو تعديل معرف التليكرام من قبل معاون شؤون الطلبة.</span>
                                    </div>
                                )}
                                {telegramSuccessMsg && (
                                    <div className="p-2.5 bg-green-500/25 border border-green-300/50 rounded-xl text-xs text-green-100 font-bold text-center flex items-center justify-center gap-2 animate-fade-in mt-2">
                                        <CheckCircle2 size={18} className="text-green-300" />
                                        <span>تم حفظ معرف التليكرام وربط الحساب بنجاح! ستصلك رسائل الإدارة والمرشد فوراً.</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Deadlines Card */}
                    <div className="bg-white p-6 rounded-xl shadow-lg h-full border-r-4 border-orange-500">
                        <div className="flex items-center gap-3 mb-6">
                            <Clock className="text-orange-600" size={28} />
                            <h3 className="text-2xl font-bold text-gray-800">مواعيد نهائية قريبة</h3>
                        </div>
                        
                        {upcomingDeadlines.length > 0 ? (
                            <div className="space-y-4">
                                {upcomingDeadlines.map(hw => {
                                    const diff = new Date(hw.deadline).getTime() - new Date().getTime();
                                    const diffDays = Math.ceil(diff / (1000 * 60 * 60 * 24));
                                    
                                    return (
                                        <div key={hw.id} className="flex items-center justify-between p-4 bg-orange-50 rounded-lg border border-orange-200 animate-pulse-slow">
                                            <div>
                                                <h4 className="font-bold text-orange-900">{hw.title}</h4>
                                                <p className="text-sm text-orange-700">{hw.subjectName}</p>
                                            </div>
                                            <div className="text-left">
                                                <span className={`flex items-center gap-1 font-black text-sm ${diffDays < 0 ? 'text-red-600' : 'text-orange-600'}`}>
                                                    <AlertTriangle size={14} />
                                                    {diffDays < 0 ? 'انتهى الموعد' : diffDays === 0 ? 'اليوم' : `باقي ${diffDays} يوم`}
                                                </span>
                                                <p className="text-xs text-gray-500">{new Date(hw.deadline).toLocaleDateString('ar-EG')}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-gray-400">
                                <CheckCircleIcon className="w-16 h-16 mx-auto mb-2 opacity-20" />
                                <p>لا توجد واجبات متأخرة أو قريبة التسليم حالياً. عمل رائع!</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {isModalOpen && (
                <div 
                    className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4"
                    onClick={() => setIsModalOpen(false)}
                >
                    <div 
                        className="bg-white p-6 rounded-lg shadow-xl w-full max-w-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center border-b pb-3 mb-4">
                            <h3 className="text-2xl font-bold">تقييم المواد</h3>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full"><X/></button>
                        </div>
                        {evaluations.length > 0 ? (
                            <div className="max-h-[60vh] overflow-y-auto">
                                <table className="w-full text-right">
                                    <thead className="sticky top-0 bg-gray-100">
                                        <tr>
                                            <th className="p-3 font-semibold">المادة الدراسية</th>
                                            <th className="p-3 font-semibold">التقييم</th>
                                            <th className="p-3 font-semibold">الأستاذ المقيم</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {evaluations.map((evaluation, index) => (
                                            <tr key={evaluation.id} className={`border-b ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                                <td className="p-3 font-medium">{evaluation.subjectName}</td>
                                                <td className={`p-3 font-bold ${RATING_MAP[evaluation.rating]?.color}`}>{evaluation.rating}</td>
                                                <td className="p-3 text-gray-600">{evaluation.teacherName}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 py-8">لم يقم المدرسون بتقييمك في أي مادة بعد.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const CheckCircleIcon = ({className}:{className?: string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
    </svg>
);
