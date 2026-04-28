/**
 * MOBILE PRODUCTION OFFLINE SYSTEM
 * SQLite storage + filesystem audio + app lifecycle handling
 */

// ============================================
// 1. STORAGE ADAPTER (SQLite Implementation)
// ============================================

/**
 * Abstract storage interface
 * Implementations: SQLite (mobile), IndexedDB (web)
 */
class StorageAdapter {
    async init() { throw new Error('Not implemented'); }
    async storePoi(poi, zoneCode = null) { throw new Error('Not implemented'); }
    async getPoi(poiCode) { throw new Error('Not implemented'); }
    async hasPoi(poiCode) { throw new Error('Not implemented'); }
    async getAllPois() { throw new Error('Not implemented'); }
    async getPoisByZone(zoneCode) { throw new Error('Not implemented'); }
    async removePoisByZoneExcept(zoneCode, validPoiCodes) { throw new Error('Not implemented'); }
    async updatePoiAudio(poiCode, localAudioPath) { throw new Error('Not implemented'); }
    async storeQueueState(state) { throw new Error('Not implemented'); }
    async loadQueueState() { throw new Error('Not implemented'); }
    async clear() { throw new Error('Not implemented'); }
}

/**
 * SQLite Storage Adapter for Mobile
 * Compatible with React Native SQLite, Expo SQLite, Capacitor SQLite
 */
class SQLiteStorageAdapter extends StorageAdapter {
    constructor(sqliteInstance, fileSystem) {
        super();
        this.db = null;
        this.sqlite = sqliteInstance; // SQLite library instance
        this.fs = fileSystem; // Filesystem API (e.g., react-native-fs)
        this.audioDir = null;
    }

    /**
     * Initialize SQLite database and audio directory
     */
    async init() {
        console.log('[SQLITE] Initializing database');

        // Open database
        this.db = await this.sqlite.openDatabase({
            name: 'vngo_offline.db',
            location: 'default'
        });

        // Create tables
        await this.db.executeSql(`
            CREATE TABLE IF NOT EXISTS pois (
                code TEXT PRIMARY KEY,
                id TEXT,
                zoneCode TEXT,
                name TEXT,
                narrationShort TEXT,
                narrationLong TEXT,
                location TEXT,
                narrationAudioUrl TEXT,
                localAudioPath TEXT,
                downloadedAt TEXT
            )
        `);

        try {
            await this.db.executeSql('ALTER TABLE pois ADD COLUMN zoneCode TEXT');
        } catch (e) {
            // no-op: column already exists
        }

        await this.db.executeSql(`
            CREATE TABLE IF NOT EXISTS queue_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                state TEXT,
                updatedAt TEXT
            )
        `);

        // Create audio directory
        this.audioDir = `${this.fs.DocumentDirectoryPath}/audio`;
        const dirExists = await this.fs.exists(this.audioDir);
        if (!dirExists) {
            await this.fs.mkdir(this.audioDir);
            console.log('[SQLITE] Created audio directory:', this.audioDir);
        }

        console.log('[SQLITE] Database initialized');
    }

