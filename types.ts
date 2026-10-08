export type SchoolLevel = 'ابتدائية' | 'متوسطة' | 'اعدادية' | 'ثانوية' | 'اعدادي علمي' | 'اعدادي ادبي' | 'ثانوية علمي' | 'ثانوية ادبي';

// FIX: Added missing AbsenceStatus type definition.
export type AbsenceStatus = 'present' | 'absent' | 'excused' | 'runaway';

export interface Subject {
    id: string;
    name: string;
}

export interface TeacherAssignment {
    classId: string;
    subjectId: string;
}

export interface User {
    id: string;
    role: 'admin' | 'principal' | 'teacher' | 'counselor' | 'student' | 'assistant';
    name: string;
    code: string;
    schoolName?: string;
    schoolLevel?: SchoolLevel;
    principalId?: string;
    assignments?: TeacherAssignment[];
    assignedStages?: string[];
    advisorClassId?: string;
    advisorClassIds?: string[];
    disabled?: boolean;
    lastOnline?: number;
    email?: string;
    studentCodeLimit?: number;
    classId?: string;
    stage?: string;
    section?: string;
}

export interface Teacher extends User {
    role: 'teacher';
    assignments: TeacherAssignment[];
}

export interface SchoolSettings {
    schoolName: string;
    principalName: string;
    academicYear: string;
    directorate: string;
    supplementarySubjectsCount: number;
    decisionPoints: number;
    principalPhone?: string;
    schoolType?: string;
    schoolGender?: string;
    schoolLevel?: SchoolLevel;
    governorateCode?: string;
    schoolCode?: string;
    governorateName?: string;
    district?: string;
    subdistrict?: string;
    lockS1Submissions?: boolean;
    lockS2Submissions?: boolean;
    lockAllSubmissions?: boolean;
    monthlyResultsNotice?: boolean;
    telegramBotToken?: string;
    telegramDefaultChatId?: string;
    telegramEnabled?: boolean;
}

export interface SubjectGrade {
    firstTerm: number | null;
    midYear: number | null;
    secondTerm: number | null;
    finalExam1st: number | null;
    finalExam2nd: number | null;
    october?: number | null;
    november?: number | null;
    december?: number | null;
    january?: number | null;
    february?: number | null;
    march?: number | null;
    april?: number | null;
    annualPursuit?: number | null;
    isExempt?: boolean;
}

export interface CalculatedGrade {
    annualPursuit: number | null;
    finalGrade1st: number | null;
    finalGradeWithDecision: number | null;
    decisionApplied: number;
    finalGrade2nd: number | null;
    isExempt: boolean;
    isGeneralExempt?: boolean;
    annualPursuitWithDecision?: number | null;
    decisionAppliedOnPursuit?: number;
}

export interface StudentResult {
    status: 'ناجح' | 'مكمل' | 'راسب' | 'مؤهل' | 'مؤهل بقرار' | 'غير مؤهل' | 'قيد الانتظار';
    message: string;
}

export interface Student {
    id: string;
    name: string;
    examId?: string;
    registrationId?: string;
    birthDate?: string;
    motherName?: string;
    motherFatherName?: string;
    grades?: Record<string, SubjectGrade>;
    teacherGrades?: Record<string, TeacherSubjectGrade>;
    enrollmentStatus?: 'active' | 'transferred' | 'dismissed';
    yearsOfFailure?: string;
    photoUrl?: string;
    studentAccessCode?: string;
    notes?: string;
    telegramChatId?: string;
}

export interface TeacherSubjectGrade {
    firstSemMonth1: number | null;
    firstSemMonth2: number | null;
    midYear: number | null;
    secondSemMonth1: number | null;
    secondSemMonth2: number | null;
    finalExam: number | null;
    october?: number | null;
    november?: number | null;
    december?: number | null;
    january?: number | null;
    february?: number | null;
    march?: number | null;
    april?: number | null;
    firstTerm?: number | null;
    secondTerm?: number | null;
    annualPursuit?: number | null;
}

export interface TeacherCalculatedGrade {
    firstSemAvg: number | null;
    secondSemAvg: number | null;
    annualPursuit: number | null;
    primaryFirstTerm?: number | null;
    primarySecondTerm?: number | null;
    isExempt?: boolean;
}

