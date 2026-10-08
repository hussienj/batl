
import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as ReactDOM from 'react-dom/client';
import { QrCode, Search, UserMinus, Layout, Camera, RefreshCw, X, Save, FileDown, Loader2, ListChecks, CheckCircle, AlertTriangle, Trash2, Info, FileText, Keyboard, FileType, BookOpen, UserCheck, UserX } from 'lucide-react';
import type { ClassData, Student, SchoolSettings, ExamAbsenceRecord, SeatingAssignment, User } from '../../types.ts';
import { GRADE_LEVELS } from '../../constants.ts';
import { db } from '../../lib/firebase.ts';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { calculateStudentResult } from '../../lib/gradeCalculator.ts';
import AbsenceListPage from './AbsenceListPage.tsx';
import AbsenceSummaryPage from './AbsenceSummaryPage.tsx';

declare const jspdf: any;
declare const html2canvas: any;

interface ExamAbsenceRecorderProps {
    classes: ClassData[];
    settings: SchoolSettings;
    principal: User;
}

type Tab = 'seating' | 'scanning';

const FIELD_OPTIONS = [
    { key: 'midYear', label: 'نصف السنة' },
    { key: 'finalExam1st', label: 'الامتحان النهائي' },
    { key: 'finalExam2nd', label: 'الاكمال' }
];

const normalizeDigits = (str: string): string => {
    if (!str) return '';
    const map: Record<string, string> = {
        '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
        '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9'
    };
    return str.replace(/[٠-٩۰-۹]/g, (d) => map[d] || d).replace(/\D/g, '');
};

