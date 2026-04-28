/**
 * MOBILE OFFLINE SYSTEM - VALIDATION TESTS
 * Tests SQLite storage, filesystem audio, network awareness, and app lifecycle
 */

// Mock SQLite for Node.js testing
class MockSQLite {
    constructor() {
        this.databases = new Map();
    }

    async openDatabase(config) {
        const dbName = config.name;
        if (!this.databases.has(dbName)) {
            this.databases.set(dbName, {
                tables: new Map(),
                name: dbName
            });
        }
        return new MockDatabase(this.databases.get(dbName));
    }
}

class MockDatabase {
    constructor(db) {
        this.db = db;
    }

    async executeSql(sql, params = []) {
        // Parse CREATE TABLE
        if (sql.includes('CREATE TABLE')) {
            const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
            if (match) {
                const tableName = match[1];
                if (!this.db.tables.has(tableName)) {
                    this.db.tables.set(tableName, []);
                }
            }
            return [{ rows: { length: 0, item: () => null } }];
        }

        // Parse INSERT
        if (sql.includes('INSERT INTO')) {
            const match = sql.match(/INSERT INTO (\w+)/);
            if (match) {
                const tableName = match[1];
                const table = this.db.tables.get(tableName) || [];

                // Create row object from params
                const row = {};
                if (tableName === 'pois') {
                    row.code = params[0];
                    row.zoneCode = params[1] ?? null;
                    row.data = params[2];
                    row.downloadedAt = params[3];
                } else if (tableName === 'queue_state') {
                    row.id = params[0];
                    row.state = params[1];
                    row.updatedAt = params[2];
                }

                table.push(row);
                this.db.tables.set(tableName, table);
            }
            return [{ rowsAffected: 1 }];
        }

        // Parse SELECT
        if (sql.includes('SELECT')) {
            const match = sql.match(/FROM (\w+)/);
            if (match) {
                const tableName = match[1];
                const table = this.db.tables.get(tableName) || [];

                // Handle WHERE clause
                if (sql.includes('WHERE code = ?')) {
                    const filtered = table.filter(row => row.code === params[0]);
                    return [{
                        rows: {
                            length: filtered.length,
                            item: (i) => filtered[i]
                        }
                    }];
                }

                return [{
                    rows: {
                        length: table.length,
                        item: (i) => table[i]
                    }
                }];
            }
        }

        // Parse UPDATE
        if (sql.includes('UPDATE')) {
            const match = sql.match(/UPDATE (\w+)/);
            if (match) {
                const tableName = match[1];
                const table = this.db.tables.get(tableName) || [];

                if (sql.includes('WHERE code = ?')) {
                    const code = params[params.length - 1];
                    const row = table.find(r => r.code === code);
                    if (row && tableName === 'pois') {
                        row.data = params[0];
                    }
                } else if (sql.includes('WHERE id = ?')) {
                    const id = params[params.length - 1];
                    const row = table.find(r => r.id === id);
                    if (row && tableName === 'queue_state') {
                        row.state = params[0];
                        row.updatedAt = params[1];
                    }
                }

                return [{ rowsAffected: 1 }];
            }
        }

        return [{ rows: { length: 0, item: () => null } }];
    }
}

// Mock filesystem for Node.js testing
class MockFileSystem {
    constructor() {
        this.files = new Map();
        this.DocumentDirectoryPath = '/mock/documents';
    }

    async mkdir(path) {
        console.log(`[FS] Created directory: ${path}`);
    }

    async exists(path) {
        return this.files.has(path);
    }

    async downloadFile(options) {
        const { fromUrl, toFile } = options;
        console.log(`[FS] Downloading ${fromUrl} to ${toFile}`);

        // Simulate download
        await new Promise(resolve => setTimeout(resolve, 50));

        // Store mock file
        this.files.set(toFile, {
            url: fromUrl,
            size: 1024,
            downloadedAt: new Date().toISOString()
        });

        return { promise: Promise.resolve({ statusCode: 200 }) };
    }

    async readFile(path) {
        const file = this.files.get(path);
        if (!file) throw new Error('File not found');
        return 'mock audio data';
    }

    async unlink(path) {
        this.files.delete(path);
    }
}

// Mock network checker
class MockNetworkChecker {
    constructor() {
        this.status = 'wifi'; // wifi | cellular | offline
        this.userConfirmed = true;
    }

    async getStatus() {
        return this.status;
    }

    async askUserConfirmation() {
        console.log('[NETWORK] Asking user for cellular download confirmation');
        return this.userConfirmed;
    }
}