export interface ClassData {
    id: string;
    stage: string;
    section: string;
    subjects: Subject[];
    students: Student[];
    principalId: string;
    subjects_migrated_v1?: boolean;
    ministerialDecisionPoints?: number;
    ministerialSupplementarySubjects?: number;
    lockS1?: boolean;
    lockS2?: boolean;
    advisorTeacherId?: string;
}

export interface TeacherSubmission {
    id: string;
    teacherId: string;
    classId: string;
    subjectId: string;
    submittedAt: string;
    grades: Record<string, TeacherSubjectGrade>;
}

export interface StudentSubmission {
    id: string;
    principalId: string;
    studentName: string;
    stage: string;
    formData: Record<string, string>;
    studentPhoto: string | null;
    submittedAt: string;
    status: 'pending' | 'viewed';
    isLocked?: boolean;
}

export interface Announcement {
    id: string;
    principalId: string;
    stage: string;
    message: string;
    timestamp: string;
}

export interface ParentContact {
    id: string;
    principalId: string;
    studentName: string;
    parentPhone: string;
    stage: string;
}

export interface StudentNotification {
    id: string;
    studentId: string;
    message: string;
    timestamp: string;
    isRead: boolean;
}

export type EvaluationRating = 'ممتاز' | 'جيد جدا' | 'جيد' | 'متوسط' | 'ضعيف' | 'ضعيف جدا';

export const EVALUATION_RATINGS: EvaluationRating[] = ['ممتاز', 'جيد جدا', 'جيد', 'متوسط', 'ضعيف', 'ضعيف جدا'];

export interface StudentEvaluation {
    id: string;
    studentId: string;
    principalId?: string;
    classId: string;
    subjectId: string;
    subjectName: string;
    teacherId: string;
    teacherName: string;
    rating: EvaluationRating;
    timestamp: string;
}

export interface DisciplineCriterion {
    id: string;
    title: string;
    description?: string;
    deductionPoints: number; // default 1
    isDefault?: boolean;
    isActive: boolean;
    category?: 'سلوكي' | 'أكاديمي' | 'التزام ونظام' | 'أخلاقي' | 'عام';
    createdAt?: string;
    createdByName?: string;
}

export interface DisciplineSettings {
    maxPoints: number; // default 10 points
    criteria: DisciplineCriterion[];
    allowTeacherCustomReason?: boolean;
    updatedAt?: string;
    updatedByName?: string;
}

export interface DisciplineRecord {
    id: string;
    principalId: string;
    studentId: string;
    studentName: string;
    studentCode?: string;
    classId: string;
    stage: string;
    section: string;
    subjectId?: string;
    subjectName?: string;
    teacherId: string;
    teacherName: string;
    teacherRole?: string;
    criterionId?: string;
    criterionTitle: string;
    pointsDeducted: number; // default 1
    notes?: string;
    violationDate?: string;
    timestamp: string;
    status: 'active' | 'archived';
    archivedAt?: string;
    archivedByName?: string;
    archiveReason?: string;
    parentSummonPrinted?: boolean;
}

export interface DisciplineArchiveLog {
    id: string;
    studentId: string;
    studentName: string;
    classId: string;
    stage: string;
    section: string;
    archivedAt: string;
    archivedByUserId: string;
    archivedByName: string;
    previousTotalDeductions: number;
    recordsCount: number;
    reason: string;
    grantedPoints: number;
}

export interface BehaviorDeduction {
    id: string;
    principalId: string;
    studentId: string;
    classId: string;
    pointsDeducted: number;
    reason: string;
    timestamp: string;
    teacherName?: string;
    subjectName?: string;
    criterionTitle?: string;
    status?: 'active' | 'archived';
}

export interface BehavioralVote {
    voterId: string;
    voterName: string;
    criteriaKeys: string[];
}

export interface HonoredStudent {
    studentId: string;
    studentName: string;
    classId: string;
    section: string;
    nominationTimestamp: string;
    votes: Record<string, BehavioralVote>;
    studentPhotoUrl?: string;
}

export interface BehavioralHonorBoard {
    id: string;
    principalId: string;
    stage: string;
    weekStartDate: string;
    honoredStudents: Record<string, HonoredStudent>;
}

