
declare const firebase: any;

const firebaseConfig = {
  apiKey: "AIzaSyD10J7Aty9t6DKhD1jwFRiVTi_66UDF_ro",
  authDomain: "batalkaebar-d2667.firebaseapp.com",
  databaseURL: "https://batalkaebar-d2667-default-rtdb.firebaseio.com",
  projectId: "batalkaebar-d2667",
  storageBucket: "batalkaebar-d2667.firebasestorage.app",
  messagingSenderId: "575420929419",
  appId: "1:575420929419:web:be8a45ecfe84f5d72acb8e",
  measurementId: "G-VTCYWHHJ7B"
};

// Use a more robust check for global firebase object
const getFirebase = () => {
    if (typeof window !== 'undefined' && (window as any).firebase) {
        return (window as any).firebase;
    }
    if (typeof firebase !== 'undefined') {
        return firebase;
    }
    return null;
};

const fb = getFirebase();

if (!fb) {
    console.error("Firebase library not found. Please check script imports in index.html.");
} else if (!fb.apps.length) {
    fb.initializeApp(firebaseConfig);
}

export const app = fb ? fb.app() : null;
export const db = fb ? fb.database() : { ref: () => ({ on: () => {}, off: () => {}, get: () => Promise.resolve({ exists: () => false, val: () => null }), set: () => Promise.resolve() }) };
export const auth = fb ? fb.auth() : { onAuthStateChanged: (cb: any) => cb(null), signInAnonymously: () => Promise.reject("Firebase not loaded") };
export const storage = fb ? fb.storage() : null;

export { fb as firebase };