    /**
     * Store POI (prevents duplication)
     */
    async storePoi(poi, zoneCode = null) {
        const exists = await this.hasPoi(poi.code);
        if (exists) {
            console.log(`[SQLITE] POI ${poi.code} already exists, skipping`);
            return false;
        }

        await this.db.executeSql(
            `INSERT INTO pois (code, id, zoneCode, name, narrationShort, narrationLong, location, narrationAudioUrl, localAudioPath, downloadedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                poi.code,
                poi._id || poi.id,
                zoneCode,
                poi.name,
                poi.narrationShort,
                poi.narrationLong,
                JSON.stringify(poi.location),
                poi.narrationAudioUrl || null,
                null,
                new Date().toISOString()
            ]
        );

        console.log(`[SQLITE] Stored POI ${poi.code}`);
        return true;
    }

    /**
     * Get POI from database
     */
    async getPoi(poiCode) {
        const result = await this.db.executeSql(
            'SELECT * FROM pois WHERE code = ?',
            [poiCode]
        );

        if (result[0].rows.length === 0) {
            return null;
        }

        const row = result[0].rows.item(0);
        return {
            code: row.code,
            id: row.id,
                zoneCode: row.zoneCode || null,
            name: row.name,
            narrationShort: row.narrationShort,
            narrationLong: row.narrationLong,
            location: JSON.parse(row.location),
            narrationAudioUrl: row.narrationAudioUrl,
            localAudioPath: row.localAudioPath,
            downloadedAt: row.downloadedAt
        };
    }

    /**
     * Check if POI exists
     */
    async hasPoi(poiCode) {
        const result = await this.db.executeSql(
            'SELECT COUNT(*) as count FROM pois WHERE code = ?',
            [poiCode]
        );
        return result[0].rows.item(0).count > 0;
    }

    /**
     * Get all POIs
     */
    async getAllPois() {
        const result = await this.db.executeSql('SELECT * FROM pois');
        const pois = [];
        for (let i = 0; i < result[0].rows.length; i++) {
            const row = result[0].rows.item(i);
            pois.push({
                code: row.code,
                id: row.id,
                zoneCode: row.zoneCode || null,
                name: row.name,
                narrationShort: row.narrationShort,
                narrationLong: row.narrationLong,
                location: JSON.parse(row.location),
                narrationAudioUrl: row.narrationAudioUrl,
                localAudioPath: row.localAudioPath,
                downloadedAt: row.downloadedAt
            });
        }
        return pois;
    }

    async getPoisByZone(zoneCode) {
        const normalized = String(zoneCode || '').toUpperCase();
        const result = await this.db.executeSql('SELECT * FROM pois WHERE zoneCode = ?', [normalized]);
        const pois = [];
        for (let i = 0; i < result[0].rows.length; i++) {
            const row = result[0].rows.item(i);
            pois.push({
                code: row.code,
                id: row.id,
                zoneCode: row.zoneCode || null,
                name: row.name,
                narrationShort: row.narrationShort,
                narrationLong: row.narrationLong,
                location: JSON.parse(row.location),
                narrationAudioUrl: row.narrationAudioUrl,
                localAudioPath: row.localAudioPath,
                downloadedAt: row.downloadedAt
            });
        }
        return pois;
    }

    async removePoisByZoneExcept(zoneCode, validPoiCodes) {
        const normalizedZone = String(zoneCode || '').toUpperCase();
        const validSet = new Set((validPoiCodes || []).map(code => String(code || '').toUpperCase()));
        const localPois = await this.getPoisByZone(normalizedZone);
        const staleCodes = localPois
            .map(p => p.code)
            .filter(code => !validSet.has(String(code || '').toUpperCase()));

        for (const code of staleCodes) {
            await this.db.executeSql('DELETE FROM pois WHERE code = ? AND zoneCode = ?', [code, normalizedZone]);
        }

        return staleCodes;
    }

    /**
     * Update POI audio path
     */
    async updatePoiAudio(poiCode, localAudioPath) {
        await this.db.executeSql(
            'UPDATE pois SET localAudioPath = ? WHERE code = ?',
            [localAudioPath, poiCode]
        );
        console.log(`[SQLITE] Updated audio path for ${poiCode}`);
        return true;
    }

    /**
     * Store queue state
     */
    async storeQueueState(state) {
        const stateJson = JSON.stringify(state);
        await this.db.executeSql(
            `INSERT OR REPLACE INTO queue_state (id, state, updatedAt)
             VALUES (1, ?, ?)`,
            [stateJson, new Date().toISOString()]
        );
        console.log('[SQLITE] Saved queue state');
    }

    /**
     * Load queue state
     */
    async loadQueueState() {
        const result = await this.db.executeSql(
            'SELECT state FROM queue_state WHERE id = 1'
        );

        if (result[0].rows.length === 0) {
            return null;
        }

        const stateJson = result[0].rows.item(0).state;
        return JSON.parse(stateJson);
    }

    /**
     * Clear all data (for testing)
     */
    async clear() {
        await this.db.executeSql('DELETE FROM pois');
        await this.db.executeSql('DELETE FROM queue_state');

        // Clear audio directory
        const files = await this.fs.readDir(this.audioDir);
        for (const file of files) {
            await this.fs.unlink(file.path);
        }

        console.log('[SQLITE] Cleared all data');
    }

    /**
     * Download and save audio file to filesystem
     */
    async downloadAudioFile(poiCode, audioUrl) {
        const fileName = `${poiCode}.mp3`;
        const filePath = `${this.audioDir}/${fileName}`;

        console.log(`[AUDIO] Downloading ${audioUrl} to ${filePath}`);

        // Download file
        const downloadResult = await this.fs.downloadFile({
            fromUrl: audioUrl,
            toFile: filePath
        }).promise;

        if (downloadResult.statusCode === 200) {
            console.log(`[AUDIO] Downloaded audio for ${poiCode}`);
            return filePath;
        } else {
            throw new Error(`Download failed with status ${downloadResult.statusCode}`);
        }
    }

    /**
     * Check if audio file exists
     */
    async audioFileExists(localAudioPath) {
        return await this.fs.exists(localAudioPath);
    }
}

// ============================================
// 2. MOBILE QUEUE WITH NETWORK AWARENESS
// ============================================

class MobileDownloadQueue {
    constructor(storage, networkChecker) {
        this.storage = storage;
        this.networkChecker = networkChecker; // Network status checker
        this.queue = [];
        this.isInterrupted = false;
        this.processing = false;
        this.maxRetries = 3;
        this.retryDelay = 2000;
        this.processingDelay = 100;
    }

    /**
     * Initialize and restore queue on app start
     */
    async init() {
        console.log('[QUEUE] Initializing mobile queue');

        const state = await this.storage.loadQueueState();
        if (state) {
            this.queue = (state.queue || []).map(item => ({
                poiCode: item.poiCode,
                poiData: item.poiData,
                status: item.status,
                retryCount: item.retryCount
            }));

            // Re-queue failed POIs
            const failedItems = this.queue.filter(item => item.status === 'failed');
            if (failedItems.length > 0) {
                console.log(`[QUEUE] Found ${failedItems.length} failed POIs, re-queueing`);
                failedItems.forEach(item => {
                    item.status = 'pending';
                    item.retryCount = 0;
                });
            }

            console.log('[QUEUE] Restored state:', {
                total: this.queue.length,
                pending: this.queue.filter(i => i.status === 'pending').length,
                completed: this.queue.filter(i => i.status === 'completed').length
            });

            // Auto-resume if there are pending items
            const hasPending = this.queue.some(i => i.status === 'pending');
            if (hasPending) {
                console.log('[QUEUE] Auto-resuming on app start');
                await this.processQueue();
            }
        }
    }

    async saveState() {
        await this.storage.storeQueueState({
            queue: this.queue.map(item => ({
                poiCode: item.poiCode,
                poiData: item.poiData,
                status: item.status,
                retryCount: item.retryCount
            }))
        });
    }

    /**
     * Download zone with network awareness
     */
    async downloadZone(zoneCode, pois) {
        console.log(`[QUEUE] Starting download for zone: ${zoneCode}`);

        // Sync strategy: when backend zone list arrives, remove stale local POIs for this zone only.
        await this.syncZonePois(zoneCode, pois);

        // Check network status
        const networkStatus = await this.networkChecker.getStatus();
        console.log(`[QUEUE] Network status: ${networkStatus}`);

        // Network-aware logic
        if (networkStatus === 'offline') {
            console.log('[QUEUE] Offline - queueing for later');
            // Queue but don't process
            await this.addToQueue(zoneCode, pois);
            return { total: pois.length, added: pois.length, skipped: 0, queued: true };
        }

        if (networkStatus === 'cellular') {
            console.log('[QUEUE] On mobile data - user confirmation required');
            const userConfirmed = await this.networkChecker.askUserConfirmation();
            if (!userConfirmed) {
                console.log('[QUEUE] User declined download on mobile data');
                return { total: pois.length, added: 0, skipped: pois.length, cancelled: true };
            }
        }

        // WiFi or user confirmed - proceed
        await this.addToQueue(zoneCode, pois);

        if (!this.processing) {
            await this.processQueue();
        }

        return { total: pois.length, added: this.queue.length, skipped: 0 };
    }

    async addToQueue(zoneCode, pois) {
        const normalizedZone = String(zoneCode || '').toUpperCase();
        let added = 0;
        for (const poi of pois) {
            const exists = await this.storage.hasPoi(poi.code);
            const inQueue = this.queue.some(item => item.poiCode === poi.code);

            if (!exists && !inQueue) {
                this.queue.push({
                    poiCode: poi.code,
                    poiData: poi,
                    zoneCode: normalizedZone,
                    status: 'pending',
                    retryCount: 0
                });
                added++;
            }
        }
        console.log(`[QUEUE] Added ${added} POIs to queue`);
        await this.saveState();
    }

    /**
     * Process queue with interruption support
     */
    async processQueue() {
        if (this.processing) return;

        this.processing = true;
        this.isInterrupted = false;
        await this.saveState();

        const pendingItems = this.queue.filter(i => i.status === 'pending');
        console.log(`[QUEUE] Processing ${pendingItems.length} pending POIs`);

        for (const item of this.queue) {
            if (this.isInterrupted) {
                console.log('[QUEUE] Interrupted by user');
                break;
            }

            if (item.status !== 'pending') continue;

            console.log(`[QUEUE] Processing ${item.poiCode}`);
            item.status = 'processing';
            await this.saveState();

            const success = await this.downloadPoiWithRetry(item);

            if (success) {
                item.status = 'completed';
                console.log(`[QUEUE] ✔ Completed: ${item.poiCode}`);
            } else {
                item.status = 'failed';
                console.log(`[QUEUE] ✖ Failed: ${item.poiCode}`);
            }

            await this.saveState();
            await new Promise(resolve => setTimeout(resolve, this.processingDelay));
        }

        this.processing = false;
        await this.saveState();
        console.log('[QUEUE] Processing complete');
    }

    async downloadPoiWithRetry(item) {
        for (let attempt = item.retryCount; attempt < this.maxRetries; attempt++) {
            try {
                console.log(`[QUEUE]   Attempt ${attempt + 1}/${this.maxRetries} for ${item.poiCode}`);

                // Store POI data
                const stored = await this.storage.storePoi(item.poiData, item.zoneCode || null);

                // Download audio if available
                if (stored && item.poiData.narrationAudioUrl) {
                    const audioPath = await this.storage.downloadAudioFile(
                        item.poiCode,
                        item.poiData.narrationAudioUrl
                    );
                    await this.storage.updatePoiAudio(item.poiCode, audioPath);
                }

                return true;
            } catch (error) {
                console.error(`[QUEUE]   Error: ${error.message}`);
                item.retryCount = attempt + 1;

                if (attempt < this.maxRetries - 1) {
                    console.log(`[QUEUE]   Retrying in ${this.retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }

        return false;
    }

    async syncZonePois(zoneCode, backendPois) {
        const normalizedZone = String(zoneCode || '').toUpperCase();
        const backendCodes = (backendPois || [])
            .map(p => String(p?.code || '').toUpperCase())
            .filter(Boolean);

        const staleCodes = await this.storage.removePoisByZoneExcept(normalizedZone, backendCodes);

        if (staleCodes.length > 0) {
            console.log(`[SYNC] Removed stale POIs for zone ${normalizedZone}: ${staleCodes.join(', ')}`);
        } else {
            console.log(`[SYNC] No stale POIs found for zone ${normalizedZone}`);
        }
    }

    async interrupt() {
        console.log('[QUEUE] Interrupt requested');
        this.isInterrupted = true;
        this.processing = false;
        await this.saveState();
    }

    async resume() {
        console.log('[QUEUE] Resuming download');
        await this.processQueue();
    }

    getStats() {
        return {
            total: this.queue.length,
            pending: this.queue.filter(i => i.status === 'pending').length,
            processing: this.queue.filter(i => i.status === 'processing').length,
            completed: this.queue.filter(i => i.status === 'completed').length,
            failed: this.queue.filter(i => i.status === 'failed').length
        };
    }
}

// ============================================
// 3. OFFLINE AUDIO PLAYER
// ============================================

class OfflineAudioPlayer {
    constructor(storage, audioPlayerAPI) {
        this.storage = storage;
        this.player = audioPlayerAPI; // Native audio player (e.g., react-native-sound)
    }

