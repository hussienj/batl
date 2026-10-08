
import React, { useState, useMemo, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import type { ClassData, Student, SchoolSettings } from '../../types.ts';
import { Key, Copy, Check, FileDown, Loader2, Search, Printer, Users } from 'lucide-react';
import StudentCodesPDF from '../principal/StudentCodesPDF.tsx';

declare const jspdf: any;
declare const html2canvas: any;

interface CounselorStudentCodesProps {
    classes: ClassData[];
    settings: SchoolSettings;
}

export default function CounselorStudentCodes({ classes, settings }: CounselorStudentCodesProps) {
    const [selectedStage, setSelectedStage] = useState('');
    const [selectedClassId, setSelectedClassId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);

    // Filter stages available in the school
    const stages = useMemo(() => Array.from(new Set(classes.map(c => c.stage))), [classes]);

    const classesInStage = useMemo(() => 
        selectedStage ? classes.filter(c => c.stage === selectedStage) : [],
    [selectedStage, classes]);

    const selectedClass = useMemo(() => 
        classes.find(c => c.id === selectedClassId),
    [selectedClassId, classes]);

    const filteredStudents = useMemo(() => {
        if (!selectedClass) return [];
        return (selectedClass.students || [])
            .filter(s => (s.name && s.name.includes(searchQuery)) || (s.examId && String(s.examId).includes(searchQuery)))
            .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }, [selectedClass, searchQuery]);

    const handleCopy = (code: string, id: string) => {
        navigator.clipboard.writeText(code).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        });
    };

    const handleExportPDF = async () => {
        if (!selectedClass) return;
        const studentsToExport = (selectedClass.students || []).filter(s => s.studentAccessCode);
        if (studentsToExport.length === 0) {
            alert("لا يوجد طلاب لديهم رموز لتصديرها في هذه الشعبة.");
            return;
        }

        setIsExporting(true);
        const tempContainer = document.createElement('div');
        Object.assign(tempContainer.style, { position: 'absolute', left: '-9999px', top: '0' });
        document.body.appendChild(tempContainer);
        const root = ReactDOM.createRoot(tempContainer);

        try {
            await new Promise<void>(resolve => {
                root.render(
                    <StudentCodesPDF 
                        students={studentsToExport}
                        schoolName={settings.schoolName}
                        className={`${selectedClass.stage} - ${selectedClass.section}`}
                    />
                );
                setTimeout(resolve, 800); 
            });

            const { jsPDF } = jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pageElements = tempContainer.querySelectorAll('.pdf-page');

            for (let i = 0; i < pageElements.length; i++) {
                const pageElement = pageElements[i] as HTMLElement;
                const canvas = await html2canvas(pageElement, { scale: 2, useCORS: true });
                if (i > 0) pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
            }
            
            pdf.save(`رموز_طلاب_${selectedClass.stage}_${selectedClass.section}.pdf`);
        } catch (error) {
            console.error(error);
            alert('فشل تصدير ملف PDF.');
        } finally {
            root.unmount();
            document.body.removeChild(tempContainer);
            setIsExporting(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-cyan-500 font-['Cairo']">
            <div className="flex items-center gap-3 mb-6">
                <div className="bg-cyan-100 p-2 rounded-lg text-cyan-600">
                    <Key size={32} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">رموز اشتراك الطلاب</h2>
                    <p className="text-sm text-gray-500">استعرض وانسخ رموز الدخول الخاصة بطلاب المدرسة</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="space-y-1">
                    <label className="text-sm font-bold text-gray-600">1. المرحلة الدراسية</label>
                    <select 
                        value={selectedStage} 
                        onChange={e => { setSelectedStage(e.target.value); setSelectedClassId(''); }}
                        className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-cyan-500 outline-none"
                    >
                        <option value="">-- اختر المرحلة --</option>
                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-bold text-gray-600">2. الشعبة</label>
                    <select 
                        value={selectedClassId} 
                        onChange={e => setSelectedClassId(e.target.value)}
                        disabled={!selectedStage}
                        className="w-full p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-cyan-500 outline-none disabled:opacity-50"
                    >
                        <option value="">-- اختر الشعبة --</option>
                        {classesInStage.map(c => <option key={c.id} value={c.id}>{c.section}</option>)}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-bold text-gray-600">3. بحث سريع</label>
                    <div className="relative">
                        <Search className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text" 
                            placeholder="ابحث بالاسم أو الرقم..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pr-8 p-2 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-cyan-500 outline-none"
                        />
                    </div>
                </div>
            </div>

            {selectedClass ? (
                <div className="space-y-4">
                    <div className="flex justify-between items-center bg-cyan-50 p-4 rounded-xl border border-cyan-100">
                        <div className="flex items-center gap-2 text-cyan-800 font-bold">
                            <Users size={20} />
                            <span>عدد الطلاب: {filteredStudents.length}</span>
                        </div>
                        <button 
                            onClick={handleExportPDF} 
                            disabled={isExporting}
                            className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition shadow-md disabled:bg-gray-400"
                        >
                            {isExporting ? <Loader2 className="animate-spin" size={18}/> : <Printer size={18} />}
                            تصدير القائمة (PDF)
                        </button>
                    </div>

                    <div className="overflow-x-auto border rounded-xl">
                        <table className="w-full text-right border-collapse">
                            <thead className="bg-gray-800 text-white">
                                <tr>
                                    <th className="p-3 w-12 text-center">ت</th>
                                    <th className="p-3">اسم الطالب</th>
                                    <th className="p-3 text-center">الرقم الامتحاني</th>
                                    <th className="p-3 text-center">رمز الاشتراك</th>
                                    <th className="p-3 text-center w-24">إجراء</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredStudents.map((student, idx) => (
                                    <tr key={student.id} className="hover:bg-cyan-50 transition-colors">
                                        <td className="p-3 text-center text-gray-400 font-bold">{idx + 1}</td>
                                        <td className="p-3 font-bold text-gray-800">{student.name}</td>
                                        <td className="p-3 text-center font-mono font-bold text-cyan-700">{student.examId || '---'}</td>
                                        <td className="p-3 text-center">
                                            {student.studentAccessCode ? (
                                                <code className="bg-gray-100 px-3 py-1 rounded-md font-mono font-black text-blue-700 border">
                                                    {student.studentAccessCode}
                                                </code>
                                            ) : (
                                                <span className="text-gray-400 text-xs italic">غير مفعل</span>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            {student.studentAccessCode && (
                                                <button 
                                                    onClick={() => handleCopy(student.studentAccessCode!, student.id)}
                                                    className={`p-2 rounded-full transition-all ${copiedId === student.id ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500 hover:bg-cyan-100 hover:text-cyan-600'}`}
                                                    title="نسخ الرمز"
                                                >
                                                    {copiedId === student.id ? <Check size={18} /> : <Copy size={18} />}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {filteredStudents.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-10 text-center text-gray-400 italic">لا توجد بيانات لعرضها</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="text-center p-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                    <Search className="mx-auto w-16 h-16 text-gray-300 mb-4" />
                    <h3 className="text-xl font-bold text-gray-500">يرجى اختيار المرحلة والشعبة لعرض الرموز</h3>
                </div>
            )}
        </div>
    );
}
