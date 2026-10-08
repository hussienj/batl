import React, { useRef, useState } from 'react';
import type { Student, ClassData, SchoolSettings, DisciplineRecord, User } from '../../types.ts';
import { exportDisciplineWordDocument } from './DisciplineWordExporter.ts';
import { 
    X, Printer, FileDown, ShieldAlert, CheckCircle2, 
    Calendar, User as UserIcon, BookOpen, AlertTriangle, 
    RotateCcw, Sparkles, Award, Clock, FileText, Loader2
} from 'lucide-react';

declare const jspdf: any;
declare const html2canvas: any;

interface DisciplineReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    student: Student;
    classData?: ClassData;
    settings: SchoolSettings;
    records: DisciplineRecord[];
    maxPoints: number;
    currentPoints: number;
    studentPhotoUrl?: string | null;
    currentUser: User;
    onArchiveAndReset?: (student: Student, reason: string) => Promise<void>;
}

export default function DisciplineReportModal({
    isOpen,
    onClose,
    student,
    classData,
    settings,
    records,
    maxPoints,
    currentPoints,
    studentPhotoUrl,
    currentUser,
    onArchiveAndReset
}: DisciplineReportModalProps) {
    const reportRef = useRef<HTMLDivElement>(null);
    const [isExportingWord, setIsExportingWord] = useState(false);
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
    const [archiveReason, setArchiveReason] = useState('حضور ولي أمر الطالب وتوقيع تعهد خطي بالالتزام التام بالنظام المدرسي');
    const [isArchiving, setIsArchiving] = useState(false);
    const [logoError, setLogoError] = useState(false);

    if (!isOpen) return null;

    const activeRecords = records.filter(r => r.status !== 'archived');
    const totalDeductions = activeRecords.reduce((sum, r) => sum + r.pointsDeducted, 0);
    const isAtZero = currentPoints <= 0;

    const stage = classData?.stage || 'غير محدد';
    const section = classData?.section || 'غير محدد';
    const schoolName = settings.schoolName || 'متوسطة بطل خيبر';
    const directorate = settings.directorate || 'المديرية العامة للتربية في محافظة كربلاء المقدسة';
    const academicYear = settings.academicYear || '2026-2027';
    const currentDate = new Date().toLocaleDateString('ar-IQ', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const isAssistantOrPrincipal = currentUser.role === 'assistant' || currentUser.role === 'principal' || currentUser.role === 'admin';

    // Direct PDF Export
    const handleExportPdf = async () => {
        const paperElement = document.getElementById('discipline-report-paper');
        if (!paperElement) return;

        setIsExportingPdf(true);
        try {
            await document.fonts.ready;

            // Wait for all images inside to be fully loaded
            const images = paperElement.querySelectorAll('img');
            await Promise.all(Array.from(images).map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
            }));

            if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
                // Fallback if cdn libraries are unavailable
                window.print();
                return;
            }

            const canvas = await html2canvas(paperElement, {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false
            });

            const { jsPDF } = jspdf;
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
            const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
            const margin = 8;
            const printableWidth = pageWidth - (margin * 2);
            const printableHeight = (canvas.height * printableWidth) / canvas.width;

            const imgData = canvas.toDataURL('image/png');

            if (printableHeight <= pageHeight - (margin * 2)) {
                // Fits neatly on single A4 page
                pdf.addImage(imgData, 'PNG', margin, margin, printableWidth, printableHeight, undefined, 'FAST');
            } else {
                // Multi-page export
                let heightLeft = printableHeight;
                let position = margin;
                let pageNum = 1;

                pdf.addImage(imgData, 'PNG', margin, position, printableWidth, printableHeight, undefined, 'FAST');
                heightLeft -= (pageHeight - (margin * 2));

                while (heightLeft > 0) {
                    position = margin - (pageNum * (pageHeight - (margin * 2)));
                    pdf.addPage();
                    pdf.addImage(imgData, 'PNG', margin, position, printableWidth, printableHeight, undefined, 'FAST');
                    heightLeft -= (pageHeight - (margin * 2));
                    pageNum++;
                }
            }

            const cleanStudentName = student.name.replace(/[/\\?%*:|"<>]/g, '_').trim();
            pdf.save(`تقرير_انضباط_الطالب_${cleanStudentName}.pdf`);
        } catch (error) {
            console.error('PDF export failed:', error);
            // Fallback to browser print
            window.print();
        } finally {
            setIsExportingPdf(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExportWord = async () => {
        setIsExportingWord(true);
        try {
            await exportDisciplineWordDocument({
                student,
                classData,
                settings,
                records,
                maxPoints,
                currentPoints,
                counselorName: 'المرشد التربوي',
                assistantName: currentUser.role === 'assistant' ? currentUser.name : 'معاون شؤون الطلبة'
            });
        } catch (error) {
            console.error('Word export failed:', error);
            alert('حدث خطأ أثناء تصدير ملف Word.');
        } finally {
            setIsExportingWord(false);
        }
    };

    const handleConfirmArchive = async () => {
        if (!archiveReason.trim()) {
            alert('يرجى كتابة سبب الإجراء / سبب منح الفرصة الجديدة.');
            return;
        }
        if (!onArchiveAndReset) return;

        setIsArchiving(true);
        try {
            await onArchiveAndReset(student, archiveReason.trim());
            setIsArchiveModalOpen(false);
            onClose();
        } catch (error) {
            console.error('Archive reset failed:', error);
            alert('حدث خطأ أثناء الأرشفة.');
        } finally {
            setIsArchiving(false);
        }
    };

    const fallbackPhoto = 'https://i.imgur.com/GckSf3v.png';
    const photoToDisplay = studentPhotoUrl || (student?.photoUrl && typeof student.photoUrl === 'string' && !student.photoUrl.includes('GckSf3v') ? student.photoUrl : null);
    const schoolLogoUrl = (settings as any)?.logo || (settings as any)?.schoolLogo || "https://i.imgur.com/jDSB6Ry.png";

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
                {/* Modal Header */}
                <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between no-print">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-500/20 text-red-400 rounded-xl border border-red-500/30">
                            <ShieldAlert className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                                تقرير انضباط الطالب واستدعاء ولي الأمر
                                {isAtZero && (
                                    <span className="text-xs bg-red-600 text-white px-2.5 py-0.5 rounded-full font-bold animate-pulse">
                                        استنفد النقاط (0/10)
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-slate-400">
                                الطالب: {student.name} | الصف: {stage} - الشعبة: {section}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Export PDF Directly */}
                        <button
                            type="button"
                            onClick={handleExportPdf}
                            disabled={isExportingPdf}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                            title="تصدير وحفظ ملف PDF مباشرة على جهازك"
                        >
                            {isExportingPdf ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <FileDown size={16} />
                            )}
                            <span>{isExportingPdf ? 'جاري إنشاء PDF...' : 'تصدير PDF'}</span>
                        </button>

                        {/* Export Word */}
                        <button
                            type="button"
                            onClick={handleExportWord}
                            disabled={isExportingWord}
                            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                            title="تصدير بصيغة Word (.docx)"
                        >
                            <FileText size={16} />
                            <span>{isExportingWord ? 'جاري التحميل...' : 'تصدير Word'}</span>
                        </button>

                        {/* Direct Print fallback icon */}
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all shadow-xs cursor-pointer"
                            title="طباعة عبر نافذة المتصفح"
                        >
                            <Printer size={16} />
                        </button>

                        {/* Archive & Grant New Chance (for Assistant / Principal) */}
                        {isAssistantOrPrincipal && onArchiveAndReset && (
                            <button
                                type="button"
                                onClick={() => setIsArchiveModalOpen(true)}
                                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                                title="أرشفة ومنح فرصة جديدة"
                            >
                                <RotateCcw size={16} />
                                <span className="hidden sm:inline">أرشفة وفرصة جديدة</span>
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Printable / Exportable Report Content */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-slate-50 print:p-0 print:bg-white text-slate-900" ref={reportRef} id="discipline-printable-area">
                    <div id="discipline-report-paper" className="max-w-3xl mx-auto bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200 print:border-none print:shadow-none print:p-0 space-y-6">
                        
                        {/* Official Document Header */}
                        <div className="border-b-2 border-slate-800 pb-4 text-center space-y-1">
                            <div className="flex items-center justify-between">
                                <div className="text-right text-xs font-bold text-slate-700 space-y-0.5">
                                    <p>جمهورية العراق</p>
                                    <p>وزارة التربية</p>
                                    <p>{directorate}</p>
                                </div>

                                <div className="text-center">
                                    <div className="w-16 h-16 mx-auto flex items-center justify-center">
                                        {!logoError ? (
                                            <img
                                                src={schoolLogoUrl}
                                                alt="شعار المدرسة"
                                                crossOrigin="anonymous"
                                                className="h-16 w-16 object-contain drop-shadow-xs"
                                                referrerPolicy="no-referrer"
                                                onError={() => setLogoError(true)}
                                            />
                                        ) : (
                                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-900 to-slate-900 text-amber-400 border border-amber-400/40 flex flex-col items-center justify-center p-1 shadow-xs">
                                                <Award className="w-7 h-7" />
                                                <span className="text-[9px] font-bold mt-0.5 text-white">متوسطة بطل خيبر</span>
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="font-extrabold text-base text-slate-900 mt-1">{schoolName}</h3>
                                    <p className="text-xs text-slate-600 font-semibold">معاونية شؤون الطلبة والانضباط المدرسي</p>
                                </div>

                                <div className="text-left text-xs font-bold text-slate-700 space-y-0.5">
                                    <p>العام الدراسي: {academicYear}</p>
                                    <p>تاريخ التقرير: {currentDate}</p>
                                    <p>الرقم: انضباط/{student.id.slice(0, 6)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Title Banner */}
                        <div className="bg-red-50 border-2 border-red-500 rounded-xl p-3 text-center">
                            <h2 className="text-lg sm:text-xl font-extrabold text-red-800 flex items-center justify-center gap-2">
                                <ShieldAlert className="w-6 h-6 text-red-600" />
                                استمارة كشف مخالفات السلوك واستدعاء ولي أمر الطالب
                            </h2>
                            <p className="text-xs text-red-600 font-bold mt-0.5">
                                {isAtZero 
                                    ? '⚠️ إشعار عاجل: استنفاد كامل رصيد نقاط السلوك والانضباط المدرسي (0/10)' 
                                    : `رصيد النقاط المتبقي: (${currentPoints} من أصل ${maxPoints})`}
                            </p>
                        </div>

                        {/* Student Identification Card */}
                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col sm:flex-row items-center gap-5">
                            {/* Student Photo */}
                            <div className="w-28 h-32 rounded-xl overflow-hidden border-2 border-slate-300 bg-white shadow-xs flex-shrink-0 flex items-center justify-center relative">
                                {photoToDisplay ? (
                                    <img
                                        src={photoToDisplay}
                                        alt={student.name}
                                        className="w-full h-full object-cover"
                                        referrerPolicy="no-referrer"
                                    />
                                ) : (
                                    <div className="text-center p-2 text-slate-400">
                                        <UserIcon className="w-12 h-12 mx-auto text-slate-300 mb-1" />
                                        <span className="text-[10px] block font-semibold">صورة الطالب</span>
                                    </div>
                                )}
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 flex-1 text-sm">
                                <div>
                                    <span className="text-xs text-slate-500 font-semibold block">اسم الطالب الرباعي:</span>
                                    <span className="font-bold text-slate-900 text-base">{student.name}</span>
                                </div>

                                <div>
                                    <span className="text-xs text-slate-500 font-semibold block">الصف والشعبة:</span>
                                    <span className="font-bold text-slate-900 text-base">{stage} / {section}</span>
                                </div>

                                <div>
                                    <span className="text-xs text-slate-500 font-semibold block">الرقم الامتحاني / الكود:</span>
                                    <span className="font-mono font-bold text-slate-700">{student.examId || student.studentAccessCode || student.id || '---'}</span>
                                </div>

                                <div>
                                    <span className="text-xs text-slate-500 font-semibold block">رصيد نقاط الانضباط:</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-3 py-0.5 rounded-full text-xs font-extrabold ${
                                            isAtZero ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-900 border border-amber-300'
                                        }`}>
                                            {currentPoints} / {maxPoints} نقطة
                                        </span>
                                        <span className="text-xs text-slate-500">({totalDeductions} خصم مسجل)</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Violations Table */}
                        <div className="space-y-2">
                            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                <Clock className="w-4 h-4 text-red-600" />
                                سجل التقييمات السلبية والمخالفات المرصودة من الكادر التعليمي:
                            </h4>

                            <div className="border border-slate-300 rounded-xl overflow-hidden shadow-xs">
                                <table className="w-full text-right text-xs">
                                    <thead className="bg-slate-900 text-white font-bold">
                                        <tr>
                                            <th className="p-2.5 text-center w-10">ت</th>
                                            <th className="p-2.5">التاريخ والوقت</th>
                                            <th className="p-2.5">المادة</th>
                                            <th className="p-2.5">المدرس / الموثق</th>
                                            <th className="p-2.5">المخالفة السلوكية</th>
                                            <th className="p-2.5 text-center w-24">الخصم</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {activeRecords.length > 0 ? (
                                            activeRecords.map((record, index) => {
                                                const d = new Date(record.timestamp);
                                                const formattedDate = d.toLocaleDateString('ar-EG');
                                                const formattedTime = d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

                                                return (
                                                    <tr key={record.id || index} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}>
                                                        <td className="p-2.5 text-center font-bold text-slate-500">{index + 1}</td>
                                                        <td className="p-2.5 font-medium text-slate-700 whitespace-nowrap">
                                                            <div>{formattedDate}</div>
                                                            <div className="text-[10px] text-slate-400">{formattedTime}</div>
                                                        </td>
                                                        <td className="p-2.5 font-semibold text-slate-800">{record.subjectName || 'سلوك عام'}</td>
                                                        <td className="p-2.5 font-bold text-blue-900">{record.teacherName || 'الإدارة'}</td>
                                                        <td className="p-2.5">
                                                            <span className="font-bold text-red-800 block">{record.criterionTitle}</span>
                                                            {record.notes && (
                                                                <span className="text-[11px] text-slate-500 block mt-0.5 bg-slate-100 p-1 rounded">
                                                                    ملاحظة: {record.notes}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="p-2.5 text-center">
                                                            <span className="inline-block px-2 py-1 bg-red-100 text-red-800 font-bold rounded-lg border border-red-200 text-xs">
                                                                -{record.pointsDeducted} نقطة
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={6} className="p-4 text-center text-slate-500 font-semibold">
                                                    لا توجد مخالفات نشطة مسجلة بحق الطالب.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Guardian Summon Notice */}
                        <div className="bg-slate-100 rounded-xl p-4 border-r-4 border-red-600 text-xs sm:text-sm text-slate-800 leading-relaxed space-y-2">
                            <p className="font-bold text-red-900">
                                أمر استدعاء ولي أمر الطالب المحترم:
                            </p>
                            <p className="text-slate-700">
                                نسترعي انتباهكم الكريم إلى أن الطالب المذكور أعلاه قد تكررت منه المخالفات السلوكية المبيّنة في هذا الكشف حتى استنفد رصيد نقاط الانضباط المحددة له في النظام المدرسي.
                                يرجى مراجعة إدارة المدرسة (معاونية شؤون الطلبة) فوراً للاطلاع على السجل وتوقيع التعهد الخطي اللازم لمتابعة التزام الطالب وعدم تكرار المخالفات.
                            </p>
                        </div>

                        {/* Signatures Grid */}
                        <div className="grid grid-cols-4 gap-3 pt-6 border-t-2 border-slate-300 text-center text-xs">
                            <div className="space-y-6">
                                <p className="font-bold text-slate-800">توقيع ولي الأمر</p>
                                <div className="border-b border-dashed border-slate-400 pb-1 text-slate-400">..............................</div>
                                <div className="text-[10px] text-slate-500">الاسم: ....................</div>
                            </div>

                            <div className="space-y-6">
                                <p className="font-bold text-slate-800">مرشد الصف / التربوي</p>
                                <div className="border-b border-dashed border-slate-400 pb-1 text-slate-400">..............................</div>
                                <div className="text-[10px] text-slate-500">التوقيع والتاريخ</div>
                            </div>

                            <div className="space-y-6">
                                <p className="font-bold text-slate-800">معاون شؤون الطلبة</p>
                                <div className="border-b border-dashed border-slate-400 pb-1 text-slate-400">..............................</div>
                                <div className="text-[10px] text-slate-500">{currentUser.role === 'assistant' ? currentUser.name : 'معاون شؤون الطلبة'}</div>
                            </div>

                            <div className="space-y-6">
                                <p className="font-bold text-slate-800">مدير المدرسة والختم</p>
                                <div className="border-b border-dashed border-slate-400 pb-1 text-slate-400">..............................</div>
                                <div className="text-[10px] text-slate-500">{settings.principalName || 'مدير المدرسة'}</div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Print Styles */}
                <style>{`
                    @media print {
                        body * {
                            visibility: hidden;
                        }
                        #discipline-printable-area, #discipline-printable-area * {
                            visibility: visible;
                        }
                        #discipline-printable-area {
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 100%;
                            background: white !important;
                            padding: 0 !important;
                            margin: 0 !important;
                        }
                        .no-print {
                            display: none !important;
                        }
                    }
                `}</style>

                {/* Archive & Reset Modal Dialog */}
                {isArchiveModalOpen && (
                    <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 space-y-4">
                            <div className="flex items-center gap-3 text-amber-600 border-b pb-3">
                                <RotateCcw className="w-6 h-6" />
                                <h3 className="font-bold text-base text-slate-900">أرشفة التقييمات ومنح الطالب فرصة جديدة</h3>
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed">
                                سيتم نقل جميع المخالفات والخصومات الحالية للطالب <b>({student.name})</b> إلى سجل الأرشيف، وإعادة تعيين رصيد نقاطه إلى <b>({maxPoints} نقاط كاملة)</b>.
                                سيتم إشعار الطالب ومدرسي الشعبة بهذا الإجراء والسبب المسجل.
                            </p>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                    سبب الإجراء / توضيح منح الفرصة الجديدة (تعهد ولي الأمر، تحسن السلوك، إلخ):
                                </label>
                                <textarea
                                    value={archiveReason}
                                    onChange={e => setArchiveReason(e.target.value)}
                                    rows={3}
                                    placeholder="اكتب سبب الأرشفة ومنح الفرصة الجديدة..."
                                    className="w-full p-3 border rounded-xl text-xs sm:text-sm bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 font-medium"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsArchiveModalOpen(false)}
                                    disabled={isArchiving}
                                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors"
                                >
                                    إلغاء
                                </button>

                                <button
                                    type="button"
                                    onClick={handleConfirmArchive}
                                    disabled={isArchiving}
                                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    <Sparkles size={14} />
                                    <span>{isArchiving ? 'جاري التنفيذ...' : 'تأكيد الأرشفة ومنح النقاط'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
