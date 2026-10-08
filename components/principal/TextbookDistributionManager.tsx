import React, { useState, useMemo, useEffect, useRef } from 'react';
import * as ReactDOM from 'react-dom/client';
import type { User, ClassData, SchoolSettings, Student } from '../../types.ts';
import { 
    BookOpenCheck, FileDown, Printer, Plus, Trash2, Edit3, Check, X, 
    ArrowRight, ArrowLeft, RefreshCw, Search, Sliders, ChevronLeft, 
    ChevronRight, Save, ShieldCheck, Sparkles, Layers, FileSpreadsheet,
    FileText, CheckCircle2, AlertCircle, Info, Download, Loader2, BookCopy, RotateCcw
} from 'lucide-react';
import { db } from '../../lib/firebase.ts';
import { DEFAULT_SUBJECTS, compareSections, GRADE_LEVELS } from '../../constants.ts';
import { v4 as uuidv4 } from 'uuid';
import TextbookDistributionPDFPage, { ColumnDef, StudentRowData } from './TextbookDistributionPDFPage.tsx';

declare const jspdf: any;
declare const html2canvas: any;
declare const XLSX: any;

interface TextbookDistributionManagerProps {
    principal: User;
    settings: SchoolSettings;
    classes: ClassData[];
}

const isExcludedTextbookSubject = (titleOrName: string) => {
    if (!titleOrName) return false;
    const clean = titleOrName.trim();
    return (
        clean === 'الرياضة' ||
        clean === 'التربية الرياضية' ||
        clean === 'رياضة' ||
        clean === 'الفنية' ||
        clean === 'التربية الفنية' ||
        clean === 'فنية' ||
        clean === 'التربية الفنية والنشيد' ||
        clean === 'نشيد'
    );
};

const getInitialStageColumns = (stage: string, classesList: ClassData[]): ColumnDef[] => {
    let subjectCols: ColumnDef[] = [];
    // 1. Try to find from classes registered in the system
    const cls = classesList.find(c => c.stage === stage);
    if (cls && cls.subjects && cls.subjects.length > 0) {
        subjectCols = cls.subjects
            .filter(s => !isExcludedTextbookSubject(s.name))
            .map(s => ({
                id: `sub_${s.id || s.name}`,
                title: s.name,
            }));
    } else if (stage && DEFAULT_SUBJECTS[stage] && DEFAULT_SUBJECTS[stage].length > 0) {
        // 2. Try DEFAULT_SUBJECTS from constants
        subjectCols = DEFAULT_SUBJECTS[stage]
            .filter(s => !isExcludedTextbookSubject(s.name))
            .map(s => ({
                id: `sub_${s.id || s.name}`,
                title: s.name,
            }));
    } else {
        // 3. Fallback standard subjects (without Sports & Art)
        subjectCols = [
            { id: 'sub_islamic', title: 'التربية الاسلامية' },
            { id: 'sub_arabic', title: 'اللغة العربية' },
            { id: 'sub_english', title: 'اللغة الإنكليزية' },
            { id: 'sub_math', title: 'الرياضيات' },
            { id: 'sub_social', title: 'الاجتماعيات' },
            { id: 'sub_science', title: 'العلوم' },
            { id: 'sub_computer', title: 'الحاسوب' },
        ];
    }

    // Always append 'توقيع المستلم' column at the end
    return [
        ...subjectCols,
        { id: 'col_receiver_signature', title: 'توقيع المستلم', minWidth: '85px', isCustom: true }
    ];
};

const STUDENTS_PER_PAGE = 20;

