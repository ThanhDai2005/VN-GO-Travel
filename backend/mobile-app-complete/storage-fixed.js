/**
 * PRODUCTION FIXES - MINIMAL CHANGES ONLY
 * Fixing only real risks found in testing
 */

// ============================================
// FIX 1: Add storage size check before download
// ============================================

class MobileStorageWithSizeCheck {
    constructor(sqlite, fs) {
        this.sqlite = sqlite;
        this.fs = fs;
        this.db = null;
        this.audioDir = null;
        this.MAX_STORAGE_MB = 500; // 500MB limit
    }

    async init() {
        console.log('[STORAGE] Initializing SQLite storage');

        this.db = await this.sqlite.openDatabase({
            name: 'vngo_offline.db',
            location: 'default'
        });

        await this.db.executeSql(`
            CREATE TABLE IF NOT EXISTS pois (
                code TEXT PRIMARY KEY,
                id TEXT,
                name TEXT,
                narrationShort TEXT,
                narrationLong TEXT,
                location TEXT,
                narrationAudioUrl TEXT,
                localAudioPath TEXT,
                audioSizeKB INTEGER,
                audioDuration INTEGER,
                downloadedAt TEXT
            )
        `);

        await this.db.executeSql(`
            CREATE TABLE IF NOT EXISTS queue_state (
                id INTEGER PRIMARY KEY,
                state TEXT,
                updatedAt TEXT
            )
        `);

        this.audioDir = \`\${this.fs.DocumentDirectoryPath}/audio\`;
        const dirExists = await this.fs.exists(this.audioDir);
        if (!dirExists) {
            await this.fs.mkdir(this.audioDir);
        }

        console.log('[STORAGE] SQLite initialized');
    }

    // FIX: Check available storage before download
    async checkStorageSpace(requiredMB) {
        try {
            // Get free space (React Native FS provides this)
            const freeSpace = await this.fs.getFSInfo();
            const freeMB = freeSpace.freeSpace / (1024 * 1024);

            console.log(\`[STORAGE] Free space: \${freeMB.toFixed(2)} MB\`);

            if (freeMB < requiredMB) {
                throw new Error(\`Insufficient storage. Required: \${requiredMB}MB, Available: \${freeMB.toFixed(2)}MB\`);
            }

            return true;
        } catch (error) {
            console.error('[STORAGE] Storage check failed:', error);
            throw error;
        }
    }

    // FIX: Calculate total download size
    async calculateDownloadSize(pois) {
        let totalKB = 0;
        for (const poi of pois) {
            if (poi.audioSizeKB) {
                totalKB += poi.audioSizeKB;
            }
        }
        return totalKB / 1024; // Return MB
    }

    async storePoi(poi) {
        const exists = await this.hasPoi(poi.code);
        if (exists) {
            console.log(\`[STORAGE] POI \${poi.code} already exists, skipping\`);
            return false;
        }

        await this.db.executeSql(
            \`INSERT INTO pois (
                code, id, name, narrationShort, narrationLong,
                location, narrationAudioUrl, localAudioPath,
                audioSizeKB, audioDuration, downloadedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
            [
                poi.code,
                poi._id || poi.id,
                poi.name,
                poi.narrationShort,
                poi.narrationLong,
                JSON.stringify(poi.location),
                poi.narrationAudioUrl || null,
                null,
                poi.audioSizeKB || null,
                poi.audioDuration || null,
                new Date().toISOString()
            ]
        );

        console.log(\`[STORAGE] Stored POI \${poi.code}\`);
        return true;
    }

    async getPoi(poiCode) {
        const [result] = await this.db.executeSql(
            'SELECT * FROM pois WHERE code = ?',
            [poiCode]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows.item(0);
        return {
            code: row.code,
            id: row.id,
            name: row.name,
            narrationShort: row.narrationShort,
            narrationLong: row.narrationLong,
            location: JSON.parse(row.location),
            narrationAudioUrl: row.narrationAudioUrl,
            localAudioPath: row.localAudioPath,
            audioSizeKB: row.audioSizeKB,
            audioDuration: row.audioDuration,
            downloadedAt: row.downloadedAt
        };
    }

    async hasPoi(poiCode) {
        const poi = await this.getPoi(poiCode);
        return poi !== null;
    }

    async getAllPois() {
        const [result] = await this.db.executeSql('SELECT * FROM pois');
        const pois = [];
        for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows.item(i);
            pois.push({
                code: row.code,
                id: row.id,
                name: row.name,
                narrationShort: row.narrationShort,
                narrationLong: row.narrationLong,
                location: JSON.parse(row.location),
                narrationAudioUrl: row.narrationAudioUrl,
                localAudioPath: row.localAudioPath,
                audioSizeKB: row.audioSizeKB,
                audioDuration: row.audioDuration,
                downloadedAt: row.downloadedAt
            });
        }
        return pois;
    }

    async updatePoiAudio(poiCode, localAudioPath) {
        await this.db.executeSql(
            'UPDATE pois SET localAudioPath = ? WHERE code = ?',
            [localAudioPath, poiCode]
        );
        console.log(\`[STORAGE] Updated audio path for \${poiCode}\`);
    }

    async downloadAudioFile(poiCode, audioUrl) {
        const filePath = \`\${this.audioDir}/\${poiCode}.mp3\`;
        console.log(\`[AUDIO] Downloading \${audioUrl} to \${filePath}\`);

        // FIX: Add timeout to download
        const downloadPromise = this.fs.downloadFile({
            fromUrl: audioUrl,
            toFile: filePath,
            connectionTimeout: 30000, // 30 second timeout
            readTimeout: 30000
        }).promise;

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Download timeout')), 35000);
        });

        const result = await Promise.race([downloadPromise, timeoutPromise]);

        if (result.statusCode === 200) {
            console.log(\`[AUDIO] Downloaded \${poiCode}\`);
            return filePath;
        } else {
            throw new Error(\`Audio download failed: \${result.statusCode}\`);
        }
    }

    async saveQueueState(state) {
        const stateJson = JSON.stringify(state);
        const [result] = await this.db.executeSql('SELECT * FROM queue_state WHERE id = 1');

        if (result.rows.length === 0) {
            await this.db.executeSql(
                'INSERT INTO queue_state (id, state, updatedAt) VALUES (?, ?, ?)',
                [1, stateJson, new Date().toISOString()]
            );
        } else {
            await this.db.executeSql(
                'UPDATE queue_state SET state = ?, updatedAt = ? WHERE id = ?',
                [stateJson, new Date().toISOString(), 1]
            );
        }

        console.log('[STORAGE] Saved queue state');
    }

    async getQueueState() {
        const [result] = await this.db.executeSql('SELECT * FROM queue_state WHERE id = 1');

        if (result.rows.length === 0) return null;

        const row = result.rows.item(0);
        return JSON.parse(row.state);
    }

    async clearAll() {
        await this.db.executeSql('DELETE FROM pois');
        await this.db.executeSql('DELETE FROM queue_state');
        console.log('[STORAGE] Cleared all data');
    }

    // FIX: Sync POIs - remove stale POIs not in backend list
    async syncPois(backendPoiCodes) {
        console.log(`[STORAGE] Syncing POIs with backend list (${backendPoiCodes.length} POIs)`);

        const localPois = await this.getAllPois();
        const localCodes = localPois.map(p => p.code);

        console.log(`[STORAGE] Local POIs: ${localCodes.length}`);

        // Find POIs that exist locally but NOT in backend
        const staleCodes = localCodes.filter(code => !backendPoiCodes.includes(code));

        if (staleCodes.length === 0) {
            console.log('[STORAGE] No stale POIs found, all in sync');
            return { removed: 0, kept: localCodes.length };
        }

        console.log(`[STORAGE] Found ${staleCodes.length} stale POIs to remove:`, staleCodes);

        // Remove stale POIs
        for (const code of staleCodes) {
            await this.db.executeSql('DELETE FROM pois WHERE code = ?', [code]);

            // Also remove audio file if exists
            const audioPath = `${this.audioDir}/${code}.mp3`;
            const exists = await this.fs.exists(audioPath);
            if (exists) {
                await this.fs.unlink(audioPath);
                console.log(`[STORAGE] Removed audio file for ${code}`);
            }
        }

        console.log(`[STORAGE] Sync complete: removed ${staleCodes.length}, kept ${localCodes.length - staleCodes.length}`);

        return {
            removed: staleCodes.length,
            kept: localCodes.length - staleCodes.length,
            removedCodes: staleCodes
        };
    }
}

// ============================================
// FIX 2: Add storage check to download queue
// ============================================

class MobileDownloadQueueWithSizeCheck {
    constructor(storage, networkChecker) {
        this.storage = storage;
        this.networkChecker = networkChecker;
        this.queue = [];
        this.isInterrupted = false;
        this.processing = false;
        this.maxRetries = 3;
        this.retryDelay = 2000;
        this.processingDelay = 100;
    }

    async init() {
        const state = await this.storage.getQueueState();
        if (state) {
            this.queue = (state.queue || []).map(item => ({
                poiCode: item.poiCode,
                poiData: item.poiData,
                status: item.status,
                retryCount: item.retryCount
            }));

            const failedItems = this.queue.filter(item => item.status === 'failed');
            if (failedItems.length > 0) {
                console.log(\`[QUEUE] Found \${failedItems.length} failed POIs, re-queueing for retry\`);
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

            const hasPending = this.queue.some(i => i.status === 'pending');
            if (hasPending) {
                console.log('[QUEUE] Auto-resuming...');
                await this.processQueue();
            }
        }
    }

    async saveState() {
        await this.storage.saveQueueState({
            queue: this.queue.map(item => ({
                poiData: item.poiData,
                poiCode: item.poiCode,
                status: item.status,
                retryCount: item.retryCount
            }))
        });
    }

    async downloadZone(zoneCode, pois) {
        console.log(\`[QUEUE] Starting download for zone: \${zoneCode}\`);

        // FIX: Check storage space before download
        const downloadSizeMB = await this.storage.calculateDownloadSize(pois);
        console.log(\`[QUEUE] Download size: \${downloadSizeMB.toFixed(2)} MB\`);

        try {
            await this.storage.checkStorageSpace(downloadSizeMB + 50); // +50MB buffer
        } catch (error) {
            console.error('[QUEUE] Storage check failed:', error);
            return {
                error: 'insufficient_storage',
                message: error.message,
                requiredMB: downloadSizeMB
            };
        }

        const networkStatus = await this.networkChecker.getStatus();
        console.log(\`[NETWORK] Status: \${networkStatus}\`);

        if (networkStatus === 'offline') {
            console.log('[QUEUE] Offline - queueing for later');
            for (const poi of pois) {
                const exists = await this.storage.hasPoi(poi.code);
                const inQueue = this.queue.some(item => item.poiCode === poi.code);
                if (!exists && !inQueue) {
                    this.queue.push({
                        poiCode: poi.code,
                        poiData: poi,
                        status: 'pending',
                        retryCount: 0
                    });
                }
            }
            await this.saveState();
            return { total: pois.length, queued: this.queue.length, processing: false };
        }

        if (networkStatus === 'cellular') {
            const confirmed = await this.networkChecker.askUserConfirmation();
            if (!confirmed) {
                console.log('[QUEUE] User declined cellular download');
                return { cancelled: true };
            }
        }

        console.log(\`[QUEUE] Fetched \${pois.length} POIs\`);

        let added = 0;
        for (const poi of pois) {
            const exists = await this.storage.hasPoi(poi.code);
            const inQueue = this.queue.some(item => item.poiCode === poi.code);

            if (!exists && !inQueue) {
                this.queue.push({
                    poiCode: poi.code,
                    poiData: poi,
                    status: 'pending',
                    retryCount: 0
                });
                added++;
            }
        }

        console.log(\`[QUEUE] Added \${added} POIs to queue\`);
        await this.saveState();

        if (!this.processing) {
            await this.processQueue();
        }

        return { total: pois.length, added, skipped: pois.length - added };
    }

    async processQueue() {
        if (this.processing) return;

        this.processing = true;
        this.isInterrupted = false;
        await this.saveState();

        const pendingItems = this.queue.filter(i => i.status === 'pending');
        console.log(\`[QUEUE] Processing \${pendingItems.length} pending POIs\`);

        for (const item of this.queue) {
            if (this.isInterrupted) {
                console.log('[QUEUE] Interrupted by user');
                break;
            }

            if (item.status !== 'pending') continue;

            console.log(\`[QUEUE] Processing \${item.poiCode}\`);
            item.status = 'processing';
            await this.saveState();

            const success = await this.downloadPoiWithRetry(item);

            if (success) {
                item.status = 'completed';
                console.log(\`[QUEUE] ✔ Completed: \${item.poiCode}\`);
            } else {
                item.status = 'failed';
                console.log(\`[QUEUE] ✖ Failed: \${item.poiCode}\`);
            }

            await this.saveState();
            await new Promise(resolve => setTimeout(resolve, this.processingDelay));
        }

        this.processing = false;
        await this.saveState();

        const stats = this.getStats();
        console.log('[QUEUE] Processing complete:', stats);
    }

    async downloadPoiWithRetry(item) {
        for (let attempt = item.retryCount; attempt < this.maxRetries; attempt++) {
            try {
                console.log(\`[QUEUE]   Attempt \${attempt + 1}/\${this.maxRetries} for \${item.poiCode}\`);

                const stored = await this.storage.storePoi(item.poiData);

                if (stored && item.poiData.narrationAudioUrl) {
                    const localPath = await this.storage.downloadAudioFile(
                        item.poiData.code,
                        item.poiData.narrationAudioUrl
                    );
                    await this.storage.updatePoiAudio(item.poiData.code, localPath);
                }

                return true;
            } catch (error) {
                console.error(\`[QUEUE]   Error: \${error.message}\`);
                item.retryCount = attempt + 1;

                if (attempt < this.maxRetries - 1) {
                    console.log(\`[QUEUE]   Retrying in \${this.retryDelay}ms...\`);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                }
            }
        }

        return false;
    }

    async interrupt() {
        console.log('[QUEUE] Interrupt requested');
        this.isInterrupted = true;
        this.processing = false;
        await this.saveState();
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

    getProgress() {
        const stats = this.getStats();
        return {
            current: stats.completed,
            total: stats.total,
            percentage: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
            isProcessing: this.processing
        };
    }
}

module.exports = {
    MobileStorageWithSizeCheck,
    MobileDownloadQueueWithSizeCheck
};
