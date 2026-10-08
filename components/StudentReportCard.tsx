
import React from 'react';
import type { ClassData, SchoolSettings, Student, StudentResult, CalculatedGrade, SubjectGrade } from '../types.ts';
import { numberToArabicWords } from '../lib/numberToWords.ts';

interface StudentReportCardProps {
    student: Student;
    classData: ClassData;
    settings: SchoolSettings;
    studentResultData: {
        finalCalculatedGrades: Record<string, CalculatedGrade>;
        result: StudentResult;
    };
    logos: {
        school: string | null;
        ministry: string | null;
        stamp: string | null;
    };
    resultType?: string;
    resultBoxColor?: string;
    successBoxColor?: string;
    studentPhotoUrl?: string | null;
}

const DEFAULT_SUBJECT_GRADE: SubjectGrade = {
    firstTerm: null,
    midYear: null,
    secondTerm: null,
    finalExam1st: null,
    finalExam2nd: null,
};

const DEFAULT_CALCULATED_GRADE: CalculatedGrade = {
    annualPursuit: null,
    finalGrade1st: null,
    finalGradeWithDecision: null,
    decisionApplied: 0,
    finalGrade2nd: null,
    isExempt: false,
};

const PRAISE_PHRASES = [
    "أحسنت يا بطل! استمر في التفوق.",
    "تميزك فخر لنا، مبارك النجاح الباهر.",
    "إلى الأمام دائماً، نتمنى لك مستقبلاً مشرقاً.",
    "جهودك أثمرت، مبارك عليك هذا الإنجاز.",
    "مستوى رائع يعكس مهاراتك العالية، أحسنت.",
    "نفتخر بك وبنتيجتك المتميزة، استمر في العطاء."
];

const MOTIVATIONAL_PHRASES = [
    "الفشل الحقيقي هو التوقف عن المحاولة، وأنا أعرف أنك لن تتوقف.",
    "كل ناجح لديه قصة تعثر في بداياته؛ اجعل هذه قصتك للمستقبل.",
    "استجمع قواك، فالفرصة القادمة بانتظارك لتثبت لنفسك أنك تستطيع.",
    "سقوطك اليوم هو مجرد دفعة لتقفز بشكل أعلى في المرة القادمة.",
    "لنتعلم مما حدث اليوم، ونركز على ما سنفعله غداً.",
    "المهم ليس السقوط، بل سرعة النهوض.",
    "خسرت جولة، لكنك لم تخسر مستقبلك؛ ابدأ من جديد."
];

const GradeCell: React.FC<{ value: number | null | undefined; isFailing?: boolean }> = ({ value, isFailing = false }) => {
    const grade = value ?? ' ';
    const colorClass = (value === null || value === undefined) ? 'text-gray-400' : (value < 50 ? 'text-red-600' : 'text-black');
    return (
        <td className={`border border-black text-center font-bold text-xl h-10 ${colorClass}`}>
            <div style={{ position: 'relative', top: '-1px' }}>{grade}</div>
        </td>
    );
}

