
import React from 'react';
import type { SchoolSettings } from '../../types.ts';

interface CommitteeMember {
    id: string;
    name: string;
}

interface SpecializationCommitteesPDFPageProps {
    settings: SchoolSettings;
    committees: [string, CommitteeMember[]][];
    pageNumber: number;
    totalPages: number;
}

const CommitteeTablePDF: React.FC<{ subject: string, members: CommitteeMember[] }> = ({ subject, members }) => (
     <div className="mb-6 break-inside-avoid">
        <h3 className="text-xl font-bold bg-yellow-200 text-center p-2 border-2 border-black">لجنة {subject}</h3>
        <table className="w-full border-collapse border-2 border-black text-lg">
            <thead>
                <tr className="bg-gray-50">
                    <th className="border-2 border-black p-2 w-[50%]">الاسم الثلاثي</th>
                    <th className="border-2 border-black p-2 w-[25%]">المنصب</th>
                    <th className="border-2 border-black p-2 w-[25%]">التوقيع</th>
                </tr>
            </thead>
            <tbody>
                {members.map((member, index) => (
                    <tr key={member.id}>
                        <td className={`border-2 border-black p-2 font-semibold h-14 ${index === 0 ? 'bg-blue-100' : ''}`} style={{ position: 'relative' }}>
                            <div style={{ position: 'relative', bottom: '6px' }}>{member.name}</div>
                        </td>
                        <td className={`border-2 border-black p-2 text-center ${index === 0 ? 'bg-blue-100' : ''}`} style={{ position: 'relative' }}>
                             <div style={{ position: 'relative', bottom: '6px' }}>{index === 0 ? 'رئيساً' : 'عضو'}</div>
                        </td>
                        <td className="border-2 border-black p-2 bg-white"></td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);


export default function SpecializationCommitteesPDFPage({ settings, committees, pageNumber, totalPages }: SpecializationCommitteesPDFPageProps) {
    // نستخدم توزيع عمودين إذا كانت اللجان كثيرة في الصفحة، أو عمود واحد لضمان الوضوح
    const half = Math.ceil(committees.length / 2);
    const firstColumn = committees.slice(0, half);
    const secondColumn = committees.slice(half);

    return (
        <div className="w-[794px] h-[1123px] bg-white p-12 flex flex-col font-['Cairo']" dir="rtl">
            <header className="text-center mb-10">
                <h1 className="text-3xl font-bold">
                    لجان الفحص حسب الاختصاص للعام الدراسي {settings.academicYear}
                </h1>
                <h2 className="text-2xl font-semibold mt-2">{settings.schoolName}</h2>
                <div className="mt-2 text-sm text-gray-500 font-bold">صفحة {pageNumber} من {totalPages}</div>
            </header>

            <main className="flex-grow flex gap-8">
                <div className="w-1/2 space-y-4">
                    {firstColumn.map(([subject, members]) => (
                        <CommitteeTablePDF key={subject} subject={subject} members={members} />
                    ))}
                </div>
                <div className="w-1/2 space-y-4">
                    {secondColumn.map(([subject, members]) => (
                        <CommitteeTablePDF key={subject} subject={subject} members={members} />
                    ))}
                </div>
            </main>

            <footer className="mt-auto pt-10 flex justify-between items-end text-xl font-bold border-t-2 border-gray-100">
                <div className="text-sm text-gray-400">نظام تربوي تك للإدارة المدرسية</div>
                <div className="text-center">
                    <p>مدير المدرسة</p>
                    <p className="mt-12">{settings.principalName}</p>
                </div>
            </footer>
            {/* هامش أمان إضافي للطباعة في الأسفل */}
            <div className="h-8 w-full"></div>
        </div>
    );
}