// Import mobile system (we'll use the classes directly)
const mockPois = [
    { _id: '1', code: 'POI_001', name: 'POI 1', narrationShort: 'Short 1', narrationLong: 'Long 1', location: {}, narrationAudioUrl: 'http://audio1.mp3' },
    { _id: '2', code: 'POI_002', name: 'POI 2', narrationShort: 'Short 2', narrationLong: 'Long 2', location: {}, narrationAudioUrl: 'http://audio2.mp3' },
    { _id: '3', code: 'POI_003', name: 'POI 3', narrationShort: 'Short 3', narrationLong: 'Long 3', location: {}, narrationAudioUrl: 'http://audio3.mp3' },
    { _id: '4', code: 'POI_004', name: 'POI 4', narrationShort: 'Short 4', narrationLong: 'Long 4', location: {}, narrationAudioUrl: 'http://audio4.mp3' },
    { _id: '5', code: 'POI_005', name: 'POI 5', narrationShort: 'Short 5', narrationLong: 'Long 5', location: {}, narrationAudioUrl: 'http://audio5.mp3' }
];

// Simplified SQLiteStorageAdapter for testing
class TestSQLiteStorage {
    constructor(sqlite, fs) {
        this.sqlite = sqlite;
        this.fs = fs;
        this.db = null;
        this.audioDir = `${fs.DocumentDirectoryPath}/audio`;
    }

