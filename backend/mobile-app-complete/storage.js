/**
 * MOBILE STORAGE ABSTRACTION
 * SQLite-based persistent storage for POIs, queue, and audio paths
 */

class MobileStorage {
    constructor(sqlite, fs) {
        this.sqlite = sqlite;
        this.fs = fs;
        this.db = null;
        this.audioDir = null;
    }

    async init() {
        console.log('[STORAGE] Initializing SQLite storage');

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

        // Setup audio directory
        this.audioDir = `${this.fs.DocumentDirectoryPath}/audio`;
        const dirExists = await this.fs.exists(this.audioDir);
        if (!dirExists) {
            await this.fs.mkdir(this.audioDir);
        }

        console.log('[STORAGE] SQLite initialized');
    }

    async storePoi(poi) {
        const exists = await this.hasPoi(poi.code);
        if (exists) {
            console.log(`[STORAGE] POI ${poi.code} already exists, skipping`);
            return false;
        }

        await this.db.executeSql(
            `INSERT INTO pois (
                code, id, name, narrationShort, narrationLong,
                location, narrationAudioUrl, localAudioPath,
                audioSizeKB, audioDuration, downloadedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                poi.code,
                poi._id || poi.id,
                poi.name,
                poi.narrationShort,
                poi.narrationLong,
                JSON.stringify(poi.location),
                poi.narrationAudioUrl || null,
                null, // localAudioPath set later
                poi.audioSizeKB || null,
                poi.audioDuration || null,
                new Date().toISOString()
            ]
        );

        console.log(`[STORAGE] Stored POI ${poi.code}`);
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
        console.log(`[STORAGE] Updated audio path for ${poiCode}`);
    }

    async downloadAudioFile(poiCode, audioUrl) {
        const filePath = `${this.audioDir}/${poiCode}.mp3`;
        console.log(`[AUDIO] Downloading ${audioUrl} to ${filePath}`);

        const result = await this.fs.downloadFile({
            fromUrl: audioUrl,
            toFile: filePath
        }).promise;

        if (result.statusCode === 200) {
            console.log(`[AUDIO] Downloaded ${poiCode}`);
            return filePath;
        } else {
            throw new Error(`Audio download failed: ${result.statusCode}`);
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

module.exports = MobileStorage;
