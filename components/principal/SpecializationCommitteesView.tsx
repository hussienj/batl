
import React, { useState, useMemo, useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import useLocalStorage from '../../hooks/useLocalStorage.ts';
import type { SchoolSettings, User, ClassData } from '../../types.ts';
import { FileText, Loader2, ArrowUpCircle } from 'lucide-react';
import SpecializationCommitteesPDFPage from './SpecializationCommitteesPDFPage.tsx';

declare const jspdf: any;
declare const html2canvas: any;

interface SpecializationCommitteesViewProps {
    setCurrentPageKey: (key: any) => void;
    settings: SchoolSettings;
    users: User[];
    classes: ClassData[];
}

interface CommitteeMember {
    id: string; // teacher user id
    name: string;
}

type CommitteesBySubject = Record<string, CommitteeMember[]>;

const PageWrapper = ({ title, children, onPrev, onNext }: { title: string, children?: React.ReactNode, onPrev: () => void, onNext: () => void }) => (
    <div className="bg-white p-8 rounded-xl shadow-lg">
        <div className="flex justify-between items-center mb-6">
            <button onClick={onPrev} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">&larr; الصفحة السابقة</button>
            <h2 className="text-3xl font-bold text-gray-800">{title}</h2>
            <button onClick={onNext} className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700">الصفحة التالية &rarr;</button>
        </div>
        {children}
    </div>
);

export default function SpecializationCommitteesView({ setCurrentPageKey, settings, users, classes }: SpecializationCommitteesViewProps) {
    const [committees, setCommittees] = useLocalStorage<CommitteesBySubject>('examLog_specCommittees_v2', {});
    const [isExporting, setIsExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    const teachers = useMemo(() => users.filter(u => u.role === 'teacher'), [users]);

    useEffect(() => {
        if (Object.keys(committees).length === 0 && teachers.length > 0 && classes.length > 0) {
            const teachersBySubject: Record<string, CommitteeMember[]> = {};

            for (const teacher of teachers) {
                if (!teacher.assignments) continue;
                for (const assignment of teacher.assignments) {
                    const classInfo = classes.find(c => c.id === assignment.classId);
                    if (!classInfo) continue;
                    const subjectInfo = classInfo.subjects.find(s => s.id === assignment.subjectId);
                    if (!subjectInfo) continue;

                    if (!teachersBySubject[subjectInfo.name]) {
                        teachersBySubject[subjectInfo.name] = [];
                    }
                    
                    if (!teachersBySubject[subjectInfo.name].some(m => m.id === teacher.id)) {
                        teachersBySubject[subjectInfo.name].push({ id: teacher.id, name: teacher.name });
                    }
                }
            }
            setCommittees(teachersBySubject);
        }
    }, [teachers, classes, committees, setCommittees]);

    const handlePromoteToHead = (subject: string, memberId: string) => {
        setCommittees(prev => {
            const currentMembers = prev[subject] || [];
            const memberToPromote = currentMembers.find(m => m.id === memberId);
            if (!memberToPromote) return prev;

            const otherMembers = currentMembers.filter(m => m.id !== memberId);
            const newOrder = [memberToPromote, ...otherMembers];
            
            return {
                ...prev,
                [subject]: newOrder
            };
        });
    };

    const handleExport = async () => {
        const committeeEntries = Object.entries(committees)
            .filter(([, members]) => members.length > 0)
            .sort(([subjectA], [subjectB]) => subjectA.localeCompare(subjectB, 'ar'));

        if (committeeEntries.length === 0) {
            alert("لا توجد لجان لعرضها.");
            return;
        }

        setIsExporting(true);
        setExportProgress(0);

        const tempContainer = document.createElement('div');
        Object.assign(tempContainer.style, { position: 'absolute', left: '-9999px', top: '0' });
        document.body.appendChild(tempContainer);
        const root = ReactDOM.createRoot(tempContainer);

        const renderComponent = (component: React.ReactElement) => new Promise<void>(resolve => {
            root.render(component);
            setTimeout(resolve, 800);
        });

        try {
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
            
            // نقسم اللجان إلى دفعات (مثلاً 4 لجان في كل صفحة لضمان وجود مساحة كافية وهامش)
            const COMMITTEES_PER_PAGE = 4;
            const chunks = [];
            for (let i = 0; i < committeeEntries.length; i += COMMITTEES_PER_PAGE) {
                chunks.push(committeeEntries.slice(i, i + COMMITTEES_PER_PAGE));
            }

            await document.fonts.ready;

            for (let i = 0; i < chunks.length; i++) {
                await renderComponent(
                    <SpecializationCommitteesPDFPage 
                        settings={settings}
                        committees={chunks[i]}
                        pageNumber={i + 1}
                        totalPages={chunks.length}
                    />
                );
                
                const page = tempContainer.children[0] as HTMLElement;
                if(!page) throw new Error("PDF export element not found");

                const canvas = await html2canvas(page, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
                const imgData = canvas.toDataURL('image/png');
                
                if (i > 0) pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
                setExportProgress(Math.round(((i + 1) / chunks.length) * 100));
            }

            pdf.save('لجان_الفحص_حسب_الاختصاص.pdf');

        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء التصدير.");
        } finally {
            root.unmount();
            document.body.removeChild(tempContainer);
            setIsExporting(false);
            setExportProgress(0);
        }
    };
    
    const committeeEntries = Object.entries(committees).filter(([, members]) => members.length > 0);

    return (
        <PageWrapper 
            title="لجان الفحص حسب الاختصاص" 
            onPrev={() => setCurrentPageKey('auditing_committee')}
            onNext={() => setCurrentPageKey('oral_exam_schedule')}
        >
            {isExporting && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex flex-col items-center justify-center text-white">
                    <Loader2 className="w-16 h-16 animate-spin mb-4" />
                    <p className="text-xl font-bold">جاري تحضير ملف PDF... {exportProgress}%</p>
                </div>
            )}

            <div className="bg-gray-50 p-6 rounded-lg border shadow-sm space-y-6">
                <div className="text-center pt-4">
                    <button onClick={handleExport} disabled={isExporting} className="px-8 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 disabled:bg-gray-400 flex items-center justify-center gap-2 mx-auto">
                        <FileText size={20}/>
                        <span>تصدير لجان الفحص (PDF)</span>
                    </button>
                    <p className="text-xs text-gray-500 mt-2">سيتم توزيع اللجان تلقائياً على عدة صفحات لضمان جودة الطباعة.</p>
                </div>
                
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {committeeEntries.map(([subject, members]) => (
                        <div key={subject}>
                            <h3 className="text-xl font-bold bg-green-200 text-green-800 text-center p-2 rounded-t-lg border-b-2 border-green-400">لجنة {subject}</h3>
                            <table className="w-full border-collapse bg-white shadow-md">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="p-2 border text-right">الاسم الثلاثي</th>
                                        <th className="p-2 border text-center w-32">المنصب</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {members.map((member, index) => (
                                        <tr key={member.id} className="hover:bg-gray-50">
                                            <td className="p-2 border font-semibold">{member.name}</td>
                                            <td className="p-2 border text-center flex items-center justify-center gap-2">
                                                <span>{index === 0 ? 'رئيساً' : 'عضو'}</span>
                                                {index > 0 && (
                                                     <button 
                                                        onClick={() => handlePromoteToHead(subject, member.id)}
                                                        className="text-blue-500 hover:text-blue-700"
                                                        title="ترقية إلى رئيس اللجنة"
                                                     >
                                                        <ArrowUpCircle size={20} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}
                </div>
            </div>
        </PageWrapper>
    );
}