export interface Conversation {
    id: string;
    principalId: string;
    studentId: string;
    studentName: string;
    staffName: string;
    lastMessageText: string;
    lastMessageTimestamp: number;
    unreadByStudent: boolean;
    unreadByStaff: boolean;
    isArchived: boolean;
    chatDisabled: boolean;
    teacherId?: string;
    classId?: string;
    subjectId?: string;
    subjectName?: string;
    groupName?: string;
}

export interface ChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: number;
    editedAt?: number;
}

export interface PollOption {
    id: string;
    text: string;
    voterIds: string[];
}

export interface PollData {
    question: string;
    options: PollOption[];
    isActive: boolean;
}

export interface ForumMessageAttachment {
    type: 'image' | 'video';
    url: string;
    name: string;
}

export interface ForumMessage {
    id: string;
    senderId: string;
    senderName: string;
    senderRole: string;
    text: string;
    timestamp: number;
    readBy?: Record<string, boolean>;
    isPinned?: boolean;
    attachment?: ForumMessageAttachment;
    poll?: PollData;
    replyTo?: {
        id: string;
        senderName: string;
        text: string;
    };
    reactions?: Record<string, string[]>;
}

export interface ForumReport {
    id: string;
    messageId: string;
    messageContent: string;
    reportedUserId: string;
    reportedUserName: string;
    reporterId: string;
    reporterName: string;
    reason: string;
    timestamp: number;
}

export interface HomeworkAttachment {
    type: 'image' | 'video' | 'file';
    url: string;
    name: string;
}

export interface Homework {
    id: string;
    principalId: string;
    teacherId: string;
    classIds: string[];
    subjectId: string;
    subjectName: string;
    title: string;
    notes: string;
    deadline: string;
    createdAt: string;
    attachments?: HomeworkAttachment[];
}

export interface HomeworkSubmission {
    id: string;
    homeworkId: string;
    studentId: string;
    studentName: string;
    classId: string;
    submittedAt: string;
    reviewedAt?: string;
    texts?: string[];
    attachments?: HomeworkAttachment[];
    status: 'pending' | 'accepted' | 'rejected';
    rejectionReason?: string;
}

export interface HomeworkProgress {
    totalCompleted: number;
    monthlyCompleted: Record<string, { count: number; lastTimestamp: number }>;
}

export interface Award {
    id: string;
    name: string;
    description: string;
    icon: string;
    minCompletions: number;
}

export interface LeaderboardEntry {
    studentId: string;
    studentName: string;
    studentPhotoUrl?: string;
    classId: string;
    section: string;
    score: number;
}

export interface XOQuestion {
    id: string;
    principalId: string;
    grade: string;
    subject: string;
    questionText: string;
    options: [string, string, string, string];
    correctOptionIndex: number;
    createdBy: string;
    creatorName?: string;
    creatorSchool?: string;
    chapter?: string;
}

export type PlayerSymbol = 'X' | 'O' | '⭐' | '🌙' | '❤️' | '🔷';

export interface XOGamePlayer {
    id: string;
    name: string;
    symbol: PlayerSymbol;
    classId?: string;
    section?: string;
}

export interface XOGameState {
    id: string;
    principalId: string;
    grade: string;
    subject: string;
    status: 'waiting_for_players' | 'in_progress' | 'finished';
    players: (XOGamePlayer | null)[];
    board: (PlayerSymbol | null)[];
    xIsNext: boolean;
    winner: PlayerSymbol | 'draw' | null;
    scores: Record<PlayerSymbol, number>;
    currentQuestion: XOQuestion | null;
    questionForSquare: number | null;
    questionTimerStart: number | null;
    chat: ChatMessage[];
    createdAt: number;
    updatedAt: number;
}

export interface XOGameSettings {
    pointsPolicy: 'grant_all' | 'winner_takes_all';
    startTime: string;
    endTime: string;
    questionTimeLimit: number;
    allowSinglePlayer: boolean;
}

export interface XOGameScore {
    studentId: string;
    studentName: string;
    classId: string;
    section: string;
    points: number;
}

export interface XOChallenge {
    id: string;
    challengerId: string;
    challengerName: string;
    challengerClass: string;
    challengerClassId?: string;
    challengerSection?: string;
    targetId: string;
    grade: string;
    subject: string;
    status: 'pending' | 'accepted' | 'declined';
    createdAt: number;
    gameId?: string;
}