    /**
     * Play audio with offline fallback
     */
    async playAudio(poiCode) {
        console.log(`[AUDIO] Playing audio for ${poiCode}`);

        // Get POI from storage
        const poi = await this.storage.getPoi(poiCode);
        if (!poi) {
            console.error(`[AUDIO] POI ${poiCode} not found`);
            return false;
        }

        // Check if audio file exists locally
        if (poi.localAudioPath) {
            const exists = await this.storage.audioFileExists(poi.localAudioPath);
            if (exists) {
                console.log(`[AUDIO] Playing from local file: ${poi.localAudioPath}`);
                await this.player.play(poi.localAudioPath);
                return true;
            } else {
                console.warn(`[AUDIO] Local file missing: ${poi.localAudioPath}`);
            }
        }

        // Fallback: no audio available
        console.log(`[AUDIO] No audio available for ${poiCode}`);
        return false;
    }

    async stopAudio() {
        await this.player.stop();
    }
}

// ============================================
// 4. NETWORK STATUS CHECKER
// ============================================

class NetworkStatusChecker {
    constructor(netInfoAPI, alertAPI) {
        this.netInfo = netInfoAPI; // e.g., @react-native-community/netinfo
        this.alert = alertAPI; // Native alert API
    }

    /**
     * Get current network status
     * Returns: 'wifi' | 'cellular' | 'offline'
     */
    async getStatus() {
        const state = await this.netInfo.fetch();

        if (!state.isConnected) {
            return 'offline';
        }

        if (state.type === 'wifi') {
            return 'wifi';
        }

        if (state.type === 'cellular') {
            return 'cellular';
        }

        return 'wifi'; // Default to wifi for unknown types
    }