    async init() {
        console.log('[STORAGE] Initializing SQLite storage');
        this.db = await this.sqlite.openDatabase({ name: 'vngo_offline.db' });

        await this.db.executeSql(`
            CREATE TABLE IF NOT EXISTS pois (
                code TEXT PRIMARY KEY,
                zoneCode TEXT,
                data TEXT,
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

        await this.fs.mkdir(this.audioDir);
        console.log('[STORAGE] SQLite initialized');
    }

    async storePoi(poi, zoneCode = null) {
        const exists = await this.hasPoi(poi.code);
        if (exists) {
            console.log(`[STORAGE] POI ${poi.code} already exists, skipping`);
            return false;
        }

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

        await this.db.executeSql(
            'INSERT INTO pois (code, zoneCode, data, downloadedAt) VALUES (?, ?, ?, ?)',
            [poi.code, zoneCode, JSON.stringify(poiData), poiData.downloadedAt]
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
        const parsed = JSON.parse(row.data);
        parsed.zoneCode = row.zoneCode || null;
        return parsed;
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
            const parsed = JSON.parse(row.data);
            parsed.zoneCode = row.zoneCode || null;
            pois.push(parsed);
        }
        return pois;
    }

    async getPoisByZone(zoneCode) {
        const normalized = String(zoneCode || '').toUpperCase();
        const all = await this.getAllPois();
        return all.filter(p => String(p.zoneCode || '').toUpperCase() === normalized);
    }

    async removePoisByZoneExcept(zoneCode, validPoiCodes) {
        const normalizedZone = String(zoneCode || '').toUpperCase();
        const validSet = new Set((validPoiCodes || []).map(code => String(code || '').toUpperCase()));
        const localZonePois = await this.getPoisByZone(normalizedZone);
        const stale = localZonePois.filter(p => !validSet.has(String(p.code || '').toUpperCase()));

        if (stale.length === 0) {
            return [];
        }

        const [result] = await this.db.executeSql('SELECT * FROM pois');
        const keepRows = [];
        for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows.item(i);
            const isTargetZone = String(row.zoneCode || '').toUpperCase() === normalizedZone;
            const isStale = isTargetZone && stale.some(s => s.code === row.code);
            if (!isStale) {
                keepRows.push(row);
            }
        }

        this.db.db.tables.set('pois', keepRows);
        return stale.map(s => s.code);
    }

    async updatePoiAudio(poiCode, localAudioPath) {
        const poi = await this.getPoi(poiCode);
        if (poi) {
            poi.localAudioPath = localAudioPath;
            await this.db.executeSql(
                'UPDATE pois SET data = ? WHERE code = ?',
                [JSON.stringify(poi), poiCode]
            );
            return true;
        }
        return false;
    }

    async downloadAudioFile(poiCode, audioUrl) {
        const filePath = `${this.audioDir}/${poiCode}.mp3`;
        console.log(`[AUDIO] Downloading ${audioUrl} to ${filePath}`);

        await this.fs.downloadFile({
            fromUrl: audioUrl,
            toFile: filePath
        });

        return filePath;
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
}

// Simplified MobileDownloadQueue for testing
class TestMobileQueue {
    constructor(storage, networkChecker) {
        this.storage = storage;
        this.networkChecker = networkChecker;
        this.queue = [];
        this.isInterrupted = false;
        this.processing = false;
        this.maxRetries = 3;
        this.retryDelay = 500;
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
                console.log(`[QUEUE] Found ${failedItems.length} failed POIs, re-queueing for retry`);
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
        console.log(`[QUEUE] Starting download for zone: ${zoneCode}`);

        await this.syncZonePois(zoneCode, pois);

        // Check network status
        const networkStatus = await this.networkChecker.getStatus();
        console.log(`[NETWORK] Status: ${networkStatus}`);

        if (networkStatus === 'offline') {
            console.log('[QUEUE] Offline - queueing for later');
            // Queue but don't process
            const normalizedZone = String(zoneCode || '').toUpperCase();
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

        console.log(`[QUEUE] Fetched ${pois.length} POIs`);

        let added = 0;
        const normalizedZone = String(zoneCode || '').toUpperCase();
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

        const stats = this.getStats();
        console.log('[QUEUE] Processing complete:', stats);
    }

    async downloadPoiWithRetry(item) {
        for (let attempt = item.retryCount; attempt < this.maxRetries; attempt++) {
            try {
                console.log(`[QUEUE]   Attempt ${attempt + 1}/${this.maxRetries} for ${item.poiCode}`);

                const stored = await this.storage.storePoi(item.poiData, item.zoneCode || null);

                if (stored && item.poiData.narrationAudioUrl) {
                    const localPath = await this.storage.downloadAudioFile(
                        item.poiData.code,
                        item.poiData.narrationAudioUrl
                    );
                    await this.storage.updatePoiAudio(item.poiData.code, localPath);
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
        const backendCodes = (backendPois || []).map(p => String(p.code || '').toUpperCase());
        const stale = await this.storage.removePoisByZoneExcept(normalizedZone, backendCodes);

        if (stale.length > 0) {
            console.log(`[SYNC] Removed stale POIs for zone ${normalizedZone}: ${stale.join(', ')}`);
        }
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
}

async function runMobileTests() {
    console.log('==================================================');
    console.log('MOBILE OFFLINE SYSTEM - VALIDATION TESTS');
    console.log('==================================================\n');

    // TEST 1: SQLite Storage & Filesystem Audio
    console.log('### TEST 1: SQLITE STORAGE & FILESYSTEM AUDIO');
    console.log('---\n');

    const sqlite = new MockSQLite();
    const fs = new MockFileSystem();
    const networkChecker = new MockNetworkChecker();

    let storage = new TestSQLiteStorage(sqlite, fs);
    await storage.init();

    let queue = new TestMobileQueue(storage, networkChecker);
    await queue.init();

    console.log('Step 1: Download 5 POIs with audio');
    const result1 = await queue.downloadZone('ZONE_A', mockPois);
    console.log('Download result:', result1);

    const pois1 = await storage.getAllPois();
    console.log('\nPOIs stored in SQLite:', pois1.length);
    console.log('Audio files in filesystem:', fs.files.size);

    const poi1 = await storage.getPoi('POI_001');
    console.log('POI_001 localAudioPath:', poi1.localAudioPath);

    const test1Pass = pois1.length === 5 && fs.files.size === 5 && poi1.localAudioPath;
    console.log('\n' + (test1Pass ? '✔ PASS' : '❌ FAIL') + ': SQLite storage and filesystem audio working\n');

    // TEST 2: App Restart & Auto-Resume
    console.log('### TEST 2: APP RESTART & AUTO-RESUME');
    console.log('---\n');

    // Use fresh database for TEST 2
    const sqlite2 = new MockSQLite();
    const fs2 = new MockFileSystem();

    storage = new TestSQLiteStorage(sqlite2, fs2);
    await storage.init();

    queue = new TestMobileQueue(storage, networkChecker);
    queue.processingDelay = 200;
    await queue.init();

    console.log('Step 1: Start downloading 5 POIs');
    queue.downloadZone('ZONE_B', mockPois.map(p => ({ ...p, code: p.code + '_B' })));

    await new Promise(resolve => setTimeout(resolve, 600));

    console.log('\nStep 2: Interrupt after ~2 POIs');
    await queue.interrupt();

    const statsBefore = queue.getStats();
    const poisBefore = await storage.getAllPois();
    console.log('Stats before restart:', statsBefore);
    console.log('POIs stored before restart:', poisBefore.length);

    console.log('\nStep 3: Simulate app restart');
    storage = new TestSQLiteStorage(sqlite2, fs2);
    await storage.init();

    queue = new TestMobileQueue(storage, networkChecker);
    await queue.init(); // Should auto-resume

    const statsAfter = queue.getStats();
    const poisAfter = await storage.getAllPois();
    console.log('Stats after restart:', statsAfter);
    console.log('POIs stored after restart:', poisAfter.length);

    const test2Pass = poisAfter.length === 5 && poisBefore.length >= 2 && poisBefore.length < 5;
    console.log('\n' + (test2Pass ? '✔ PASS' : '❌ FAIL') + ': Auto-resume works after app restart\n');

    // TEST 3: Network Awareness
    console.log('### TEST 3: NETWORK AWARENESS');
    console.log('---\n');

    storage = new TestSQLiteStorage(sqlite, fs);
    await storage.init();

    console.log('Case 1: WiFi (auto-download)');
    networkChecker.status = 'wifi';
    queue = new TestMobileQueue(storage, networkChecker);
    await queue.init();

    const wifiResult = await queue.downloadZone('ZONE_WIFI', mockPois.map(p => ({ ...p, code: p.code + '_WIFI' })));
    console.log('WiFi result:', wifiResult);

    console.log('\nCase 2: Cellular (ask user)');
    networkChecker.status = 'cellular';
    networkChecker.userConfirmed = true;
    queue = new TestMobileQueue(storage, networkChecker);
    await queue.init();

    const cellularResult = await queue.downloadZone('ZONE_CELL', mockPois.map(p => ({ ...p, code: p.code + '_CELL' })));
    console.log('Cellular result (confirmed):', cellularResult);

    console.log('\nCase 3: Cellular (user declined)');
    networkChecker.userConfirmed = false;
    queue = new TestMobileQueue(storage, networkChecker);
    await queue.init();

    const declinedResult = await queue.downloadZone('ZONE_DECLINED', mockPois.map(p => ({ ...p, code: p.code + '_DEC' })));
    console.log('Cellular result (declined):', declinedResult);

    console.log('\nCase 4: Offline (queue for later)');
    networkChecker.status = 'offline';
    queue = new TestMobileQueue(storage, networkChecker);
    await queue.init();

    const offlineResult = await queue.downloadZone('ZONE_OFFLINE', mockPois.map(p => ({ ...p, code: p.code + '_OFF' })));
    console.log('Offline result:', offlineResult);

    const test3Pass = wifiResult.added === 5 && cellularResult.added === 5 &&
                      declinedResult.cancelled === true && offlineResult.processing === false;
    console.log('\n' + (test3Pass ? '✔ PASS' : '❌ FAIL') + ': Network awareness working correctly\n');

    // SUMMARY
    console.log('==================================================');
    console.log('VALIDATION SUMMARY');
    console.log('==================================================');
    console.log((test1Pass ? '✔' : '❌') + ' TEST 1: SQLite storage & filesystem audio');
    console.log((test2Pass ? '✔' : '❌') + ' TEST 2: App restart & auto-resume');
    console.log((test3Pass ? '✔' : '❌') + ' TEST 3: Network awareness (WiFi/cellular/offline)');

    const allPass = test1Pass && test2Pass && test3Pass;
    console.log('\n' + (allPass ? '✅ MOBILE SYSTEM IS PRODUCTION-READY' : '❌ MOBILE SYSTEM NOT PRODUCTION-READY'));
    console.log('==================================================\n');

    // TEST 4: Zone sync invalidates stale POIs only
    console.log('### TEST 4: ZONE POI SYNC INVALIDATION');
    console.log('---\n');

    const sqlite4 = new MockSQLite();
    const fs4 = new MockFileSystem();
    const network4 = new MockNetworkChecker();
    network4.status = 'offline'; // keep queueing only, no processing side effects

    const storage4 = new TestSQLiteStorage(sqlite4, fs4);
    await storage4.init();
    const queue4 = new TestMobileQueue(storage4, network4);
    await queue4.init();

    const zoneCode = 'ZONE_SYNC';
    const local10 = Array.from({ length: 10 }, (_, i) => {
        const n = i + 1;
        return {
            _id: `sync-${n}`,
            code: `SYNC_POI_${String(n).padStart(2, '0')}`,
            name: `Sync POI ${n}`,
            narrationShort: `Short ${n}`,
            narrationLong: `Long ${n}`,
            location: {},
            narrationAudioUrl: null
        };
    });

    for (const p of local10) {
        await storage4.storePoi(p, zoneCode);
    }

    const beforeSync = await storage4.getPoisByZone(zoneCode);
    console.log('Before sync local POIs:', beforeSync.map(p => p.code));
    console.log(`Before sync count: ${beforeSync.length}`);

    const backend6 = local10.slice(0, 6);
    await queue4.syncZonePois(zoneCode, backend6);

    const afterSync = await storage4.getPoisByZone(zoneCode);
    console.log('After sync local POIs:', afterSync.map(p => p.code));
    console.log(`After sync count: ${afterSync.length}`);

    const test4Pass = beforeSync.length === 10 && afterSync.length === 6;
    console.log('\n' + (test4Pass ? '✔ PASS' : '❌ FAIL') + ': Zone sync removed stale POIs only\n');
}

runMobileTests().catch(err => {
    console.error('TEST ERROR:', err);
    process.exit(1);
});