const playScanSound = (success: boolean) => {
    try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(success ? 880 : 220, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
};

export default function ExamAbsenceRecorder({ classes, settings, principal }: ExamAbsenceRecorderProps) {
    const [activeTab, setActiveTab] = useState<Tab>('seating');
    const [selectedStages, setSelectedStages] = useState<string[]>([]);
    const [stageSubjects, setStageSubjects] = useState<Record<string, string>>({});
    const [targetField, setTargetField] = useState('midYear');
    const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [isSavingSeating, setIsSavingSeating] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [manuallyExcludedIds, setManuallyExcludedIds] = useState<string[]>([]);
    const [isExporting, setIsExporting] = useState(false);
    const [isApproving, setIsApproving] = useState(false);

    const [seatingAssignments, setSeatingAssignments] = useState<Record<string, SeatingAssignment>>({}); 
    const [absentRecords, setAbsentRecords] = useState<Record<string, ExamAbsenceRecord>>({}); 

    const [isScannerActive, setIsScannerActive] = useState(false);
    const [lastScannedStudent, setLastScannedStudent] = useState<ExamAbsenceRecord | null>(null);
    const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string>('');
    const [isLoadingCameras, setIsLoadingCameras] = useState(false);
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

    const principalId = settings.principalName + "_" + settings.schoolName;
    const smartSeatingPath = `seating_data/${principal.id}`;

    const handleImportSmartSeating = async () => {
        if (!window.confirm('سيتم استيراد توزيع القاعات الذكي واستبدال التوزيع الحالي لهذا اليوم. هل أنت متأكد؟')) return;
        
        setIsImporting(true);
        try {
            const snapshot = await db.ref(smartSeatingPath).once('value');
            const data = snapshot.val();
            
            if (!data || !data.seatingChart || !data.students) {
                alert('لا يوجد توزيع ذكي محفوظ حالياً.');
                return;
            }

            const newSeating: Record<string, SeatingAssignment> = { ...seatingAssignments };
            const studentsMap: Record<string, any> = {}; 
            
            data.students.forEach((s: any) => {
                studentsMap[s.uid || s.id] = s;
            });

            Object.entries(data.seatingChart).forEach(([seatKey, studentUid]) => {
                const student = studentsMap[studentUid as string];
                if (student && student.id) { 
                    const [hallId] = (seatKey as string).split(':');
                    const hall = data.halls?.find((h: any) => h.id === hallId);
                    
                    if (hall) {
                        newSeating[student.id] = {
                            ...(newSeating[student.id] || {}),
                            hallNumber: hall.name,
                            sectorNumber: (newSeating[student.id]?.sectorNumber) || '1',
                            isExcused: (newSeating[student.id]?.isExcused) || false,
                            isExempt: student.isExempt || false
                        };
                    }
                }
            });

            setSeatingAssignments(newSeating);
            alert('تم استيراد التوزيع بنجاح. يرجى الضغط على "حفظ التوزيع" لتثبيت التغييرات.');
        } catch (error) {
            console.error("Import Error:", error);
            alert('حدث خطأ أثناء استيراد التوزيع.');
        } finally {
            setIsImporting(false);
        }
    };

    const filteredGradeLevels = useMemo(() => {
        const level = settings.schoolLevel;
        if (level === 'ابتدائية') return GRADE_LEVELS.filter(g => g.includes('ابتدائي'));
        if (level === 'متوسطة') return GRADE_LEVELS.filter(g => g.includes('متوسط'));
        if (level.includes('اعدادي') || level.includes('اعدادية')) return GRADE_LEVELS.filter(g => g.includes('العلمي') || g.includes('الادبي') || g.includes('الرابع') || g.includes('الخامس') || g.includes('السادس'));
        if (level.includes('ثانوية')) return GRADE_LEVELS.filter(g => !g.includes('ابتدائي'));
        return GRADE_LEVELS;
    }, [settings.schoolLevel]);

    useEffect(() => {
        const path = `exam_seating/${principalId}`;
        const ref = db.ref(path);
        const callback = (snap: any) => setSeatingAssignments(snap.val() || {});
        ref.on('value', callback);
        return () => ref.off('value', callback);
    }, [principalId]);

    useEffect(() => {
        if (selectedStages.length === 0 || !currentDate) {
            setAbsentRecords({});
            return;
        }
        
        const fetchAllAbsences = async () => {
            const allAbsences: Record<string, ExamAbsenceRecord> = {};
            for (const stage of selectedStages) {
                const path = `exam_absences/${principalId}/${stage}/${currentDate}`;
                const snap = await db.ref(path).get();
                if (snap.exists()) {
                    Object.assign(allAbsences, snap.val());
                }
            }
            setAbsentRecords(allAbsences);
        };

        fetchAllAbsences();
        
        const refs = selectedStages.map(stage => db.ref(`exam_absences/${principalId}/${stage}/${currentDate}`));
        const handlers = refs.map(() => {
            const handler = () => fetchAllAbsences();
            return handler;
        });

        refs.forEach((ref, idx) => ref.on('value', handlers[idx]));

        return () => {
            refs.forEach((ref, idx) => ref.off('value', handlers[idx]));
        };
    }, [principalId, selectedStages, currentDate]);

    const activeStudents = useMemo(() => {
        if (selectedStages.length === 0) return [];
        return classes
            .filter(c => selectedStages.includes(c.stage))
            .flatMap(c => (c.students || []).map(s => ({ student: s, classData: c })))
            .filter(({ student, classData }) => {
                // 1. الأساسي: الطلاب النشطين (وليس منقول أو مفصول)
                const isExcludedStatus = ['dismissed', 'transferred', 'منقول', 'مفصول'].includes(student.enrollmentStatus || '');
                if (isExcludedStatus) return false;
                if (student.enrollmentStatus && student.enrollmentStatus !== 'active') return false;

                // 2. الحذف اليدوي
                if (manuallyExcludedIds.includes(student.id)) return false;

                // 3. المعفويين والناجحين تلقائياً (فحص الإعفاء والنجاح)
                // الإعفاء العام والنجاح النهائي يعني عدم الحاجة للتواجد في القاعة (للمراحل غير المنتهية)
                const isMinisterial = ['الثالث متوسط', 'السادس العلمي', 'السادس الادبي', 'السادس ابتدائي'].some(m => classData.stage.includes(m));
                
                // نحسب النتيجة النهائية دائماً للتأكد من حالة الإعفاء أو النجاح المسبق
                const result = calculateStudentResult(student, classData.subjects, settings, classData, 'final');
                
                // أ- الإعفاء العام (Ma'fo Am)
                const isGeneralExempt = Object.values(result.finalCalculatedGrades).some(g => g.isGeneralExempt);
                if (isGeneralExempt && !isMinisterial) return false;

                // ب- النجاح النهائي (إذا كان الطالب ناجحاً بالفعل في الدور الأول، لا يظهر في الدور الثاني)
                if (targetField === 'finalExam2nd' && result.result.status === 'ناجح') return false;
                
                // ج- إذا كان الحقل هو الامتحان النهائي 1، والنتيجة ناجح (وهذا يعني إعفاء بالضرورة في هذه المرحلة)
                if (targetField === 'finalExam1st' && result.result.status === 'ناجح' && !isMinisterial) return false;

                return true;
            })
            .map(({ student }) => student)
            .sort((a, b) => {
                const aId = parseInt(normalizeDigits(a.examId || '0'), 10);
                const bId = parseInt(normalizeDigits(b.examId || '0'), 10);
                return aId - bId;
            });
    }, [classes, selectedStages, manuallyExcludedIds, targetField, settings]);

    const getFinalAbsenceList = useMemo(() => {
        const combined: Record<string, ExamAbsenceRecord> = { ...absentRecords };
        
        // نقوم بفلترة absentRecords للتأكد من حذف أي طالب معفى حتى لو كان مسجلاً مسبقاً
        const finalActiveIds = new Set(activeStudents.map(s => s.id));
        Object.keys(combined).forEach(studentId => {
            if (!finalActiveIds.has(studentId)) {
                delete combined[studentId];
            }
        });

        activeStudents.forEach(student => {
            const seating = seatingAssignments[student.id];
            if ((seating?.isExcused || seating?.isExempt) && !combined[student.id]) {
                const classData = classes.find(c => c.students?.some(s => s.id === student.id))!;
                combined[student.id] = {
                    studentId: student.id,
                    studentName: student.name,
                    stage: classData.stage,
                    section: classData.section,
                    hallNumber: seating.hallNumber || '?',
                    sectorNumber: seating.sectorNumber || '?',
                    examId: student.examId || '?',
                    status: seating.isExcused ? 'excused' : 'absent',
                    isExempt: seating.isExempt || false
                };
            }
        });

        return Object.values(combined).sort((a, b) => {
            const idA = parseInt(normalizeDigits(a.examId)) || 0;
            const idB = parseInt(normalizeDigits(b.examId)) || 0;
            return idA - idB;
        });
    }, [absentRecords, activeStudents, seatingAssignments, classes]);

    const handleSeatingChange = (studentId: string, field: keyof SeatingAssignment, value: any) => {
        setSeatingAssignments(prev => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] || { hallNumber: '', sectorNumber: '', isExcused: false }),
                [field]: value
            }
        }));
    };

    const handleSaveSeating = async () => {
        setIsSavingSeating(true);
        try {
            await db.ref(`exam_seating/${principalId}`).set(seatingAssignments);
            alert("تم حفظ توزيع القاعات وتأشير الإجازات بنجاح.");
        } catch (error) {
            alert("حدث خطأ أثناء الحفظ.");
        } finally {
            setIsSavingSeating(false);
        }
    };

    const fetchCameras = async () => {
        setIsLoadingCameras(true);
        try {
            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
                setCameras(devices.map(d => ({ id: d.id, label: d.label })));
                const backCamera = devices.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
                setSelectedCameraId(backCamera ? backCamera.id : devices[0].id);
            }
        } catch (err) {
            console.error("No cameras found");
        } finally {
            setIsLoadingCameras(false);
        }
    };

    const stopScanner = async () => {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
            try { await html5QrCodeRef.current.stop(); } catch (err) {}
        }
    };

    const startScanner = async () => {
        if (!selectedCameraId || !isScannerActive) return;
        await stopScanner();
        try {
            const scanner = new Html5Qrcode("exam-qr-reader", {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                verbose: false
            });
            html5QrCodeRef.current = scanner;
            await scanner.start(
                selectedCameraId,
                { fps: 20, qrbox: { width: 250, height: 250 } },
                (text) => {
                    const cleanId = normalizeDigits(text);
                    const student = activeStudents.find(s => normalizeDigits(s.examId || '') === cleanId);
                    if (student) {
                        registerAbsence(student);
                    } else {
                        playScanSound(false);
                    }
                },
                () => {}
            );
        } catch (err) {
            setIsScannerActive(false);
        }
    };

    const registerAbsence = async (student: Student) => {
        if (absentRecords[student.id]) return; 

        const seating = seatingAssignments[student.id] || { hallNumber: '?', sectorNumber: '?', isExcused: false };
        const classData = classes.find(c => c.students?.some(s => s.id === student.id))!;
        
        const record: ExamAbsenceRecord = {
            studentId: student.id,
            studentName: student.name,
            stage: classData.stage,
            section: classData.section,
            hallNumber: seating.hallNumber || '?',
            sectorNumber: seating.sectorNumber || '?',
            examId: student.examId || '?',
            status: seating.isExcused ? 'excused' : 'absent',
            isExempt: seating.isExempt || false
        };

        try {
            await db.ref(`exam_absences/${principalId}/${classData.stage}/${currentDate}/${student.id}`).set(record);
            setLastScannedStudent(record);
            playScanSound(true);
            if (window.navigator.vibrate) window.navigator.vibrate(100);
        } catch (e) {
            console.error(e);
        }
    };

    const removeAbsence = async (studentId: string, stage: string) => {
        if (confirm("هل تريد إزالة هذا الطالب من قائمة الغياب؟")) {
            await db.ref(`exam_absences/${principalId}/${stage}/${currentDate}/${studentId}`).remove();
        }
    };

    const handleApproveAbsences = async () => {
        const list = getFinalAbsenceList;
        if (list.length === 0) {
            alert("لا توجد غيابات أو إجازات مسجلة لاعتمادها.");
            return;
        }

        const missingSubjects = selectedStages.filter(s => !stageSubjects[s]);
        if (missingSubjects.length > 0) {
            alert(`يرجى تحديد مادة الامتحان للمراحل التالية أولاً: ${missingSubjects.join('، ')}`);
            return;
        }

        if (!confirm(`سيتم تسجيل ${list.length} طالب كغائب أو مجاز في سجل الدرجات لمادة اليوم. هل أنت متأكد؟`)) return;

        setIsApproving(true);
        const updates: Record<string, any> = {};

        try {
            list.forEach(record => {
                const classData = classes.find(c => c.stage === record.stage && c.section === record.section);
                if (!classData) return;

                const studentIndex = (classData.students || []).findIndex(s => s.id === record.studentId);
                if (studentIndex === -1) return;

                const subjectName = stageSubjects[record.stage];
                const gradeValue = record.status === 'excused' ? -2 : -1;

                const path = `classes/${classData.id}/students/${studentIndex}/grades/${subjectName}/${targetField}`;
                updates[path] = gradeValue;
            });

            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
                alert("تم اعتماد الغيابات والإجازات وتحديث سجل الدرجات بنجاح.");
            }
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء عملية الاعتماد.");
        } finally {
            setIsApproving(false);
        }
    };

    const handleExportWord = async (type: 'list' | 'summary') => {
        if (selectedStages.length === 0) {
            alert("يرجى اختيار المرحلة أولاً.");
            return;
        }

        const docxLib = (window as any).docx;
        const saveAsLib = (window as any).saveAs;

        if (!docxLib) {
            alert("مكتبة تصدير Word غير محملة. يرجى الانتظار ثوانٍ ثم المحاولة مجدداً.");
            return;
        }

        setIsExporting(true);
        const { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, AlignmentType, VerticalAlign, TextRun, TableLayoutType, TableBorders, BorderStyle } = docxLib;

        // Twips constants (1 cm = 567 twips)
        const cellMargin = 85; // 0.15 cm
        const cellSpacing = 57; // 0.1 cm
        const pageMargin = 284; // 0.5 cm (approx minimal)

        try {
            const list = getFinalAbsenceList;
            const children: any[] = [];

            const createRtlPara = (text: string, bold = false, size = 32, alignment = AlignmentType.CENTER) => new Paragraph({
                alignment,
                bidirectional: true,
                children: [new TextRun({ text, bold, size })]
            });

            if (type === 'list') {
                children.push(createRtlPara(settings.schoolName, true, 32, AlignmentType.RIGHT));
                children.push(createRtlPara("قائمة غيابات الطلبة اليومية", true, 44));
                children.push(createRtlPara(`التاريخ: ${currentDate}`, false, 24));
                
                selectedStages.forEach(stage => {
                    children.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        bidirectional: true,
                        children: [
                            new TextRun({ text: `${stage}: `, bold: true, size: 28, color: "1e3a8a" }),
                            new TextRun({ text: stageSubjects[stage] || 'لم تحدد', bold: true, size: 28, color: "ff0000" })
                        ]
                    }));
                });
                
                children.push(new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }));

                const table = new Table({
                    width: { size: 100, type: WidthType.PERCENT },
                    tableLayout: TableLayoutType.FIXED,
                    visuallyBidirectional: true, 
                    cellSpacing: { value: cellSpacing, type: WidthType.DXA },
                    rows: [
                        new TableRow({
                            tableHeader: true,
                            children: ["ت", "اسم الطالب الغائب", "الصف", "الشعبة", "قاعة", "قطاع", "الرقم", "الحالة", "المراقب", "التوقيع"].map(h => new TableCell({
                                verticalAlign: VerticalAlign.CENTER,
                                shading: { fill: "1e3a8a" },
                                margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin },
                                children: [new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: true, children: [new TextRun({ text: h, color: "ffffff", bold: true, size: 32 })] })]
                            }))
                        }),
                        ...list.map((abs, i) => {
                            const nameParts = [new TextRun({ text: abs.studentName, size: 32 })];
                            if (abs.status === 'excused') {
                                nameParts.push(new TextRun({ text: " (مجاز)", size: 32, color: "0000ff", bold: true }));
                            }

                            return new TableRow({
                                children: [
                                    (i + 1).toString(), 
                                    { isNameCell: true, children: nameParts },
                                    abs.stage, abs.section, abs.hallNumber, abs.sectorNumber, abs.examId,
                                    abs.isExempt ? "معفو" : abs.status === 'excused' ? "مجاز" : "غائب",
                                    "", ""
                                ].map((content: any) => {
                                    const isSpecial = typeof content === 'object' && content.isNameCell;
                                    const text = isSpecial ? "" : content;
                                    
                                    return new TableCell({
                                        margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin },
                                        children: [new Paragraph({ 
                                            alignment: AlignmentType.CENTER, 
                                            bidirectional: true, 
                                            children: isSpecial ? content.children : [new TextRun({ text, size: 32, noWrap: true })] 
                                        })]
                                    });
                                })
                            });
                        })
                    ]
                });
                children.push(table);
            } else {
                children.push(createRtlPara("خلاصة الغيابات اليومية", true, 48));
                children.push(createRtlPara(`التاريخ: ${currentDate}`, true, 32));
                
                selectedStages.forEach(stage => {
                    children.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        bidirectional: true,
                        children: [
                            new TextRun({ text: `${stage}: `, bold: true, size: 28, color: "1e3a8a" }),
                            new TextRun({ text: stageSubjects[stage] || 'لم تحدد', bold: true, size: 28, color: "ff0000" })
                        ]
                    }));
                });

                children.push(new Paragraph({ children: [new TextRun({ text: "", size: 20 })] }));

                const hallSectors: Record<string, { hall: string, sector: string, totals: number[], examinees: number[] }> = {};
                const stageSlots = selectedStages.slice(0, 3);
                
                // Helper to check if a student is exempt - matching PDF logic
                const isStudentExempt = (student: any, classData: ClassData) => {
                    if (!targetField || !['finalExam1st', 'finalExam2nd'].includes(targetField)) return false;
                    const isMinisterial = ['الثالث متوسط', 'السادس العلمي', 'السادس الادبي', 'السادس ابتدائي'].some(m => classData.stage.includes(m));
                    const result = calculateStudentResult(student, classData.subjects, settings, classData, 'final');
                    const isGeneralExempt = Object.values(result.finalCalculatedGrades).some((g: any) => g.isGeneralExempt);
                    if (isGeneralExempt && !isMinisterial) return true;
                    if (targetField === 'finalExam2nd' && result.result.status === 'ناجح') return true;
                    if (targetField === 'finalExam1st' && result.result.status === 'ناجح' && !isMinisterial) return true;
                    return false;
                };

                classes.forEach(cls => {
                    if (!selectedStages.includes(cls.stage)) return;
                    const slotIdx = stageSlots.indexOf(cls.stage);
                    if (slotIdx === -1) return;

                    (cls.students || []).forEach(student => {
                        // 1. استثناء الطلاب غير المستمرين
                        if (student.enrollmentStatus && student.enrollmentStatus !== 'active') return;

                        // 2. استثناء المعفيين في الامتحان النهائي (نفس منطق الـ PDF)
                        if (isStudentExempt(student, cls)) return;

                        const assign = seatingAssignments[student.id];
                        if (!assign || !assign.hallNumber) return;
                        
                        const key = `${assign.hallNumber}-${assign.sectorNumber}`;
                        if (!hallSectors[key]) {
                            hallSectors[key] = { hall: assign.hallNumber, sector: assign.sectorNumber || '?', totals: [0,0,0], examinees: [0,0,0] };
                        }
                        hallSectors[key].totals[slotIdx]++;
                        
                        const isAbsent = absentRecords[student.id] || assign.isExcused;
                        if (!isAbsent) hallSectors[key].examinees[slotIdx]++;
                    });
                });

                const tableData = Object.values(hallSectors).sort((a,b) => {
                    const hA = parseInt(a.hall) || 0;
                    const hB = parseInt(b.hall) || 0;
                    if (hA !== hB) return hA - hB;
                    return (a.sector || '').localeCompare(b.sector || '');
                });

                // Calculate grand totals for each stage slot
                const grandGrandTotal = [0, 0, 0];
                tableData.forEach(row => {
                    row.examinees.forEach((v, i) => { grandGrandTotal[i] += v; });
                });

                const table = new Table({
                    width: { size: 100, type: WidthType.PERCENT },
                    visuallyBidirectional: true,
                    cellSpacing: { value: cellSpacing, type: WidthType.DXA },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({ margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin }, children: [createRtlPara("رقم القاعة", true, 32)], verticalAlign: VerticalAlign.CENTER }),
                                new TableCell({ margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin }, children: [createRtlPara("القطاع", true, 32)], verticalAlign: VerticalAlign.CENTER }),
                                ...stageSlots.map(s => new TableCell({ margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin }, children: [createRtlPara(s, true, 32)], verticalAlign: VerticalAlign.CENTER })),
                                new TableCell({ margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin }, children: [createRtlPara("مجموع الحاضرين", true, 32)], verticalAlign: VerticalAlign.CENTER })
                            ]
                        }),
                        ...tableData.map(row => new TableRow({
                            children: [
                                new TableCell({ margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin }, children: [createRtlPara(row.hall, false, 32)] }),
                                new TableCell({ margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin }, children: [createRtlPara(row.sector, false, 32)] }),
                                ...row.examinees.slice(0, stageSlots.length).map(v => new TableCell({ margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin }, children: [createRtlPara(v.toString(), true, 32)] })),
                                new TableCell({ 
                                    shading: { fill: "dcfce7" },
                                    margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin },
                                    children: [createRtlPara(row.examinees.reduce((a,b)=>a+b, 0).toString(), true, 32)] 
                                })
                            ]
                        })),
                        // Add Total Row
                        new TableRow({
                            children: [
                                new TableCell({ 
                                    columnSpan: 2, 
                                    shading: { fill: "f3f4f6" }, 
                                    margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin },
                                    children: [createRtlPara("المجموع الكلي للحاضرين", true, 32)] 
                                }),
                                ...stageSlots.map((_, i) => new TableCell({ 
                                    shading: { fill: "e0f2fe" },
                                    margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin },
                                    children: [createRtlPara(grandGrandTotal[i].toString(), true, 32)] 
                                })),
                                new TableCell({ 
                                    shading: { fill: "1e3a8a" },
                                    margins: { top: cellMargin, bottom: cellMargin, left: cellMargin, right: cellMargin },
                                    children: [
                                        new Paragraph({ 
                                            alignment: AlignmentType.CENTER, 
                                            bidirectional: true, 
                                            children: [new TextRun({ text: grandGrandTotal.reduce((a,b)=>a+b, 0).toString(), bold: true, size: 32, color: "ffffff" })] 
                                        })
                                    ] 
                                })
                            ]
                        })
                    ]
                });
                children.push(table);
            }

            const doc = new Document({
                sections: [{ 
                    properties: { 
                        page: { 
                            margin: { top: pageMargin, right: pageMargin, bottom: pageMargin, left: pageMargin }
                        } 
                    }, 
                    children 
                }]
            });

            const blob = await Packer.toBlob(doc);
            if (saveAsLib) {
                saveAsLib(blob, `${type === 'list' ? 'غيابات' : 'خلاصة'}_${currentDate}.docx`);
            }
        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء تصدير Word.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleExport = async (type: 'list' | 'summary') => {
        const list = getFinalAbsenceList;
        if (selectedStages.length === 0 || (list.length === 0 && type === 'list')) {
            alert("يرجى اختيار المرحلة وتأكد من وجود غيابات أو إجازات مسجلة.");
            return;
        }

        setIsExporting(true);

        const { jsPDF } = jspdf;
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const tempContainer = document.createElement('div');
        Object.assign(tempContainer.style, { position: 'absolute', left: '-9999px', top: '0' });
        document.body.appendChild(tempContainer);
        const root = ReactDOM.createRoot(tempContainer);

        const renderComponent = (component: React.ReactElement) => new Promise<void>(resolve => {
            root.render(component);
            setTimeout(resolve, 800);
        });

        try {
            await document.fonts.ready;

            if (type === 'list') {
                await renderComponent(
                    <AbsenceListPage 
                        settings={settings}
                        stages={selectedStages}
                        stageSubjects={stageSubjects}
                        date={currentDate}
                        absences={list}
                    />
                );
                
                const pages = tempContainer.querySelectorAll('.pdf-page');
                for (let i = 0; i < pages.length; i++) {
                    if (i > 0) pdf.addPage();
                    const canvas = await html2canvas(pages[i] as HTMLElement, { scale: 2, useCORS: true });
                    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
                }
            } else {
                await renderComponent(
                    <AbsenceSummaryPage 
                        settings={settings}
                        stages={selectedStages}
                        stageSubjects={stageSubjects}
                        date={currentDate}
                        absences={list}
                        allClasses={classes}
                        seating={seatingAssignments}
                        targetField={targetField}
                    />
                );
                
                const pages = tempContainer.querySelectorAll('.summary-page');
                for (let i = 0; i < pages.length; i++) {
                    if (i > 0) pdf.addPage();
                    const canvas = await html2canvas(pages[i] as HTMLElement, { scale: 2, useCORS: true });
                    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'FAST');
                }
            }

            pdf.save(`${type === 'list' ? 'قائمة_غياب' : 'خلاصة_غيابات'}.pdf`);

        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء التصدير.");
        } finally {
            root.unmount();
            document.body.removeChild(tempContainer);
            setIsExporting(false);
        }
    };

    const handleStageToggle = (stage: string) => {
        setSelectedStages(prev => {
            if (prev.includes(stage)) {
                const newStages = prev.filter(s => s !== stage);
                const newSubjects = { ...stageSubjects };
                delete newSubjects[stage];
                setStageSubjects(newSubjects);
                return newStages;
            } else {
                return [...prev, stage];
            }
        });
    };

    const handleSubjectChange = (stage: string, subject: string) => {
        setStageSubjects(prev => ({ ...prev, [stage]: subject }));
    };

    useEffect(() => {
        if (isScannerActive && activeTab === 'scanning') {
            if (cameras.length === 0) fetchCameras();
            startScanner();
        } else {
            stopScanner();
        }
        return () => { stopScanner(); };
    }, [isScannerActive, activeTab, selectedCameraId]);

    return (
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-xl max-w-6xl mx-auto border-t-4 border-amber-500 font-['Cairo']">
            {(isExporting || isApproving) && (
                <div className="fixed inset-0 bg-black/60 z-[200] flex flex-col items-center justify-center text-white">
                    <Loader2 className="w-16 h-16 animate-spin mb-4" />
                    <p className="text-xl font-bold">{isApproving ? 'جاري اعتماد الدرجات...' : 'جاري المعالجة والتصدير...'}</p>
                </div>
            )}

            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b">
                <div className="flex items-center gap-3">
                    <div className="bg-amber-100 p-2 rounded-lg"><UserMinus className="text-amber-600 w-8 h-8" /></div>
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800">تسجيل غيابات الامتحانات</h2>
                        <p className="text-sm text-gray-500">إدارة القاعات وتسجيل الغيابات بـ QR</p>
                    </div>
                </div>
                
                <div className="flex bg-gray-100 p-1.5 rounded-xl w-full sm:w-auto shadow-inner">
                    <button onClick={() => setActiveTab('seating')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all ${activeTab === 'seating' ? 'bg-white text-amber-600 shadow-md transform scale-105' : 'text-gray-500'}`}><Layout size={20} /><span>توزيع القاعات</span></button>
                    <button onClick={() => setActiveTab('scanning')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all ${activeTab === 'scanning' ? 'bg-white text-amber-600 shadow-md transform scale-105' : 'text-gray-500'}`}><QrCode size={20} /><span>مسح الغيابات</span></button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm">
                <div>
                    <label className="block text-sm font-black text-gray-600 mb-2">اختر المراحل الدراسية الخاصة بالمدرسة:</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-white p-3 rounded-xl border border-gray-200 max-h-32 overflow-y-auto">
                        {filteredGradeLevels.map(g => (
                            <label key={g} className={`flex items-center gap-2 p-1.5 rounded-lg border cursor-pointer transition-all ${selectedStages.includes(g) ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}>
                                <input type="checkbox" checked={selectedStages.includes(g)} onChange={() => handleStageToggle(g)} className="w-4 h-4 text-amber-600" />
                                <span className="text-xs font-bold">{g}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-black text-gray-600 mb-2">تاريخ اليوم:</label>
                    <input type="date" value={currentDate} onChange={e => setCurrentDate(e.target.value)} className="w-full p-3 border-2 border-gray-200 rounded-xl bg-white focus:border-amber-500 outline-none h-[88px]" />
                </div>
            </div>

            {selectedStages.length > 0 && (
                <div className="mb-8 bg-blue-50 p-6 rounded-2xl border border-blue-100">
                    <h3 className="text-xl font-bold text-blue-900 mb-4 flex items-center gap-2">
                        <BookOpen className="text-blue-600" /> تحديد المواد الامتحانية لهذا اليوم
                    </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {selectedStages.map(stage => {
                            const availableSubjects = Array.from(new Set(
                                classes
                                    .filter(c => c.stage === stage)
                                    .flatMap(c => c.subjects.map(s => s.name))
                            )).sort();

                            return (
                                <div key={stage} className="bg-white p-4 rounded-xl border border-blue-200 shadow-sm">
                                    <label className="block text-sm font-black text-blue-800 mb-2">{stage}</label>
                                    <select 
                                        value={stageSubjects[stage] || ''} 
                                        onChange={(e) => handleSubjectChange(stage, e.target.value)}
                                        className="w-full p-2 border rounded-lg focus:border-blue-500 outline-none font-bold text-gray-700 bg-gray-50"
                                    >
                                        <option value="">اختر المادة...</option>
                                        {availableSubjects.map(sub => (
                                            <option key={sub} value={sub}>{sub}</option>
                                        ))}
                                    </select>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {selectedStages.length === 0 ? (
                <div className="text-center p-20 bg-gray-100 rounded-2xl border-4 border-dashed border-gray-300">
                    <Info className="mx-auto w-16 h-16 text-gray-400 mb-4" />
                    <h3 className="text-xl font-bold text-gray-500">يرجى اختيار مرحلة واحدة على الأقل للبدء</h3>
                </div>
            ) : activeTab === 'seating' ? (
                <div className="space-y-6">
                    <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <div className="text-sm font-bold text-blue-800 flex items-center gap-2">
                            <AlertTriangle size={16} />
                            <span>وزع الطلاب على القاعات، وأشر على "مجاز" لمن لديه عذر رسمي لليوم.</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button 
                                onClick={handleImportSmartSeating} 
                                disabled={isImporting || isSavingSeating} 
                                className="bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-bold shadow-md hover:bg-indigo-700 transition flex items-center gap-2"
                                title="استيراد التوزيع من مدير القاعات الذكي"
                            >
                                {isImporting ? <Loader2 className="animate-spin" /> : <RefreshCw size={20} />}
                                <span>استيراد التوزيع الذكي</span>
                            </button>
                            <button onClick={handleSaveSeating} disabled={isSavingSeating || isImporting} className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-bold shadow-md hover:bg-green-700 transition flex items-center gap-2">
                                {isSavingSeating ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                                <span>حفظ التوزيع والاجازات</span>
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto border rounded-xl shadow-inner">
                        <table className="w-full text-right">
                            <thead className="bg-gray-800 text-white">
                                <tr>
                                    <th className="p-3 text-center w-12">ت</th>
                                    <th className="p-3">اسم الطالب</th>
                                    <th className="p-3">المرحلة</th>
                                    <th className="p-3 text-center">الرقم الامتحاني</th>
                                    <th className="p-3 text-center w-32">رقم القاعة</th>
                                    <th className="p-3 text-center w-32">رقم القطاع</th>
                                    <th className="p-3 text-center w-24 bg-blue-700">مجاز</th>
                                    <th className="p-3 text-center w-12">حذف</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {activeStudents.map((s, i) => (
                                    <tr key={s.id} className={`hover:bg-amber-50 transition-colors ${seatingAssignments[s.id]?.isExcused ? 'bg-blue-50' : seatingAssignments[s.id]?.isExempt ? 'bg-purple-50' : ''}`}>
                                        <td className="p-3 text-center font-bold text-gray-400">{i + 1}</td>
                                        <td className={`p-3 font-bold ${seatingAssignments[s.id]?.isExcused ? 'text-blue-700' : seatingAssignments[s.id]?.isExempt ? 'text-purple-700' : 'text-gray-700'}`}>
                                            {s.name} 
                                            {seatingAssignments[s.id]?.isExcused && ' (مجاز)'}
                                            {seatingAssignments[s.id]?.isExempt && ' (معفو)'}
                                        </td>
                                        <td className="p-3 text-xs font-bold text-cyan-600">{classes.find(c => c.students?.some(stu => stu.id === s.id))?.stage}</td>
                                        <td className="p-3 text-center font-mono font-bold text-cyan-700">{s.examId}</td>
                                        <td className="p-2">
                                            <input 
                                                type="text" 
                                                value={seatingAssignments[s.id]?.hallNumber || ''} 
                                                onChange={e => handleSeatingChange(s.id, 'hallNumber', e.target.value)}
                                                className="w-full text-center p-2 border rounded-lg focus:border-amber-500 outline-none"
                                                placeholder="1"
                                            />
                                        </td>
                                        <td className="p-2">
                                            <input 
                                                type="text" 
                                                value={seatingAssignments[s.id]?.sectorNumber || ''} 
                                                onChange={e => handleSeatingChange(s.id, 'sectorNumber', e.target.value)}
                                                className="w-full text-center p-2 border rounded-lg focus:border-amber-500 outline-none"
                                                placeholder="A"
                                            />
                                        </td>
                                        <td className="p-2 text-center">
                                            <div className="flex flex-col gap-1 items-center">
                                                <label className="flex items-center gap-1 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={!!seatingAssignments[s.id]?.isExcused}
                                                        onChange={e => handleSeatingChange(s.id, 'isExcused', e.target.checked)}
                                                        className="w-5 h-5 text-blue-600 rounded"
                                                    />
                                                    <span className="text-[9px] font-bold text-blue-600">مجاز</span>
                                                </label>
                                                <label className="flex items-center gap-1 cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={!!seatingAssignments[s.id]?.isExempt}
                                                        onChange={e => handleSeatingChange(s.id, 'isExempt', e.target.checked)}
                                                        className="w-5 h-5 text-purple-600 rounded"
                                                    />
                                                    <span className="text-[9px] font-bold text-purple-600">معفو</span>
                                                </label>
                                            </div>
                                        </td>
                                        <td className="p-2 text-center">
                                            <button 
                                                onClick={() => {
                                                    if (confirm(`هل أنت متأكد من استبعاد الطالب "${s.name}" من قوائم اليوم؟`)) {
                                                        setManuallyExcludedIds(prev => [...prev, s.id]);
                                                    }
                                                }}
                                                className="text-red-400 hover:text-red-600 transition-colors p-1"
                                                title="حذف من القائمة"
                                            >
                                                <UserX size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white p-6 rounded-xl border shadow-md text-center flex flex-col items-center">
                        <h3 className="font-bold mb-4 text-xl flex items-center gap-2"><Camera className="text-amber-500" /> ماسح غيابات القاعات</h3>
                        
                        <div className="mb-4 w-full space-y-4">
                            <div className="flex gap-2">
                                <button onClick={() => setIsScannerActive(!isScannerActive)} className={`flex-1 py-3 rounded-full font-bold text-lg transition-all shadow-md flex items-center justify-center gap-2 ${isScannerActive ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-green-600 text-white hover:bg-green-700'}`}>
                                    {isScannerActive ? <X /> : <Camera />}
                                    <span>{isScannerActive ? 'إيقاف الكاميرا' : 'بدء المسح'}</span>
                                </button>
                                <button onClick={fetchCameras} className="p-3 bg-gray-100 text-gray-600 rounded-full hover:bg-gray-200 transition-colors shadow-inner"><RefreshCw size={24} className={isLoadingCameras ? 'animate-spin' : ''}/></button>
                            </div>
                            {isScannerActive && (
                                <select value={selectedCameraId} onChange={(e) => setSelectedCameraId(e.target.value)} className="w-full p-2 text-sm border-2 border-gray-100 rounded-xl bg-gray-50 font-bold outline-none">
                                    {cameras.map(cam => <option key={cam.id} value={cam.id}>{cam.label || `كاميرا ${cam.id.substring(0,5)}`}</option>)}
                                </select>
                            )}
                        </div>

                        <div className="relative w-full aspect-square max-w-[350px] bg-black rounded-3xl overflow-hidden border-8 border-gray-800 shadow-2xl flex items-center justify-center">
                            <div id="exam-qr-reader" className="w-full h-full"></div>
                            {!isScannerActive && <div className="absolute inset-0 flex items-center justify-center"><QrCode size={120} className="text-gray-700 opacity-20" /></div>}
                        </div>

                        {lastScannedStudent && (
                            <div className={`mt-6 w-full p-4 border-2 rounded-2xl animate-in zoom-in slide-in-from-bottom-2 duration-300 ${lastScannedStudent.status === 'excused' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full text-white shadow-lg ${lastScannedStudent.status === 'excused' ? 'bg-blue-600' : 'bg-green-500'}`}>
                                        {lastScannedStudent.status === 'excused' ? <UserCheck /> : <CheckCircle />}
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-black ${lastScannedStudent.status === 'excused' ? 'text-blue-600' : 'text-green-600'}`}>
                                            تم تسجيل {lastScannedStudent.status === 'excused' ? 'إجازة' : 'غياب'}:
                                        </p>
                                        <h4 className={`text-lg font-black ${lastScannedStudent.status === 'excused' ? 'text-blue-900' : 'text-green-900'}`}>{lastScannedStudent.studentName}</h4>
                                        <p className="text-xs font-bold text-gray-500">القاعة: {lastScannedStudent.hallNumber} | القطاع: {lastScannedStudent.sectorNumber}</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-md border-r-4 border-cyan-600">
                            <h3 className="font-bold text-xl mb-4 flex items-center gap-2"><CheckCircle className="text-cyan-600" /> اعتماد النتائج في السجل</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-600 mb-1">الحقل المطلوب تسجيل الغياب فيه:</label>
                                    <select value={targetField} onChange={e => setTargetField(e.target.value)} className="w-full p-2 border rounded-lg bg-gray-50 font-bold">
                                        {FIELD_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                                    </select>
                                </div>
                                <button 
                                    onClick={handleApproveAbsences}
                                    disabled={isApproving || getFinalAbsenceList.length === 0}
                                    className="w-full py-3 bg-cyan-600 text-white font-black text-lg rounded-xl shadow-lg hover:bg-cyan-700 transition flex items-center justify-center gap-2 disabled:bg-gray-300"
                                >
                                    <Save />
                                    <span>اعتماد الغيابات والاجازات</span>
                                </button>
                                <p className="text-[10px] text-gray-400 italic text-center">سيتم كتابة (غ) للغائب و (م) للمجاز في سجلات الشعب مباشرة.</p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-md">
                            <h3 className="font-bold text-xl mb-4 flex items-center gap-2"><FileDown className="text-red-500" /> تصدير التقارير</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                                    <h4 className="font-bold text-red-800 text-sm mb-2 flex items-center gap-2"><FileText size={16}/> قائمة الغياب اليومية</h4>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleExport('list')} className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-bold text-xs">
                                            <FileDown size={14}/> PDF
                                        </button>
                                        <button onClick={() => handleExportWord('list')} className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition font-bold text-xs">
                                            <FileType size={14}/> Word
                                        </button>
                                    </div>
                                </div>

                                <div className="p-3 bg-cyan-50 rounded-xl border border-cyan-100">
                                    <h4 className="font-bold text-cyan-800 text-sm mb-2 flex items-center gap-2"><ListChecks size={16}/> خلاصة الغيابات النهائية</h4>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleExport('summary')} className="flex-1 flex items-center justify-center gap-2 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition font-bold text-xs">
                                            <FileDown size={14}/> PDF
                                        </button>
                                        <button onClick={() => handleExportWord('summary')} className="flex-1 flex items-center justify-center gap-2 py-2 bg-indigo-700 text-white rounded-lg hover:bg-indigo-800 transition font-bold text-xs">
                                            <FileType size={14}/> Word
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 p-6 rounded-2xl border shadow-inner flex-grow flex flex-col">
                            <h3 className="font-bold text-xl mb-4 flex justify-between items-center">
                                <span>الغيابات والاجازات المسجلة ({getFinalAbsenceList.length})</span>
                                <span className="text-[10pt] font-normal text-gray-500">{currentDate}</span>
                            </h3>
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[400px]">
                                {getFinalAbsenceList.reverse().map(record => (
                                    <div key={record.studentId} className={`bg-white p-3 border-2 rounded-xl shadow-sm flex justify-between items-center group transition ${record.status === 'excused' ? 'border-blue-200' : record.isExempt ? 'border-purple-200' : 'border-gray-100 hover:border-red-200'}`}>
                                        <div className="text-right">
                                            <p className={`font-black text-sm ${record.status === 'excused' ? 'text-blue-700' : record.isExempt ? 'text-purple-700' : 'text-gray-800'}`}>
                                                {record.studentName} 
                                                {record.status === 'excused' && ' (مجاز)'}
                                                {record.isExempt && ' (معفو)'}
                                            </p>
                                            <p className="text-[10px] font-bold text-gray-500">القاعة: {record.hallNumber} | القطاع: {record.sectorNumber}</p>
                                            <p className="text-[10px] font-mono font-black text-blue-600 mt-0.5">{record.examId}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={async () => {
                                                    const path = `exam_absences/${principalId}/${record.stage}/${currentDate}/${record.studentId}/isExempt`;
                                                    await db.ref(path).set(!record.isExempt);
                                                }}
                                                className={`p-2 rounded-lg transition ${record.isExempt ? 'bg-purple-100 text-purple-600' : 'bg-gray-50 text-gray-400 hover:text-purple-500'}`}
                                                title="تأشير معفو"
                                            >
                                                <UserCheck size={18} />
                                            </button>
                                            {absentRecords[record.studentId] && (
                                                <button onClick={() => removeAbsence(record.studentId, record.stage)} className="text-gray-300 hover:text-red-500 transition-colors p-2"><Trash2 size={18}/></button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
