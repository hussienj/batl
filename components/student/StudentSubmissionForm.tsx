import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../lib/firebase.ts';
import { uploadToImgur } from '../../lib/imgur.ts';
import { v4 as uuidv4 } from 'uuid';
import RegistrationFormPage1 from '../principal/RegistrationFormPage1.tsx';
import RegistrationFormPage2 from '../principal/RegistrationFormPage2.tsx';
import { Loader2, Send, FileDown, LogOut, Info, CheckCircle, Lock } from 'lucide-react';
import type { Announcement, User } from '../../types.ts';

declare const jspdf: any;
declare const html2canvas: any;

interface StudentSubmissionFormProps {
    submissionInfo: {
        principalId: string;
        stage: string;
    };
    currentUser?: User;
    onLogout: () => void;
}

export default function StudentSubmissionForm({ submissionInfo, currentUser, onLogout }: StudentSubmissionFormProps) {
    const studentKey = currentUser?.id || currentUser?.code || 'default_student';
    const storageKeyForm = `student_form_data_${studentKey}`;
    const storageKeyPhoto = `student_form_photo_${studentKey}`;
    const storageKeyStatus = `student_form_status_${studentKey}`;

    const [formData, setFormData] = useState<Record<string, string>>({
        stage: submissionInfo.stage,
        fullName: currentUser?.name || '',
        fullName2: currentUser?.name || '',
    });
    const [studentPhoto, setStudentPhoto] = useState<string | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submissionSuccess, setSubmissionSuccess] = useState(false);
    const [announcement, setAnnouncement] = useState<Announcement | null>(null);
    const [schoolName, setSchoolName] = useState<string>('');
    const [isExporting, setIsExporting] = useState(false);
    const [isFormLocked, setIsFormLocked] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Listen for form lock status
        const locksRef = db.ref(`form_locks/${submissionInfo.principalId}`);
        const lockCallback = (snapshot: any) => {
            if (snapshot.exists()) {
                const val = snapshot.val();
                const allLocked = !!val.allLocked;
                const studentLocked = !!val[studentKey] || (currentUser?.name && !!val[currentUser.name.trim()]);
                setIsFormLocked(allLocked || studentLocked);
            } else {
                setIsFormLocked(false);
            }
        };
        locksRef.on('value', lockCallback);

        // 1. First load from local storage if available
        try {
            const localSavedData = localStorage.getItem(storageKeyForm);
            const localSavedPhoto = localStorage.getItem(storageKeyPhoto);
            const localStatus = localStorage.getItem(storageKeyStatus);

            if (localSavedData) {
                const parsed = JSON.parse(localSavedData);
                setFormData(prev => ({ ...prev, ...parsed }));
            }
            if (localSavedPhoto) {
                setStudentPhoto(localSavedPhoto);
            }
            if (localStatus === 'submitted') {
                setSubmissionSuccess(true);
            }
        } catch (e) {
            console.warn("Could not read local form data:", e);
        }

        // 2. Fetch from Firebase for persistent cross-device syncing
        const studentFormRef = db.ref(`student_saved_forms/${submissionInfo.principalId}/${studentKey}`);
        studentFormRef.get().then((snapshot: any) => {
            if (snapshot.exists()) {
                const val = snapshot.val();
                if (val.formData) {
                    setFormData(prev => ({ ...prev, ...val.formData }));
                    try { localStorage.setItem(storageKeyForm, JSON.stringify(val.formData)); } catch (e) {}
                }
                if (val.studentPhoto) {
                    setStudentPhoto(val.studentPhoto);
                    try { localStorage.setItem(storageKeyPhoto, val.studentPhoto); } catch (e) {}
                }
                if (val.submitted || val.status === 'submitted') {
                    setSubmissionSuccess(true);
                    try { localStorage.setItem(storageKeyStatus, 'submitted'); } catch (e) {}
                }
            } else {
                // Also check student_submissions if already submitted
                const submissionsRef = db.ref(`student_submissions/${submissionInfo.principalId}`);
                submissionsRef.get().then((subSnap: any) => {
                    if (subSnap.exists()) {
                        const subs = Object.values(subSnap.val()) as any[];
                        const userSub = subs.find((s: any) => 
                            s.studentId === studentKey || 
                            (s.studentCode && s.studentCode === currentUser?.code) || 
                            (s.studentName && s.studentName === currentUser?.name)
                        );
                        if (userSub) {
                            if (userSub.formData) {
                                setFormData(prev => ({ ...prev, ...userSub.formData }));
                                try { localStorage.setItem(storageKeyForm, JSON.stringify(userSub.formData)); } catch (e) {}
                            }
                            if (userSub.studentPhoto) {
                                setStudentPhoto(userSub.studentPhoto);
                                try { localStorage.setItem(storageKeyPhoto, userSub.studentPhoto); } catch (e) {}
                            }
                            setSubmissionSuccess(true);
                            try { localStorage.setItem(storageKeyStatus, 'submitted'); } catch (e) {}
                        }
                    }
                });
            }
        });

        // Fetch announcement
        const announcementRef = db.ref(`announcements/${submissionInfo.principalId}/${submissionInfo.stage}`);
        announcementRef.get().then((snapshot: any) => {
            if (snapshot.exists()) {
                setAnnouncement(snapshot.val());
            }
        });

        // Fetch school name
        const schoolNameRef = db.ref(`settings/${submissionInfo.principalId}/schoolName`);
        schoolNameRef.get().then((snapshot: any) => {
            if(snapshot.exists()) {
                setSchoolName(snapshot.val());
            }
        });

        return () => {
            locksRef.off('value', lockCallback);
        };
    }, [submissionInfo.principalId, submissionInfo.stage, studentKey, storageKeyForm, storageKeyPhoto, storageKeyStatus, currentUser]);
    
    const handleUpdate = (field: string, value: string) => {
        if (isFormLocked) {
            alert("تم قفل التعديل على بيانات الاستمارة من قبل إدارة المدرسة.");
            return;
        }

        setFormData(prev => {
            const updated = { ...prev, [field]: value };
            try {
                localStorage.setItem(storageKeyForm, JSON.stringify(updated));
            } catch (e) {}
            
            // Debounced/async save to firebase draft
            db.ref(`student_saved_forms/${submissionInfo.principalId}/${studentKey}`).update({
                formData: updated,
                updatedAt: new Date().toISOString()
            }).catch(() => {});

            return updated;
        });
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isFormLocked) {
            alert("تم قفل تغيير الصورة الشخصية من قبل إدارة المدرسة.");
            return;
        }

        const file = e.target.files?.[0];
        if (file) {
            setIsUploadingPhoto(true);
            try {
                const imgUrl = await uploadToImgur(file);
                setStudentPhoto(imgUrl);
                try {
                    localStorage.setItem(storageKeyPhoto, imgUrl);
                } catch (e) {}

                db.ref(`student_saved_forms/${submissionInfo.principalId}/${studentKey}`).update({
                    studentPhoto: imgUrl,
                    updatedAt: new Date().toISOString()
                }).catch(() => {});
            } catch (err) {
                console.error("Error uploading image:", err);
            } finally {
                setIsUploadingPhoto(false);
            }
        }
    };

    const validateForm = (): boolean => {
        const { fullName, motherName, fatherPhone, motherPhone, studentPhoneOrTelegram } = formData;
        const errors = [];

        if (!studentPhoto) {
            errors.push("الصورة الشخصية للطالب (يرجى إرفاق وإضافة صورة شخصية للطالب أولاً)");
        }
        if (!fullName || !fullName.trim()) {
            errors.push("اسم الطالب الرباعي واللقب");
        }
        if (!motherName || !motherName.trim()) {
            errors.push("اسم الام الثلاثي");
        }
        if (!studentPhoneOrTelegram || !studentPhoneOrTelegram.trim()) {
            errors.push("موبايل الطالب المرتبط بالتليكرام او المعرف (حقل إلزامي)");
        }
        if ((!fatherPhone || !fatherPhone.trim()) && (!motherPhone || !motherPhone.trim())) {
            errors.push("رقم هاتف الاب او رقم هاتف الام");
        }
        
        if (errors.length > 0) {
            alert(`يرجى استكمال المتطلبات التالية قبل تصدير أو إرسال الاستمارة:\n- ${errors.join('\n- ')}`);
            return false;
        }
        return true;
    };

    const handleExportPdf = async () => {
        if (!validateForm()) {
            return;
        }
        setIsExporting(true);
        
        const page1Container = document.getElementById('pdf-page-1');
        const page2Container = document.getElementById('pdf-page-2');

        const page1Element = page1Container?.firstElementChild as HTMLElement;
        const page2Element = page2Container?.firstElementChild as HTMLElement;

        if (!page1Element || !page2Element) {
            alert("خطأ: تعذر العثور على عناصر الصفحة للتصدير.");
            setIsExporting(false);
            return;
        }

        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(btn => ((btn as HTMLElement).style.visibility = 'hidden'));
        
        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            const addCanvasToPdf = async (canvas: HTMLCanvasElement) => {
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                const canvasAspectRatio = canvas.width / canvas.height;
                const MARGIN_MM = 5;
                const availableWidth = pdfWidth - (MARGIN_MM * 2);
                const availableHeight = pdfHeight - (MARGIN_MM * 2);
                let imgWidth, imgHeight;

                if ((availableWidth / canvas.width) * canvas.height < availableHeight) {
                    imgWidth = availableWidth;
                    imgHeight = imgWidth / canvasAspectRatio;
                } else {
                    imgHeight = availableHeight;
                    imgWidth = imgHeight * canvasAspectRatio;
                }

                const xPos = (pdfWidth - imgWidth) / 2;
                const yPos = (pdfHeight - imgHeight) / 2;
                
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', xPos, yPos, imgWidth, imgHeight, undefined, 'FAST');
            };
            
            const canvas1 = await html2canvas(page1Element, { scale: 2, useCORS: true, logging: true });
            await addCanvasToPdf(canvas1);
    
            pdf.addPage();
            const canvas2 = await html2canvas(page2Element, { scale: 2, useCORS: true });
            await addCanvasToPdf(canvas2);
    
            pdf.save(`استمارة-${formData.fullName || 'طالب'}.pdf`);
        } catch(e) {
            console.error("PDF export failed:", e);
            alert('فشل تصدير الملف.');
        } finally {
            allButtons.forEach(btn => ((btn as HTMLElement).style.visibility = 'visible'));
            setIsExporting(false);
        }
    };

    const handleSubmit = async () => {
        if (isFormLocked) {
            alert("تم إيقاف وتحديث الاستمارة من قبل إدارة المدرسة.");
            return;
        }
        if (!validateForm()) return;
        setIsSubmitting(true);
        
        try {
            const submissionId = studentKey;
            const submissionData = {
                id: submissionId,
                studentId: studentKey,
                studentCode: currentUser?.code || '',
                principalId: submissionInfo.principalId,
                studentName: formData.fullName || currentUser?.name || 'طالب',
                stage: submissionInfo.stage,
                formData: formData,
                studentPhoto: studentPhoto,
                submittedAt: new Date().toISOString(),
                status: 'pending'
            };

            // Save submission for principal
            await db.ref(`student_submissions/${submissionInfo.principalId}/${submissionId}`).set(submissionData);

            // Save persistent form data and status for student
            await db.ref(`student_saved_forms/${submissionInfo.principalId}/${studentKey}`).set({
                formData: formData,
                studentPhoto: studentPhoto,
                submitted: true,
                status: 'submitted',
                submittedAt: new Date().toISOString()
            });

            try {
                localStorage.setItem(storageKeyForm, JSON.stringify(formData));
                if (studentPhoto) localStorage.setItem(storageKeyPhoto, studentPhoto);
                localStorage.setItem(storageKeyStatus, 'submitted');
            } catch (e) {}

            setSubmissionSuccess(true);
        } catch (error) {
            console.error("Submission failed:", error);
            alert("حدث خطأ أثناء إرسال الاستمارة. يرجى المحاولة مرة أخرى.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="bg-gray-100 p-4 sm:p-8 min-h-screen">
             <header className="max-w-[882px] mx-auto bg-white p-4 rounded-t-xl shadow-md flex justify-between items-center mb-4">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">{schoolName || 'استمارة معلومات الطالب'}</h1>
                    <p className="text-sm text-gray-500">المرحلة: {submissionInfo.stage}</p>
                </div>
                <button onClick={onLogout} className="px-4 py-2 bg-red-600 text-white rounded-md flex items-center gap-2">
                    <LogOut size={18} />
                    تسجيل الخروج
                </button>
            </header>

             {isFormLocked && (
                <div className="max-w-[882px] mx-auto bg-red-100 border-r-4 border-red-600 text-red-900 p-4 mb-4 rounded-md flex items-center gap-3 shadow-md">
                    <Lock className="w-8 h-8 flex-shrink-0 text-red-600" />
                    <div>
                        <p className="font-extrabold text-lg">تم قفل التعديل والإرسال من قبل إدارة المدرسة</p>
                        <p className="text-sm">تم توقيف إجراء أي تعديل جديد على بيانات الاستمارة أو إعادة إرسالها أو تغيير الصورة الشخصية بناءً على توجيهات المدير.</p>
                    </div>
                </div>
            )}

             {announcement && (
                <div className="max-w-[882px] mx-auto bg-blue-100 border-l-4 border-blue-500 text-blue-800 p-4 mb-4 rounded-md flex items-start gap-3 shadow-sm">
                    <Info className="w-6 h-6 flex-shrink-0 mt-1" />
                    <div>
                        <p className="font-bold">تبليغ من الإدارة:</p>
                        <p>{announcement.message}</p>
                    </div>
                </div>
            )}

            {isUploadingPhoto && (
                <div className="max-w-[882px] mx-auto bg-yellow-50 border border-yellow-300 text-yellow-800 p-3 mb-4 rounded-md flex items-center gap-2">
                    <Loader2 className="animate-spin text-yellow-600" size={20} />
                    <span>جاري رفع الصورة الشخصية إلى الخادم (Imgur)...</span>
                </div>
            )}

            <div ref={formRef}>
                <div className="space-y-8">
                     <div id="pdf-page-1">
                        <RegistrationFormPage1 
                            formData={formData} 
                            onUpdate={handleUpdate} 
                            studentPhoto={studentPhoto}
                            onPhotoUpload={handlePhotoUpload}
                            isPdfMode={isFormLocked}
                        />
                    </div>
                    <div id="pdf-page-2">
                        <RegistrationFormPage2 
                            formData={formData} 
                            onUpdate={handleUpdate} 
                            isPdfMode={isFormLocked}
                        />
                    </div>
                </div>
                
                <div className="mt-8 text-center space-y-4 max-w-[882px] mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button 
                            type="button"
                            onClick={handleExportPdf}
                            disabled={isExporting}
                            className="w-full px-6 py-4 bg-red-600 text-white font-bold text-lg rounded-lg shadow-lg hover:bg-red-700 disabled:bg-gray-400 transition flex items-center justify-center gap-2"
                        >
                            {isExporting ? <Loader2 className="animate-spin" /> : <FileDown size={22} />}
                            <span>تصدير ملف PDF (الصفحتين)</span>
                        </button>

                        <button 
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting || submissionSuccess || isFormLocked}
                            className={`w-full px-6 py-4 ${isFormLocked ? 'bg-red-800 cursor-not-allowed opacity-90' : submissionSuccess ? 'bg-green-700' : 'bg-green-600 hover:bg-green-700'} text-white font-bold text-lg rounded-lg shadow-lg disabled:bg-gray-400 transition flex items-center justify-center gap-2`}
                        >
                            {isFormLocked ? (
                                <>
                                    <Lock size={22} />
                                    <span>التعديل والإرسال موقوف من الإدارة</span>
                                </>
                            ) : isSubmitting ? (
                                <>
                                    <Loader2 className="animate-spin" />
                                    <span>جاري الإرسال...</span>
                                </>
                            ) : submissionSuccess ? (
                                <>
                                    <CheckCircle size={22} />
                                    <span>تم إرسال الاستمارة بنجاح</span>
                                </>
                            ) : (
                                <>
                                    <Send size={22} />
                                    <span>إرسال الاستمارة إلى إدارة المدرسة</span>
                                </>
                            )}
                        </button>
                    </div>

                    {submissionSuccess && (
                        <div className="p-4 bg-green-100 border-2 border-green-400 rounded-lg text-green-800 font-bold text-center text-lg">
                            ✓ تم إرسال الاستمارة بنجاح إلى إدارة المدرسة، وتأكيد وصولها بصفحة الاستمارات المستلمة.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}