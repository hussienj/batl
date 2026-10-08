
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import type { ClassData, Student, SubjectGrade, SchoolSettings, CalculatedGrade, StudentResult, TeacherSubmission, TeacherSubjectGrade } from '../types.ts';
import { calculateStudentResult } from '../lib/gradeCalculator.ts';
import { UserPlus, Trash2, ChevronLeft, ChevronRight, Download, Edit, ShieldCheck, Loader2, Pin, PinOff, ArrowLeftRight, FileText, ArrowDownAZ, ArrowDown10, BookOpen, Filter } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../lib/firebase.ts';
import { exportSingleSectionWord } from '../lib/studentRosterExporter.ts';

declare const XLSX: any;

interface GradeSheetProps {
    classData: ClassData;
    settings: SchoolSettings;
    allClasses?: ClassData[];
}

const DEFAULT_SUBJECT_GRADE: SubjectGrade = {
    firstTerm: null, midYear: null, secondTerm: null, finalExam1st: null, finalExam2nd: null,
    october: null, november: null, december: null, january: null, february: null, march: null, april: null,
};

const DEFAULT_CALCULATED_GRADE: CalculatedGrade = {
    annualPursuit: null, finalGrade1st: null, finalGradeWithDecision: null, decisionApplied: 0,
    finalGrade2nd: null, isExempt: false,
};

// Stage Type Constants
const PRIMARY_1_4_STAGES = ['الاول ابتدائي', 'الثاني ابتدائي', 'الثالث ابتدائي', 'الرابع ابتدائي'];
const PRIMARY_5_STAGE = 'الخامس ابتدائي';
const PRIMARY_6_STAGE = 'السادس ابتدائي';
const MINISTERIAL_STAGES = ['الثالث متوسط', 'السادس العلمي', 'السادس الادبي', PRIMARY_6_STAGE];


const GradeInput: React.FC<{
    studentId: string;
    subjectName: string;
    field: keyof SubjectGrade;
    value: number | null;
    onGradeChange: (studentId: string, subjectName: string, field: keyof SubjectGrade, value: number | boolean | null) => void;
    onEnterPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    onAutoAdvance: (input: HTMLInputElement | null) => void;
    max: number;
    schoolGender?: string;
}> = ({ studentId, subjectName, field, value, onGradeChange, onEnterPress, onAutoAdvance, max, schoolGender }) => {
    
    const valueToString = useCallback((val: number | null | undefined): string => {
        if (val === null || val === undefined) return '';
        if (val === -1) return schoolGender === 'بنات' ? 'غائبة' : 'غائب';
        if (val === -2) return schoolGender === 'بنات' ? 'مجازة' : 'مجاز';
        return String(val);
    }, [schoolGender]);

    const [localValue, setLocalValue] = useState(valueToString(value));

    useEffect(() => {
        setLocalValue(valueToString(value));
    }, [value, valueToString]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const inputElement = e.currentTarget;
        setLocalValue(val);

        if (val === '') return;
        
        // Handle quick characters
        if (val === 'ع') {
            onGradeChange(studentId, subjectName, 'isExempt' as any, true);
            setLocalValue('');
            return;
        }
        if (val === 'غ') {
            onGradeChange(studentId, subjectName, field, -1);
            setTimeout(() => onAutoAdvance(inputElement), 0);
            return;
        }
        if (val === 'م') {
            onGradeChange(studentId, subjectName, field, -2);
            setTimeout(() => onAutoAdvance(inputElement), 0);
            return;
        }

        const numericValue = parseInt(val, 10);
        if (isNaN(numericValue) || numericValue > max || numericValue < 0) {
            return;
        }

        let shouldAdvance = false;
        if (max === 100) {
            if (numericValue >= 11) {
                shouldAdvance = true;
            }
        } else if (max === 10) {
            if (numericValue === 10) {
                shouldAdvance = true;
            }
        }

        if (shouldAdvance) {
            onGradeChange(studentId, subjectName, field, numericValue);
            setTimeout(() => onAutoAdvance(inputElement), 0);
        }
    };

    const handleBlur = () => {
        const trimmed = localValue.trim();
        if (trimmed === '') {
             onGradeChange(studentId, subjectName, field, null);
             return;
        }

        if (trimmed === 'غ' || trimmed === 'غائب' || trimmed === 'غائبة') {
            onGradeChange(studentId, subjectName, field, -1);
            return;
        }
        if (trimmed === 'م' || trimmed === 'مجاز' || trimmed === 'مجازة') {
            onGradeChange(studentId, subjectName, field, -2);
            return;
        }
        
        let numericValue = parseInt(trimmed, 10);
        if (isNaN(numericValue) || numericValue < 0) {
            numericValue = 0;
        } else if (numericValue > max) {
            numericValue = max;
        }
        
        onGradeChange(studentId, subjectName, field, numericValue);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.repeat && e.key >= '0' && e.key <= '9') {
            e.preventDefault();
            return;
        }
        if (e.key === 'Enter') {
            const trimmed = localValue.trim();
            if (trimmed === 'غ') {
                onGradeChange(studentId, subjectName, field, -1);
                onAutoAdvance(e.currentTarget);
                return;
            }
            if (trimmed === 'م') {
                onGradeChange(studentId, subjectName, field, -2);
                onAutoAdvance(e.currentTarget);
                return;
            }
        }
        onEnterPress(e);
    };

    const getBgColor = () => {
        if (value === -1) return 'bg-red-500 text-white font-bold';
        if (value === -2) return 'bg-orange-500 text-white font-bold';
        return 'bg-transparent';
    };
    
    return (
        <input
            type="text"
            value={localValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            data-student-id={studentId}
            data-subject-name={subjectName}
            data-field={field}
            className={`w-full h-full text-center border-0 focus:ring-1 focus:ring-inset focus:ring-cyan-500 p-1 outline-none transition-colors ${getBgColor()}`}
        />
    );
};


