import { useState, useCallback, useEffect, useRef } from 'react';
import type { User, ClassData } from '../types.ts';
import { v4 as uuidv4 } from 'uuid';
import { db, auth, firebase } from '../lib/firebase.ts';

const PRINCIPAL_USER: User = {
    id: 'principal_al_hamza',
    role: 'principal',
    name: 'حسنين علي هادي',
    schoolName: 'متوسطة بطل خيبر',
    schoolLevel: 'متوسطة',
    code: '11aks@Q',
    studentCodeLimit: 1000
};

export default function useAuth() {
    const [users, setUsers] = useState<User[]>([]);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<User | null>(() => {
        const storedUser = window.localStorage.getItem('current_user');
        if (storedUser) {
            try {
                const parsedUser = JSON.parse(storedUser);
                // If stored user is principal, ensure updated name and school are loaded
                if (parsedUser.role === 'principal') {
                    return PRINCIPAL_USER;
                }
                // If the stored user is the old admin, log them out.
                if (parsedUser.role === 'admin') {
                    window.localStorage.removeItem('current_user');
                    return null;
                }
                return parsedUser;
            } catch {
                window.localStorage.removeItem('current_user');
                return null;
            }
        }
        return null;
    });

    const logout = useCallback(() => {
        // The presence cleanup effect for the old user will handle removing them from 'status'
        window.localStorage.removeItem('current_user');
        setCurrentUser(null);
        // Full page reload to clear all state
        window.location.reload();
    }, []);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user: any) => {
            if (user) {
                setAuthError(null); 
                setIsAuthReady(true);
            } else {
                auth.signInAnonymously().catch((error: any) => {
                    console.error("Critical: Anonymous sign-in failed.", error);
                    setAuthError("فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى. قد تمنع بعض الشبكات (مثل شبكات المدارس) الوصول إلى خدماتنا.");
                    setIsAuthReady(true); 
                });
            }
        });
    
        return () => unsubscribe(); 
    }, []); 

    useEffect(() => {
        if (!isAuthReady || authError) return;

        const usersRef = db.ref('users');
        const callback = (snapshot: any) => {
            const usersData = snapshot.val();
            if (usersData) {
                const usersList = (Object.values(usersData) as User[]).filter(u => u.role !== 'admin');
                const allUsers = [PRINCIPAL_USER, ...usersList.filter(u => u.id !== PRINCIPAL_USER.id)];
                setUsers(allUsers);

                setCurrentUser(prev => {
                    if (!prev || prev.role === 'principal' || prev.role === 'student') return prev;
                    const latest = allUsers.find(u => u.id === prev.id);
                    if (!latest) return prev;
                    if (latest.disabled) {
                        alert('تم تعطيل حسابك من قبل المسؤول. سيتم تسجيل خروجك.');
                        logout();
                        return null;
                    }
                    // Compare without lastOnline timestamp to avoid infinite feedback loops
                    const cleanPrev = { ...prev, lastOnline: undefined };
                    const cleanLatest = { ...latest, lastOnline: undefined };
                    if (JSON.stringify(cleanPrev) !== JSON.stringify(cleanLatest)) {
                        try {
                            window.localStorage.setItem('current_user', JSON.stringify(latest));
                        } catch (e) {}
                        return latest;
                    }
                    return prev;
                });
            } else {
                setUsers([PRINCIPAL_USER]);
            }
        };
        usersRef.on('value', callback);

        return () => usersRef.off('value', callback);
    }, [isAuthReady, authError, logout]);

    const idleTimer = useRef<number | null>(null);
    const lastActivityTime = useRef<number>(0);

    const currentUserId = currentUser?.id;

    // Effect for Firebase Realtime Presence with IDLE TIMEOUT based on user role
    useEffect(() => {
        if (!currentUserId || !isAuthReady || authError) {
            return;
        }
    
        const myConnectionsRef = db.ref(`status/${currentUserId}`);
        const connectedRef = db.ref('.info/connected');
        let isOnlineForPresence = false;

        const goOnline = () => {
            if (isOnlineForPresence) return;
            myConnectionsRef.set(true);
            myConnectionsRef.onDisconnect().remove();
            if (currentUserId !== 'principal_al_hamza') {
                 db.ref(`users/${currentUserId}/lastOnline`).set(firebase.database.ServerValue.TIMESTAMP);
            }
            isOnlineForPresence = true;
        };
        
        const goOfflineIdle = () => {
             if (!isOnlineForPresence) return;
             myConnectionsRef.remove();
             isOnlineForPresence = false;
        };

        const resetIdleTimer = () => {
            const now = Date.now();
            // Throttle activity checks to once every 10 seconds to keep UI 60fps smooth
            if (now - lastActivityTime.current < 10000 && isOnlineForPresence) {
                return;
            }
            lastActivityTime.current = now;

            if (idleTimer.current) {
                clearTimeout(idleTimer.current);
            }
            if (!isOnlineForPresence) {
                goOnline();
            }
            // Set timeout to 2 minutes (120,000 milliseconds)
            idleTimer.current = window.setTimeout(goOfflineIdle, 2 * 60 * 1000);
        };

        const onConnectedChange = (snapshot: any) => {
            if (snapshot.val() === true) {
                resetIdleTimer();
            } else {
                if (idleTimer.current) {
                    clearTimeout(idleTimer.current);
                }
                isOnlineForPresence = false;
            }
        };
    
        connectedRef.on('value', onConnectedChange);
        
        const activityEvents: ('pointerdown' | 'keydown' | 'touchstart' | 'scroll')[] = ['pointerdown', 'keydown', 'touchstart', 'scroll'];

        activityEvents.forEach(event => {
            window.addEventListener(event, resetIdleTimer, { passive: true });
        });
    
        return () => {
            connectedRef.off('value', onConnectedChange);
            activityEvents.forEach(event => {
                window.removeEventListener(event, resetIdleTimer);
            });
            if (idleTimer.current) {
                clearTimeout(idleTimer.current);
            }
            if (isOnlineForPresence) {
                myConnectionsRef.remove();
            }
        };
    }, [currentUserId, isAuthReady, authError]);


    const login = useCallback(async (identifier: string, secret: string): Promise<boolean> => {
        // Principal login
        if (identifier === PRINCIPAL_USER.code && secret === '') {
            setCurrentUser(PRINCIPAL_USER);
            window.localStorage.setItem('current_user', JSON.stringify(PRINCIPAL_USER));
            return true;
        }
    
        // Teacher, Counselor and Assistant login
        const staffUser = users.find(u => 
            (u.role === 'teacher' || u.role === 'counselor' || u.role === 'assistant') && u.code === identifier
        );
    
        if (staffUser) {
            if (staffUser.disabled) {
                alert('تم تعطيل حسابك من قبل المسؤول.');
                return false;
            }
            if (staffUser.principalId !== PRINCIPAL_USER.id) {
                return false; 
            }
            setCurrentUser(staffUser);
            window.localStorage.setItem('current_user', JSON.stringify(staffUser));
            return true;
        }
        
        // Student login
        try {
            const studentCodeRef = db.ref(`student_access_codes_individual/${identifier}`);
            const snapshot = await studentCodeRef.get();
            if (snapshot.exists()) {
                const codeData = snapshot.val();
                if (codeData.principalId !== PRINCIPAL_USER.id) {
                    return false;
                }

                const classSnapshot = await db.ref(`classes/${codeData.classId}`).get();
                if (classSnapshot.exists()) {
                    const classData: ClassData = classSnapshot.val();
                    const studentData = classData.students?.find(s => s.id === codeData.studentId);

                    if (studentData) {
                        const studentUser: User = {
                            id: studentData.id,
                            name: studentData.name,
                            role: 'student',
                            code: identifier,
                            principalId: codeData.principalId,
                            classId: codeData.classId,
                            stage: classData.stage,
                            section: classData.section,
                        };
                        setCurrentUser(studentUser);
                        window.localStorage.setItem('current_user', JSON.stringify(studentUser));
                        return true;
                    }
                }
            }
        } catch (error) {
            console.error("Student login check failed:", error);
        }
    
        return false;
    }, [users]);
    
    const addUser = useCallback((newUser: Omit<User, 'id'>): User => {
        const userWithId = { 
            ...newUser, 
            id: uuidv4(),
            principalId: PRINCIPAL_USER.id 
        };
        db.ref(`users/${userWithId.id}`).set(userWithId);
        return userWithId;
    }, []);
    
    const updateUser = useCallback((userId: string, updater: (user: User) => User) => {
        const userToUpdate = users.find(u => u.id === userId);
        if (userToUpdate) {
            const updatedUser = updater(userToUpdate);
            // Remove undefined values to prevent Firebase RTDB set errors
            const sanitizedUser: Record<string, any> = {};
            Object.entries(updatedUser).forEach(([key, value]) => {
                if (value !== undefined) {
                    sanitizedUser[key] = value;
                }
            });
            db.ref(`users/${userId}`).set(sanitizedUser);
        }
    }, [users]);

    const deleteUser = useCallback((userId: string) => {
        if (window.confirm('هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.')) {
            db.ref(`users/${userId}`).remove();
        }
    }, []);

    return {
        currentUser,
        users,
        login,
        logout,
        addUser,
        updateUser,
        deleteUser,
        isAuthReady,
        authError,
    };
}