import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as ReactDOM from 'react-dom/client';
import { 
    QrCode, Camera, RefreshCw, CheckCircle, AlertTriangle, Search, 
    FileDown, Printer, Users, UserCheck, UserX, Clock, Calendar, 
    Sparkles, Shield, ChevronRight, ChevronLeft, Award, Scissors,
    Check, X, Eye, EyeOff, Volume2, Info, Loader2, Filter, Hash,
    ArrowRight, AlertCircle, BookmarkCheck, FileText, Smile
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import type { User, SchoolSettings, ClassData, TeacherAttendanceRecord } from '../../types.ts';
import { db } from '../../lib/firebase.ts';

declare const jspdf: any;
declare const html2canvas: any;

interface TeacherQRAttendanceProps {
    principal: User;
    settings: SchoolSettings;
    users: User[];
    classes: ClassData[];
}

type TabMode = 'scanner' | 'logs' | 'generator';

// Color themes for the generated QR ID badges
const BADGE_COLORS = [
    { name: 'أسود كلاسيكي', hex: '#111827', border: 'border-gray-800', bg: 'bg-gray-900', text: 'text-gray-900' },
    { name: 'أزرق ملكي', hex: '#1e3a8a', border: 'border-blue-900', bg: 'bg-blue-900', text: 'text-blue-900' },
    { name: 'أخضر زمردي', hex: '#065f46', border: 'border-emerald-800', bg: 'bg-emerald-800', text: 'text-emerald-800' },
    { name: 'عنابي فاخر', hex: '#831843', border: 'border-pink-900', bg: 'bg-pink-900', text: 'text-pink-900' },
];

// Helper to convert Gregorian digits to Arabic
const toArabicDigits = (str: string | number): string => {
    if (str === null || str === undefined) return '';
    const map: Record<string, string> = {
        '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤', '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩'
    };
    return String(str).replace(/[0-9]/g, (d) => map[d] || d);
};

// Play check-in chime
const playWelcomeChime = () => {
    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const audioCtx = new AudioCtx();
        
        // Note 1: E5 (659.25 Hz)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, audioCtx.currentTime);
        gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(audioCtx.currentTime);
        osc1.stop(audioCtx.currentTime + 0.2);

        // Note 2: A5 (880 Hz) slightly delayed for pleasant bell effect
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, audioCtx.currentTime + 0.12);
        gain2.gain.setValueAtTime(0.15, audioCtx.currentTime + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.45);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(audioCtx.currentTime + 0.12);
        osc2.stop(audioCtx.currentTime + 0.45);
    } catch (e) {
        console.warn('Audio chime unsupported or blocked by browser', e);
    }
};

// Format current date as YYYY-MM-DD
const getTodayDateString = (): string => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// Format time in 12-hour Arabic format
const formatArabicTime = (dateObj: Date = new Date()): string => {
    let hours = dateObj.getHours();
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getSeconds()).padStart(2, '0');
    const period = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12 || 12;
    return `${toArabicDigits(hours)}:${toArabicDigits(minutes)}:${toArabicDigits(seconds)} ${period}`;
};

