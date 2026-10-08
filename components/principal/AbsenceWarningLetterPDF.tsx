import React from 'react';
import type { SchoolSettings, ClassData, Student } from '../../types.ts';

interface AbsenceWarningLetterPDFProps {
    settings: SchoolSettings;
    classData: ClassData;
    student: Student;
    totalAbsences: number;
    absentDays?: number;
    runawayLessons?: number;
    runawayDays?: number;
    warningType?: string;
    currentDate?: string;
}

export default function AbsenceWarningLetterPDF({
    settings,
    classData,
    student,
    totalAbsences,
    currentDate
}: AbsenceWarningLetterPDFProps) {
    // Format date as DD/MM/YYYY
    const formattedDate = (() => {
        if (currentDate && currentDate.includes('-')) {
            const parts = currentDate.split('-');
            if (parts.length === 3) {
                return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
            }
        }
        const now = new Date();
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        return `${d}/${m}/${y}`;
    })();

    const directorateName = (() => {
        const raw = settings.governorateName || settings.directorate || 'كربلاء المقدسة';
        if (raw.includes('المديرية العامة')) return raw;
        if (raw.startsWith('تربية')) return `المديرية العامة لـ${raw}`;
        return `المديرية العامة لتربية ${raw}`;
    })();

    const schoolTitle = settings.schoolName 
        ? (settings.schoolName.startsWith('إدارة') ? settings.schoolName : `إدارة ${settings.schoolName}`)
        : 'إدارة متوسطة بطل خيبر';

    const principal = settings.principalName || 'حسنين علي هادي';
    const deductedMarks = totalAbsences * 2;

    const SingleCopy = ({ copyLabel }: { copyLabel: string }) => (
        <div className="flex flex-col justify-between h-[515px] p-6 text-gray-900 font-['Cairo']" dir="rtl" style={{ letterSpacing: 'normal' }}>
            {/* Header: Right, Center, Left */}
            <div>
                <div className="flex justify-between items-start">
                    {/* Top Right: State & Directorate */}
                    <div className="text-right text-xs leading-relaxed font-bold">
                        <p className="text-[11px] text-gray-600 font-normal mb-1">{copyLabel}</p>
                        <p className="text-sm font-extrabold text-gray-900">جمهورية العراق</p>
                        <p className="text-xs font-bold text-gray-900">وزارة التربية</p>
                        <p className="text-xs font-bold text-gray-900">{directorateName}</p>
                        <p className="text-xs font-bold text-gray-900">{schoolTitle}</p>
                    </div>

                    {/* Top Center: Circular Ministry Emblem */}
                    <div className="flex justify-center pt-1">
                        <img 
                            src="https://i.imgur.com/JNUggOC.png" 
                            alt="شعار وزارة التربية" 
                            className="w-16 h-16 object-contain"
                            crossOrigin="anonymous"
                        />
                    </div>

                    {/* Top Left: Number & Date */}
                    <div className="text-left text-xs font-bold space-y-1 pt-1" style={{ letterSpacing: 'normal' }}>
                        <p className="font-bold">العدد: ............</p>
                        <p>التاريخ: <span className="font-extrabold">{formattedDate}</span></p>
                    </div>
                </div>

                {/* Addressee & Subject Line */}
                <div className="text-center my-6 space-y-2">
                    <p className="text-base font-bold text-gray-900">
                        إلى ولي أمر الطالب / <span className="font-black">{student.name}</span>
                    </p>
                    <h3 className="text-base font-black text-gray-900" style={{ letterSpacing: 'normal' }}>
                        الموضوع : غيابات طالب
                    </h3>
                </div>

                {/* Body Text Matching User Attachment */}
                <div className="text-[13px] text-justify leading-loose font-normal text-gray-900 mt-2 px-1" style={{ letterSpacing: 'normal' }}>
                    <p>
                        لقد بلغ مجموع الايام التي تغيبها ولدكم ( <span className="font-bold">{student.name}</span> ) في الصف ( <span className="font-bold">{classData.stage} - {classData.section}</span> ) عن المدرسة لغاية <span className="font-bold">{formattedDate}</span> ، ( <span className="font-black">{totalAbsences}</span> ) يوم ، فخصمت منه ( <span className="font-black">{deductedMarks}</span> ) درجة من الدوام ، فإذا بلغت الدرجات المخصومة منه <span className="font-bold">51 %</span> من درجات الدوام فسيعتبر راسباً في صفه لهذا العام عملاً بمنطوق <span className="font-bold">المادة 14 المعدلة من نظام المدارس الثانوية رقم 2 لسنة 1977</span> .
                    </p>
                </div>
            </div>

            {/* Footer matching User Attachment: Signatures on Right, Principal on Left */}
            <div className="flex justify-between items-end mt-4 px-2 pb-2">
                {/* Signatures on Right */}
                <div className="text-right text-xs space-y-1.5 font-bold text-gray-800">
                    <p>توقيع ولي الأمر: ..............................</p>
                    <p>رقم هاتف ولي الأمر: ..............................</p>
                    <p>اسم ولي الأمر: ..............................</p>
                    <p>معاون شؤون الطلبة: ..............................</p>
                    <p>المرشد التربوي: ..............................</p>
                    <p>مراقب الصف: ..............................</p>
                </div>

                {/* Principal on Left */}
                <div className="text-center w-56 pb-2">
                    <p className="text-sm font-bold text-gray-900">مدير المدرسة</p>
                    <p className="text-sm font-black mt-2 text-gray-900">{principal}</p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="w-[794px] h-[1123px] bg-white p-6 flex flex-col justify-between font-['Cairo'] box-border text-gray-900 select-none" dir="rtl" style={{ letterSpacing: 'normal' }}>
            {/* Top Copy: Guardian Copy */}
            <div className="h-[520px]">
                <SingleCopy copyLabel="نسخة ولي الأمر (تُسلم لولي الأمر)" />
            </div>

            {/* Center Dashed Cut Line */}
            <div className="relative my-2 text-center">
                <div className="border-t border-dashed border-gray-400 w-full absolute top-1/2"></div>
                <span className="relative bg-white px-3 text-[11px] font-bold text-gray-500 border border-gray-300 rounded-full shadow-xs">
                    ✂️ يُقطع من هنا وتُسَلَّم نسخة لولي الأمر وتُحفظ النسخة الأخرى في إدارة المدرسة
                </span>
            </div>

            {/* Bottom Copy: School Administration Copy */}
            <div className="h-[520px]">
                <SingleCopy copyLabel="نسخة إدارة المدرسة (تُحفظ في السجلات المدرسية)" />
            </div>
        </div>
    );
}