export default function StudentReportCard({ 
    student, 
    classData, 
    settings, 
    studentResultData, 
    logos, 
    resultType = 'الدرجة النهائية',
    resultBoxColor = '#f5f3ff',
    successBoxColor = '#f0fdf4',
    studentPhotoUrl = null
}: StudentReportCardProps) {
    const { finalCalculatedGrades, result } = studentResultData;
    const reportCardHeaders = ['المواد', 'الفصل الاول', 'نصف السنة', 'الفصل الثاني', 'السعي السنوي', 'الامتحان النهائي', 'الدرجة النهائية', 'درجة الاكمال', 'الدرجة بعد الاكمال'];
    
    const isSuccess = ['ناجح', 'مؤهل', 'مؤهل بقرار'].includes(result.status);
    const isFail = ['راسب', 'غير مؤهل'].includes(result.status);
    const isSupplementary = result.status === 'مكمل';
    const isPending = result.status === 'قيد الانتظار';

    const bgColor = isSuccess ? successBoxColor : resultBoxColor;
    const textColor = isFail ? '#991b1b' : (isSuccess ? '#166534' : '#1e3a8a');

    const subjects = classData.subjects || [];
    
    const seed = student.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const praisePhrase = PRAISE_PHRASES[seed % PRAISE_PHRASES.length];
    const motivationalPhrase = MOTIVATIONAL_PHRASES[seed % MOTIVATIONAL_PHRASES.length];

    const generateResultContent = () => {
        if (isPending) return <span className="text-xl font-bold italic opacity-60">{result.message}</span>;

        if (isSuccess) {
            return (
                <div className="flex flex-col items-center gap-1">
                    <span className="text-3xl font-black">{result.message}</span>
                    <span className="text-xl italic opacity-80">{praisePhrase}</span>
                </div>
            );
        }

        if (isFail || isSupplementary) {
            return (
                <div className="flex flex-col items-center gap-2">
                    <span className="text-3xl font-black">{result.message}</span>
                    <p className="text-lg font-bold px-4 text-center leading-relaxed">
                        "{motivationalPhrase}"
                    </p>
                </div>
            );
        }

        return <span className="text-2xl font-bold">{result.message}</span>;
    };

    const renderLogo = (logo: string | null, defaultText: string) => {
        const finalLogo = logo || (defaultText?.includes('مدرسة') ? "https://i.imgur.com/jDSB6Ry.png" : null);
        return (
            <div className="h-24 w-24 flex items-center justify-center rounded-full bg-white p-1 shadow-sm overflow-hidden">
                {finalLogo ? <img src={finalLogo} alt={defaultText} className="h-full w-full object-contain" /> : <span className="text-[10pt] font-bold text-gray-300">{defaultText}</span>}
            </div>
        );
    };

    return (
        <div 
            className="w-[794px] h-[1123px] p-4 flex flex-col font-['Cairo'] box-border transition-colors duration-300 overflow-hidden" 
            style={{ direction: 'rtl', backgroundColor: bgColor }}
        >
            {/* Header Area: Slightly larger font sizes */}
            <div className="bg-white/70 p-5 border-2 border-black rounded-2xl shadow-sm mb-4">
                <header className="flex justify-between items-center text-center mb-5">
                    {renderLogo(logos.ministry, 'وزارة التربية')}
                    <div className="flex-grow px-4">
                        <h1 className="text-3xl font-black text-gray-900 leading-tight">{settings.schoolName}</h1>
                        <h2 className="text-xl font-bold text-gray-600 mt-1">نتيجة الطالب للعام الدراسي {settings.academicYear}</h2>
                    </div>
                    {renderLogo(logos.school, 'شعار المدرسة')}
                </header>

                <div className="flex gap-3 items-stretch">
                    {/* Student Photo */}
                    <div className="w-28 h-28 flex-shrink-0 bg-white border-2 border-black rounded-lg overflow-hidden flex flex-col items-center justify-center p-0.5 shadow-sm">
                        {studentPhotoUrl ? (
                            <img src={studentPhotoUrl} alt="صورة الطالب" className="w-full h-full object-cover rounded" />
                        ) : (
                            <div className="text-center text-gray-400 p-1 flex flex-col items-center justify-center h-full">
                                <span className="text-[10px] font-bold text-gray-500">صورة الطالب</span>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 grid grid-cols-2 gap-px bg-black border-2 border-black rounded-lg overflow-hidden text-base">
                        <div className="bg-white/95 p-3 font-bold flex justify-between">
                            <span className="text-gray-500">الاسم:</span>
                            <span className="text-gray-900 text-xl">{student.name}</span>
                        </div>
                        <div className="bg-white/95 p-3 font-bold flex justify-between">
                            <span className="text-gray-500">الصف:</span>
                            <span className="text-gray-900 text-xl">{classData.stage} ({classData.section})</span>
                        </div>
                        <div className="bg-white/95 p-3 font-bold flex justify-between">
                            <span className="text-gray-500">الرقم الامتحاني:</span>
                            <span className="text-gray-900 font-mono text-xl">{student.examId || '---'}</span>
                        </div>
                        <div className="bg-white/95 p-3 font-bold flex justify-between">
                            <span className="text-gray-500">سجل القيد:</span>
                            <span className="text-gray-900 text-xl">{student.registrationId || '---'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Table Area: Larger font for visibility */}
            <main className="flex-shrink-0 px-2">
                <table className="w-full border-collapse border-2 border-black bg-white shadow-md table-fixed">
                    <thead className="bg-gray-800 text-white text-sm">
                        <tr>
                            <th className="border-2 border-black p-2 w-[22%]"><div style={{ position: 'relative', top: '-1px' }}>المادة الدراسية</div></th>
                            {reportCardHeaders.slice(1).map(h => (
                                <th key={h} className="border-2 border-black p-1 text-[11px]"><div style={{ position: 'relative', top: '-1px' }}>{h}</div></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {subjects.map((subject, index) => {
                            const grades = student.grades?.[subject.name] || DEFAULT_SUBJECT_GRADE;
                            const calculated = finalCalculatedGrades[subject.name] || DEFAULT_CALCULATED_GRADE;
                            return (
                                <tr key={subject.id} className={`h-10 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                    <td className="border-2 border-black p-1 text-right font-black bg-gray-100 overflow-hidden whitespace-nowrap text-sm">
                                        <div style={{ position: 'relative', top: '-1px' }}>{subject.name}</div>
                                    </td>
                                    <GradeCell value={grades.firstTerm} />
                                    <GradeCell value={grades.midYear} />
                                    <GradeCell value={grades.secondTerm} />
                                    <GradeCell value={calculated.annualPursuit} />
                                    
                                    {calculated.isExempt ? (
                                        <td className="border border-black text-center font-bold text-sm text-blue-700 bg-blue-50 align-middle">معفو</td>
                                    ) : (
                                        <GradeCell value={grades.finalExam1st} />
                                    )}
                                    
                                    {(() => {
                                        const originalGrade = calculated.finalGrade1st;
                                        const decisionGrade = calculated.finalGradeWithDecision;
                                        const decisionApplied = calculated.decisionApplied;
                                        if (decisionApplied > 0 && decisionGrade === 50 && originalGrade !== null && originalGrade < 50) {
                                            return (
                                                <td className="border border-black text-center p-0 align-middle bg-yellow-50">
                                                    <div className="flex flex-col items-center justify-center leading-tight py-1">
                                                        <span className="text-[10px] font-semibold text-gray-700">50</span>
                                                        <span className="text-xl font-[900] text-red-600 border-t border-red-200 mt-[-1px]">{originalGrade}</span>
                                                    </div>
                                                </td>
                                            );
                                        }
                                        return <GradeCell value={decisionGrade} />;
                                    })()}

                                    <GradeCell value={grades.finalExam2nd} />
                                    <GradeCell value={calculated.finalGrade2nd} />
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Result Section */}
                <div 
                    className="w-full mt-5 py-6 px-10 border-2 border-black rounded-3xl shadow-xl border-dashed"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.85)', color: textColor }}
                >
                    <div className="flex flex-col items-center text-center">
                        {generateResultContent()}
                    </div>
                </div>
            </main>

            <div className="flex-grow"></div>

            {/* Footer: Principal Name Removed, Stamp Doubled in Size, No Rotation */}
            <footer className="mt-auto mb-2 flex-shrink-0">
                <div className="flex justify-between items-center px-10">
                    <div className="text-center w-1/2">
                        <p className="text-xl font-bold mb-10">الختم والتوقيع</p>
                        <div className="w-64 h-px bg-black/30 mx-auto"></div>
                    </div>
                    
                    <div className="w-1/2 flex justify-center items-center px-4 min-h-[220px]">
                        {logos.stamp ? (
                            <img 
                                src={logos.stamp} 
                                alt="ختم المدرسة" 
                                className="max-w-[260px] max-h-[220px] object-contain opacity-95 drop-shadow-2xl" 
                            />
                        ) : (
                            <div className="w-48 h-48 border-4 border-dashed border-gray-400 rounded-full flex items-center justify-center text-gray-300 font-bold italic opacity-40 text-sm">ختم المدرسة</div>
                        )}
                    </div>
                </div>
                
                <div className="text-center text-[8pt] text-gray-400 border-t border-gray-200 mt-10 pt-2 italic">
                    تم التوليد بواسطة نظام تربوي تك للإدارة المدرسية الذكية
                </div>
            </footer>
            
            {/* SAFE AREA: 1cm is approx 38px */}
            <div className="h-[38px] w-full flex-shrink-0"></div>
        </div>
    );
}