export default function GradeSheet({ classData, settings, allClasses }: GradeSheetProps): React.ReactNode {
    const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
    const [newStudentData, setNewStudentData] = useState({ name: '', registrationId: '', birthDate: '', examId: '', yearsOfFailure: 'لا يوجد رسوب', notes: '' });
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [showScrollButtons, setShowScrollButtons] = useState(false);
    const [isHeaderPinned, setIsHeaderPinned] = useState(true);
    
    // Sort & Filter state
    type SortMode = 'examId' | 'alphabetical';
    const [sortMode, setSortMode] = useState<SortMode>('examId');
    const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');

    const [localStudents, setLocalStudents] = useState<Student[]>([]);
    const [isPushing, setIsPushing] = useState(false);

    const [isEditStudentModalOpen, setIsEditStudentModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [editedStudentData, setEditedStudentData] = useState({ name: '', registrationId: '', birthDate: '', examId: '', yearsOfFailure: 'لا يوجد رسوب', notes: '' });

    // Transfer student states
    const [transferStudent, setTransferStudent] = useState<Student | null>(null);
    const [targetClassId, setTargetClassId] = useState<string>('');
    const [isTransferring, setIsTransferring] = useState<boolean>(false);
    const [fetchedClasses, setFetchedClasses] = useState<ClassData[]>([]);

    useEffect(() => {
        if (classData.principalId) {
            db.ref('classes').get().then(snap => {
                if (snap.exists()) {
                    const val = snap.val();
                    const list: ClassData[] = Object.values(val);
                    setFetchedClasses(list.filter(c => c.principalId === classData.principalId));
                }
            }).catch(console.error);
        }
    }, [classData.principalId]);

    const targetSections = useMemo(() => {
        const list = (allClasses && allClasses.length > 0) ? allClasses : fetchedClasses;
        return list.filter(c => c.stage === classData.stage && c.id !== classData.id);
    }, [allClasses, fetchedClasses, classData.stage, classData.id]);

    const handleConfirmTransfer = async () => {
        if (!transferStudent || !targetClassId) {
            alert("يرجى اختيار الشعبة المراد نقل الطالب إليها.");
            return;
        }
        const list = (allClasses && allClasses.length > 0) ? allClasses : fetchedClasses;
        const targetClass = list.find(c => c.id === targetClassId);
        if (!targetClass) {
            alert("الشعبة المحددة غير موجودة.");
            return;
        }

        if (!confirm(`هل أنت متأكد من نقل الطالب (${transferStudent.name}) من الشعبة (${classData.section}) إلى الشعبة (${targetClass.section})؟\n\nتنبيه: ستبقى جميع الدرجات والرمز السري والبيانات محفوظة بالكامل.`)) {
            return;
        }

        setIsTransferring(true);
        try {
            const updatedSourceStudents = (classData.students || []).filter(s => s.id !== transferStudent.id);
            const existingTargetStudents = targetClass.students || [];
            const filteredTargetStudents = existingTargetStudents.filter(s => s.id !== transferStudent.id);
            const updatedTargetStudents = [...filteredTargetStudents, transferStudent].sort((a, b) =>
                (a.examId || '').localeCompare(b.examId || '', undefined, { numeric: true })
            );

            const updates: Record<string, any> = {};
            updates[`classes/${classData.id}/students`] = updatedSourceStudents;
            updates[`classes/${targetClass.id}/students`] = updatedTargetStudents;

            if (transferStudent.studentAccessCode) {
                updates[`student_access_codes_individual/${transferStudent.studentAccessCode}/classId`] = targetClass.id;
            }

            await db.ref().update(updates);

            alert(`تم نقل الطالب (${transferStudent.name}) بنجاح إلى الشعبة (${targetClass.section}).`);
            setTransferStudent(null);
            setTargetClassId('');
        } catch (error) {
            console.error("Transfer error:", error);
            alert("حدث خطأ أثناء نقل الطالب. يرجى المحاولة مرة أخرى.");
        } finally {
            setIsTransferring(false);
        }
    };


    const sortStudentList = useCallback((list: Student[], mode: SortMode) => {
        return [...list].sort((a, b) => {
            if (mode === 'alphabetical') {
                return (a.name || '').trim().localeCompare((b.name || '').trim(), 'ar', { sensitivity: 'base' });
            } else {
                const examA = (a.examId || '').trim();
                const examB = (b.examId || '').trim();
                if (!examA && !examB) return (a.name || '').localeCompare(b.name || '', 'ar');
                if (!examA) return 1;
                if (!examB) return -1;
                return examA.localeCompare(examB, undefined, { numeric: true });
            }
        });
    }, []);

    const handleSortChange = (newMode: SortMode) => {
        setSortMode(newMode);
        setLocalStudents(prev => sortStudentList(prev, newMode));
    };

    useEffect(() => {
        const raw = classData.students || [];
        setLocalStudents(sortStudentList(raw, sortMode));
    }, [classData.students, sortMode, sortStudentList]);

    const subjects = useMemo(() => classData.subjects || [], [classData.subjects]);
    
    const displayedSubjects = useMemo(() => {
        if (selectedSubjectFilter === 'ALL') {
            return subjects;
        }
        return subjects.filter(s => s.name === selectedSubjectFilter || s.id === selectedSubjectFilter);
    }, [subjects, selectedSubjectFilter]);
    
    const results = useMemo(() => {
        const studentResults: Record<string, { finalCalculatedGrades: Record<string, CalculatedGrade>, result: StudentResult }> = {};
        localStudents.forEach(student => {
            studentResults[student.id] = calculateStudentResult(student, subjects, settings, classData);
        });
        return studentResults;
    }, [localStudents, subjects, settings, classData]);

    const stageType = useMemo(() => {
        if (PRIMARY_1_4_STAGES.includes(classData.stage)) return 'primary1_4';
        if (classData.stage === PRIMARY_5_STAGE) return 'primary5';
        if (classData.stage === PRIMARY_6_STAGE) return 'primary6';
        if (MINISTERIAL_STAGES.includes(classData.stage)) return 'ministerial';
        return 'standard';
    }, [classData.stage]);

    const maxGrade = stageType === 'primary1_4' ? 10 : 100;
    
    const columnConfig = useMemo(() => {
        switch(stageType) {
            case 'primary1_4': return [
                { key: 'midYear', header: 'نصف السنة', type: 'input' },
                { key: 'finalExam1st', header: 'الامتحان النهائي', type: 'input' },
                { key: 'finalExam2nd', header: 'الاكمال', type: 'input' },
            ];
            case 'primary5': return [
                { key: 'october', header: 'تشرين الاول', type: 'input' },
                { key: 'november', header: 'تشرين الثاني', type: 'input' },
                { key: 'december', header: 'كانون الاول', type: 'input' },
                { key: 'january', header: 'كانون الثاني', type: 'input' },
                { key: 'firstTerm', header: 'الفصل الاول', type: 'input' },
                { key: 'midYear', header: 'نصف السنة', type: 'input' },
                { key: 'february', header: 'شباط', type: 'input' },
                { key: 'march', header: 'اذار', type: 'input' },
                { key: 'april', header: 'نيسان', type: 'input' },
                { key: 'secondTerm', header: 'الفصل الثاني', type: 'input' },
                { key: 'annualPursuit', header: 'السعي السنوي', type: 'calculated-result' },
                { key: 'finalExam1st', header: 'الامتحان النهائي', type: 'input' },
                { key: 'finalGradeWithDecision', header: 'الدرجة النهائية', type: 'calculated-final' },
                { key: 'finalExam2nd', header: 'الاكمال', type: 'input' },
                { key: 'finalGrade2nd', header: 'الدرجة بعد الاكمال', type: 'calculated-result' },
            ];
            case 'primary6': return [
                 { key: 'october', header: 'تشرين الاول', type: 'input' },
                 { key: 'november', header: 'تشرين الثاني', type: 'input' },
                 { key: 'december', header: 'كانون الاول', type: 'input' },
                 { key: 'january', header: 'كانون الثاني', type: 'input' },
                 { key: 'firstTerm', header: 'الفصل الاول', type: 'input' },
                 { key: 'midYear', header: 'نصف السنة', type: 'input' },
                 { key: 'february', header: 'شباط', type: 'input' },
                 { key: 'march', header: 'اذار', type: 'input' },
                 { key: 'april', header: 'نيسان', type: 'input' },
                 { key: 'secondTerm', header: 'الفصل الثاني', type: 'input' },
                 { key: 'annualPursuit', header: 'السعي السنوي', type: 'calculated-result' },
            ];
            case 'ministerial': return [
                 { key: 'firstTerm', header: 'الفصل الأول', type: 'input' },
                 { key: 'midYear', header: 'نصف السنة', type: 'input' },
                 { key: 'secondTerm', header: 'الفصل الثاني', type: 'input' },
                 { key: 'annualPursuit', header: 'السعي السنوي', type: 'calculated-result' }
            ];
            case 'standard':
            default: return [
                 { key: 'firstTerm', header: 'الفصل الأول', type: 'input' },
                 { key: 'midYear', header: 'نصف السنة', type: 'input' },
                 { key: 'secondTerm', header: 'الفصل الثاني', type: 'input' },
                 { key: 'annualPursuit', header: 'السعي السنوي', type: 'calculated-result' },
                 { key: 'finalExam1st', header: 'الامتحان النهائي', type: 'input-exempt' },
                 { key: 'finalGradeWithDecision', header: 'الدرجة النهائية', type: 'calculated-final' },
                 { key: 'finalExam2nd', header: 'الاكمال', type: 'input' },
                 { key: 'finalGrade2nd', header: 'الدرجة بعد الاكمال', type: 'calculated-result' },
            ];
        }
    }, [stageType]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const checkScroll = () => container && setShowScrollButtons(container.scrollWidth > container.clientWidth);
        const resizeObserver = new ResizeObserver(checkScroll);
        resizeObserver.observe(container);
        checkScroll();
        return () => resizeObserver.disconnect();
    }, [localStudents, subjects, columnConfig]);


    const handleGradeChange = useCallback((studentId: string, subjectName: string, field: keyof SubjectGrade, value: number | boolean | null) => {
        // 1. Update local state for immediate UI feedback
        setLocalStudents(prevStudents =>
            prevStudents.map(student => {
                if (student.id === studentId) {
                    const newGrades = { ...student.grades };
                    if (!newGrades[subjectName]) {
                        newGrades[subjectName] = { ...DEFAULT_SUBJECT_GRADE };
                    }
                    const newSubjectGrade = { ...newGrades[subjectName], [field]: value } as SubjectGrade;
                    newGrades[subjectName] = newSubjectGrade;
                    return { ...student, grades: newGrades };
                }
                return student;
            })
        );

        // 2. Persist to Firebase (this is the auto-save)
        const originalStudentIndex = (classData.students || []).findIndex(s => s.id === studentId);
        if (originalStudentIndex === -1) return;
        const gradePath = `classes/${classData.id}/students/${originalStudentIndex}/grades/${subjectName}/${String(field)}`;
        db.ref(gradePath).set(value);
    }, [classData.id, classData.students]);

    const handleAutoAdvance = useCallback((currentInput: HTMLInputElement | null) => {
        if (!currentInput?.form) return;
        const { studentId, subjectName, field } = currentInput.dataset;
        if (!studentId || !subjectName || !field) return;
        
        const currentStudentIndex = localStudents.findIndex(s => s.id === studentId);
        
        // Find the next eligible student (skip dismissed/transferred AND exempt)
        let nextIndex = currentStudentIndex + 1;
        while (nextIndex < localStudents.length) {
            const nextStudent = localStudents[nextIndex];
            const status = nextStudent.enrollmentStatus;
            const isInactive = status && status !== 'active';
            
            // Check for exemption if we are entering final exam grades
            let isExempt = false;
            if (field === 'finalExam1st') {
                const calculated = results[nextStudent.id]?.finalCalculatedGrades[subjectName];
                if (calculated?.isExempt) {
                    isExempt = true;
                }
            }

            if (!isInactive && !isExempt) {
                break;
            }
            nextIndex++;
        }

        if (currentStudentIndex !== -1 && nextIndex < localStudents.length) {
            const nextStudentId = localStudents[nextIndex].id;
            const nextInput = currentInput.form.querySelector(`input[data-student-id="${nextStudentId}"][data-subject-name="${subjectName}"][data-field="${field}"]`) as HTMLInputElement;
            if (nextInput) { nextInput.focus(); nextInput.select(); }
        }
    }, [localStudents, results]);

    const handleEnterPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') { e.preventDefault(); handleAutoAdvance(e.currentTarget); }
    };
    
    const handleAddStudent = useCallback(() => {
        if (!newStudentData.name.trim()) { alert('يرجى إدخال اسم الطالب على الأقل.'); return; }
        const studentToAdd: Student = {
            id: uuidv4(), name: newStudentData.name.trim(), registrationId: newStudentData.registrationId.trim(),
            birthDate: newStudentData.birthDate.trim(), examId: newStudentData.examId.trim(), 
            yearsOfFailure: newStudentData.yearsOfFailure,
            notes: newStudentData.notes.trim(),
            grades: {},
        };
        const updatedStudents = sortStudentList([...(classData.students || []), studentToAdd], sortMode);
        db.ref(`classes/${classData.id}`).update({ students: updatedStudents });
        setIsAddStudentModalOpen(false);
        setNewStudentData({ name: '', registrationId: '', birthDate: '', examId: '', yearsOfFailure: 'لا يوجد رسوب', notes: '' });
    }, [newStudentData, classData, sortMode, sortStudentList]);

    const handleDeleteStudent = useCallback((studentIdToDelete: string) => {
        if (window.confirm('هل أنت متأكد من حذف هذا الطالب وجميع درجاته؟ لا يمكن التراجع عن هذا الإجراء.')) {
            const updatedStudents = (classData.students || []).filter(s => s.id !== studentIdToDelete);
            db.ref(`classes/${classData.id}`).update({ students: updatedStudents });
        }
    }, [classData]);

    const handleStatusChange = (studentId: string, status: string) => {
        setLocalStudents(prev => prev.map(s => s.id === studentId ? { ...s, enrollmentStatus: status as any } : s));
        
        const originalStudentIndex = (classData.students || []).findIndex(s => s.id === studentId);
        if (originalStudentIndex !== -1) {
            db.ref(`classes/${classData.id}/students/${originalStudentIndex}/enrollmentStatus`).set(status);
        }
    };

    const handleExportWord = useCallback(() => {
        if (!localStudents || localStudents.length === 0) {
            alert('لا يوجد طلاب في هذه الشعبة للتصدير.');
            return;
        }
        exportSingleSectionWord({ ...classData, students: localStudents }, settings);
    }, [localStudents, classData, settings]);

    const handleExportExcel = useCallback(() => {
        if (!localStudents || localStudents.length === 0) {
            alert('لا يوجد طلاب في هذه الشعبة للتصدير.');
            return;
        }

        const dataForExcel = localStudents.map(student => ({
            'الاسم': student.name,
            'الرقم الامتحاني': student.examId || '',
            'رقم القيد': student.registrationId || '',
            'التولد': student.birthDate || '',
            'سنوات الرسوب': student.yearsOfFailure || 'لا يوجد رسوب'
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'أسماء الطلاب');
        
        const fileName = `أسماء-طلاب-${classData.stage}-${classData.section}.xlsx`;
        XLSX.writeFile(workbook, fileName);
    }, [localStudents, classData.stage, classData.section]);

    const handleExportGradesExcel = useCallback((targetSubjectName?: string) => {
        if (!localStudents || localStudents.length === 0) {
            alert('لا يوجد طلاب في هذه الشعبة للتصدير.');
            return;
        }

        const subjectToExport = targetSubjectName || (selectedSubjectFilter !== 'ALL' ? selectedSubjectFilter : null);

        if (subjectToExport) {
            const foundSubject = subjects.find(s => s.name === subjectToExport || s.id === subjectToExport);
            const subName = foundSubject ? foundSubject.name : subjectToExport;

            const dataForExcel = localStudents.map((student, idx) => {
                const studentResultData = results[student.id] || { finalCalculatedGrades: {}, result: { status: 'قيد الانتظار', message: '' } };
                const grade = { ...DEFAULT_SUBJECT_GRADE, ...(student.grades?.[subName] || {}) };
                const calculated = studentResultData.finalCalculatedGrades[subName] || DEFAULT_CALCULATED_GRADE;

                const row: Record<string, any> = {
                    'ت': idx + 1,
                    'اسم الطالب': student.name,
                    'الرقم الامتحاني': student.examId || '',
                    'رقم القيد': student.registrationId || '',
                    'حالة الطالب': student.enrollmentStatus === 'dismissed' ? 'مفصول' : student.enrollmentStatus === 'transferred' ? 'منقول' : 'مستمر',
                };

                columnConfig.forEach(col => {
                    let cellVal: any = '-';
                    if (col.type.startsWith('input')) {
                        if (col.type === 'input-exempt' && calculated.isExempt) {
                            cellVal = 'معفو';
                        } else {
                            const val = grade[col.key as keyof SubjectGrade];
                            if (val === -1) cellVal = settings.schoolGender === 'بنات' ? 'غائبة' : 'غائب';
                            else if (val === -2) cellVal = settings.schoolGender === 'بنات' ? 'مجازة' : 'مجاز';
                            else if (val !== null && val !== undefined) cellVal = val;
                            else cellVal = '';
                        }
                    } else if (col.type === 'calculated-term1') {
                        const term = Math.round(((grade.october ?? 0) + (grade.november ?? 0) + (grade.december ?? 0) + (grade.january ?? 0)) / 4);
                        cellVal = !isNaN(term) ? term : '-';
                    } else if (col.type === 'calculated-term2') {
                        const term = Math.round(((grade.february ?? 0) + (grade.march ?? 0) + (grade.april ?? 0)) / 3);
                        cellVal = !isNaN(term) ? term : '-';
                    } else if (col.type === 'calculated-result') {
                        cellVal = calculated[col.key as keyof CalculatedGrade] ?? '-';
                    } else if (col.type === 'calculated-final') {
                        cellVal = calculated.finalGradeWithDecision ?? calculated.finalGrade1st ?? '-';
                    } else if (col.type === 'calculated-pursuit') {
                        cellVal = calculated.annualPursuit ?? '-';
                    }
                    row[col.header] = cellVal;
                });

                return row;
            });

            const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, subName.slice(0, 31));

            const fileName = `درجات-${classData.stage}-${classData.section}-${subName}.xlsx`;
            XLSX.writeFile(workbook, fileName);
        } else {
            const dataForExcel = localStudents.map((student, idx) => {
                const studentResultData = results[student.id] || { finalCalculatedGrades: {}, result: { status: 'قيد الانتظار', message: '' } };
                const row: Record<string, any> = {
                    'ت': idx + 1,
                    'اسم الطالب': student.name,
                    'الرقم الامتحاني': student.examId || '',
                    'حالة الطالب': student.enrollmentStatus === 'dismissed' ? 'مفصول' : student.enrollmentStatus === 'transferred' ? 'منقول' : 'مستمر',
                };

                subjects.forEach(subject => {
                    const grade = { ...DEFAULT_SUBJECT_GRADE, ...(student.grades?.[subject.name] || {}) };
                    const calculated = studentResultData.finalCalculatedGrades[subject.name] || DEFAULT_CALCULATED_GRADE;

                    if (stageType === 'primary1_4') {
                        row[`${subject.name} - نصف السنة`] = grade.midYear ?? '-';
                        row[`${subject.name} - النهائي`] = grade.finalExam1st ?? '-';
                    } else if (stageType === 'ministerial') {
                        row[`${subject.name} - الفصل الأول`] = grade.firstTerm ?? '-';
                        row[`${subject.name} - نصف السنة`] = grade.midYear ?? '-';
                        row[`${subject.name} - الفصل الثاني`] = grade.secondTerm ?? '-';
                        row[`${subject.name} - السعي السنوي`] = calculated.annualPursuit ?? '-';
                    } else {
                        row[`${subject.name} - نصف السنة`] = grade.midYear ?? '-';
                        row[`${subject.name} - السعي السنوي`] = calculated.annualPursuit ?? '-';
                        row[`${subject.name} - النهائي`] = calculated.isExempt ? 'معفو' : (grade.finalExam1st ?? '-');
                        row[`${subject.name} - الدرجة النهائية`] = calculated.finalGradeWithDecision ?? calculated.finalGrade1st ?? '-';
                    }
                });

                row['النتيجة العامة'] = studentResultData.result.message || studentResultData.result.status;
                return row;
            });

            const worksheet = XLSX.utils.json_to_sheet(dataForExcel);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'سجل الدرجات');

            const fileName = `سجل-درجات-${classData.stage}-${classData.section}-جميع-المواد.xlsx`;
            XLSX.writeFile(workbook, fileName);
        }
    }, [localStudents, selectedSubjectFilter, subjects, results, columnConfig, settings.schoolGender, classData.stage, classData.section, stageType]);
    
    const handleOpenEditModal = (student: Student) => {
        setEditingStudent(student);
        setEditedStudentData({
            name: student.name,
            registrationId: student.registrationId || '',
            birthDate: student.birthDate || '',
            examId: student.examId || '',
            yearsOfFailure: student.yearsOfFailure || 'لا يوجد رسوب',
            notes: student.notes || ''
        });
        setIsEditStudentModalOpen(true);
    };

    const handleSaveStudentEdit = useCallback(() => {
        if (!editingStudent || !editedStudentData.name.trim()) {
            alert('يجب إدخال اسم الطالب.');
            return;
        }
    
        const updatedStudents = (classData.students || []).map(s => {
            if (s.id === editingStudent.id) {
                return {
                    ...s,
                    name: editedStudentData.name.trim(),
                    registrationId: editedStudentData.registrationId.trim(),
                    birthDate: editedStudentData.birthDate.trim(),
                    examId: editedStudentData.examId.trim(),
                    yearsOfFailure: editedStudentData.yearsOfFailure,
                    notes: editedStudentData.notes.trim(),
                };
            }
            return s;
        });
    
        const sortedUpdated = sortStudentList(updatedStudents, sortMode);
    
        db.ref(`classes/${classData.id}/students`).set(sortedUpdated)
            .then(() => {
                setIsEditStudentModalOpen(false);
                setEditingStudent(null);
            })
            .catch((error) => {
                console.error("Failed to update student:", error);
                alert("فشل تحديث معلومات الطالب.");
            });
    }, [editingStudent, editedStudentData, classData.id, classData.students, sortMode, sortStudentList]);

    // NEW: Push Master Grades to Teacher Sheets
    const handlePushToTeachers = async () => {
        if (!confirm("هل أنت متأكد من اعتماد وإرسال كافة الدرجات (معدلات الفصول، نصف السنة، السعي السنوي، والامتحان النهائي) الحالية في هذا السجل إلى كافة سجلات المدرسين وتوليد سجلات استلام رسمية؟")) {
            return;
        }

        setIsPushing(true);
        const updates: Record<string, any> = {};
        const timestamp = new Date().toISOString();

        try {
            // Find all unique teachers assigned to this class
            const usersSnap = await db.ref('users').once('value');
            const allUsers = Object.values(usersSnap.val() || {}) as any[];
            const classTeachers = allUsers.filter(u => 
                u.role === 'teacher' && 
                u.assignments?.some((a: any) => a.classId === classData.id)
            );

            for (const subject of subjects) {
                // Find teacher for this specific subject
                const subjectTeacher = classTeachers.find(t => 
                    t.assignments?.some((a: any) => a.classId === classData.id && a.subjectId === subject.id)
                );

                if (!subjectTeacher) continue;

                const teacherSubmissionGrades: Record<string, any> = {};

                localStudents.forEach((student) => {
                    const masterGrades = (student.grades?.[subject.name] || {}) as SubjectGrade;
                    const studentIndexInOriginal = (classData.students || []).findIndex(s => s.id === student.id);
                    
                    if (studentIndexInOriginal === -1) return;

                    // Calculate the grades to get averages and pursuit
                    const { finalCalculatedGrades } = calculateStudentResult(student, subjects, settings, classData);
                    const calculated = finalCalculatedGrades[subject.name];

                    // Prepare grades to push
                    const gradesToPush: TeacherSubjectGrade = {
                        firstSemMonth1: masterGrades.october ?? null,
                        firstSemMonth2: masterGrades.november ?? null,
                        midYear: masterGrades.midYear ?? null,
                        secondSemMonth1: masterGrades.february ?? null,
                        secondSemMonth2: masterGrades.march ?? null,
                        finalExam: masterGrades.finalExam1st ?? null,
                        october: masterGrades.october ?? null,
                        november: masterGrades.november ?? null,
                        december: masterGrades.december ?? null,
                        january: masterGrades.january ?? null,
                        february: masterGrades.february ?? null,
                        march: masterGrades.march ?? null,
                        april: masterGrades.april ?? null,
                        firstTerm: masterGrades.firstTerm ?? null,
                        secondTerm: masterGrades.secondTerm ?? null,
                        annualPursuit: calculated?.annualPursuit ?? null
                    };

                    // Update the student object itself (for the teacher sheet view)
                    const teacherGradesPath = `classes/${classData.id}/students/${studentIndexInOriginal}/teacherGrades/${subject.name}`;
                    
                    Object.entries(gradesToPush).forEach(([key, value]) => {
                        updates[`${teacherGradesPath}/${key}`] = value;
                    });

                    // Prepare data for the TeacherSubmission object
                    teacherSubmissionGrades[student.id] = gradesToPush;
                });

                // Generate a dummy submission record so it appears in "Received Logs"
                const submissionId = uuidv4();
                const submission: TeacherSubmission = {
                    id: submissionId,
                    teacherId: subjectTeacher.id,
                    classId: classData.id,
                    subjectId: subject.id,
                    submittedAt: timestamp,
                    grades: teacherSubmissionGrades as any
                };
                updates[`teacher_submissions/${submissionId}`] = submission;
            }

            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
                alert("تم اعتماد وإرسال الدرجات بنجاح إلى كافة سجلات المدرسين وتم تحديث السجلات المستلمة.");
            } else {
                alert("لا توجد درجات مكتملة لإرسالها.");
            }
        } catch (error) {
            console.error("Push to teachers failed:", error);
            alert("حدث خطأ أثناء محاولة مزامنة السجلات.");
        } finally {
            setIsPushing(false);
        }
    };

    const renderFinalGradeCell = (originalGrade: number | null, decisionGrade: number | null, decisionApplied: number) => {
        if (decisionGrade === null) return <span className="text-gray-400">-</span>;
        if (decisionApplied > 0 && decisionGrade === 50) {
            return (
                <div className="font-bold flex items-center justify-center gap-2 text-inherit">
                    <span className="line-through opacity-50">{originalGrade}</span>
                    <span>{decisionGrade}</span>
                </div>
            );
        }
        return <span className="font-bold text-inherit">{decisionGrade}</span>;
    }

    const getResultCellStyle = (status: StudentResult['status']) => {
        switch (status) {
            case 'ناجح': case 'مؤهل': return 'bg-green-100 text-green-800';
            case 'مكمل': case 'مؤهل بقرار': return 'bg-yellow-100 text-yellow-800';
            case 'راسب': case 'غير مؤهل': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getRowStyle = (student: Student, index: number) => {
        const status = student.enrollmentStatus;
        if (status === 'dismissed') return { backgroundColor: '#bfdbfe' }; // Blue-200
        if (status === 'transferred') return { backgroundColor: '#bbf7d0' }; // Green-200
        return { backgroundColor: index % 2 === 0 ? 'white' : '#F9FAFB' };
    };
    
    return (
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg">
            {isPushing && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex flex-col items-center justify-center text-white">
                    <Loader2 className="w-16 h-16 animate-spin mb-4" />
                    <p className="text-xl font-bold">جاري اعتماد وإرسال الدرجات للمدرسين وتوليد السجلات...</p>
                </div>
            )}

            {isAddStudentModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                        <h3 className="text-xl font-bold mb-4">إضافة طالب جديد يدوياً</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">اسم الطالب (مطلوب)</label>
                                <input type="text" name="name" value={newStudentData.name} onChange={e => setNewStudentData(p=>({...p, name: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" required autoFocus/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">الرقم الامتحاني</label>
                                <input type="text" name="examId" value={newStudentData.examId} onChange={e => setNewStudentData(p=>({...p, examId: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">رقم القيد</label>
                                <input type="text" name="registrationId" value={newStudentData.registrationId} onChange={e => setNewStudentData(p=>({...p, registrationId: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">التولد</label>
                                <input type="text" name="birthDate" value={newStudentData.birthDate} onChange={e => setNewStudentData(p=>({...p, birthDate: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">سنوات الرسوب</label>
                                <select 
                                    name="yearsOfFailure" 
                                    value={newStudentData.yearsOfFailure} 
                                    onChange={e => setNewStudentData(p=>({...p, yearsOfFailure: e.target.value as any}))} 
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                                >
                                    <option value="لا يوجد رسوب">لا يوجد رسوب</option>
                                    <option value="راسب">راسب</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">الملاحظات</label>
                                <textarea name="notes" value={newStudentData.notes} onChange={e => setNewStudentData(p=>({...p, notes: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" rows={2}/>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setIsAddStudentModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md">إلغاء</button>
                            <button onClick={handleAddStudent} className="px-4 py-2 bg-cyan-600 text-white rounded-md">إضافة الطالب</button>
                        </div>
                    </div>
                </div>
            )}

            {isEditStudentModalOpen && editingStudent && (
                 <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg">
                        <h3 className="text-xl font-bold mb-4">تعديل معلومات الطالب: {editingStudent.name}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">اسم الطالب (مطلوب)</label>
                                <input type="text" name="name" value={editedStudentData.name} onChange={e => setEditedStudentData(p=>({...p, name: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" required autoFocus/>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">الرقم الامتحاني</label>
                                <input type="text" name="examId" value={editedStudentData.examId} onChange={e => setEditedStudentData(p=>({...p, examId: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">رقم القيد</label>
                                <input type="text" name="registrationId" value={editedStudentData.registrationId} onChange={e => setEditedStudentData(p=>({...p, registrationId: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-700">التولد</label>
                                <input type="text" name="birthDate" value={editedStudentData.birthDate} onChange={e => setEditedStudentData(p=>({...p, birthDate: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">سنوات الرسوب</label>
                                <select 
                                    name="yearsOfFailure" 
                                    value={editedStudentData.yearsOfFailure} 
                                    onChange={e => setEditedStudentData(p=>({...p, yearsOfFailure: e.target.value as any}))} 
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
                                >
                                    <option value="لا يوجد رسوب">لا يوجد رسوب</option>
                                    <option value="راسب">راسب</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">الملاحظات</label>
                                <textarea name="notes" value={editedStudentData.notes} onChange={e => setEditedStudentData(p=>({...p, notes: e.target.value}))} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md" rows={2}/>
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setIsEditStudentModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md">إلغاء</button>
                            <button onClick={handleSaveStudentEdit} className="px-4 py-2 bg-green-600 text-white rounded-md">حفظ التعديلات</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Title and Action Buttons */}
            <div className="flex flex-col lg:flex-row justify-between items-start mb-3 gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-800 flex items-center gap-2">
                        <span>سجل درجات:</span>
                        <span className="text-cyan-700">{classData.stage} - {classData.section}</span>
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        العام الدراسي: {settings.academicYear} | مدير المدرسة: {settings.principalName} | مجموع الطلاب: {localStudents.length}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                    <button 
                        onClick={handlePushToTeachers} 
                        disabled={isPushing}
                        className="flex items-center gap-2 px-3.5 py-2 bg-indigo-700 text-white font-bold rounded-lg hover:bg-indigo-800 shadow transition-all transform hover:scale-105 text-sm"
                        title="إرسال درجات نصف السنة والنهائي من هذا السجل إلى سجلات المدرسين مباشرة"
                    >
                        <ShieldCheck size={18} />
                        <span>اعتماد وإرسال للمدرسين</span>
                    </button>
                    <button 
                        onClick={handleExportWord} 
                        className="flex items-center gap-2 px-3.5 py-2 bg-blue-700 text-white font-semibold rounded-lg hover:bg-blue-800 shadow transition-all transform hover:scale-105 text-sm"
                        title="تحميل قائمة أسماء طلبة الشعبة كملف Word منسق كجدول مع بيانات المدرسة والشعبة"
                    >
                        <FileText size={18} /><span>الأسماء (Word)</span>
                    </button>
                    <button 
                        onClick={handleExportExcel} 
                        className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 shadow transition-all transform hover:scale-105 text-sm"
                        title="تحميل قائمة أسماء طلبة الشعبة كملف Excel"
                    >
                        <Download size={18} /><span>الأسماء (Excel)</span>
                    </button>
                    <button onClick={() => setIsAddStudentModalOpen(true)} className="flex items-center gap-2 px-3.5 py-2 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 shadow transition-all text-sm">
                        <UserPlus size={18} /><span>إضافة طالب</span>
                    </button>
                </div>
            </div>

            {/* Interactive Control Bar: Sorting, Subject Filter, Header Pinning, and Grades Export */}
            <div className="bg-white p-3.5 rounded-xl shadow-sm border border-gray-200 mb-4 flex flex-wrap items-center justify-between gap-3">
                {/* Right Group: Sorting and Subject Filter */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Student Sorting Buttons */}
                    <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg border border-gray-200">
                        <span className="text-xs font-bold text-gray-500 px-1">ترتيب الطلاب:</span>
                        <button
                            type="button"
                            onClick={() => handleSortChange('examId')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                                sortMode === 'examId'
                                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                                    : 'text-gray-700 hover:bg-white'
                            }`}
                            title="ترتيب الطلاب حسب تسلسل الأرقام الامتحانية في الشعبة"
                        >
                            <ArrowDown10 size={16} />
                            <span>بالرقم الامتحاني</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSortChange('alphabetical')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                                sortMode === 'alphabetical'
                                    ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                                    : 'text-gray-700 hover:bg-white'
                            }`}
                            title="ترتيب الطلاب على أساس تسلسل الحروف الأبجدية (أ - ي)"
                        >
                            <ArrowDownAZ size={16} />
                            <span>أبجدياً (أ - ي)</span>
                        </button>
                    </div>

                    {/* Subject Filter Dropdown */}
                    <div className="flex items-center gap-2 bg-gray-100 p-1 px-2.5 rounded-lg border border-gray-200">
                        <BookOpen size={16} className="text-cyan-700" />
                        <span className="text-xs font-bold text-gray-700">عرض المواد:</span>
                        <select
                            value={selectedSubjectFilter}
                            onChange={(e) => setSelectedSubjectFilter(e.target.value)}
                            className="bg-white border border-gray-300 text-xs font-bold text-gray-800 rounded-md px-2.5 py-1.5 focus:ring-2 focus:ring-cyan-500 outline-none cursor-pointer"
                        >
                            <option value="ALL">جميع المواد ({subjects.length})</option>
                            {subjects.map(s => (
                                <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Left Group: Pinning and Grades Download */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Grades Download Button */}
                    <button
                        type="button"
                        onClick={() => handleExportGradesExcel()}
                        className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm text-xs font-bold transition-all transform hover:scale-105"
                        title={selectedSubjectFilter === 'ALL' ? "تحميل سجل درجات جميع المواد كملف Excel" : `تحميل درجات مادة ${selectedSubjectFilter} كملف Excel`}
                    >
                        <Download size={16} />
                        <span>
                            {selectedSubjectFilter === 'ALL' ? 'تنزيل درجات السجل (Excel)' : `تنزيل درجات (${selectedSubjectFilter}) Excel`}
                        </span>
                    </button>

                    {/* Header Pinning Toggle Button */}
                    <button 
                        type="button"
                        onClick={() => setIsHeaderPinned(!isHeaderPinned)}
                        className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg shadow-sm transition-all transform hover:scale-105 ${
                            isHeaderPinned 
                                ? 'bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-300' 
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                        }`}
                        title={isHeaderPinned ? "إلغاء تثبيت العناوين" : "تثبيت عناوين المواد والجدول عند التمرير لأسفل"}
                    >
                        {isHeaderPinned ? <Pin size={16} /> : <PinOff size={16} />}
                        <span>{isHeaderPinned ? "العناوين مثبتة (مفعل)" : "تثبيت العناوين"}</span>
                    </button>
                </div>
            </div>

            {/* Filter Notice Strip */}
            {selectedSubjectFilter !== 'ALL' && (
                <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-2.5 px-4 mb-3 flex items-center justify-between text-xs text-cyan-900 shadow-sm animate-fadeIn">
                    <div className="flex items-center gap-2 font-bold">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 animate-pulse"></span>
                        <span>يتم الآن عرض مادة <span className="underline text-cyan-800 text-sm">«{selectedSubjectFilter}»</span> فقط لتسهيل رصد وتنزيل الدرجات بتركيز ووضوح تام.</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSelectedSubjectFilter('ALL')}
                        className="bg-white hover:bg-cyan-100 text-cyan-800 border border-cyan-300 px-3 py-1 rounded font-bold transition shadow-xs"
                    >
                        إلغاء التركيز وعرض جميع المواد
                    </button>
                </div>
            )}

            <div className="relative">
                 <div ref={scrollContainerRef} className={`w-full ${isHeaderPinned ? 'overflow-auto max-h-[calc(100vh-230px)] min-h-[420px] border border-gray-300 rounded-xl shadow-inner bg-white relative' : 'overflow-x-auto'}`}>
                    <form>
                    <table className="min-w-full border-separate border-spacing-0 border border-gray-300 text-sm bg-white">
                        <thead className={`text-gray-700 font-bold ${isHeaderPinned ? 'sticky top-0 z-30' : ''}`}>
                            <tr className="bg-gray-200 h-[44px]">
                                <th rowSpan={2} className={`border-b-2 border-l border-gray-300 p-2 text-center bg-gray-200 w-[50px] min-w-[50px] sticky right-0 left-auto ${isHeaderPinned ? 'top-0 z-50 shadow-sm' : 'z-20'}`}>ت</th>
                                <th rowSpan={2} className={`border-b-2 border-l border-gray-300 p-2 text-right bg-gray-200 w-[200px] min-w-[200px] sticky right-[50px] left-auto ${isHeaderPinned ? 'top-0 z-50 shadow-sm' : 'z-20'}`}>اسم الطالب</th>
                                <th rowSpan={2} className={`border-b-2 border-l border-gray-300 p-1 text-center bg-yellow-400 w-[50px] min-w-[50px] font-black sticky right-[250px] left-auto ${isHeaderPinned ? 'top-0 z-50 shadow-sm' : 'z-20'}`} style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)'}}>الرقم الامتحاني</th>
                                {displayedSubjects.map((subject, i) => {
                                    const originalIndex = subjects.findIndex(s => s.id === subject.id);
                                    const colorIndex = originalIndex >= 0 ? originalIndex : i;
                                    const bgColors = ['#fde68a', '#a5f3fc', '#f9a8d4', '#a7f3d0', '#d8b4fe'];
                                    const bgColor = bgColors[colorIndex % bgColors.length];
                                    return (
                                        <th key={subject.id} colSpan={columnConfig.length} className={`border-b border-l border-gray-300 p-2 whitespace-nowrap text-center text-sm font-bold ${isHeaderPinned ? 'sticky top-0 z-30 shadow-sm' : ''}`} style={{backgroundColor: bgColor}}>
                                            <div className="flex items-center justify-center gap-2">
                                                <span>{subject.name}</span>
                                                {selectedSubjectFilter === 'ALL' && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setSelectedSubjectFilter(subject.name); }}
                                                        className="text-[11px] px-2 py-0.5 bg-black/10 hover:bg-black/25 rounded font-normal transition text-gray-800"
                                                        title={`عرض مادة ${subject.name} فقط`}
                                                    >
                                                        تركيز
                                                    </button>
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}
                                <th rowSpan={2} className={`border-b-2 border-l border-gray-300 p-2 min-w-[200px] text-center bg-yellow-300 font-bold ${isHeaderPinned ? 'sticky top-0 z-30 shadow-sm' : ''}`}>
                                    {MINISTERIAL_STAGES.includes(classData.stage) ? "نتيجة التأهيل الوزاري" : "النتيجة النهائية"}
                                </th>
                                <th rowSpan={2} className={`border-b-2 border-gray-300 p-2 bg-gray-200 w-[120px] min-w-[120px] text-center font-bold ${isHeaderPinned ? 'sticky top-0 z-30 shadow-sm' : ''}`}>إجراءات</th>
                            </tr>
                            <tr className="bg-gray-100">
                                {displayedSubjects.map(subject => columnConfig.map(col => (
                                    <th key={`${subject.id}-${col.key}`} className={`border-b-2 border-l border-gray-300 p-1 font-semibold whitespace-nowrap text-[10px] w-[55px] min-w-[55px] h-[100px] text-center ${isHeaderPinned ? 'sticky top-[44px] z-30 shadow-sm' : ''}`} style={{writingMode: 'vertical-rl', transform: 'rotate(180deg)', backgroundColor: '#f3f4f6'}}>{col.header}</th>
                                )))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {localStudents.map((student, studentIndex) => {
                                 const studentResultData = results[student.id] || { finalCalculatedGrades: {}, result: { status: 'قيد الانتظار', message: ''} };
                                 const rowStyle = getRowStyle(student, studentIndex);
                                 
                                return (
                                    <tr key={student.id} className="hover:bg-cyan-50/60 transition-colors" style={rowStyle}>
                                        <td className="border-b border-l border-gray-300 p-2 text-center sticky right-0 left-auto z-10 font-medium" style={rowStyle}>{studentIndex + 1}</td>
                                        <td className="border-b border-l border-gray-300 p-2 font-semibold sticky right-[50px] left-auto z-10 text-gray-900" style={rowStyle}>{student.name}</td>
                                        <td className="border-b border-l border-gray-300 p-2 text-center sticky right-[250px] left-auto z-10 font-bold text-gray-900" style={{ ...rowStyle, backgroundColor: '#facc15' }}>{student.examId}</td>
                                        {displayedSubjects.map(subject => {
                                            const grade = { ...DEFAULT_SUBJECT_GRADE, ...(student.grades?.[subject.name] || {}) };
                                            const calculated = studentResultData.finalCalculatedGrades[subject.name] || DEFAULT_CALCULATED_GRADE;
                                            return (
                                                <React.Fragment key={subject.id}>
                                                    {columnConfig.map(col => {
                                                        const cellKey = `${student.id}-${subject.id}-${col.key}`;
                                                        if (col.type.startsWith('input')) {
                                                            if (col.type === 'input-exempt' && calculated.isExempt) {
                                                                return (
                                                                    <td 
                                                                        key={cellKey} 
                                                                        className="border-b border-l border-gray-300 cursor-pointer"
                                                                        onClick={() => handleGradeChange(student.id, subject.name, 'isExempt' as any, false)}
                                                                        title="اضغط لإلغاء الإعفاء"
                                                                    >
                                                                        <div className="w-full h-full flex items-center justify-center bg-blue-100 text-blue-800 font-semibold py-1">معفو</div>
                                                                    </td>
                                                                );
                                                            }
                                                            return <td key={cellKey} className="border-b border-l border-gray-300 p-0"><GradeInput studentId={student.id} subjectName={subject.name} field={col.key as keyof SubjectGrade} value={grade[col.key as keyof SubjectGrade] as number | null} onGradeChange={handleGradeChange} onEnterPress={handleEnterPress} onAutoAdvance={handleAutoAdvance} max={maxGrade} schoolGender={settings.schoolGender} /></td>;
                                                        }
                                                        if (col.type === 'calculated-term1') {
                                                            const term = Math.round(((grade.october ?? 0) + (grade.november ?? 0) + (grade.december ?? 0) + (grade.january ?? 0)) / 4);
                                                            return <td key={cellKey} className="border-b border-l border-gray-300 text-center font-semibold bg-gray-50">{!isNaN(term) ? term : '-'}</td>;
                                                        }
                                                        if (col.type === 'calculated-term2') {
                                                            const term = Math.round(((grade.february ?? 0) + (grade.march ?? 0) + (grade.april ?? 0)) / 3);
                                                            return <td key={cellKey} className="border-b border-l border-gray-300 text-center font-semibold bg-gray-50">{!isNaN(term) ? term : '-'}</td>;
                                                        }
                                                        if (col.type === 'calculated-result') {
                                                            return <td key={cellKey} className="border-b border-l border-gray-300 text-center font-semibold bg-gray-50">{calculated[col.key as keyof CalculatedGrade] ?? '-'}</td>;
                                                        }
                                                        if (col.type === 'calculated-final') {
                                                            if (stageType === 'standard' && (grade.finalExam1st === null || grade.finalExam1st === undefined)) {
                                                                return <td key={cellKey} className="border-b border-l border-gray-300 text-center bg-gray-50">-</td>;
                                                            }
                                                            return <td key={cellKey} className="border-b border-l border-gray-300 text-center">{renderFinalGradeCell(calculated.finalGrade1st, calculated.finalGradeWithDecision, calculated.decisionApplied)}</td>;
                                                        }
                                                        if (col.type === 'calculated-pursuit') return <td key={cellKey} className="border-b border-l border-gray-300 text-center font-semibold bg-gray-50">{calculated.annualPursuit ?? '-'}</td>;
                                                        return <td key={cellKey} className="border-b border-l border-gray-300"></td>;
                                                    })}
                                                </React.Fragment>
                                            )
                                        })}
                                        <td className={`border-b border-l border-gray-300 p-2 text-center font-bold text-sm ${getResultCellStyle(studentResultData.result.status)}`}>{studentResultData.result.message}</td>
                                        <td className="border-b border-gray-300 p-1 text-center min-w-[120px]">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-center gap-1">
                                                     <button type="button" onClick={() => { setTransferStudent(student); setTargetClassId(''); }} className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 rounded-full" title="نقل الطالب إلى شعبة أخرى في نفس المرحلة"><ArrowLeftRight size={16} /></button><button type="button" onClick={() => handleOpenEditModal(student)} className="p-1 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100 rounded-full" title="تغيير معلومات الطالب"><Edit size={16} /></button>
                                                     <button type="button" onClick={() => handleDeleteStudent(student.id)} className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full" title="حذف الطالب"><Trash2 size={16} /></button>
                                                </div>
                                                <select
                                                    value={student.enrollmentStatus || 'active'}
                                                    onChange={(e) => handleStatusChange(student.id, e.target.value)}
                                                    className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white w-full"
                                                >
                                                    <option value="active">مستمر</option>
                                                    <option value="transferred">منقول</option>
                                                    <option value="dismissed">مفصول</option>
                                                </select>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    </form>
                </div>

                {showScrollButtons && (
                    <>
                        <button onClick={() => scrollContainerRef.current?.scrollBy({ left: -300, behavior: 'smooth' })} className="absolute right-0 top-1/2 -translate-y-1/2 z-40 bg-black/40 text-white p-2 rounded-full" aria-label="Scroll left"><ChevronRight size={24} /></button>
                        <button onClick={() => scrollContainerRef.current?.scrollBy({ left: 300, behavior: 'smooth' })} className="absolute left-0 top-1/2 -translate-y-1/2 z-40 bg-black/40 text-white p-2 rounded-full" aria-label="Scroll right"><ChevronLeft size={24} /></button>
                    </>
                )}
            </div>

            {transferStudent && (
                <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-[100] p-4">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md border border-gray-100">
                        <div className="flex items-center gap-3 text-indigo-700 mb-4 pb-3 border-b">
                            <ArrowLeftRight className="w-6 h-6" />
                            <h3 className="text-xl font-bold">نقل الطالب إلى شعبة أخرى</h3>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                <p className="text-xs text-gray-500 font-bold mb-1">اسم الطالب</p>
                                <p className="font-bold text-gray-800 text-lg">{transferStudent.name}</p>
                                {transferStudent.examId && (
                                    <p className="text-xs text-indigo-600 mt-1 font-semibold">الرقم الامتحاني: {transferStudent.examId}</p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                    <p className="text-xs text-blue-600 font-bold">المرحلة الدراسية</p>
                                    <p className="font-bold text-blue-900 mt-0.5">{classData.stage}</p>
                                </div>
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                                    <p className="text-xs text-amber-700 font-bold">الشعبة الحالية</p>
                                    <p className="font-bold text-amber-900 mt-0.5">{classData.section}</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">
                                    اختر الشعبة الجديدة للنقل إليها (في نفس المرحلة)
                                </label>
                                {targetSections.length > 0 ? (
                                    <select
                                        value={targetClassId}
                                        onChange={(e) => setTargetClassId(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 font-bold text-gray-800"
                                    >
                                        <option value="">-- اختر الشعبة الجديدة --</option>
                                        {targetSections.map(c => (
                                            <option key={c.id} value={c.id}>
                                                الشعبة ({c.section}) - {c.students?.length || 0} طالب
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-semibold">
                                        لا توجد شعب أخرى مضافة لمرحلة ({classData.stage}). يرجى إضافة شعبة أخرى أولاً للنقل إليها.
                                    </div>
                                )}
                            </div>

                            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 flex items-start gap-2">
                                <ShieldCheck className="w-5 h-5 flex-shrink-0 text-green-600 mt-0.5" />
                                <span>
                                    تنبيه: يتم نقل جميع الدرجات والرمز السري والبيانات الشخصية للطالب بالكامل دون أي تعديل أو تغيير.
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-3 border-t">
                            <button
                                type="button"
                                onClick={() => { setTransferStudent(null); setTargetClassId(''); }}
                                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg font-bold hover:bg-gray-300 transition"
                                disabled={isTransferring}
                            >
                                إلغاء
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmTransfer}
                                disabled={!targetClassId || isTransferring}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold transition flex items-center gap-2 disabled:bg-gray-400"
                            >
                                {isTransferring ? (
                                    <>
                                        <Loader2 className="animate-spin w-4 h-4" />
                                        <span>جاري النقل...</span>
                                    </>
                                ) : (
                                    <>
                                        <ArrowLeftRight className="w-4 h-4" />
                                        <span>تأكيد نقل الطالب</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