export default function TextbookDistributionManager({ principal, settings, classes }: TextbookDistributionManagerProps) {
    const [selectedStage, setSelectedStage] = useState<string>('');
    const [selectedSection, setSelectedSection] = useState<string>('ALL'); // 'ALL' or specific section
    const [columns, setColumns] = useState<ColumnDef[]>([]);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [activePage, setActivePage] = useState<number>(1);
    const [sortMode, setSortMode] = useState<'alphabetical' | 'natural'>('alphabetical');
    const [fillEmptyRowsTo20, setFillEmptyRowsTo20] = useState<boolean>(true);

    // Metadata & Signatures
    const [academicYear, setAcademicYear] = useState<string>(settings?.academicYear || '2024 - 2025');
    const [counselorName, setCounselorName] = useState<string>('');
    const [customNote, setCustomNote] = useState<string>('');

    // Distribution state stored by studentId -> colId -> string / boolean
    const [distributionData, setDistributionData] = useState<Record<string, Record<string, string>>>({});
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

    // Modal & Action states
    const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState(false);
    const [newColTitle, setNewColTitle] = useState('');
    const [newColPosition, setNewColPosition] = useState<'end' | 'start' | 'before' | 'after'>('end');
    const [newColTargetId, setNewColTargetId] = useState('');

    const [editingColId, setEditingColId] = useState<string | null>(null);
    const [editingColTitle, setEditingColTitle] = useState<string>('');

    // Export progress
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);

    // Default stage selection
    useEffect(() => {
        if (classes.length > 0 && !selectedStage) {
            const stages = Array.from(new Set(classes.map(c => c.stage)));
            if (stages.length > 0) {
                setSelectedStage(stages[0]);
            }
        }
    }, [classes, selectedStage]);

    // Load distribution data from Firebase for this principal & stage
    useEffect(() => {
        if (!principal?.id || !selectedStage) return;

        // Set default subjects immediately for chosen stage
        const initialCols = getInitialStageColumns(selectedStage, classes);
        setColumns(initialCols);

        const stageKey = encodeURIComponent(selectedStage.replace(/\//g, '_'));
        const distRef = db.ref(`textbook_distribution/${principal.id}/${stageKey}`);
        
        const handleData = (snapshot: any) => {
            const val = snapshot.val();
            if (val) {
                if (val.records) setDistributionData(val.records);
                if (val.columns && Array.isArray(val.columns) && val.columns.length > 0) {
                    const filteredCols = val.columns.filter((c: ColumnDef) => !isExcludedTextbookSubject(c.title));
                    if (!filteredCols.some((c: ColumnDef) => c.title === 'توقيع المستلم' || c.id === 'col_receiver_signature')) {
                        filteredCols.push({ id: 'col_receiver_signature', title: 'توقيع المستلم', minWidth: '85px', isCustom: true });
                    }
                    setColumns(filteredCols);
                }
                if (val.counselorName) setCounselorName(val.counselorName);
                if (val.customNote) setCustomNote(val.customNote);
            }
        };

        distRef.on('value', handleData);
        return () => distRef.off('value', handleData);
    }, [principal?.id, selectedStage, classes]);

    // Available stages & classes
    const availableStages = useMemo(() => {
        return Array.from(new Set(classes.map(c => c.stage))).sort((a, b) => {
            const idxA = GRADE_LEVELS.indexOf(a);
            const idxB = GRADE_LEVELS.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            return a.localeCompare(b, 'ar-IQ');
        });
    }, [classes]);

    const stageClasses = useMemo(() => {
        if (!selectedStage) return [];
        return classes
            .filter(c => c.stage === selectedStage)
            .sort((a, b) => compareSections(a.section, b.section));
    }, [classes, selectedStage]);

    const availableSections = useMemo(() => {
        return stageClasses.map(c => c.section);
    }, [stageClasses]);

    // Filter & Collect Students
    const allFilteredStudents = useMemo(() => {
        if (!selectedStage) return [];

        let targetClasses = stageClasses;
        if (selectedSection !== 'ALL') {
            targetClasses = stageClasses.filter(c => c.section === selectedSection);
        }

        const rawList: { student: Student; section: string }[] = [];
        targetClasses.forEach(cls => {
            (cls.students || []).forEach(st => {
                if (st.enrollmentStatus !== 'transferred' && st.enrollmentStatus !== 'dismissed') {
                    rawList.push({ student: st, section: cls.section });
                }
            });
        });

        // Filter search
        let filtered = rawList;
        if (searchTerm.trim()) {
            const term = searchTerm.trim().toLowerCase();
            filtered = filtered.filter(item => 
                item.student.name.toLowerCase().includes(term) ||
                item.section.toLowerCase().includes(term)
            );
        }

        // Sort: Group strictly by Section first, then sort students within each Section
        filtered.sort((a, b) => {
            const secCompare = compareSections(a.section, b.section);
            if (secCompare !== 0) return secCompare;

            if (sortMode === 'alphabetical') {
                return a.student.name.localeCompare(b.student.name, 'ar-IQ');
            }
            return 0;
        });

        // Map to StudentRowData
        return filtered.map((item, idx): StudentRowData => {
            const stValues = distributionData[item.student.id] || {};
            return {
                seq: idx + 1,
                id: item.student.id,
                name: item.student.name,
                section: item.section,
                examId: item.student.examId,
                values: stValues,
            };
        });
    }, [selectedStage, stageClasses, selectedSection, searchTerm, sortMode, distributionData]);

    // Pagination calculations (Strictly 20 per page)
    const totalPages = useMemo(() => {
        const count = allFilteredStudents.length;
        if (count === 0) return 1;
        return Math.ceil(count / STUDENTS_PER_PAGE);
    }, [allFilteredStudents.length]);

    // Adjust active page if out of bounds
    useEffect(() => {
        if (activePage > totalPages) {
            setActivePage(totalPages);
        }
    }, [totalPages, activePage]);

    // Current page slice
    const currentPageStudents = useMemo(() => {
        const start = (activePage - 1) * STUDENTS_PER_PAGE;
        return allFilteredStudents.slice(start, start + STUDENTS_PER_PAGE);
    }, [allFilteredStudents, activePage]);

    // Break all students into 20-row page chunks for export/print
    const allPagesChunks = useMemo(() => {
        const pages: StudentRowData[][] = [];
        for (let i = 0; i < allFilteredStudents.length; i += STUDENTS_PER_PAGE) {
            pages.push(allFilteredStudents.slice(i, i + STUDENTS_PER_PAGE));
        }
        if (pages.length === 0) {
            pages.push([]);
        }
        return pages;
    }, [allFilteredStudents]);

    // Toggle or update student cell status
    const handleCellChange = (studentId: string, colId: string, value: string) => {
        setDistributionData(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || {}),
                [colId]: value,
            }
        }));
    };

    const handleToggleDelivered = (studentId: string, colId: string) => {
        const currentVal = distributionData[studentId]?.[colId] || '';
        const newVal = currentVal === 'delivered' ? '' : 'delivered';
        handleCellChange(studentId, colId, newVal);
    };

    // Bulk actions
    const handleSetAllColumnDelivered = (colId: string, value: 'delivered' | '') => {
        const updated = { ...distributionData };
        allFilteredStudents.forEach(st => {
            if (!updated[st.id]) updated[st.id] = {};
            updated[st.id][colId] = value;
        });
        setDistributionData(updated);
    };

    // Save changes to Firebase
    const handleSaveToDatabase = async () => {
        if (!principal?.id || !selectedStage) return;
        setIsSaving(true);
        try {
            const stageKey = encodeURIComponent(selectedStage.replace(/\//g, '_'));
            await db.ref(`textbook_distribution/${principal.id}/${stageKey}`).set({
                stage: selectedStage,
                records: distributionData,
                columns: columns,
                counselorName,
                customNote,
                updatedAt: Date.now(),
            });
            setLastSavedTime(new Date().toLocaleTimeString('ar-EG'));
            alert('تم حفظ بيانات واستلام الكتب بنجاح في قاعدة البيانات!');
        } catch (error) {
            console.error('Error saving textbook data:', error);
            alert('حدث خطأ أثناء حفظ البيانات.');
        } finally {
            setIsSaving(false);
        }
    };

    // Column Management Methods
    const handleAddColumn = () => {
        if (!newColTitle.trim()) {
            alert('يرجى كتابة عنوان العمود.');
            return;
        }

        const newCol: ColumnDef = {
            id: `col_${uuidv4().substring(0, 8)}`,
            title: newColTitle.trim(),
            isCustom: true,
        };

        let updatedCols = [...columns];
        if (newColPosition === 'start') {
            updatedCols.unshift(newCol);
        } else if (newColPosition === 'end') {
            updatedCols.push(newCol);
        } else if (newColPosition === 'before' && newColTargetId) {
            const idx = updatedCols.findIndex(c => c.id === newColTargetId);
            if (idx !== -1) {
                updatedCols.splice(idx, 0, newCol);
            } else {
                updatedCols.push(newCol);
            }
        } else if (newColPosition === 'after' && newColTargetId) {
            const idx = updatedCols.findIndex(c => c.id === newColTargetId);
            if (idx !== -1) {
                updatedCols.splice(idx + 1, 0, newCol);
            } else {
                updatedCols.push(newCol);
            }
        } else {
            updatedCols.push(newCol);
        }

        setColumns(updatedCols);
        setNewColTitle('');
        setIsAddColumnModalOpen(false);
    };

    const handleDeleteColumn = (colId: string) => {
        if (!confirm('هل أنت متأكد من حذف هذا العمود؟')) return;
        setColumns(prev => prev.filter(c => c.id !== colId));
    };

    const handleMoveColumn = (colIndex: number, direction: 'left' | 'right') => {
        const newIndex = direction === 'left' ? colIndex + 1 : colIndex - 1;
        if (newIndex < 0 || newIndex >= columns.length) return;
        const newCols = [...columns];
        const [movedCol] = newCols.splice(colIndex, 1);
        newCols.splice(newIndex, 0, movedCol);
        setColumns(newCols);
    };

    const handleSaveColumnTitle = (colId: string) => {
        if (!editingColTitle.trim()) return;
        setColumns(prev => prev.map(c => c.id === colId ? { ...c, title: editingColTitle.trim() } : c));
        setEditingColId(null);
        setEditingColTitle('');
    };

    // Preset Configurations
    const applyActualSubjectsPreset = () => {
        const stageCols = getInitialStageColumns(selectedStage, classes);
        if (stageCols.length === 0) {
            alert('لا توجد مواد مسجلة لهذا الصف في النظام.');
            return;
        }

        if (confirm(`هل تريد استعادة وتطبيق كافة المواد الدراسية المسجلة في النظام لمرحلة (${selectedStage})؟`)) {
            setColumns(stageCols);
        }
    };

    const applyNumberedPreset = () => {
        if (confirm('هل تريد تطبيق النموذج المرقم (المادة الأولى، الثانية...)؟')) {
            setColumns([
                { id: 'sub_1', title: 'المادة الأولى' },
                { id: 'sub_2', title: 'المادة الثانية' },
                { id: 'sub_3', title: 'المادة الثالثة' },
                { id: 'sub_4', title: 'المادة الرابعة' },
                { id: 'sub_5', title: 'المادة الخامسة' },
                { id: 'sub_6', title: 'المادة السادسة' },
                { id: 'col_receiver_signature', title: 'توقيع المستلم', minWidth: '85px', isCustom: true },
            ]);
        }
    };

    const applyHandoverAndReceiptPreset = () => {
        if (confirm('هل تريد تطبيق نموذج الاستلام والتسليم والتواقيع؟')) {
            setColumns([
                { id: 'col_book_name', title: 'اسم الكتاب' },
                { id: 'col_del_date', title: 'تاريخ التسليم' },
                { id: 'col_st_sig', title: 'توقيع الطالب' },
                { id: 'col_ret_date', title: 'تاريخ الإرجاع' },
                { id: 'col_condition', title: 'حالة الكتاب' },
                { id: 'col_rec_sig', title: 'توقيع المستلم' },
                { id: 'col_notes', title: 'ملاحظات' },
            ]);
        }
    };

    // EXPORT TO EXCEL
    const handleExportExcel = () => {
        if (typeof XLSX === 'undefined') {
            alert('خطأ: مكتبة Excel غير محملة.');
            return;
        }

        const wb = XLSX.utils.book_new();

        const sheetData: any[][] = [
            ['جمهورية العراق - وزارة التربية'],
            [`${settings.directorate || 'المديرية العامة للتربية'} - ${settings.schoolName}`],
            ['سجل تسليم واستلام الكتب المدرسية'],
            [`العام الدراسي: ${academicYear || settings.academicYear}`, `المرحلة: ${selectedStage}`, `الشعبة: ${selectedSection === 'ALL' ? 'كافة الشعب' : selectedSection}`],
            [],
            ['ت', 'اسم الطالب', 'الشعبة', ...columns.map(c => c.title)]
        ];

        allFilteredStudents.forEach(st => {
            const rowValues = columns.map(c => {
                const val = st.values[c.id] || '';
                return val === 'delivered' ? 'تم الاستلام' : val;
            });
            sheetData.push([st.seq, st.name, st.section, ...rowValues]);
        });

        sheetData.push([]);
        sheetData.push(['معاون شؤون الطلبة', '', '', '', 'مدير المدرسة']);
        sheetData.push([counselorName || '................', '', '', '', settings.principalName || '................']);

        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws['!views'] = [{ RTL: true }];

        XLSX.utils.book_append_sheet(wb, ws, 'سجل تسليم الكتب');
        XLSX.writeFile(wb, `سجل_تسليم_الكتب_${selectedStage}_${selectedSection}.xlsx`);
    };

    // EXPORT TO WORD (.doc in Landscape)
    const handleExportWord = () => {
        const sectionTitle = selectedSection === 'ALL' ? 'كافة الشعب' : selectedSection;

        // Build HTML table for Word with landscape page setup
        let pagesHtml = '';

        allPagesChunks.forEach((chunk, pageIndex) => {
            const pageNum = pageIndex + 1;
            const rowsToRender: (StudentRowData | null)[] = [...chunk];
            if (fillEmptyRowsTo20) {
                while (rowsToRender.length < STUDENTS_PER_PAGE) {
                    rowsToRender.push(null);
                }
            }

            const isLastPage = pageIndex === allPagesChunks.length - 1;
            const isDenseWord = columns.length > 8;

            pagesHtml += `
                <div class="page-container" style="page-break-after: ${isLastPage ? 'auto' : 'always'}; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px; font-family: 'Cairo', 'Arial', sans-serif;">
                        <tr>
                            <td style="width: 28%; text-align: right; font-size: 10pt; font-weight: bold;">
                                جمهورية العراق<br/>
                                وزارة التربية<br/>
                                ${settings.directorate || 'المديرية العامة للتربية'}<br/>
                                <span style="color: #0e7490;">مدرسة: ${settings.schoolName}</span>
                            </td>
                            <td style="width: 44%; text-align: center;">
                                <h2 style="margin: 0; font-size: 15pt; font-weight: bold; color: #000;">سجل تسليم واستلام الكتب المدرسية</h2>
                                <p style="margin: 4px 0 0 0; font-size: 9.5pt; font-weight: bold; background-color: #f1f5f9; padding: 3px; border: 1px solid #cbd5e1;">
                                    العام الدراسي: ${academicYear || settings.academicYear} | المرحلة: ${selectedStage} | الشعبة: ${sectionTitle}
                                </p>
                            </td>
                            <td style="width: 28%; text-align: left; font-size: 9.5pt; font-weight: bold;">
                                صفحة (${pageNum}) من (${totalPages})
                            </td>
                        </tr>
                    </table>

                    <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: ${isDenseWord ? '8.5pt' : '9.5pt'}; border: 2px solid #000; font-family: 'Cairo', 'Arial', sans-serif;" dir="rtl">
                        <thead>
                            <tr style="background-color: #e2efda; font-weight: bold; height: 25px;">
                                <th style="border: 1px solid #000; width: 28px; text-align: center;">ت</th>
                                <th style="border: 1px solid #000; width: ${isDenseWord ? '140px' : '180px'}; text-align: right; padding-right: 4px;">اسم الطالب</th>
                                <th style="border: 1px solid #000; width: 45px; text-align: center;">الشعبة</th>
                                ${columns.map(col => `
                                    <th style="border: 1px solid #000; padding: 2px 4px; text-align: center;">${col.title}</th>
                                `).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsToRender.map((row, rIdx) => {
                                const isOdd = rIdx % 2 === 0;
                                const bg = isOdd ? '#fff2cc' : '#ffffff';
                                const seqVal = row ? row.seq : (chunk.length > 0 ? chunk[0].seq + rIdx : rIdx + 1);

                                if (!row) {
                                    return `
                                        <tr style="background-color: ${bg}; height: 23px;">
                                            <td style="border: 1px solid #000; text-align: center; color: #94a3b8;">${seqVal}</td>
                                            <td style="border: 1px solid #000;"></td>
                                            <td style="border: 1px solid #000;"></td>
                                            ${columns.map(() => `<td style="border: 1px solid #000;"></td>`).join('')}
                                        </tr>
                                    `;
                                }

                                return `
                                    <tr style="background-color: ${bg}; height: 23px;">
                                        <td style="border: 1px solid #000; text-align: center; font-weight: bold;">${row.seq}</td>
                                        <td style="border: 1px solid #000; text-align: right; padding-right: 4px; font-weight: bold;">${row.name}</td>
                                        <td style="border: 1px solid #000; text-align: center;">${row.section}</td>
                                        ${columns.map(col => {
                                            const val = row.values[col.id] || '';
                                            return `<td style="border: 1px solid #000; text-align: center;">${val === 'delivered' ? '✔' : val}</td>`;
                                        }).join('')}
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>

                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px; text-align: center; font-size: 9.5pt; font-weight: bold; font-family: 'Cairo', 'Arial', sans-serif;">
                        <tr>
                            <td style="width: 50%;">
                                معاون شؤون الطلبة<br/>
                                <span style="font-weight: normal; color: #475569;">${counselorName || '................................'}</span><br/><br/>
                                التوقيع: .....................
                            </td>
                            <td style="width: 50%;">
                                مدير المدرسة<br/>
                                <span style="color: #000;">${settings.principalName || '................................'}</span><br/><br/>
                                التوقيع والختم: .....................
                            </td>
                        </tr>
                    </table>
                </div>
            `;
        });

        const wordDocument = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset="utf-8">
                <title>سجل تسليم واستلام الكتب المدرسية</title>
                <!--[if gte mso 9]>
                <xml>
                    <w:WordDocument>
                        <w:View>Print</w:View>
                        <w:Zoom>100</w:Zoom>
                        <w:DoNotOptimizeForBrowser/>
                    </w:WordDocument>
                </xml>
                <![endif]-->
                <style>
                    @page Section1 {
                        size: 841.9pt 595.3pt;
                        mso-page-orientation: landscape;
                        margin: 18pt 18pt 18pt 18pt;
                        mso-header-margin: 10pt;
                        mso-footer-margin: 10pt;
                    }
                    div.Section1 { page: Section1; }
                    body { font-family: 'Cairo', 'Traditional Arabic', 'Arial', sans-serif; direction: rtl; text-align: right; }
                    table { border-collapse: collapse; }
                </style>
            </head>
            <body lang="AR-IQ">
                <div class="Section1">
                    ${pagesHtml}
                </div>
            </body>
            </html>
        `;

        const blob = new Blob(['\ufeff' + wordDocument], { type: 'application/msword;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `سجل_تسليم_الكتب_${selectedStage}_${sectionTitle}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // EXPORT MULTI-PAGE PDF (Landscape)
    const handleExportPdf = async () => {
        if (typeof jspdf === 'undefined' || typeof html2canvas === 'undefined') {
            alert('خطأ: مكتبة تصدير PDF غير محملة.');
            return;
        }

        setIsExportingPdf(true);
        setExportProgress(0);

        try {
            const { jsPDF } = jspdf;
            // Landscape A4 PDF: width 297mm, height 210mm
            const pdf = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });

            const tempContainer = document.createElement('div');
            Object.assign(tempContainer.style, {
                position: 'absolute',
                left: '-9999px',
                top: '0',
                width: '1123px',
                background: '#ffffff',
            });
            document.body.appendChild(tempContainer);
            const root = ReactDOM.createRoot(tempContainer);

            const renderComponent = (component: React.ReactElement) => new Promise<void>(resolve => {
                root.render(component);
                setTimeout(resolve, 400);
            });

            const sectionTitle = selectedSection === 'ALL' ? 'كافة الشعب' : selectedSection;

            for (let i = 0; i < allPagesChunks.length; i++) {
                setExportProgress(Math.round(((i + 1) / allPagesChunks.length) * 100));

                const pageStudents = allPagesChunks[i];
                await renderComponent(
                    <TextbookDistributionPDFPage
                        settings={settings}
                        stageName={selectedStage}
                        sectionName={sectionTitle}
                        academicYear={academicYear}
                        columns={columns}
                        students={pageStudents}
                        pageNumber={i + 1}
                        totalPages={totalPages}
                        counselorName={counselorName}
                        customNote={customNote}
                        totalExpectedRows={fillEmptyRowsTo20 ? STUDENTS_PER_PAGE : pageStudents.length}
                    />
                );

                const canvas = await html2canvas(tempContainer.firstElementChild as HTMLElement, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    windowWidth: 1123,
                });

                const imgData = canvas.toDataURL('image/jpeg', 0.98);
                if (i > 0) pdf.addPage('a4', 'l');
                pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);
            }

            pdf.save(`سجل_تسليم_الكتب_${selectedStage}_${sectionTitle}.pdf`);
            root.unmount();
            document.body.removeChild(tempContainer);
        } catch (error) {
            console.error('PDF Export Error:', error);
            alert('حدث خطأ أثناء تصدير ملف PDF.');
        } finally {
            setIsExportingPdf(false);
            setExportProgress(0);
        }
    };

    // DIRECT PRINT (Landscape)
    const handleDirectPrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Header Title Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-cyan-100 text-cyan-700 rounded-2xl">
                        <BookOpenCheck size={28} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-gray-800">سجل تسليم واستلام الكتب المدرسية</h2>
                        <p className="text-xs text-gray-500 font-semibold mt-0.5">
                            إدارة وتصدير جداول تسليم الكتب (Word / Excel / PDF) أفقياً بسعة 20 طالباً لكل صفحة بأسماء المواد المسجلة بالنظام
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handleSaveToDatabase}
                        disabled={isSaving}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                        {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                        <span>حفظ البيانات في النظام</span>
                    </button>

                    {lastSavedTime && (
                        <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-mono">
                            آخر حفظ: {lastSavedTime}
                        </span>
                    )}
                </div>
            </div>

            {/* Filter and Configuration Controls */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">المرحلة الدراسية:</label>
                        <select
                            value={selectedStage}
                            onChange={e => { setSelectedStage(e.target.value); setSelectedSection('ALL'); setActivePage(1); }}
                            className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-cyan-500 font-bold text-sm"
                        >
                            {availableStages.map(stg => (
                                <option key={stg} value={stg}>{stg}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">الشعبة:</label>
                        <select
                            value={selectedSection}
                            onChange={e => { setSelectedSection(e.target.value); setActivePage(1); }}
                            className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-cyan-500 font-bold text-sm"
                        >
                            <option value="ALL">-- كافة شعب المرحلة --</option>
                            {availableSections.map(sec => (
                                <option key={sec} value={sec}>الشعبة ({sec})</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">العام الدراسي:</label>
                        <input
                            type="text"
                            value={academicYear}
                            onChange={e => setAcademicYear(e.target.value)}
                            placeholder="2024 - 2025"
                            className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-cyan-500 text-sm font-semibold"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">البحث عن طالب:</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => { setSearchTerm(e.target.value); setActivePage(1); }}
                                placeholder="ابحث بالاسم أو الشعبة..."
                                className="w-full p-2.5 pr-8 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-cyan-500 text-sm"
                            />
                            <Search size={16} className="absolute right-2.5 top-3 text-gray-400" />
                        </div>
                    </div>
                </div>

                {/* Additional Metadata Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">اسم معاون شؤون الطلبة:</label>
                        <input
                            type="text"
                            value={counselorName}
                            onChange={e => setCounselorName(e.target.value)}
                            placeholder="أدخل اسم المعاون..."
                            className="w-full p-2 text-xs border rounded-lg bg-gray-50 focus:bg-white"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">ملاحظة أسفل السجل (اختياري):</label>
                        <input
                            type="text"
                            value={customNote}
                            onChange={e => setCustomNote(e.target.value)}
                            placeholder="مثال: يلتزم الطالب بالمحافظة على الكتب وإعادتها..."
                            className="w-full p-2 text-xs border rounded-lg bg-gray-50 focus:bg-white"
                        />
                    </div>
                </div>
            </div>

            {/* Column Control Toolbar & Presets */}
            <div className="bg-slate-800 text-white p-5 rounded-2xl shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Sliders className="text-cyan-400" size={20} />
                        <h3 className="font-bold text-sm md:text-base">إدارة وتخصيص المواد والأعمدة</h3>
                        <span className="text-xs text-gray-400">({columns.length} مواد/أعمدة)</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsAddColumnModalOpen(true)}
                            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                            <Plus size={15} />
                            <span>إضافة عمود / مادة إضافية</span>
                        </button>

                        <button
                            type="button"
                            onClick={applyActualSubjectsPreset}
                            title="تطبيق كافة المواد الدراسية المسجلة في النظام لهذا الصف"
                            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer border border-emerald-600"
                        >
                            <Sparkles size={14} className="text-amber-300" />
                            <span>المواد الدراسية بالنظام ({selectedStage})</span>
                        </button>

                        <button
                            type="button"
                            onClick={applyHandoverAndReceiptPreset}
                            title="نموذج الاستلام والإرجاع والتواقيع"
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-gray-200 text-xs font-bold rounded-lg border border-slate-600 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                            <span>نموذج الاستلام والإرجاع</span>
                        </button>

                        <button
                            type="button"
                            onClick={applyNumberedPreset}
                            title="تطبيق النموذج المرقم (المادة الأولى، الثانية...)"
                            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-gray-300 text-xs font-bold rounded-lg border border-slate-600 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                            <span>النموذج المرقم</span>
                        </button>
                    </div>
                </div>

                {/* Column Tags with Edit/Delete/Reorder */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700">
                    <span className="text-xs text-gray-400 self-center">المواد/الأعمدة المعروضة:</span>
                    {columns.map((col, idx) => (
                        <div
                            key={col.id}
                            className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-200 group"
                        >
                            {editingColId === col.id ? (
                                <div className="flex items-center gap-1">
                                    <input
                                        type="text"
                                        value={editingColTitle}
                                        onChange={e => setEditingColTitle(e.target.value)}
                                        className="p-1 text-xs text-black bg-white rounded w-24"
                                        autoFocus
                                    />
                                    <button 
                                        type="button"
                                        onClick={() => handleSaveColumnTitle(col.id)}
                                        className="text-emerald-400 hover:text-emerald-300"
                                    >
                                        <Check size={14} />
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setEditingColId(null)}
                                        className="text-red-400 hover:text-red-300"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <span className="font-bold text-cyan-300 text-[11px]">{idx + 1}.</span>
                                    <span className="text-[11px] font-semibold">{col.title}</span>

                                    <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100 mr-1 border-r border-slate-700 pr-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingColId(col.id);
                                                setEditingColTitle(col.title);
                                            }}
                                            title="تعديل اسم المادة"
                                            className="text-gray-400 hover:text-amber-300 p-0.5"
                                        >
                                            <Edit3 size={11} />
                                        </button>

                                        {idx > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => handleMoveColumn(idx, 'right')}
                                                title="تحريك لليمين"
                                                className="text-gray-400 hover:text-cyan-300 p-0.5"
                                            >
                                                <ArrowRight size={11} />
                                            </button>
                                        )}

                                        {idx < columns.length - 1 && (
                                            <button
                                                type="button"
                                                onClick={() => handleMoveColumn(idx, 'left')}
                                                title="تحريك لليسار"
                                                className="text-gray-400 hover:text-cyan-300 p-0.5"
                                            >
                                                <ArrowLeft size={11} />
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => handleDeleteColumn(col.id)}
                                            title="حذف العمود"
                                            className="text-red-400 hover:text-red-300 p-0.5"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Export Toolbar (Word, Excel, PDF, Direct Print) */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-700">خيارات التصدير (أفقي Landscape):</span>
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                        <input
                            type="checkbox"
                            checked={fillEmptyRowsTo20}
                            onChange={e => setFillEmptyRowsTo20(e.target.checked)}
                            className="rounded text-cyan-600 focus:ring-cyan-500"
                        />
                        <span>تعبئة باقي الصفوف حتى 20 سطراً بالصفحة الأخيرة</span>
                    </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Word Export */}
                    <button
                        type="button"
                        onClick={handleExportWord}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-98"
                    >
                        <FileText size={16} />
                        <span>تصدير ملف Word (.doc)</span>
                    </button>

                    {/* Excel Export */}
                    <button
                        type="button"
                        onClick={handleExportExcel}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-98"
                    >
                        <FileSpreadsheet size={16} />
                        <span>تصدير ملف Excel (.xlsx)</span>
                    </button>

                    {/* PDF Export */}
                    <button
                        type="button"
                        onClick={handleExportPdf}
                        disabled={isExportingPdf}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
                    >
                        {isExportingPdf ? <Loader2 className="animate-spin" size={16} /> : <FileDown size={16} />}
                        <span>{isExportingPdf ? `جاري التصدير (${exportProgress}%)...` : 'تصدير ملف PDF'}</span>
                    </button>

                    {/* Direct Print */}
                    <button
                        type="button"
                        onClick={handleDirectPrint}
                        className="px-4 py-2 bg-gray-800 hover:bg-black text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-98"
                    >
                        <Printer size={16} />
                        <span>طباعة فورية</span>
                    </button>
                </div>
            </div>

            {/* Interactive Preview Table Container */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Pagination Controls & Header */}
                <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="font-extrabold text-sm text-gray-800">
                            الطلاب المسجلين: <span className="text-cyan-700">{allFilteredStudents.length} طالب</span>
                        </span>
                        <span className="text-xs text-gray-400">|</span>
                        <span className="text-xs font-bold text-gray-600">
                            (كل صفحة تحوي 20 اسماً بالضبط)
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setActivePage(p => Math.max(1, p - 1))}
                            disabled={activePage === 1}
                            className="p-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                        >
                            <ChevronRight size={18} />
                        </button>

                        <div className="flex items-center gap-1 text-xs font-bold">
                            <span>صفحة</span>
                            <select
                                value={activePage}
                                onChange={e => setActivePage(Number(e.target.value))}
                                className="px-2 py-1 bg-white border rounded font-mono"
                            >
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(num => (
                                    <option key={num} value={num}>{num}</option>
                                ))}
                            </select>
                            <span>من {totalPages}</span>
                        </div>

                        <button
                            type="button"
                            onClick={() => setActivePage(p => Math.min(totalPages, p + 1))}
                            disabled={activePage === totalPages}
                            className="p-1.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                        >
                            <ChevronLeft size={18} />
                        </button>
                    </div>
                </div>

                {/* The Styled Table matching layout */}
                <div className="overflow-x-auto p-4">
                    <table className="w-full border-collapse border border-black text-center text-xs font-['Cairo']">
                        <thead>
                            <tr style={{ backgroundColor: '#e2efda' }} className="font-extrabold text-gray-900 border-b border-black">
                                <th className="border border-black px-1.5 py-2 w-8 text-center">ت</th>
                                <th className="border border-black px-2 py-2 text-right min-w-[150px]">اسم الطالب</th>
                                <th className="border border-black px-1 py-2 w-14 text-center">الشعبة</th>
                                {columns.map(col => (
                                    <th key={col.id} className="border border-black px-1.5 py-2 min-w-[75px] text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="leading-tight">{col.title}</span>
                                            <div className="flex items-center gap-1 opacity-70 hover:opacity-100">
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetAllColumnDelivered(col.id, 'delivered')}
                                                    title="تحديد الكل كمستلم"
                                                    className="text-[9.5px] bg-white text-emerald-800 px-1 rounded border border-emerald-300 hover:bg-emerald-50"
                                                >
                                                    ✔ الكل
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetAllColumnDelivered(col.id, '')}
                                                    title="تفريغ هذا العمود"
                                                    className="text-[9.5px] bg-white text-red-700 px-1 rounded border border-red-300 hover:bg-red-50"
                                                >
                                                    تفريغ
                                                </button>
                                            </div>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {currentPageStudents.length === 0 ? (
                                <tr>
                                    <td colSpan={3 + columns.length} className="p-8 text-center text-gray-400 font-bold">
                                        لا توجد بيانات طلاب متطابقة مع البحث أو الفلاتر المحددة.
                                    </td>
                                </tr>
                            ) : (
                                (() => {
                                    const rows: (StudentRowData | null)[] = [...currentPageStudents];
                                    if (fillEmptyRowsTo20) {
                                        while (rows.length < STUDENTS_PER_PAGE) {
                                            rows.push(null);
                                        }
                                    }

                                    return rows.map((row, idx) => {
                                        const isOdd = idx % 2 === 0;
                                        const bgColor = isOdd ? '#fff2cc' : '#ffffff';
                                        const seqNum = row ? row.seq : ((activePage - 1) * STUDENTS_PER_PAGE + idx + 1);

                                        if (!row) {
                                            return (
                                                <tr key={`blank-${idx}`} style={{ backgroundColor: bgColor, height: '26px' }}>
                                                    <td className="border border-black px-1 text-center font-bold text-gray-400">{seqNum}</td>
                                                    <td className="border border-black px-2 text-right"></td>
                                                    <td className="border border-black px-1 text-center"></td>
                                                    {columns.map(col => (
                                                        <td key={col.id} className="border border-black px-1 text-center"></td>
                                                    ))}
                                                </tr>
                                            );
                                        }

                                        return (
                                            <tr 
                                                key={row.id} 
                                                style={{ backgroundColor: bgColor, height: '26px' }}
                                                className="hover:bg-amber-100/70 transition-colors"
                                            >
                                                <td className="border border-black px-1 font-bold text-center">{row.seq}</td>
                                                <td className="border border-black px-2 font-bold text-right text-gray-900 truncate">{row.name}</td>
                                                <td className="border border-black px-1 font-semibold text-center">{row.section}</td>
                                                {columns.map(col => {
                                                    const cellVal = row.values[col.id] || '';
                                                    const isDelivered = cellVal === 'delivered';

                                                    return (
                                                        <td 
                                                            key={col.id} 
                                                            onClick={() => handleToggleDelivered(row.id, col.id)}
                                                            className="border border-black px-1 text-center cursor-pointer select-none hover:bg-cyan-100 transition-colors"
                                                        >
                                                            {isDelivered ? (
                                                                <span className="inline-block text-emerald-700 font-extrabold text-sm">✔</span>
                                                            ) : cellVal ? (
                                                                <span className="text-xs font-semibold">{cellVal}</span>
                                                            ) : (
                                                                <span className="text-gray-300 text-[10px]">-</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })
                                })()
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer instructions */}
                <div className="p-4 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between text-xs text-gray-500">
                    <span>💡 انقر على أي خلية لتبديل حالة الاستلام (✔)، أو أدخل الملاحظات في الإعدادات.</span>
                    <span>صفحة ({activePage}) من ({totalPages}) | إجمالي الطلاب: {allFilteredStudents.length}</span>
                </div>
            </div>

            {/* Add Column Modal */}
            {isAddColumnModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 border border-gray-200">
                        <div className="flex items-center justify-between border-b pb-3">
                            <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                                <Plus className="text-cyan-600" size={20} />
                                <span>إضافة عمود أو مادة جديدة</span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setIsAddColumnModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    عنوان العمود (اسم المادة / الحقل):
                                </label>
                                <input
                                    type="text"
                                    value={newColTitle}
                                    onChange={e => setNewColTitle(e.target.value)}
                                    placeholder="مثال: التربية الفنية، توقيع ولي الأمر..."
                                    className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-cyan-500 font-bold text-sm"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    موضع العمود في الجدول:
                                </label>
                                <select
                                    value={newColPosition}
                                    onChange={e => setNewColPosition(e.target.value as any)}
                                    className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white font-semibold text-sm"
                                >
                                    <option value="end">في نهاية الجدول (اليسار)</option>
                                    <option value="start">في بداية المواد (بعد الشعبة مباشرة)</option>
                                    <option value="before">قبل مادة/عمود محدد...</option>
                                    <option value="after">بعد مادة/عمود محدد...</option>
                                </select>
                            </div>

                            {(newColPosition === 'before' || newColPosition === 'after') && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">
                                        اختر العمود المرجعي:
                                    </label>
                                    <select
                                        value={newColTargetId}
                                        onChange={e => setNewColTargetId(e.target.value)}
                                        className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white font-semibold text-sm"
                                    >
                                        <option value="">-- اختر العمود --</option>
                                        {columns.map(c => (
                                            <option key={c.id} value={c.id}>{c.title}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t">
                            <button
                                type="button"
                                onClick={() => setIsAddColumnModalOpen(false)}
                                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl"
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                onClick={handleAddColumn}
                                className="px-5 py-2 text-sm font-bold bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl shadow-md"
                            >
                                إضافة العمود
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
