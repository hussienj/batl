import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, FileDown, FileUp, Trash2, Edit2, ChevronRight, ChevronLeft, Loader2, Save, X } from 'lucide-react';
import { db } from '../../lib/firebase.ts';
import type { GeneralRegistrationEntry, User, SchoolSettings } from '../../types.ts';
import { v4 as uuidv4 } from 'uuid';

declare const XLSX: any;
declare const jspdf: any;
declare const html2canvas: any;

export default function GeneralRegistrationManager({ currentUser, settings }: { currentUser: User, settings: SchoolSettings }) {
    const [entries, setEntries] = useState<GeneralRegistrationEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingEntry, setEditingEntry] = useState<Partial<GeneralRegistrationEntry> | null>(null);

    const principalId = currentUser.role === 'principal' ? currentUser.id : currentUser.principalId;

    useEffect(() => {
        if (!principalId) return;
        setLoading(true);
        const ref = db.ref(`general_registration/${principalId}`);
        const callback = (snapshot: any) => {
            const data = snapshot.val();
            const list: GeneralRegistrationEntry[] = data ? Object.values(data) : [];
            // Sort by studentName initially, or by updatedAt? User requested search across all names.
            setEntries(list.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ar')));
            setLoading(false);
        };
        ref.on('value', callback);
        return () => ref.off('value', callback);
    }, [principalId]);

    const filteredEntries = useMemo(() => {
        if (!searchTerm) return entries;
        const lowerTerm = searchTerm.toLowerCase();
        return entries.filter(e => 
            e.studentName.toLowerCase().includes(lowerTerm) || 
            e.registrationNumber.toString().includes(lowerTerm)
        );
    }, [entries, searchTerm]);

    const itemsPerPage = 44; // Matches the user's design for 2 columns of 22
    const totalPages = Math.ceil(filteredEntries.length / itemsPerPage) || 1;
    const currentItems = filteredEntries.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetArr = workbook.SheetNames[0];
                const firstSheet = workbook.Sheets[firstSheetArr];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];

                if (jsonData.length < 2) {
                    alert("الملف فارغ أو غير صحيح");
                    return;
                }

                const headers = jsonData[0].map(h => h?.toString().trim());
                let nameIdx = -1, regIdx = -1, pageIdx = -1;

                headers.forEach((h, idx) => {
                    if (h?.includes('اسم') || h?.includes('Name')) nameIdx = idx;
                    if (h?.includes('قيد') || h?.includes('Registration') || h?.includes('رقم')) regIdx = idx;
                    if (h?.includes('الصفحة') || h?.includes('Page')) pageIdx = idx;
                });

                // Fallback for names if the header is not exact
                if (nameIdx === -1) nameIdx = 1; 
                if (regIdx === -1) regIdx = 2;
                if (pageIdx === -1) pageIdx = 3;

                const newEntries: Record<string, GeneralRegistrationEntry> = {};
                let count = 0;
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (!row[nameIdx]) continue;

                    const id = uuidv4();
                    newEntries[id] = {
                        id,
                        studentName: row[nameIdx]?.toString() || '',
                        registrationNumber: row[regIdx]?.toString() || '',
                        registrationPage: row[pageIdx]?.toString() || '',
                        principalId: principalId!,
                        updatedAt: Date.now() + i
                    };
                    count++;
                }

                if (count > 0) {
                    await db.ref(`general_registration/${principalId}`).update(newEntries);
                    alert(`تم استيراد ${count} سجل بنجاح`);
                } else {
                    alert("لم يتم العثور على بيانات صالحة للاستيراد");
                }
            } catch (error) {
                console.error(error);
                alert("حدث خطأ أثناء الاستيراد");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const handleSaveEntry = async () => {
        if (!editingEntry?.studentName) {
            alert("يرجى إدخال اسم الطالب");
            return;
        }
        const id = editingEntry.id || uuidv4();
        const entry: GeneralRegistrationEntry = {
            id,
            studentName: editingEntry.studentName,
            registrationNumber: editingEntry.registrationNumber || '',
            registrationPage: editingEntry.registrationPage || '',
            principalId: principalId!,
            updatedAt: Date.now()
        };
        try {
            await db.ref(`general_registration/${principalId}/${id}`).set(entry);
            setIsEditing(false);
            setEditingEntry(null);
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء الحفظ");
        }
    };

    const handleDeleteEntry = async (id: string) => {
        if (!confirm("هل أنت متأكد من حذف هذا السجل؟")) return;
        try {
            await db.ref(`general_registration/${principalId}/${id}`).remove();
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء الحذف");
        }
    };

    const handleExportPDF = async () => {
        setIsExporting(true);
        const element = document.getElementById('registration-table');
        if (!element) return;

        try {
            const canvas = await html2canvas(element, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`سجل_القيد_المدرسي_${settings.schoolName}.pdf`);
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء التصدير");
        } finally {
            setIsExporting(false);
        }
    };

    const firstColumn = currentItems.slice(0, 22);
    const secondColumn = currentItems.slice(22, 44);

    return (
        <div className="max-w-7xl mx-auto p-4 space-y-6 animate-in fade-in duration-500">
            <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b pb-6 gap-4">
                    <div className="text-right">
                        <h1 className="text-3xl font-black text-blue-900 mb-2">سجل دليل القيد العام</h1>
                        <p className="text-gray-600 font-bold">{settings.schoolName}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <button 
                            onClick={() => { setEditingEntry({}); setIsEditing(true); }}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold shadow-md"
                        >
                            <Plus size={20} />
                            إضافة سجل
                        </button>
                        <label className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition font-bold shadow-md cursor-pointer">
                            <FileUp size={20} />
                            استيراد Excel
                            <input type="file" className="hidden" accept=".xlsx, .xls" onChange={handleImportExcel} />
                        </label>
                        <button 
                            onClick={handleExportPDF}
                            disabled={isExporting}
                            className="flex items-center gap-2 px-6 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition font-bold shadow-md disabled:bg-gray-400"
                        >
                            <FileDown size={20} />
                            تصدير PDF
                        </button>
                    </div>
                </div>

                <div className="mb-6">
                    <div className="relative">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input 
                            type="text" 
                            placeholder="ابحث عن اسم الطالب أو رقم القيد..." 
                            className="w-full pr-10 pl-4 py-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition font-bold"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(0); }}
                        />
                    </div>
                </div>

                <div className="flex justify-between items-center mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                            disabled={currentPage === 0}
                            className="p-2 hover:bg-white rounded-lg disabled:opacity-30 border border-transparent hover:border-gray-200 transition"
                        >
                            <ChevronRight size={24} />
                        </button>
                        <span className="font-black text-blue-900 border-x px-4 min-w-[120px] text-center">
                            الصفحة {currentPage + 1} من {totalPages}
                        </span>
                        <button 
                            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={currentPage >= totalPages - 1}
                            className="p-2 hover:bg-white rounded-lg disabled:opacity-30 border border-transparent hover:border-gray-200 transition"
                        >
                            <ChevronLeft size={24} />
                        </button>
                    </div>
                    <div className="text-gray-500 font-bold hidden sm:block">
                        إجمالي السجلات: {filteredEntries.length}
                    </div>
                </div>

                <div id="registration-table" className="grid grid-cols-1 lg:grid-cols-2 gap-4 border-2 border-blue-900 rounded-xl overflow-hidden bg-white p-4">
                    {[firstColumn, secondColumn].map((column, colIdx) => (
                        <div key={colIdx} className="overflow-x-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-blue-100">
                                        <th className="border border-blue-900 p-2 text-center text-blue-900 w-12 font-black">ت</th>
                                        <th className="border border-blue-900 p-2 text-right text-blue-900 font-black">اسم الطالب</th>
                                        <th className="border border-blue-900 p-2 text-center text-blue-900 w-20 font-black">القيد</th>
                                        <th className="border border-blue-900 p-2 text-center text-blue-900 w-20 font-black">الصفحة</th>
                                        <th className="border border-blue-900 p-2 text-center text-blue-900 w-24 print:hidden font-black">إجراء</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {column.map((entry, idx) => (
                                        <tr key={entry.id} className="hover:bg-blue-50/50 transition h-10">
                                            <td className="border border-blue-900 p-2 text-center font-bold text-gray-700">{currentPage * itemsPerPage + (colIdx * 22) + idx + 1}</td>
                                            <td className="border border-blue-900 p-2 text-right font-bold text-blue-950">{entry.studentName}</td>
                                            <td className="border border-blue-900 p-2 text-center font-bold text-gray-700">{entry.registrationNumber}</td>
                                            <td className="border border-blue-900 p-2 text-center font-bold text-gray-700">{entry.registrationPage}</td>
                                            <td className="border border-blue-900 p-2 text-center print:hidden">
                                                <div className="flex justify-center gap-1">
                                                    <button onClick={() => { setEditingEntry(entry); setIsEditing(true); }} className="p-1 text-blue-600 hover:bg-blue-100 rounded transition" title="تعديل"><Edit2 size={16} /></button>
                                                    <button onClick={() => handleDeleteEntry(entry.id)} className="p-1 text-red-600 hover:bg-red-100 rounded transition" title="حذف"><Trash2 size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Fill empty rows to maintain layout consistency (22 rows per column) */}
                                    {Array.from({ length: Math.max(0, 22 - column.length) }).map((_, i) => (
                                        <tr key={`empty-${colIdx}-${i}`} className="h-10">
                                            <td className="border border-blue-900 p-2 bg-gray-50/30"></td>
                                            <td className="border border-blue-900 p-2 bg-gray-50/30"></td>
                                            <td className="border border-blue-900 p-2 bg-gray-50/30"></td>
                                            <td className="border border-blue-900 p-2 bg-gray-50/30"></td>
                                            <td className="border border-blue-900 p-2 print:hidden bg-gray-50/30"></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            </div>

            {isEditing && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 transform transition-all animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-gray-800">{editingEntry?.id ? 'تعديل سجل' : 'إضافة سجل جديد'}</h2>
                            <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
                        </div>
                        <div className="space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">اسم الطالب رباعي</label>
                                <input 
                                    className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold"
                                    value={editingEntry?.studentName || ''}
                                    onChange={(e) => setEditingEntry(prev => ({ ...prev!, studentName: e.target.value }))}
                                    placeholder="أدخل الاسم الكامل للطالب"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">رقم القيد</label>
                                    <input 
                                        className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold text-center"
                                        value={editingEntry?.registrationNumber || ''}
                                        onChange={(e) => setEditingEntry(prev => ({ ...prev!, registrationNumber: e.target.value }))}
                                        placeholder="0000"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">الصفحة</label>
                                    <input 
                                        className="w-full px-4 py-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none font-bold text-center"
                                        value={editingEntry?.registrationPage || ''}
                                        onChange={(e) => setEditingEntry(prev => ({ ...prev!, registrationPage: e.target.value }))}
                                        placeholder="0"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-8">
                            <button 
                                onClick={handleSaveEntry}
                                className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                            >
                                <Save size={20} />
                                حفظ السجل
                            </button>
                            <button 
                                onClick={() => setIsEditing(false)}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-black hover:bg-gray-200 transition"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {loading && (
                <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-[60] backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4">
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="font-black text-blue-900 text-xl">جاري تحميل السجلات من السحابة...</p>
                    </div>
                </div>
            )}
        </div>
    );
}
