// IndexedDB Local Storage Service for Student Photos
// Allows instant offline access to student photos without re-downloading large submissions

const DB_NAME = 'HmzaStudentPhotosDB';
const STORE_NAME = 'photos';
const DB_VERSION = 1;

interface PhotoRecord {
    id: string; // `${principalId}_${studentKey}`
    principalId: string;
    studentKey: string;
    photo: string;
    timestamp: number;
}

// In-memory fast cache for instant O(1) synchronous lookups during React renders
const memoryCache: Record<string, string> = {};

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

export const initPhotoDB = (): Promise<IDBDatabase> => {
    if (dbInstance) return Promise.resolve(dbInstance);
    if (dbInitPromise) return dbInitPromise;

    dbInitPromise = new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.indexedDB) {
            reject(new Error('IndexedDB not supported in this environment'));
            return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: any) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('principalId', 'principalId', { unique: false });
                store.createIndex('studentKey', 'studentKey', { unique: false });
            }
        };

        request.onsuccess = (event: any) => {
            dbInstance = event.target.result;
            resolve(dbInstance!);
        };

        request.onerror = (event: any) => {
            console.error('IndexedDB open error:', event.target.error);
            reject(event.target.error);
        };
    });

    return dbInitPromise;
};

/**
 * Load all locally cached photos for a given principal
 */
export const loadLocalPhotos = async (principalId: string): Promise<Record<string, string>> => {
    if (!principalId) return {};

    try {
        const db = await initPhotoDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('principalId');
            const request = index.getAll(IDBKeyRange.only(principalId));

            request.onsuccess = () => {
                const records: PhotoRecord[] = request.result || [];
                const photosMap: Record<string, string> = {};

                records.forEach((rec) => {
                    photosMap[rec.studentKey] = rec.photo;
                    memoryCache[rec.studentKey] = rec.photo;
                });

                resolve(photosMap);
            };

            request.onerror = () => {
                console.warn('Failed to load photos from IndexedDB');
                resolve({});
            };
        });
    } catch (err) {
        console.warn('loadLocalPhotos error:', err);
        return {};
    }
};

/**
 * Bulk save photos to IndexedDB and update memory cache
 */
export const saveBulkPhotosLocally = async (
    principalId: string,
    photos: Record<string, string>
): Promise<number> => {
    if (!principalId || !photos || Object.keys(photos).length === 0) return 0;

    try {
        const db = await initPhotoDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            let count = 0;
            const now = Date.now();

            Object.entries(photos).forEach(([studentKey, photo]) => {
                if (photo && studentKey) {
                    const id = `${principalId}_${studentKey}`;
                    store.put({
                        id,
                        principalId,
                        studentKey,
                        photo,
                        timestamp: now
                    });
                    memoryCache[studentKey] = photo;
                    count++;
                }
            });

            tx.oncomplete = () => {
                try {
                    localStorage.setItem(`school_photos_count_${principalId}`, String(count));
                    localStorage.setItem(`school_photos_synced_at_${principalId}`, String(Date.now()));
                } catch {}
                resolve(count);
            };

            tx.onerror = () => {
                reject(tx.error);
            };
        });
    } catch (err) {
        console.error('saveBulkPhotosLocally error:', err);
        return 0;
    }
};

/**
 * Synchronous memory lookup for instantaneous rendering without any async delays
 */
export const getCachedPhotoSync = (studentKey: string): string | null => {
    if (!studentKey) return null;
    return memoryCache[studentKey] || null;
};

/**
 * Set memory cache entries
 */
export const populateMemoryCache = (photos: Record<string, string>) => {
    Object.assign(memoryCache, photos);
};

/**
 * Clear all locally saved photos for this school/principal
 */
export const clearLocalPhotos = async (principalId: string): Promise<void> => {
    if (!principalId) return;

    try {
        const db = await initPhotoDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('principalId');
            const request = index.getAllKeys(IDBKeyRange.only(principalId));

            request.onsuccess = () => {
                const keys = request.result || [];
                keys.forEach(k => store.delete(k));
            };

            tx.oncomplete = () => {
                Object.keys(memoryCache).forEach(k => delete memoryCache[k]);
                try {
                    localStorage.removeItem(`school_photos_count_${principalId}`);
                    localStorage.removeItem(`school_photos_synced_at_${principalId}`);
                    localStorage.removeItem(`cached_discipline_photos_${principalId}`);
                } catch {}
                resolve();
            };

            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.error('clearLocalPhotos error:', err);
    }
};

/**
 * Get stats about locally saved photos
 */
export const getLocalPhotoStats = (principalId: string) => {
    try {
        const count = parseInt(localStorage.getItem(`school_photos_count_${principalId}`) || '0', 10);
        const syncedAt = parseInt(localStorage.getItem(`school_photos_synced_at_${principalId}`) || '0', 10);
        return { count, syncedAt };
    } catch {
        return { count: 0, syncedAt: 0 };
    }
};
