/**
 * PRODUCTION-READY OFFLINE SYSTEM
 * Persistent storage with IndexedDB, queue persistence, retry logic, and audio support
 */

// ============================================
// 1. PERSISTENT STORAGE (IndexedDB)
// ============================================

class PersistentStorage {
    constructor(dbName = 'vngo_offline', version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
    }

    /**
     * Initialize IndexedDB
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // POIs store
                if (!db.objectStoreNames.contains('pois')) {
                    const poisStore = db.createObjectStore('pois', { keyPath: 'code' });
                    poisStore.createIndex('downloadedAt', 'downloadedAt', { unique: false });
                }

                // Queue state store
                if (!db.objectStoreNames.contains('queue')) {
                    db.createObjectStore('queue', { keyPath: 'id' });
                }

                // Audio files store
                if (!db.objectStoreNames.contains('audio')) {
                    db.createObjectStore('audio', { keyPath: 'poiCode' });
                }
            };
        });
    }

    /**
     * Store POI (prevents duplication)
     */
    async storePoi(poi) {
        const exists = await this.hasPoi(poi.code);
        if (exists) {
            console.log(`[STORAGE] POI ${poi.code} already exists, skipping`);
            return false;
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pois'], 'readwrite');
            const store = transaction.objectStore('pois');

            const poiData = {
                id: poi._id || poi.id,
                code: poi.code,
                name: poi.name,
                narrationShort: poi.narrationShort,
                narrationLong: poi.narrationLong,
                location: poi.location,
                narrationAudioUrl: poi.narrationAudioUrl || null,
                localAudioPath: null,
                downloadedAt: new Date().toISOString()
            };

            const request = store.add(poiData);

            request.onsuccess = () => {
                console.log(`[STORAGE] Stored POI ${poi.code}`);
                resolve(true);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get POI from storage
     */
    async getPoi(poiCode) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pois'], 'readonly');
            const store = transaction.objectStore('pois');
            const request = store.get(poiCode);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Check if POI exists
     */
    async hasPoi(poiCode) {
        const poi = await this.getPoi(poiCode);
        return !!poi;
    }

    /**
     * Update POI audio path
     */
    async updatePoiAudio(poiCode, localAudioPath) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pois'], 'readwrite');
            const store = transaction.objectStore('pois');
            const getRequest = store.get(poiCode);

            getRequest.onsuccess = () => {
                const poi = getRequest.result;
                if (poi) {
                    poi.localAudioPath = localAudioPath;
                    const updateRequest = store.put(poi);
                    updateRequest.onsuccess = () => resolve(true);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    resolve(false);
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Store audio blob
     */
    async storeAudio(poiCode, audioBlob) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audio'], 'readwrite');
            const store = transaction.objectStore('audio');

            const audioData = {
                poiCode,
                blob: audioBlob,
                storedAt: new Date().toISOString()
            };

            const request = store.put(audioData);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get audio blob
     */
    async getAudio(poiCode) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['audio'], 'readonly');
            const store = transaction.objectStore('audio');
            const request = store.get(poiCode);

            request.onsuccess = () => resolve(request.result?.blob);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get all POIs
     */
    async getAllPois() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['pois'], 'readonly');
            const store = transaction.objectStore('pois');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all data (for testing)
     */
    async clear() {
        const stores = ['pois', 'queue', 'audio'];
        for (const storeName of stores) {
            await new Promise((resolve, reject) => {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }
}

// ============================================
// 2. PERSISTENT DOWNLOAD QUEUE
// ============================================

class PersistentDownloadQueue {
    constructor(storage) {
        this.storage = storage;
        this.queue = [];
        this.completed = new Set();
        this.failed = new Map(); // poiCode -> retryCount
        this.processing = false;
        this.maxRetries = 3;
        this.retryDelay = 2000; // 2 seconds
    }

    /**
     * Initialize and restore queue state
     */
    async init() {
        await this.restoreQueueState();

        // Auto-resume if there are pending downloads
        if (this.queue.length > 0 && !this.processing) {
            console.log('[QUEUE] Auto-resuming unfinished downloads');
            await this.processQueue();
        }
    }

    /**
     * Save queue state to IndexedDB
     */
    async saveQueueState() {
        return new Promise((resolve, reject) => {
            const transaction = this.storage.db.transaction(['queue'], 'readwrite');
            const store = transaction.objectStore('queue');

            const state = {
                id: 'current',
                queue: this.queue,
                completed: Array.from(this.completed),
                failed: Array.from(this.failed.entries()),
                processing: this.processing,
                savedAt: new Date().toISOString()
            };

            const request = store.put(state);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Restore queue state from IndexedDB
     */
    async restoreQueueState() {
        return new Promise((resolve, reject) => {
            const transaction = this.storage.db.transaction(['queue'], 'readonly');
            const store = transaction.objectStore('queue');
            const request = store.get('current');

            request.onsuccess = () => {
                const state = request.result;
                if (state) {
                    this.queue = state.queue || [];
                    this.completed = new Set(state.completed || []);
                    this.failed = new Map(state.failed || []);
                    this.processing = false; // Always reset processing flag on restore
                    console.log('[QUEUE] Restored state:', {
                        pending: this.queue.length,
                        completed: this.completed.size,
                        failed: this.failed.size
                    });
                }
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Download zone with retry logic
     */
    async downloadZone(zoneCode, apiClient) {
        console.log(`\n[QUEUE] Starting download for zone: ${zoneCode}`);

        // Fetch POIs from API
        const pois = await apiClient.getZonePois(zoneCode);
        console.log(`[QUEUE] Fetched ${pois.length} POIs from API`);

        // Add to queue (skip already downloaded)
        let added = 0;
        for (const poi of pois) {
            const exists = await this.storage.hasPoi(poi.code);
            if (!exists && !this.completed.has(poi.code)) {
                this.queue.push(poi);
                added++;
            } else {
                console.log(`[QUEUE] Skipping ${poi.code} (already downloaded)`);
            }
        }

        console.log(`[QUEUE] Added ${added} POIs to queue`);
        await this.saveQueueState();

        // Start processing
        if (!this.processing) {
            await this.processQueue();
        }

        return {
            total: pois.length,
            added: added,
            skipped: pois.length - added
        };
    }

    /**
     * Process queue with retry logic
     */
    async processQueue() {
        if (this.processing) {
            console.log('[QUEUE] Already processing');
            return;
        }

        this.processing = true;
        await this.saveQueueState();

        console.log(`[QUEUE] Processing ${this.queue.length} POIs`);

        while (this.queue.length > 0) {
            const poi = this.queue[0]; // Peek first item

            // Skip if already completed
            if (this.completed.has(poi.code)) {
                console.log(`[QUEUE] Skipping completed POI: ${poi.code}`);
                this.queue.shift();
                await this.saveQueueState();
                continue;
            }

            // Try to download with retry
            const success = await this.downloadPoiWithRetry(poi);

            if (success) {
                this.queue.shift(); // Remove from queue
                this.completed.add(poi.code);
                this.failed.delete(poi.code);
                console.log(`[QUEUE] Completed: ${poi.code}`);
            } else {
                // Max retries exceeded, keep in queue but mark as failed
                console.log(`[QUEUE] Failed after ${this.maxRetries} retries: ${poi.code}`);
                this.queue.shift(); // Remove from queue
                // Could implement a failed queue here if needed
            }

            await this.saveQueueState();
        }

        this.processing = false;
        await this.saveQueueState();
        console.log('[QUEUE] Processing complete');
    }

    /**
     * Download single POI with retry logic
     */
    async downloadPoiWithRetry(poi) {
        const retryCount = this.failed.get(poi.code) || 0;

        for (let attempt = retryCount; attempt < this.maxRetries; attempt++) {
            try {
                console.log(`[QUEUE] Downloading ${poi.code} (attempt ${attempt + 1}/${this.maxRetries})`);

                // Store POI data
                const stored = await this.storage.storePoi(poi);

                if (stored && poi.narrationAudioUrl) {
                    // Download audio if available
                    await this.downloadAudio(poi);
                }

                return true; // Success
            } catch (error) {
                console.error(`[QUEUE] Error downloading ${poi.code}:`, error.message);
                this.failed.set(poi.code, attempt + 1);

                if (attempt < this.maxRetries - 1) {
                    console.log(`[QUEUE] Retrying in ${this.retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }

        return false; // Failed after all retries
    }

    /**
     * Download audio file for POI
     */
    async downloadAudio(poi) {
        if (!poi.narrationAudioUrl) return;

        try {
            console.log(`[AUDIO] Downloading audio for ${poi.code}`);

            // Simulate audio download (in real app, use fetch)
            const response = await fetch(poi.narrationAudioUrl);
            const audioBlob = await response.blob();

            // Store audio
            await this.storage.storeAudio(poi.code, audioBlob);

            // Update POI with local audio path
            await this.storage.updatePoiAudio(poi.code, `local://${poi.code}.mp3`);

            console.log(`[AUDIO] Stored audio for ${poi.code}`);
        } catch (error) {
            console.error(`[AUDIO] Failed to download audio for ${poi.code}:`, error.message);
            // Don't fail the entire POI download if audio fails
        }
    }

    /**
     * Interrupt processing
     */
    async interrupt() {
        console.log('[QUEUE] Interrupted! Remaining:', this.queue.length);
        this.processing = false;
        await this.saveQueueState();
    }

    /**
     * Resume processing
     */
    async resume() {
        console.log('[QUEUE] Resuming download...');
        await this.processQueue();
    }

    /**
     * Get queue status
     */
    getStatus() {
        return {
            pending: this.queue.length,
            completed: this.completed.size,
            failed: this.failed.size,
            processing: this.processing
        };
    }
}

// ============================================
// 3. UPDATED ACCESS LAYER
// ============================================

class ProductionOfflineAccessLayer {
    constructor(storage) {
        this.storage = storage;
    }

    /**
     * Get POI content with offline-first logic
     * Includes audio support
     */
    async getPoiContent(poiCode, onlinePoi = null) {
        // Try local storage first
        const localPoi = await this.storage.getPoi(poiCode);

        if (localPoi) {
            console.log(`[ACCESS] Using local data for ${poiCode}`);

            // Get audio if available
            let audioBlob = null;
            if (localPoi.localAudioPath) {
                audioBlob = await this.storage.getAudio(poiCode);
            }

            return {
                source: 'local',
                hasFullContent: true,
                hasAudio: !!audioBlob,
                poi: {
                    code: localPoi.code,
                    name: localPoi.name,
                    narrationShort: localPoi.narrationShort,
                    narrationLong: localPoi.narrationLong,
                    location: localPoi.location,
                    audioBlob: audioBlob
                }
            };
        }

        // Fallback to online data (restricted)
        if (onlinePoi) {
            console.log(`[ACCESS] Using online data for ${poiCode} (restricted)`);
            return {
                source: 'online',
                hasFullContent: false,
                hasAudio: false,
                poi: {
                    code: onlinePoi.code,
                    name: onlinePoi.name,
                    narrationShort: onlinePoi.narrationShort,
                    narrationLong: null,
                    location: onlinePoi.location,
                    audioBlob: null
                }
            };
        }

        console.log(`[ACCESS] POI ${poiCode} not found`);
        return null;
    }

    /**
     * Check if POI has full content available
     */
    async hasFullContent(poiCode) {
        return await this.storage.hasPoi(poiCode);
    }

    /**
     * Check if POI has audio available
     */
    async hasAudio(poiCode) {
        const poi = await this.storage.getPoi(poiCode);
        if (!poi || !poi.localAudioPath) return false;

        const audioBlob = await this.storage.getAudio(poiCode);
        return !!audioBlob;
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PersistentStorage,
        PersistentDownloadQueue,
        ProductionOfflineAccessLayer
    };
}