export interface XOOverallLeaderboardEntry {
    studentId: string;
    studentName: string;
    totalPoints: number;
}

export type Mood = 'happy' | 'anxious' | 'angry' | 'sad' | 'frustrated';

export interface MoodLog {
    mood: Mood;
    timestamp: number;
    date: string;
}

export interface PublishedMonthlyResult {
    monthKey: string;
    monthLabel: string;
    publishedAt: string;
    grades: { subjectName: string; grade: number | null }[];
}

export interface LeaveRequest {
    id: string;
    teacherId: string;
    principalId: string;
    teacherName: string;
    requestedAt: string;
    status: 'pending' | 'approved' | 'rejected';
    requestBody: string;
    approvalBody?: string;
    daysDeducted?: number;
    resolvedAt?: string;
    rejectionReason?: string;
}

export interface CounselorGuidance {
    id: string;
    principalId: string;
    counselorId: string;
    counselorName: string;
    title: string;
    content: string;
    createdAt: string;
    updatedAt?: string;
}

export interface StudyPlan {
    grades: Record<string, {
        subjects: Record<string, number>;
        total: number;
    }>;
}

export interface ScheduleAssignment {
    subject: string;
    teacher: string;
}

export interface SchedulePeriod {
    period: number;
    assignments: Record<string, ScheduleAssignment>;
}

export type ScheduleData = Record<string, SchedulePeriod[]>;

export interface SwapRequest {
    id: string;
    requesterId: string;
    responderId: string;
    originalSlot: { classId: string; day: string; period: number };
    requestedSlot: { classId: string; day: string; period: number };
    status: 'pending_teacher' | 'pending_principal' | 'approved' | 'rejected';
}

export interface YardDutyLocation {
    id: string;
    name: string;
}

export interface YardDutyAssignment {
    day: string;
    locationId: string;
    teacherId: string;
}

export interface YardDutySchedule {
    principalId: string;
    locations: YardDutyLocation[];
    assignments: YardDutyAssignment[];
}

export interface YardDutySwapRequest {
    id: string;
    requesterId: string;
    responderId: string;
    originalSlot: { day: string; locationId: string };
    requestedSlot: { day: string; locationId: string };
    status: 'pending_teacher' | 'pending_principal' | 'approved' | 'rejected';
}

// NEW: Exam Absence Records and Seating
export interface ExamAbsenceRecord {
    studentId: string;
    studentName: string;
    stage: string;
    section: string;
    hallNumber: string;
    sectorNumber: string;
    examId: string;
    status: 'absent' | 'excused'; // 'absent' = غ, 'excused' = م
    isExempt?: boolean; // NEW: Flag to mark student as Ma'fo (Exempted) for this specific exam
}

export interface SeatingAssignment {
    hallNumber: string;
    sectorNumber: string;
    isExcused?: boolean; // NEW: Flag to mark student as excused in advance
    isExempt?: boolean; // NEW: Flag to mark student as Ma'fo in advance
    row?: number;
    col?: number;
}

export interface GeneralRegistrationEntry {
    id: string;
    studentName: string;
    registrationNumber: string;
    registrationPage: string;
    principalId: string;
    updatedAt: number;
}

export interface AdvisorGuidanceItem {
    id: string;
    classId: string;
    studentId?: string;
    studentName?: string;
    title: string;
    content: string;
    category?: string;
    createdAt: number;
    advisorTeacherId: string;
    advisorTeacherName: string;
}

export interface AdvisorChatMessage {
    id: string;
    senderId: string;
    senderName: string;
    senderRole: 'student' | 'advisor';
    text: string;
    timestamp: number;
    read?: boolean;
}

export interface AdvisorPrivateChat {
    id: string;
    studentId: string;
    studentName: string;
    classId: string;
    advisorTeacherId: string;
    advisorTeacherName: string;
    lastMessageText: string;
    lastMessageTimestamp: number;
    unreadByAdvisor?: boolean;
    unreadByStudent?: boolean;
}

export interface TeacherAttendanceRecord {
    teacherId: string;
    teacherName: string;
    teacherCode?: string;
    role?: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM:SS format
    timestamp: number;
    status: 'present' | 'late' | 'excused' | 'absent';
    note?: string;
    method?: 'qr' | 'manual';
}