export default function TeacherQRAttendance({ principal, settings, users, classes }: TeacherQRAttendanceProps) {
    const [activeTab, setActiveTab] = useState<TabMode>('scanner');
    const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString);
    
    // Scanner states
    const [isScannerRunning, setIsScannerRunning] = useState(false);
    const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
    const [selectedCameraId, setSelectedCameraId] = useState<string>('');
    const [scannerError, setScannerError] = useState<string | null>(null);
    const [isStartingScanner, setIsStartingScanner] = useState(false);

    // Welcome greeting banner state
    const [recentWelcome, setRecentWelcome] = useState<{
        teacher: User;
        time: string;
        isRepeat?: boolean;
    } | null>(null);

    // Attendance data
    const [attendanceMap, setAttendanceMap] = useState<Record<string, TeacherAttendanceRecord>>({});
    const [isLoadingAttendance, setIsLoadingAttendance] = useState(true);

    // Manual search / quick check-in
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent'>('all');

    // Badge Generation Settings
    const [selectedBadgeColor, setSelectedBadgeColor] = useState<string>(BADGE_COLORS[1].hex); // Blue default
    const [selectedTeacherIdsForBadges, setSelectedTeacherIdsForBadges] = useState<string[]>([]);
    const [isExportingPDF, setIsExportingPDF] = useState(false);
    const [pdfProgress, setPdfProgress] = useState(0);

    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const lastScanRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });
    const welcomeTimeoutRef = useRef<any>(null);

    // Target school ID for Firebase path
    const schoolKey = principal?.id || (settings as any)?.principalId || 'default_school';

    // List of teachers and staff
    const teachersList = useMemo(() => {
        return users.filter(u => {
            const isRoleMatch = u.role === 'teacher' || u.role === 'counselor' || u.role === 'assistant';
            const isSchoolMatch = !principal?.id || u.principalId === principal.id || !u.principalId;
            return isRoleMatch && isSchoolMatch && !u.disabled;
        }).sort((a, b) => a.name.localeCompare(b.name, 'ar-IQ'));
    }, [users, principal?.id]);

    // Compute teacher subjects from class assignments
    const getTeacherSubjects = (teacher: User): string => {
        if (teacher.role === 'counselor') return 'مرشد تربوي';
        if (teacher.role === 'assistant') return 'معاون شؤون طلبة';
        const assignments = teacher.assignments || [];
        const subjectsSet = new Set<string>();
        assignments.forEach(a => {
            const cls = classes.find(c => c.id === a.classId);
            const subj = cls?.subjects.find(s => s.id === a.subjectId);
            if (subj?.name) subjectsSet.add(subj.name);
        });
        const arr = Array.from(subjectsSet);
        return arr.length > 0 ? arr.join('، ') : 'كادر تعليمي';
    };

    // Initialize all teacher IDs for badge generation initially
    useEffect(() => {
        if (teachersList.length > 0 && selectedTeacherIdsForBadges.length === 0) {
            setSelectedTeacherIdsForBadges(teachersList.map(t => t.id));
        }
    }, [teachersList]);

    // Load attendance from Firebase Realtime Database for the selected date
    useEffect(() => {
        setIsLoadingAttendance(true);
        const attendanceRef = db.ref(`teacher_attendance/${schoolKey}/${selectedDate}`);
        
        const handleData = (snapshot: any) => {
            if (snapshot.exists()) {
                const data = snapshot.val() || {};
                setAttendanceMap(data);
            } else {
                setAttendanceMap({});
            }
            setIsLoadingAttendance(false);
        };

        attendanceRef.on('value', handleData);
        return () => {
            attendanceRef.off('value', handleData);
        };
    }, [schoolKey, selectedDate]);

    // Stop camera safely
    const stopScanner = async () => {
        if (html5QrCodeRef.current) {
            try {
                if (html5QrCodeRef.current.isScanning) {
                    await html5QrCodeRef.current.stop();
                }
                html5QrCodeRef.current.clear();
            } catch (err) {
                console.warn("Failed to stop scanner cleanly:", err);
            }
            html5QrCodeRef.current = null;
        }
        setIsScannerRunning(false);
    };

    // Initialize camera on mount or tab change to 'scanner'
    useEffect(() => {
        let isMounted = true;

        if (activeTab === 'scanner') {
            const initCamerasAndStart = async () => {
                setIsStartingScanner(true);
                setScannerError(null);

                try {
                    // Try to list available cameras
                    const devices = await Html5Qrcode.getCameras().catch(() => []);
                    if (!isMounted) return;

                    if (devices && devices.length > 0) {
                        setAvailableCameras(devices.map(d => ({ id: d.id, label: d.label || `كاميرا ${d.id}` })));
                        
                        // Look specifically for BACK / REAR / ENVIRONMENT camera (prioritized for QR scanning)
                        const backCamera = devices.find(d => {
                            const lbl = (d.label || '').toLowerCase();
                            return lbl.includes('back') || lbl.includes('rear') || lbl.includes('environment') || 
                                   lbl.includes('خلف') || lbl.includes('الخلف') || lbl.includes('main') || 
                                   lbl.includes('outward') || lbl.includes('camera 0');
                        });

                        // Choose back camera if detected, or default to the last camera (typically back camera on phones/tablets) or first
                        const initialId = backCamera ? backCamera.id : (devices[devices.length - 1]?.id || devices[0].id);
                        setSelectedCameraId(initialId);
                        await launchScanner(initialId);
                    } else {
                        // If devices list empty or permission not prompted yet, attempt facingMode "environment"
                        await launchScanner({ facingMode: "environment" });
                    }
                } catch (err: any) {
                    console.error("Camera init error:", err);
                    if (isMounted) {
                        setScannerError("تعذر تشغيل الكاميرا الخلفية تلقائياً. يرجى التأكد من منح إذن الوصول للكاميرا في المتصفح.");
                    }
                } finally {
                    if (isMounted) setIsStartingScanner(false);
                }
            };

            const timer = setTimeout(initCamerasAndStart, 250);
            return () => {
                isMounted = false;
                clearTimeout(timer);
                stopScanner();
            };
        } else {
            stopScanner();
        }

        return () => {
            isMounted = false;
            stopScanner();
        };
    }, [activeTab]);

    // Launch scanner on a given camera ID or facingMode constraint
    const launchScanner = async (cameraIdOrConfig: string | { facingMode: string }) => {
        await stopScanner();
        setScannerError(null);

        try {
            const qrElement = document.getElementById("teacher-qr-reader");
            if (!qrElement) return;

            const scanner = new Html5Qrcode("teacher-qr-reader", {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                verbose: false
            });
            html5QrCodeRef.current = scanner;

            const config = {
                fps: 25,
                qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                    const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                    const boxSize = Math.max(200, Math.floor(minEdge * 0.75));
                    return { width: boxSize, height: boxSize };
                },
                aspectRatio: 1.0,
            };

            await scanner.start(
                cameraIdOrConfig as any,
                config,
                handleQrCodeSuccess,
                () => {} // Silent on individual frame read misses
            );

            setIsScannerRunning(true);
        } catch (err: any) {
            console.error("Scanner start error:", err);
            setScannerError("حدث خطأ أثناء تشغيل الكاميرا: " + (err?.message || "يرجى التحقق من اتصال الكاميرا وإذن المتصفح."));
            setIsScannerRunning(false);
        }
    };

    // Switch camera handler
    const handleCameraChange = async (newCameraId: string) => {
        setSelectedCameraId(newCameraId);
        await launchScanner(newCameraId);
    };

    // QR Success Handler (Requirement 2, 3, 4: Capture, Welcome, Keep camera running)
    const handleQrCodeSuccess = (decodedText: string) => {
        if (!decodedText) return;
        const text = decodedText.trim();

        // Find teacher by code, id, or TEACHER:xxx prefix
        let teacherMatch: User | undefined;

        // Clean prefix if present
        let cleanId = text;
        if (text.startsWith('TEACHER:')) {
            cleanId = text.substring('TEACHER:'.length).trim();
        }

        teacherMatch = teachersList.find(t => 
            t.id === cleanId || 
            t.code === cleanId || 
            t.id === text || 
            t.code === text || 
            t.name.trim() === text ||
            (cleanId.length > 5 && (t.id.includes(cleanId) || cleanId.includes(t.id)))
        );

        if (!teacherMatch) {
            // Unrecognized code, ignore quick jitter
            return;
        }

        // Throttle cooldown: prevent re-recording the exact same teacher in under 4 seconds
        const now = Date.now();
        if (lastScanRef.current.id === teacherMatch.id && (now - lastScanRef.current.time) < 4000) {
            return;
        }

        // Update cooldown
        lastScanRef.current = { id: teacherMatch.id, time: now };

        // Process attendance
        recordTeacherAttendance(teacherMatch, 'qr');
    };

    // Core Attendance Recording Logic
    const recordTeacherAttendance = async (teacher: User, method: 'qr' | 'manual' = 'qr') => {
        const todayDate = getTodayDateString();
        const formattedTime = formatArabicTime(new Date());
        const timestamp = Date.now();

        const isAlreadyRecorded = !!attendanceMap[teacher.id];

        const record: TeacherAttendanceRecord = {
            teacherId: teacher.id,
            teacherName: teacher.name,
            teacherCode: teacher.code,
            role: teacher.role,
            date: todayDate,
            time: isAlreadyRecorded ? attendanceMap[teacher.id].time : formattedTime,
            timestamp,
            status: 'present',
            method,
            note: isAlreadyRecorded ? `تم تأكيد التواجد (${formattedTime})` : 'حاضر بالموعد'
        };

        // Optimistic local update
        setAttendanceMap(prev => ({
            ...prev,
            [teacher.id]: record
        }));

        // Play pleasant welcome chime
        playWelcomeChime();

        // Show welcome greeting banner
        setRecentWelcome({
            teacher,
            time: record.time,
            isRepeat: isAlreadyRecorded
        });

        // Clear existing timer if any
        if (welcomeTimeoutRef.current) {
            clearTimeout(welcomeTimeoutRef.current);
        }
        // Auto-dismiss welcome notice after 5 seconds while camera stays open!
        welcomeTimeoutRef.current = setTimeout(() => {
            setRecentWelcome(null);
        }, 5000);

        // Persist to Firebase Realtime Database
        try {
            await db.ref(`teacher_attendance/${schoolKey}/${todayDate}/${teacher.id}`).set(record);
        } catch (err) {
            console.error("Failed to save teacher attendance to Firebase:", err);
        }
    };

    // Manual status change (e.g. absent, excused, or delete)
    const handleUpdateStatus = async (teacher: User, newStatus: 'present' | 'absent' | 'excused' | 'late') => {
        const record: TeacherAttendanceRecord = {
            teacherId: teacher.id,
            teacherName: teacher.name,
            teacherCode: teacher.code,
            role: teacher.role,
            date: selectedDate,
            time: newStatus === 'present' || newStatus === 'late' ? formatArabicTime() : '--:--',
            timestamp: Date.now(),
            status: newStatus,
            method: 'manual'
        };

        setAttendanceMap(prev => ({
            ...prev,
            [teacher.id]: record
        }));

        try {
            await db.ref(`teacher_attendance/${schoolKey}/${selectedDate}/${teacher.id}`).set(record);
        } catch (err) {
            console.error("Firebase update failed:", err);
        }
    };

    // Remove an attendance record
    const handleRemoveRecord = async (teacherId: string) => {
        if (!confirm('هل تريد بالتأكيد إلغاء تسجيل حضور هذا المدرس لهذا اليوم؟')) return;

        setAttendanceMap(prev => {
            const next = { ...prev };
            delete next[teacherId];
            return next;
        });

        try {
            await db.ref(`teacher_attendance/${schoolKey}/${selectedDate}/${teacherId}`).remove();
        } catch (err) {
            console.error("Firebase removal failed:", err);
        }
    };

    // Attendance stats
    const stats = useMemo(() => {
        const total = teachersList.length;
        let present = 0;
        let late = 0;
        let excused = 0;

        teachersList.forEach(t => {
            const rec = attendanceMap[t.id];
            if (rec) {
                if (rec.status === 'present') present++;
                else if (rec.status === 'late') late++;
                else if (rec.status === 'excused') excused++;
            }
        });

        const attendedTotal = present + late;
        const absent = Math.max(0, total - attendedTotal - excused);
        const rate = total > 0 ? Math.round((attendedTotal / total) * 100) : 0;

        return { total, present: attendedTotal, late, excused, absent, rate };
    }, [teachersList, attendanceMap]);

    // Filtered teachers list for logs view
    const filteredTeachers = useMemo(() => {
        return teachersList.filter(t => {
            const matchesQuery = t.name.includes(searchQuery) || 
                                 (t.code && t.code.includes(searchQuery)) ||
                                 getTeacherSubjects(t).includes(searchQuery);
            if (!matchesQuery) return false;

            const rec = attendanceMap[t.id];
            const isPresent = rec && (rec.status === 'present' || rec.status === 'late');

            if (statusFilter === 'present') return isPresent;
            if (statusFilter === 'absent') return !isPresent;
            return true;
        });
    }, [teachersList, searchQuery, statusFilter, attendanceMap]);

    // List of teachers who checked in today (for live scanner sidebar feed)
    const todayCheckedInList = useMemo(() => {
        return (Object.values(attendanceMap) as TeacherAttendanceRecord[])
            .filter(r => r.status === 'present' || r.status === 'late')
            .sort((a, b) => b.timestamp - a.timestamp);
    }, [attendanceMap]);

    // Export Daily Attendance Log as PDF (Requirement 5)
    const handleExportAttendancePDF = async () => {
        setIsExportingPDF(true);
        setPdfProgress(10);

        try {
            const jsPDFClass = (window as any).jspdf?.jsPDF || jspdf?.jsPDF;
            if (!jsPDFClass) {
                throw new Error("مكتبة jsPDF غير متوفرة حالياً");
            }

            // Create printable container
            const printContainer = document.createElement('div');
            printContainer.style.position = 'absolute';
            printContainer.style.left = '-9999px';
            printContainer.style.top = '0';
            printContainer.style.width = '210mm'; // A4 width
            printContainer.style.background = '#ffffff';
            printContainer.dir = 'rtl';
            document.body.appendChild(printContainer);

            // Populate container with official Iraqi school report formatting
            printContainer.innerHTML = `
                <div style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 15mm; color: #111827; box-sizing: border-box;">
                    <!-- Official Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0891b2; padding-bottom: 10px; margin-bottom: 15px;">
                        <div style="text-align: right; line-height: 1.4;">
                            <div style="font-size: 13pt; font-weight: bold; color: #1f2937;">جمهورية العراق</div>
                            <div style="font-size: 11pt; color: #4b5563;">وزارة التربية - ${settings.directorate || 'المديرية العامة للتربية'}</div>
                            <div style="font-size: 12pt; font-weight: bold; color: #0891b2;">${settings.schoolName}</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 16pt; font-weight: 900; color: #0e7490; margin-bottom: 4px;">سجل الحضور اليومي للمدرسين</div>
                            <div style="font-size: 10pt; color: #6b7280;">(عبر منظومة رموز QR الذكية)</div>
                        </div>
                        <div style="text-align: left; line-height: 1.4;">
                            <div style="font-size: 10pt; color: #4b5563;">العام الدراسي: <strong>${settings.academicYear || '---'}</strong></div>
                            <div style="font-size: 10pt; color: #4b5563;">التاريخ: <strong>${selectedDate}</strong></div>
                            <div style="font-size: 10pt; color: #4b5563;">اليوم: <strong>${new Date(selectedDate).toLocaleDateString('ar-IQ', { weekday: 'long' })}</strong></div>
                        </div>
                    </div>

                    <!-- Statistics Summary Bar -->
                    <div style="display: flex; justify-content: space-between; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 8px 16px; margin-bottom: 16px;">
                        <div style="font-size: 10pt;">إجمالي الكادر: <strong>${stats.total}</strong></div>
                        <div style="font-size: 10pt; color: #047857;">عدد الحاضرين: <strong>${stats.present}</strong></div>
                        <div style="font-size: 10pt; color: #b91c1c;">عدد الغائبين: <strong>${stats.absent}</strong></div>
                        <div style="font-size: 10pt; color: #0369a1;">نسبة الحضور: <strong>${stats.rate}%</strong></div>
                    </div>

                    <!-- Attendance Table -->
                    <table style="width: 100%; border-collapse: collapse; font-size: 10pt; text-align: right;">
                        <thead>
                            <tr style="background: #0891b2; color: #ffffff;">
                                <th style="border: 1px solid #0891b2; padding: 6px 8px; width: 35px; text-align: center;">ت</th>
                                <th style="border: 1px solid #0891b2; padding: 6px 8px;">اسم المدرس / الكادر</th>
                                <th style="border: 1px solid #0891b2; padding: 6px 8px;">المادة / الاختصاص</th>
                                <th style="border: 1px solid #0891b2; padding: 6px 8px; text-align: center; width: 100px;">وقت الحضور</th>
                                <th style="border: 1px solid #0891b2; padding: 6px 8px; text-align: center; width: 85px;">الحالة</th>
                                <th style="border: 1px solid #0891b2; padding: 6px 8px; width: 120px;">ملاحظات / التوقيع</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${teachersList.map((t, idx) => {
                                const rec = attendanceMap[t.id];
                                const isPresent = rec && (rec.status === 'present' || rec.status === 'late');
                                const bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
                                const statusColor = isPresent ? '#059669' : '#dc2626';
                                const statusText = isPresent ? (rec.status === 'late' ? 'متأخر' : 'حاضر') : 'غائب';
                                const checkInTime = isPresent ? rec.time : '----';
                                
                                return `
                                    <tr style="background: ${bg};">
                                        <td style="border: 1px solid #d1d5db; padding: 5px 6px; text-align: center; font-weight: bold;">${idx + 1}</td>
                                        <td style="border: 1px solid #d1d5db; padding: 5px 8px; font-weight: bold;">${t.name}</td>
                                        <td style="border: 1px solid #d1d5db; padding: 5px 8px; color: #4b5563;">${getTeacherSubjects(t)}</td>
                                        <td style="border: 1px solid #d1d5db; padding: 5px 6px; text-align: center; font-family: monospace; font-size: 9pt; direction: ltr;">${checkInTime}</td>
                                        <td style="border: 1px solid #d1d5db; padding: 5px 6px; text-align: center; font-weight: bold; color: ${statusColor};">${statusText}</td>
                                        <td style="border: 1px solid #d1d5db; padding: 5px 8px; font-size: 8.5pt; color: #6b7280;">${rec?.note || ''}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>

                    <!-- Signatures Section -->
                    <div style="display: flex; justify-content: space-between; margin-top: 30px; padding-top: 15px; border-top: 1px dashed #9ca3af;">
                        <div style="text-align: center; min-width: 140px;">
                            <div style="font-size: 10pt; font-weight: bold;">مسؤول الحضور والانصراف</div>
                            <div style="margin-top: 35px; font-size: 9pt; color: #9ca3af;">التوقيع: .....................</div>
                        </div>
                        <div style="text-align: center; min-width: 140px;">
                            <div style="font-size: 10pt; font-weight: bold;">معاون شؤون الإدارة والطلبة</div>
                            <div style="margin-top: 35px; font-size: 9pt; color: #9ca3af;">التوقيع: .....................</div>
                        </div>
                        <div style="text-align: center; min-width: 140px;">
                            <div style="font-size: 10pt; font-weight: bold;">مدير المدرسة</div>
                            <div style="font-size: 11pt; font-weight: 900; color: #111827; margin-top: 4px;">${settings.principalName || 'إدارة المدرسة'}</div>
                            <div style="margin-top: 20px; font-size: 9pt; color: #9ca3af;">الختم والتوقيع: .....................</div>
                        </div>
                    </div>
                </div>
            `;

            setPdfProgress(40);
            await document.fonts.ready;

            const canvas = await html2canvas(printContainer, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff'
            });

            setPdfProgress(75);

            const pdf = new jsPDFClass({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgData = canvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
            pdf.save(`سجل_حضور_المدرسين_${selectedDate}.pdf`);

            document.body.removeChild(printContainer);
            setPdfProgress(100);
        } catch (err: any) {
            console.error("PDF export error:", err);
            alert("حدث خطأ أثناء تصدير ملف PDF: " + (err?.message || "يرجى المحاولة مرة أخرى"));
        } finally {
            setIsExportingPDF(false);
            setPdfProgress(0);
        }
    };

    // Export Teacher QR Badges as multi-page PDF (Requirement 6)
    const handleExportTeacherBadgesPDF = async () => {
        const teachersToPrint = teachersList.filter(t => selectedTeacherIdsForBadges.includes(t.id));
        if (teachersToPrint.length === 0) {
            alert("يرجى تحديد مدرس واحد على الأقل لتوليد بطاقة QR له.");
            return;
        }

        setIsExportingPDF(true);
        setPdfProgress(5);

        try {
            const jsPDFClass = (window as any).jspdf?.jsPDF || jspdf?.jsPDF;
            if (!jsPDFClass) {
                throw new Error("مكتبة jsPDF غير متوفرة حالياً");
            }

            // Chunk teachers into pages: 8 cards per page (2 columns x 4 rows)
            const CARDS_PER_PAGE = 8;
            const chunks: User[][] = [];
            for (let i = 0; i < teachersToPrint.length; i += CARDS_PER_PAGE) {
                chunks.push(teachersToPrint.slice(i, i + CARDS_PER_PAGE));
            }

            const pdf = new jsPDFClass({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const tempContainer = document.createElement('div');
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            tempContainer.style.top = '0';
            tempContainer.style.width = '210mm';
            tempContainer.style.background = '#ffffff';
            tempContainer.dir = 'rtl';
            document.body.appendChild(tempContainer);

            for (let pageIdx = 0; pageIdx < chunks.length; pageIdx++) {
                const currentChunk = chunks[pageIdx];
                const cleanHex = selectedBadgeColor.replace('#', '');

                tempContainer.innerHTML = `
                    <div style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; width: 210mm; min-height: 297mm; padding: 8mm; box-sizing: border-box; background: #ffffff;">
                        <!-- Page Header -->
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${selectedBadgeColor}; padding-bottom: 6px; margin-bottom: 8px;">
                            <div style="font-size: 11pt; font-weight: bold; color: #1f2937;">
                                ${settings.schoolName} - بطاقات الحضور الذكية (QR)
                            </div>
                            <div style="font-size: 9pt; color: #6b7280;">
                                العام الدراسي: ${settings.academicYear || '---'} | صفحة ${pageIdx + 1} من ${chunks.length}
                            </div>
                            <div style="font-size: 8.5pt; color: #9ca3af;">
                                ✂️ قم بالقص بمحاذاة الخطوط المتقطعة
                            </div>
                        </div>

                        <!-- 2 Columns x 4 Rows Grid of ID Cards -->
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6mm;">
                            ${currentChunk.map((teacher) => {
                                const qrData = `TEACHER:${teacher.id}`;
                                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}&color=${cleanHex}&margin=1`;
                                const subjects = getTeacherSubjects(teacher);

                                return `
                                    <div style="border: 2px dashed #9ca3af; padding: 4mm; border-radius: 8px; background: #ffffff; position: relative; box-sizing: border-box;">
                                        <!-- Cutting scissors icon indicator -->
                                        <div style="position: absolute; top: -7px; right: 8px; font-size: 8pt; background: #fff; padding: 0 4px; color: #6b7280;">✂️</div>

                                        <!-- Badge Container -->
                                        <div style="border: 2px solid ${selectedBadgeColor}; border-radius: 8px; overflow: hidden; background: #ffffff;">
                                            <!-- Badge Top Bar -->
                                            <div style="background: ${selectedBadgeColor}; color: #ffffff; padding: 5px 8px; text-align: center;">
                                                <div style="font-size: 7.5pt; opacity: 0.9;">جمهورية العراق - وزارة التربية</div>
                                                <div style="font-size: 9.5pt; font-weight: 900;">${settings.schoolName}</div>
                                                <div style="font-size: 7pt; opacity: 0.85; margin-top: 1px;">بطاقة الحضور والانصراف الإلكترونية</div>
                                            </div>

                                            <!-- Badge Body: Info Right, QR Left -->
                                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; gap: 8px;">
                                                <!-- Teacher Details -->
                                                <div style="flex: 1; text-align: right; min-width: 0;">
                                                    <div style="font-size: 7.5pt; color: #6b7280; font-weight: bold; margin-bottom: 2px;">اسم الأستاذ / الكادر:</div>
                                                    <div style="font-size: 11pt; font-weight: 900; color: #111827; margin-bottom: 4px; line-height: 1.2; word-break: break-word;">
                                                        ${teacher.name}
                                                    </div>
                                                    <div style="font-size: 8pt; color: #0284c7; font-weight: bold; margin-bottom: 4px;">
                                                        المادة: ${subjects}
                                                    </div>
                                                    <div style="display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                                                        <span style="font-size: 7pt; color: #6b7280; font-weight: bold;">الرمز:</span>
                                                        <span style="font-size: 8pt; font-family: monospace; font-weight: bold; background: #f3f4f6; padding: 1px 6px; border-radius: 4px; border: 1px solid #e5e7eb;">
                                                            ${teacher.code || teacher.id.substring(0, 8)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <!-- QR Code Block -->
                                                <div style="width: 25mm; height: 25mm; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 2px;">
                                                    <img src="${qrUrl}" alt="QR Code" style="width: 100%; height: 100%; object-fit: contain;" />
                                                </div>
                                            </div>

                                            <!-- Badge Footer Note -->
                                            <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 2px 6px; text-align: center; font-size: 6.5pt; color: #64748b;">
                                                قم بتوجيه الرمز أمام كاميرا تسجيل الحضور عند الدخول
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;

                // Render fonts & capture canvas
                await document.fonts.ready;
                // Wait for all QR images in this chunk to load
                const imgs = Array.from(tempContainer.querySelectorAll('img'));
                await Promise.all(imgs.map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise((resolve) => {
                        img.onload = () => resolve(true);
                        img.onerror = () => resolve(true);
                        setTimeout(resolve, 1500); // safety fallback
                    });
                }));

                const canvas = await html2canvas(tempContainer, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff'
                });

                if (pageIdx > 0) {
                    pdf.addPage();
                }

                const imgData = canvas.toDataURL('image/png');
                pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
                
                setPdfProgress(Math.round(((pageIdx + 1) / chunks.length) * 100));
            }

            pdf.save(`بطاقات_QR_حضور_المدرسين.pdf`);
            document.body.removeChild(tempContainer);
        } catch (err: any) {
            console.error("PDF generation error:", err);
            alert("حدث خطأ أثناء تصدير بطاقات المدرسين: " + (err?.message || "يرجى المحاولة مرة أخرى"));
        } finally {
            setIsExportingPDF(false);
            setPdfProgress(0);
        }
    };

    // Toggle select all teachers for badges
    const handleToggleSelectAllTeachers = () => {
        if (selectedTeacherIdsForBadges.length === teachersList.length) {
            setSelectedTeacherIdsForBadges([]);
        } else {
            setSelectedTeacherIdsForBadges(teachersList.map(t => t.id));
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12" dir="rtl">
            {/* Top Navigation & Header Bar */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0" style={{ backgroundColor: '#0891b2' }}>
                        <QrCode className="w-7 h-7" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                            تسجيل الحضور اليومي للمدرسين (QR)
                        </h1>
                        <p className="text-xs md:text-sm text-gray-600 font-bold mt-0.5">
                            مسح فوري بالكاميرا الخلفية المباشرة، سجل الحضور، وتوليد هويات وبطاقات الكادر
                        </p>
                    </div>
                </div>

                {/* Tabs Switcher */}
                <div className="flex items-center bg-gray-200 p-1.5 rounded-xl border border-gray-300 w-full md:w-auto">
                    <button
                        onClick={() => setActiveTab('scanner')}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-black transition-all cursor-pointer"
                        style={activeTab === 'scanner' 
                            ? { backgroundColor: '#0891b2', color: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' } 
                            : { color: '#1f2937' }}
                    >
                        <Camera className="w-4 h-4" />
                        <span>الماسح المباشر</span>
                        {isScannerRunning && (
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" title="الكاميرا نشطة" />
                        )}
                    </button>

                    <button
                        onClick={() => setActiveTab('logs')}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-black transition-all cursor-pointer"
                        style={activeTab === 'logs' 
                            ? { backgroundColor: '#0891b2', color: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' } 
                            : { color: '#1f2937' }}
                    >
                        <FileText className="w-4 h-4" />
                        <span>سجل الحضور والتقارير</span>
                        <span 
                            className="text-xs px-2 py-0.5 rounded-full font-black"
                            style={activeTab === 'logs' 
                                ? { backgroundColor: '#ffffff', color: '#0e7490' } 
                                : { backgroundColor: '#dbeafe', color: '#1e40af' }}
                        >
                            {stats.present}/{stats.total}
                        </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('generator')}
                        className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-black transition-all cursor-pointer"
                        style={activeTab === 'generator' 
                            ? { backgroundColor: '#0891b2', color: '#ffffff', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' } 
                            : { color: '#1f2937' }}
                    >
                        <Award className="w-4 h-4" />
                        <span>توليد هويات QR</span>
                    </button>
                </div>
            </div>

            {/* Loading / Progress Modal for PDF Generation */}
            {isExportingPDF && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white p-4">
                    <div className="bg-slate-900 border-2 border-slate-700 p-6 rounded-2xl flex flex-col items-center max-w-sm w-full shadow-2xl text-center">
                        <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-4" />
                        <h3 className="text-lg font-bold mb-2 text-white">جاري تجهيز وتصدير ملف PDF...</h3>
                        <p className="text-xs text-gray-300 mb-4">يتم ضبط الهوامش وتوليد الصفحات بدقة عالية للطباعة</p>
                        <div className="w-full bg-gray-800 h-3 rounded-full overflow-hidden mb-2">
                            <div 
                                className="h-full transition-all duration-300"
                                style={{ width: `${pdfProgress}%`, backgroundColor: '#06b6d4' }}
                            />
                        </div>
                        <span className="text-xs font-mono font-black text-cyan-300">{pdfProgress}%</span>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 1: LIVE SCANNER (Requirements 1, 2, 3, 4)                             */}
            {/* ========================================================================= */}
            {activeTab === 'scanner' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Left Column: Live Camera & Welcome Banner (7 cols) */}
                    <div className="lg:col-span-7 space-y-4">
                        {/* Live Welcome Banner (Celebratory greeting card on scan) */}
                        {recentWelcome ? (
                            <div 
                                className="p-5 rounded-2xl shadow-xl border-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in zoom-in duration-300"
                                style={{ backgroundColor: '#047857', borderColor: '#34d399', color: '#ffffff' }}
                            >
                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                    <div 
                                        className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border-2 shadow-inner"
                                        style={{ backgroundColor: '#064e3b', borderColor: '#fde047' }}
                                    >
                                        <Smile className="w-8 h-8 animate-bounce" style={{ color: '#fde047' }} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span 
                                                className="text-xs px-3 py-0.5 rounded-full font-black shadow-sm"
                                                style={{ 
                                                    backgroundColor: recentWelcome.isRepeat ? '#fef08a' : '#fde047', 
                                                    color: '#14532d',
                                                    border: '1px solid #ca8a04'
                                                }}
                                            >
                                                {recentWelcome.isRepeat ? '✓ تأكيد الحضور مسبقاً' : '✓ تم تسجيل الحضور بنجاح'}
                                            </span>
                                            <span 
                                                className="text-xs font-mono font-bold px-2 py-0.5 rounded-md"
                                                style={{ backgroundColor: '#064e3b', color: '#a7f3d0' }}
                                            >
                                                {recentWelcome.time}
                                            </span>
                                        </div>
                                        <h3 className="text-xl md:text-2xl font-black mt-1.5 tracking-tight" style={{ color: '#ffffff' }}>
                                            أهلاً وسهلاً بحضرتك يا أستاذ {recentWelcome.teacher.name}! ✨
                                        </h3>
                                        <p className="text-sm font-bold mt-1" style={{ color: '#fef08a' }}>
                                            المادة: {getTeacherSubjects(recentWelcome.teacher)} • مرحباً بك في دوام اليوم
                                        </p>
                                    </div>
                                </div>
                                <div 
                                    className="hidden sm:flex flex-col items-center justify-center px-4 py-2.5 rounded-xl border-2 shrink-0 shadow-sm"
                                    style={{ backgroundColor: '#064e3b', borderColor: '#34d399' }}
                                >
                                    <CheckCircle className="w-8 h-8" style={{ color: '#fde047' }} />
                                    <span className="text-xs font-black mt-1" style={{ color: '#ffffff' }}>تم الحضور</span>
                                </div>
                            </div>
                        ) : (
                            /* Waiting placeholder banner - Redesigned for maximum readability and high contrast */
                            <div 
                                className="p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md border-2"
                                style={{ backgroundColor: '#0f172a', borderColor: '#10b981', color: '#ffffff' }}
                            >
                                <div className="flex items-center gap-3.5 w-full sm:w-auto">
                                    <div 
                                        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border-2"
                                        style={{ backgroundColor: '#059669', borderColor: '#34d399', color: '#ffffff' }}
                                    >
                                        <Camera className="w-6 h-6 animate-pulse text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-black tracking-tight" style={{ color: '#ffffff' }}>
                                            الكاميرا الخلفية جاهزة وتعمل باستمرار
                                        </h3>
                                        <p className="text-xs font-bold mt-0.5" style={{ color: '#a7f3d0' }}>
                                            وجّه بطاقة QR الخاصة بالمدرس نحو الكاميرا لتسجيل الحضور فوراً
                                        </p>
                                    </div>
                                </div>
                                <div 
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black shadow-sm shrink-0 border"
                                    style={{ backgroundColor: '#047857', color: '#ffffff', borderColor: '#34d399' }}
                                >
                                    <span className="w-2.5 h-2.5 rounded-full animate-ping" style={{ backgroundColor: '#fde047' }} />
                                    <span style={{ color: '#ffffff' }}>بانتظار الرمز التالي...</span>
                                </div>
                            </div>
                        )}

                        {/* Camera Viewfinder Box */}
                        <div className="bg-gray-900 rounded-3xl overflow-hidden shadow-xl border-4 border-gray-800 relative">
                            {/* Camera Header controls */}
                            <div className="p-3.5 bg-gray-900 border-b border-gray-800 flex items-center justify-between text-white z-10 relative">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-xs font-black tracking-wide" style={{ color: '#ffffff' }}>بث مباشر - الكاميرا الخلفية</span>
                                </div>

                                {/* Camera Selector Dropdown */}
                                {availableCameras.length > 1 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-300 font-bold">الكاميرا:</span>
                                        <select
                                            value={selectedCameraId}
                                            onChange={(e) => handleCameraChange(e.target.value)}
                                            className="bg-gray-800 border border-gray-600 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none font-bold"
                                        >
                                            {availableCameras.map(c => {
                                                const lbl = (c.label || '').toLowerCase();
                                                const isBack = lbl.includes('back') || lbl.includes('rear') || lbl.includes('environment') || lbl.includes('خلف');
                                                const isFront = lbl.includes('front') || lbl.includes('user') || lbl.includes('selfie') || lbl.includes('أمام');
                                                const prefix = isBack ? '📷 خلفية: ' : isFront ? '📷 أمامية: ' : '📷 ';
                                                return (
                                                    <option key={c.id} value={c.id}>
                                                        {prefix}{c.label}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                )}

                                <button
                                    onClick={() => launchScanner(selectedCameraId || { facingMode: "environment" })}
                                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-200 hover:text-white transition-colors cursor-pointer"
                                    title="إعادة تشغيل الكاميرا"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Viewport Area */}
                            <div className="relative min-h-[380px] md:min-h-[440px] flex items-center justify-center bg-black">
                                <div 
                                    id="teacher-qr-reader" 
                                    className="w-full h-full overflow-hidden flex items-center justify-center [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
                                />

                                {/* Camera starting indicator */}
                                {isStartingScanner && (
                                    <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center text-white z-20">
                                        <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-2" />
                                        <p className="text-sm font-bold text-white">جاري فتح الكاميرا الخلفية...</p>
                                    </div>
                                )}

                                {/* Camera error message */}
                                {scannerError && (
                                    <div className="absolute inset-0 bg-gray-900/95 flex flex-col items-center justify-center text-center p-6 text-white z-20">
                                        <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
                                        <h4 className="text-base font-bold mb-1 text-white">تعذر تشغيل الكاميرا</h4>
                                        <p className="text-xs text-gray-300 max-w-md mb-4">{scannerError}</p>
                                        <button
                                            onClick={() => launchScanner(selectedCameraId || { facingMode: "environment" })}
                                            className="px-5 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-lg cursor-pointer"
                                            style={{ backgroundColor: '#0891b2', color: '#ffffff', border: '1px solid #06b6d4' }}
                                        >
                                            <RefreshCw className="w-4 h-4" />
                                            <span>إعادة المحاولة والتشغيل</span>
                                        </button>
                                    </div>
                                )}

                                {/* Target scanning frame guide lines */}
                                {isScannerRunning && !scannerError && (
                                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                                        <div className="w-64 h-64 border-2 border-cyan-400/80 rounded-3xl relative shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                                            {/* Corner brackets */}
                                            <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-cyan-400 rounded-tr-xl" />
                                            <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-cyan-400 rounded-tl-xl" />
                                            <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-cyan-400 rounded-br-xl" />
                                            <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-cyan-400 rounded-bl-xl" />
                                            {/* Center scanning line */}
                                            <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent top-1/2 -translate-y-1/2 animate-pulse" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Camera Status Footer */}
                            <div className="p-3 bg-gray-900 border-t border-gray-800 text-xs text-gray-300 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                    <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                                    <span className="font-bold">نغمة الترحيب مفعلة تلقائياً</span>
                                </span>
                                <span className="text-[11px] text-gray-400 font-bold">
                                    تبقى الكاميرا نشطة باستمرار بانتظار بطاقات الأساتذة
                                </span>
                            </div>
                        </div>

                        {/* Quick Manual Check-in for teachers without card */}
                        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Search className="w-3.5 h-3.5 text-cyan-600" />
                                <span>تسجيل يدوي سريع (لمن نسي البطاقة)</span>
                            </h4>
                            <div className="flex gap-2">
                                <select
                                    className="flex-1 p-2.5 border border-gray-300 rounded-xl text-xs md:text-sm font-medium bg-gray-50 outline-none focus:ring-2 focus:ring-cyan-500"
                                    onChange={(e) => {
                                        const teacherId = e.target.value;
                                        if (!teacherId) return;
                                        const t = teachersList.find(x => x.id === teacherId);
                                        if (t) recordTeacherAttendance(t, 'manual');
                                        e.target.value = '';
                                    }}
                                    defaultValue=""
                                >
                                    <option value="" disabled>-- اختر اسم الأستاذ للتسجيل اليدوي المباشر --</option>
                                    {teachersList.map(t => {
                                        const isPresent = !!attendanceMap[t.id];
                                        return (
                                            <option key={t.id} value={t.id}>
                                                {t.name} {isPresent ? '✓ (مسجل حضور مسبقاً)' : ''}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Live Feed & Today's Attendance Stream (5 cols) */}
                    <div className="lg:col-span-5 space-y-4">
                        {/* Daily Stats Overview Cards */}
                        <div className="grid grid-cols-3 gap-2.5">
                            <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm text-center">
                                <span className="text-[11px] font-bold text-gray-500 block">إجمالي الكادر</span>
                                <span className="text-xl font-black text-gray-800">{stats.total}</span>
                            </div>
                            <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-center">
                                <span className="text-[11px] font-bold text-emerald-700 block">الحاضرون اليوم</span>
                                <span className="text-xl font-black text-emerald-800">{stats.present}</span>
                            </div>
                            <div className="bg-rose-50 p-3 rounded-2xl border border-rose-100 text-center">
                                <span className="text-[11px] font-bold text-rose-700 block">لم يحضروا بعد</span>
                                <span className="text-xl font-black text-rose-800">{stats.absent}</span>
                            </div>
                        </div>

                        {/* Recent Check-ins List Card */}
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[520px]">
                            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
                                <div className="flex items-center gap-2">
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    <h3 className="font-bold text-sm text-gray-900">
                                        سجل الحاضرين اليوم (مباشر)
                                    </h3>
                                </div>
                                <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                                    {todayCheckedInList.length} أستاذ
                                </span>
                            </div>

                            {/* Feed Items */}
                            <div className="flex-1 overflow-y-auto p-3 space-y-2 divide-y divide-gray-100">
                                {todayCheckedInList.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                                        <Clock className="w-12 h-12 text-gray-300 mb-2 stroke-1" />
                                        <p className="text-sm font-bold text-gray-500">لم يسجل أي أستاذ حضوره بعد</p>
                                        <p className="text-xs text-gray-400 mt-1 max-w-xs">
                                            قم بتوجيه رمز QR الخاص بالمدرس نحو الكاميرا لبدء التسجيل
                                        </p>
                                    </div>
                                ) : (
                                    todayCheckedInList.map((rec, index) => {
                                        const teacherObj = teachersList.find(t => t.id === rec.teacherId);
                                        return (
                                            <div 
                                                key={rec.teacherId} 
                                                className={`pt-2.5 first:pt-0 flex items-center justify-between gap-3 p-2 rounded-xl transition-all ${
                                                    index === 0 ? 'bg-emerald-50/80 border border-emerald-200' : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="w-8 h-8 rounded-full bg-cyan-100 text-cyan-800 font-bold flex items-center justify-center text-xs shrink-0">
                                                        {index + 1}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-xs md:text-sm font-black text-gray-900 truncate">
                                                            {rec.teacherName}
                                                        </h4>
                                                        <p className="text-[11px] text-gray-500 truncate">
                                                            {teacherObj ? getTeacherSubjects(teacherObj) : 'كادر'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="text-left shrink-0">
                                                    <div className="flex items-center gap-1 text-xs font-mono font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-lg border border-emerald-200">
                                                        <Clock className="w-3 h-3 text-emerald-600" />
                                                        <span>{rec.time}</span>
                                                    </div>
                                                    <span className="text-[10px] text-gray-400 block mt-0.5">
                                                        {rec.method === 'qr' ? 'بواسطة QR' : 'تسجيل يدوي'}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Footer Actions */}
                            <div className="p-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs">
                                <span className="text-gray-500">
                                    التاريخ: <strong>{getTodayDateString()}</strong>
                                </span>
                                <button
                                    onClick={() => setActiveTab('logs')}
                                    className="text-cyan-700 font-bold hover:text-cyan-900 flex items-center gap-1 transition-colors"
                                >
                                    <span>عرض وطباعة التقرير الكامل</span>
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: ATTENDANCE LOGS & PDF REPORT (Requirement 5)                       */}
            {/* ========================================================================= */}
            {activeTab === 'logs' && (
                <div className="space-y-6">
                    {/* Filter & Date Controller Bar */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            {/* Date Selector */}
                            <div className="flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-cyan-600" />
                                <span className="text-sm font-bold text-gray-700">تاريخ السجل:</span>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="border border-gray-300 rounded-xl px-3 py-1.5 text-sm font-bold text-gray-800 bg-gray-50 outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                                <button
                                    onClick={() => setSelectedDate(getTodayDateString())}
                                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-bold transition-colors"
                                >
                                    اليوم الحالي
                                </button>
                            </div>

                            {/* Export to PDF Button (Requirement 5) */}
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <button
                                    onClick={handleExportAttendancePDF}
                                    disabled={isExportingPDF}
                                    className="w-full md:w-auto px-5 py-2.5 rounded-xl text-sm font-black shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 hover:brightness-110"
                                    style={{ backgroundColor: '#047857', color: '#ffffff', border: '2px solid #065f46' }}
                                >
                                    <FileDown className="w-5 h-5" style={{ color: '#fde047' }} />
                                    <span style={{ color: '#ffffff' }}>تصدير السجل كملف PDF</span>
                                </button>
                            </div>
                        </div>

                        {/* Search & Status Filters */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-gray-100">
                            <div className="md:col-span-6 relative">
                                <Search className="w-4 h-4 text-gray-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="ابحث باسم المدرس، المادة، أو الكود..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-xl text-sm font-medium bg-gray-50 outline-none focus:ring-2 focus:ring-cyan-500"
                                />
                            </div>

                            <div className="md:col-span-6 flex items-center gap-2 justify-end">
                                <span className="text-xs text-gray-700 font-bold">الحالة:</span>
                                <div className="flex bg-gray-200 p-1 rounded-xl border border-gray-300">
                                    <button
                                        onClick={() => setStatusFilter('all')}
                                        className="px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer"
                                        style={statusFilter === 'all' 
                                            ? { backgroundColor: '#0f172a', color: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } 
                                            : { color: '#374151' }}
                                    >
                                        الكل ({teachersList.length})
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('present')}
                                        className="px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer"
                                        style={statusFilter === 'present' 
                                            ? { backgroundColor: '#047857', color: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } 
                                            : { color: '#374151' }}
                                    >
                                        حاضرون ({stats.present})
                                    </button>
                                    <button
                                        onClick={() => setStatusFilter('absent')}
                                        className="px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer"
                                        style={statusFilter === 'absent' 
                                            ? { backgroundColor: '#b91c1c', color: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' } 
                                            : { color: '#374151' }}
                                    >
                                        غائبون ({stats.absent})
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Statistics Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                <Users className="w-5 h-5" />
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block">إجمالي الكادر</span>
                                <span className="text-xl font-black text-gray-900">{stats.total}</span>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                <UserCheck className="w-5 h-5" />
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block">المسجلين حضوراً</span>
                                <span className="text-xl font-black text-emerald-600">{stats.present}</span>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                                <UserX className="w-5 h-5" />
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block">لم يسجلوا بعد</span>
                                <span className="text-xl font-black text-rose-600">{stats.absent}</span>
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center shrink-0">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 block">نسبة الحضور</span>
                                <span className="text-xl font-black text-cyan-600">{stats.rate}%</span>
                            </div>
                        </div>
                    </div>

                    {/* Main Attendance Table */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-right text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-600">
                                    <tr>
                                        <th className="p-3.5 w-12 text-center">ت</th>
                                        <th className="p-3.5">اسم المدرس / الكادر</th>
                                        <th className="p-3.5">المادة / الاختصاص</th>
                                        <th className="p-3.5 text-center">وقت الحضور</th>
                                        <th className="p-3.5 text-center">طريقة التسجيل</th>
                                        <th className="p-3.5 text-center">الحالة</th>
                                        <th className="p-3.5">ملاحظات</th>
                                        <th className="p-3.5 text-center">إجراءات</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-medium">
                                    {isLoadingAttendance ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-gray-400">
                                                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-cyan-600" />
                                                <span>جاري تحميل بيانات السجل...</span>
                                            </td>
                                        </tr>
                                    ) : filteredTeachers.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-8 text-center text-gray-400">
                                                لم يتم العثور على أي مدرس يطابق معايير البحث
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredTeachers.map((teacher, idx) => {
                                            const rec = attendanceMap[teacher.id];
                                            const isPresent = rec && (rec.status === 'present' || rec.status === 'late');
                                            const status = rec ? rec.status : 'absent';

                                            return (
                                                <tr key={teacher.id} className="hover:bg-gray-50/80 transition-colors">
                                                    <td className="p-3.5 text-center text-xs font-bold text-gray-400">
                                                        {idx + 1}
                                                    </td>
                                                    <td className="p-3.5">
                                                        <div className="font-black text-gray-900">{teacher.name}</div>
                                                        <div className="text-[11px] text-gray-400 font-mono">
                                                            كود: {teacher.code || teacher.id.substring(0, 8)}
                                                        </div>
                                                    </td>
                                                    <td className="p-3.5 text-gray-600 text-xs">
                                                        {getTeacherSubjects(teacher)}
                                                    </td>
                                                    <td className="p-3.5 text-center font-mono text-xs" dir="ltr">
                                                        {isPresent ? (
                                                            <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                                                                {rec.time}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400">--:--</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3.5 text-center text-xs text-gray-500">
                                                        {rec?.method === 'qr' ? (
                                                            <span className="inline-flex items-center gap-1 text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full font-bold">
                                                                <QrCode className="w-3 h-3" />
                                                                <span>رمز QR</span>
                                                            </span>
                                                        ) : rec?.method === 'manual' ? (
                                                            <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full font-bold">
                                                                <span>يدوي</span>
                                                            </span>
                                                        ) : (
                                                            '---'
                                                        )}
                                                    </td>
                                                    <td className="p-3.5 text-center">
                                                        {status === 'present' && (
                                                            <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-black">
                                                                حاضر
                                                            </span>
                                                        )}
                                                        {status === 'late' && (
                                                            <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-1 rounded-full font-black">
                                                                متأخر
                                                            </span>
                                                        )}
                                                        {status === 'excused' && (
                                                            <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-full font-black">
                                                                مجاز
                                                            </span>
                                                        )}
                                                        {status === 'absent' && (
                                                            <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-1 rounded-full font-black">
                                                                لم يحضر
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="p-3.5 text-xs text-gray-500">
                                                        {rec?.note || '---'}
                                                    </td>
                                                    <td className="p-3.5 text-center">
                                                        <div className="flex items-center justify-center gap-1.5">
                                                            {!isPresent ? (
                                                                <button
                                                                    onClick={() => handleUpdateStatus(teacher, 'present')}
                                                                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold transition-colors"
                                                                    title="تسجيل حضور الآن"
                                                                >
                                                                    <Check className="w-4 h-4" />
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleRemoveRecord(teacher.id)}
                                                                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold transition-colors"
                                                                    title="إلغاء الحضور"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 3: GENERATE TEACHER QR ID BADGES & PDF (Requirement 6)                 */}
            {/* ========================================================================= */}
            {activeTab === 'generator' && (
                <div className="space-y-6">
                    {/* Generation Controller Card */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                                    <Award className="w-5 h-5 text-cyan-600" />
                                    <span>توليد وتصدير هويات وبطاقات QR للمدرسين</span>
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    بطاقات تعريفية مجهزة بخطوط تنقيط للقص ✂️ تم تصميمها بحجم قياسي لطباعتها وتوزيعها على الكادر كهوية
                                </p>
                            </div>

                            {/* Export All to Single PDF Button (Requirement 6) - Styled with unmistakable high-contrast colors */}
                            <button
                                onClick={handleExportTeacherBadgesPDF}
                                disabled={isExportingPDF || selectedTeacherIdsForBadges.length === 0}
                                className="px-6 py-3.5 rounded-xl text-sm md:text-base font-black shadow-lg transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50 hover:brightness-110"
                                style={{ backgroundColor: '#1d4ed8', color: '#ffffff', border: '2px solid #1e40af' }}
                            >
                                <FileDown className="w-5 h-5" style={{ color: '#fde047' }} />
                                <span style={{ color: '#ffffff' }}>تصدير الهويات كملف PDF للطباعة</span>
                                <span 
                                    className="px-2.5 py-0.5 rounded-lg text-xs font-black shadow-sm"
                                    style={{ backgroundColor: '#fde047', color: '#1e3a8a' }}
                                >
                                    {selectedTeacherIdsForBadges.length} بطاقة
                                </span>
                            </button>
                        </div>

                        {/* Controls: Color Picker & Selection */}
                        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-gray-100">
                            {/* QR Color Picker */}
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-gray-600">لون الرمز والإطار:</span>
                                <div className="flex items-center gap-2">
                                    {BADGE_COLORS.map(c => (
                                        <button
                                            key={c.hex}
                                            onClick={() => setSelectedBadgeColor(c.hex)}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                                                selectedBadgeColor === c.hex 
                                                    ? 'border-gray-900 ring-2 ring-cyan-500 bg-gray-50' 
                                                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.hex }} />
                                            <span>{c.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Select All / Deselect All */}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleToggleSelectAllTeachers}
                                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-bold transition-colors"
                                >
                                    {selectedTeacherIdsForBadges.length === teachersList.length ? 'إلغاء تحديد الكل' : 'تحديد جميع المدرسين'}
                                </button>
                                <span className="text-xs text-gray-500">
                                    تم تحديد: <strong>{selectedTeacherIdsForBadges.length}</strong> من أصل {teachersList.length}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Live Preview Grid of ID Badges */}
                    <div>
                        <div className="flex items-center justify-between mb-3 px-1">
                            <span className="text-xs font-bold text-gray-500">
                                معاينة البطاقات قبل الطباعة (بشكل جدول منظم):
                            </span>
                            <span className="text-xs text-cyan-600 font-bold">
                                رمز المعرف: TEACHER:ID
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {teachersList.map((teacher) => {
                                const isSelected = selectedTeacherIdsForBadges.includes(teacher.id);
                                const qrData = `TEACHER:${teacher.id}`;
                                const cleanHex = selectedBadgeColor.replace('#', '');
                                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qrData)}&color=${cleanHex}&margin=1`;
                                const subjects = getTeacherSubjects(teacher);

                                return (
                                    <div
                                        key={teacher.id}
                                        className={`relative transition-all ${isSelected ? 'opacity-100' : 'opacity-40'}`}
                                    >
                                        {/* Selection Checkbox */}
                                        <div className="absolute top-2 left-2 z-10">
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => {
                                                    setSelectedTeacherIdsForBadges(prev => 
                                                        prev.includes(teacher.id)
                                                            ? prev.filter(id => id !== teacher.id)
                                                            : [...prev, teacher.id]
                                                    );
                                                }}
                                                className="w-5 h-5 rounded text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                                            />
                                        </div>

                                        {/* Cutting Border Guide */}
                                        <div className="border-2 border-dashed border-gray-300 p-2.5 rounded-2xl bg-white shadow-sm hover:border-cyan-400 transition-colors">
                                            <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1 px-1">
                                                <span>✂️ خط القص</span>
                                                <span>بطاقة هوية أستاذ</span>
                                            </div>

                                            {/* Actual Badge Card Layout */}
                                            <div 
                                                className="rounded-xl overflow-hidden border-2 bg-white"
                                                style={{ borderColor: selectedBadgeColor }}
                                            >
                                                {/* Badge Top Header */}
                                                <div 
                                                    className="p-2 text-center text-white"
                                                    style={{ backgroundColor: selectedBadgeColor }}
                                                >
                                                    <div className="text-[9px] opacity-90 font-medium">جمهورية العراق - وزارة التربية</div>
                                                    <div className="text-xs font-black tracking-tight">{settings.schoolName}</div>
                                                    <div className="text-[8px] opacity-80 mt-0.5">بطاقة الحضور والانصراف الإلكترونية</div>
                                                </div>

                                                {/* Badge Body */}
                                                <div className="p-3 flex items-center justify-between gap-3">
                                                    {/* Text Info */}
                                                    <div className="flex-1 min-w-0 text-right">
                                                        <span className="text-[9px] text-gray-400 block font-bold">اسم الأستاذ:</span>
                                                        <h4 className="text-sm font-black text-gray-900 truncate mt-0.5">
                                                            {teacher.name}
                                                        </h4>
                                                        <div className="text-[11px] font-bold text-cyan-700 truncate mt-1">
                                                            المادة: {subjects}
                                                        </div>
                                                        <div className="flex items-center gap-1 mt-2">
                                                            <span className="text-[9px] text-gray-400 font-bold">الكود:</span>
                                                            <span className="text-[10px] font-mono font-bold bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                                                {teacher.code || teacher.id.substring(0, 8)}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* QR Code Container */}
                                                    <div className="w-20 h-20 bg-white border border-gray-200 rounded-lg p-1 flex items-center justify-center shrink-0 shadow-inner">
                                                        <img 
                                                            src={qrUrl} 
                                                            alt={`QR ${teacher.name}`}
                                                            className="w-full h-full object-contain" 
                                                        />
                                                    </div>
                                                </div>

                                                {/* Badge Footer */}
                                                <div className="bg-gray-50 border-t border-gray-100 px-2 py-1 text-center text-[8px] text-gray-500 font-medium">
                                                    امسح الرمز أمام الكاميرا لتسجيل الحضور اليومي
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