    /**
     * Ask user confirmation for download on mobile data
     */
    async askUserConfirmation() {
        return new Promise((resolve) => {
            this.alert.alert(
                'Download on Mobile Data',
                'You are on mobile data. Download zone content now?',
                [
                    { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
                    { text: 'Download', onPress: () => resolve(true) }
                ]
            );
        });
    }
}

// ============================================
// 5. MOBILE ACCESS LAYER
// ============================================

class MobileOfflineAccessLayer {
    constructor(storage) {
        this.storage = storage;
    }

    /**
     * Get POI content with offline-first logic
     */
    async getPoiContent(poiCode, onlinePoi = null) {
        // Try local storage first
        const localPoi = await this.storage.getPoi(poiCode);

        if (localPoi) {
            console.log(`[ACCESS] Using local data for ${poiCode}`);

            // Check if audio file exists
            let hasAudio = false;
            if (localPoi.localAudioPath) {
                hasAudio = await this.storage.audioFileExists(localPoi.localAudioPath);
            }

            return {
                source: 'local',
                hasFullContent: true,
                hasAudio: hasAudio,
                poi: {
                    code: localPoi.code,
                    name: localPoi.name,
                    narrationShort: localPoi.narrationShort,
                    narrationLong: localPoi.narrationLong,
                    location: localPoi.location,
                    audioPath: localPoi.localAudioPath
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
                    audioPath: null
                }
            };
        }

        return null;
    }

    async hasFullContent(poiCode) {
        return await this.storage.hasPoi(poiCode);
    }

    async hasAudio(poiCode) {
        const poi = await this.storage.getPoi(poiCode);
        if (!poi || !poi.localAudioPath) return false;
        return await this.storage.audioFileExists(poi.localAudioPath);
    }
}

// Export for mobile app integration
module.exports = {
    StorageAdapter,
    SQLiteStorageAdapter,
    MobileDownloadQueue,
    OfflineAudioPlayer,
    NetworkStatusChecker,
    MobileOfflineAccessLayer
};
