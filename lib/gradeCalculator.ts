
import type { Student, Subject, SubjectGrade, CalculatedGrade, StudentResult, SchoolSettings, ClassData } from '../types.ts';

const MINISTERIAL_STAGES = ['الثالث متوسط', 'السادس العلمي', 'السادس الادبي', 'السادس ابتدائي'];

const isValidGrade = (grade: number | null | undefined): grade is number => {
    return grade !== null && grade !== undefined && grade >= 0;
};

export function calculateStudentResult(
    student: Student, 
    subjects: Subject[], 
    settings: SchoolSettings, 
    classData: ClassData,
    evalContext: 'midYear' | 'final' = 'final'
): { finalCalculatedGrades: Record<string, CalculatedGrade>, result: StudentResult } {
    const finalCalculatedGrades: Record<string, CalculatedGrade> = {};
    
    // 1. Handle "No Grades Yet" case
    if (!student.grades || Object.keys(student.grades).length === 0) {
        return { finalCalculatedGrades, result: { status: 'قيد الانتظار', message: 'ليس لديه درجات بعد' } };
    }
    const hasAnyGrade = subjects.some(subject => {
        const grade = student.grades?.[subject.name];
        if (!grade) return false;
        return Object.values(grade).some(g => g !== null && g !== undefined);
    });
    if (!hasAnyGrade) {
        return { finalCalculatedGrades, result: { status: 'قيد الانتظار', message: 'ليس لديه درجات بعد' } };
    }

    // 2. Initial calculations
    const isMinisterial = MINISTERIAL_STAGES.includes(classData.stage);

    const subjectData: Record<string, { firstTerm: number | null, secondTerm: number | null, annualPursuit: number | null, grade: SubjectGrade }> = {};

    subjects.forEach(subject => {
        const grade: SubjectGrade = {
            october: null, november: null, december: null, january: null,
            february: null, march: null, april: null,
            firstTerm: null, midYear: null, secondTerm: null,
            finalExam1st: null, finalExam2nd: null,
            ...student.grades?.[subject.name]
        };
        
        let firstTerm = grade.firstTerm;
        let secondTerm = grade.secondTerm;
        const isPrimary5_6 = classData.stage === 'الخامس ابتدائي' || classData.stage === 'السادس ابتدائي';
        if (isPrimary5_6) {
             if (firstTerm === null) {
                 const firstTermMonths = [grade.october, grade.november, grade.december, grade.january];
                 if(firstTermMonths.every(isValidGrade)) {
                     firstTerm = Math.round(firstTermMonths.reduce((a, b) => a + b!, 0) / firstTermMonths.length);
                 }
             }
             if (secondTerm === null) {
                 const secondTermMonths = [grade.february, grade.march, grade.april];
                 if(secondTermMonths.every(isValidGrade)) {
                     secondTerm = Math.round(secondTermMonths.reduce((a, b) => a + b!, 0) / secondTermMonths.length);
                 }
             }
        }

        let annualPursuit: number | null = null;
        if (isValidGrade(firstTerm) && isValidGrade(grade.midYear) && isValidGrade(secondTerm)) {
            annualPursuit = Math.round((firstTerm! + grade.midYear! + secondTerm!) / 3);
        }

        subjectData[subject.name] = { firstTerm, secondTerm, annualPursuit, grade };
    });

    // Determine General Exemption
    // Condition 1: All subjects must have annual pursuit >= 75
    // Condition 2: Average of annual pursuit across all subjects >= 85
    // All subjects must have a calculated annual pursuit for general exemption to be considered
    const allPursuitsValid = subjects.every(s => isValidGrade(subjectData[s.name].annualPursuit));
    let isGeneralExempt = false;
    if (allPursuitsValid) {
        const allAbove75 = subjects.every(s => (subjectData[s.name].annualPursuit ?? 0) >= 75);
        const totalPursuit = subjects.reduce((acc, s) => acc + (subjectData[s.name].annualPursuit ?? 0), 0);
        const averagePursuit = totalPursuit / subjects.length;
        if (allAbove75 && averagePursuit >= 85) {
            isGeneralExempt = true;
        }
    }

    subjects.forEach(subject => {
        const { annualPursuit, grade } = subjectData[subject.name];

        // Individual Exemption: annual pursuit >= 90
        const manualExempt = !!grade.isExempt;
        const isIndividualExempt = isValidGrade(annualPursuit) && annualPursuit >= 90;
        const isExempt = manualExempt || isIndividualExempt || isGeneralExempt;

        let finalGrade1st: number | null = null;
        if (isExempt) {
            finalGrade1st = annualPursuit;
        } else if (isValidGrade(annualPursuit) && isValidGrade(grade.finalExam1st)) {
            finalGrade1st = Math.round((annualPursuit! + grade.finalExam1st!) / 2);
        }

        finalCalculatedGrades[subject.name] = {
            annualPursuit, finalGrade1st, finalGradeWithDecision: finalGrade1st, decisionApplied: 0,
            finalGrade2nd: null, isExempt, isGeneralExempt, annualPursuitWithDecision: annualPursuit, decisionAppliedOnPursuit: 0,
        };
    });

    // 3. Completeness Check based on context
    if (evalContext === 'midYear') {
        const hasIncompleteMidYear = subjects.some(subject => {
            const midGrade = student.grades?.[subject.name]?.midYear;
            // null means missing. -1 (absent) and -2 (excused) are considered valid inputs.
            return midGrade === null || midGrade === undefined;
        });
        if (hasIncompleteMidYear) {
            return { finalCalculatedGrades, result: { status: 'قيد الانتظار', message: 'بعض درجات نصف السنة غير موجودة' } };
        }
    } else {
        const hasIncompleteGrades = subjects.some(subject => {
            const calculated = finalCalculatedGrades[subject.name];
            if (calculated.isExempt) return false; 
            
            const gradeToCheck = isMinisterial ? calculated.annualPursuit : calculated.finalGrade1st;
            const originalGrade = student.grades?.[subject.name]?.[isMinisterial ? 'annualPursuit' as any : 'finalExam1st'];
            return gradeToCheck === null && originalGrade !== -1 && originalGrade !== -2;
        });

        if (hasIncompleteGrades) {
            return { finalCalculatedGrades, result: { status: 'قيد الانتظار', message: 'بعض الدرجات غير موجودة' } };
        }
    }

    // 4. Determine Status without Decision Points first
    const PASSING_GRADE = 50;
    const supplementarySubjectsLimit = isMinisterial ? (classData.ministerialSupplementarySubjects ?? 3) : settings.supplementarySubjectsCount;

    const getFailingCount = (useDecision: boolean) => {
        let count = 0;
        subjects.forEach(subject => {
            const calculated = finalCalculatedGrades[subject.name];
            const gradeToCheck = isMinisterial 
                ? (useDecision ? calculated.annualPursuitWithDecision : calculated.annualPursuit)
                : (useDecision ? calculated.finalGradeWithDecision : calculated.finalGrade1st);
            
            const rawGrade = student.grades?.[subject.name]?.[isMinisterial ? 'annualPursuit' as any : 'finalExam1st'];
            
            if (!calculated.isExempt) {
                if ((gradeToCheck !== null && gradeToCheck < PASSING_GRADE) || rawGrade === -1 || rawGrade === -2) {
                    count++;
                }
            }
        });
        return count;
    };

    const getStatusRank = (count: number) => {
        if (count === 0) return 3; // ناجح / مؤهل
        if (count <= supplementarySubjectsLimit) return 2; // مكمل / مؤهل بقرار
        return 1; // راسب / غير مؤهل
    };

    const initialFailingCount = getFailingCount(false);
    const initialStatusRank = getStatusRank(initialFailingCount);

    // Now Apply Decision Points (Qarar) - Only if NOT just midYear check for final result
    let remainingDecisionPoints = settings.decisionPoints;

    if (evalContext !== 'midYear') {
        if (isMinisterial) {
            let remainingMinisterialDecisionPoints = classData.ministerialDecisionPoints ?? 5;
            // Sort subjects by annualPursuit descending (closest to 50 first)
            const sortedSubjects = [...subjects].sort((a, b) => {
                const gradeA = finalCalculatedGrades[a.name].annualPursuit ?? -1;
                const gradeB = finalCalculatedGrades[b.name].annualPursuit ?? -1;
                if (gradeA !== gradeB) return gradeB - gradeA;
                
                // Tie-breaker: Lower Sa'i (annualPursuit) gets priority
                const pursuitA = finalCalculatedGrades[a.name].annualPursuit ?? Infinity;
                const pursuitB = finalCalculatedGrades[b.name].annualPursuit ?? Infinity;
                return pursuitA - pursuitB;
            });

            sortedSubjects.forEach(subject => {
                const calculated = finalCalculatedGrades[subject.name];
                if (calculated.annualPursuit !== null && calculated.annualPursuit < PASSING_GRADE) {
                    const pointsNeeded = PASSING_GRADE - calculated.annualPursuit;
                    if (remainingMinisterialDecisionPoints >= pointsNeeded) {
                        calculated.annualPursuitWithDecision = PASSING_GRADE;
                        calculated.decisionAppliedOnPursuit = pointsNeeded;
                        remainingMinisterialDecisionPoints -= pointsNeeded;
                    }
                }
            });
        } else {
            // Sort subjects by finalGrade1st descending (closest to 50 first)
            const sortedSubjects = [...subjects].sort((a, b) => {
                const gradeA = finalCalculatedGrades[a.name].finalGrade1st ?? -1;
                const gradeB = finalCalculatedGrades[b.name].finalGrade1st ?? -1;
                
                if (gradeA !== gradeB) {
                    return gradeB - gradeA;
                }
                
                // Tie-breaker: Lower Sa'i (annualPursuit) gets priority
                const pursuitA = finalCalculatedGrades[a.name].annualPursuit ?? Infinity;
                const pursuitB = finalCalculatedGrades[b.name].annualPursuit ?? Infinity;
                return pursuitA - pursuitB;
            });

            sortedSubjects.forEach(subject => {
                const calculated = finalCalculatedGrades[subject.name];
                if (calculated.finalGrade1st !== null && calculated.finalGrade1st < PASSING_GRADE) {
                    const pointsNeeded = PASSING_GRADE - calculated.finalGrade1st;
                    if (remainingDecisionPoints >= pointsNeeded) {
                        calculated.finalGradeWithDecision = PASSING_GRADE;
                        calculated.decisionApplied = pointsNeeded;
                        remainingDecisionPoints -= pointsNeeded;
                    }
                }
            });
        }

        // Validate Decision Points usage: Rank must improve
        const finalFailingCount = getFailingCount(true);
        const finalStatusRank = getStatusRank(finalFailingCount);

        if (finalStatusRank === 1) {
            // Revert decision points - If student remains failed (Rasib), decision points are worthless
            subjects.forEach(subject => {
                const calculated = finalCalculatedGrades[subject.name];
                calculated.annualPursuitWithDecision = calculated.annualPursuit;
                calculated.decisionAppliedOnPursuit = 0;
                calculated.finalGradeWithDecision = calculated.finalGrade1st;
                calculated.decisionApplied = 0;
            });
        }
    }

    // 5. Calculate 2nd attempt final grade
    subjects.forEach(subject => {
        const grade = student.grades?.[subject.name];
        const calculated = finalCalculatedGrades[subject.name];
        if (isValidGrade(calculated.annualPursuit) && isValidGrade(grade?.finalExam2nd)) {
            calculated.finalGrade2nd = Math.round((calculated.annualPursuit! + grade!.finalExam2nd!) / 2);
        }
    });

    // 6. Determine Overall Result
    let failingSubjects: string[] = [];
    let anySecondAttemptGradeEntered = false;

    if (evalContext === 'midYear') {
        subjects.forEach(subject => {
            const midYearGrade = student.grades?.[subject.name]?.midYear;
            if (midYearGrade !== null && midYearGrade !== undefined && midYearGrade < PASSING_GRADE) {
                failingSubjects.push(subject.name);
            }
        });
        
        const status = failingSubjects.length === 0 ? 'ناجح' : 'راسب';
        const message = failingSubjects.length === 0 ? 'ناجح في نصف السنة' : `راسب في نصف السنة بـ ${failingSubjects.length} دروس`;
        return { finalCalculatedGrades, result: { status, message } };
    }

    // Final result logic
    let failingSubjects1stAttempt: string[] = [];
    let decisionSubjects: string[] = [];
    let failingSubjectsCount2ndAttempt = 0;

    subjects.forEach(subject => {
        const calculated = finalCalculatedGrades[subject.name];
        if (calculated.decisionApplied > 0) { decisionSubjects.push(subject.name); }

        const gradeToCheck = isMinisterial ? calculated.annualPursuitWithDecision : calculated.finalGradeWithDecision;
        const rawGrade = student.grades?.[subject.name]?.[isMinisterial ? 'annualPursuit' as any : 'finalExam1st'];
        
        if (!calculated.isExempt) {
            if ((gradeToCheck !== null && gradeToCheck < PASSING_GRADE) || rawGrade === -1 || rawGrade === -2) {
                failingSubjects1stAttempt.push(subject.name);
            }
        }

        const rawGrade2nd = student.grades?.[subject.name]?.finalExam2nd;
        if (!calculated.isExempt && (calculated.finalGrade2nd !== null || rawGrade2nd === -1 || rawGrade2nd === -2)) {
            anySecondAttemptGradeEntered = true;
            if (calculated.finalGrade2nd === null || calculated.finalGrade2nd < PASSING_GRADE) { failingSubjectsCount2ndAttempt++; }
        } else if (!calculated.isExempt && gradeToCheck !== null && gradeToCheck < PASSING_GRADE) {
            failingSubjectsCount2ndAttempt++;
        }
    });

    let status: StudentResult['status'] = 'قيد الانتظار';
    let message = 'النتيجة قيد الانتظار';

    if (anySecondAttemptGradeEntered) {
        if (failingSubjectsCount2ndAttempt === 0) {
            status = 'ناجح';
            message = 'ناجح (الدور الثاني)';
        } else {
            status = 'راسب';
            message = 'راسب دور ثاني';
        }
    } else {
        if (isMinisterial) {
            if (failingSubjects1stAttempt.length === 0) {
                status = 'مؤهل';
                message = 'مؤهل لدخول الامتحان الوزاري';
            } else if (failingSubjects1stAttempt.length <= supplementarySubjectsLimit) {
                status = 'مؤهل بقرار';
                message = `مؤهل لدخول الامتحان الوزاري بقرار (${failingSubjects1stAttempt.length} دروس)`;
            } else {
                status = 'غير مؤهل';
                message = `غير مؤهل لدخول الامتحان الوزاري (${failingSubjects1stAttempt.length} دروس)`;
            }
        } else {
            if (failingSubjects1stAttempt.length === 0) {
                status = 'ناجح';
                message = decisionSubjects.length > 0 ? `ناجح (قرار: ${decisionSubjects.join('، ')})` : 'ناجح';
            } else if (failingSubjects1stAttempt.length <= supplementarySubjectsLimit) {
                status = 'مكمل';
                let suppMessage = `مكمل (${failingSubjects1stAttempt.join('، ')})`;
                if (decisionSubjects.length > 0) {
                    suppMessage += ` (قرار: ${decisionSubjects.join('، ')})`;
                }
                message = suppMessage;
            } else {
                status = 'راسب';
                message = `راسب بـ ${failingSubjects1stAttempt.length} دروس`;
            }
        }
    }

    const result: StudentResult = { status, message };
    return { finalCalculatedGrades, result };
}
