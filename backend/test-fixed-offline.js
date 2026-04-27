/**
 * FIXED OFFLINE SYSTEM - CRITICAL RELIABILITY BUGS RESOLVED
 * 1. Controlled queue processing with proper interruption
 * 2. Failed POI recovery (never lost)
 * 3. Proper state persistence
 */

class FixedTestStorage {
    constructor() {
        this.pois = new Map();
        this.queueState = null;
        this.audio = new Map();
    }

    async init() {
        console.log('[STORAGE] Initialized');
    }

    async storePoi(poi) {
        if (this.pois.has(poi.code)) {
            console.log(`[STORAGE] POI ${poi.code} already exists, skipping`);
            return false;
        }
        this.pois.set(poi.code, {
            id: poi._id || poi.id,
            code: poi.code,
            name: poi.name,
            narrationShort: poi.narrationShort,
            narrationLong: poi.narrationLong,
            location: poi.location,
            narrationAudioUrl: poi.narrationAudioUrl || null,
            localAudioPath: null,
            downloadedAt: new Date().toISOString()
        });
        console.log(`[STORAGE] Stored POI ${poi.code}`);
        return true;
    }

    async getPoi(poiCode) {
        return this.pois.get(poiCode);
    }

    async hasPoi(poiCode) {
        return this.pois.has(poiCode);
    }

    async getAllPois() {
        return Array.from(this.pois.values());
    }

    async updatePoiAudio(poiCode, localAudioPath) {
        const poi = this.pois.get(poiCode);
        if (poi) {
            poi.localAudioPath = localAudioPath;
            return true;
        }
        return false;
    }

    async storeAudio(poiCode, audioBlob) {
        this.audio.set(poiCode, audioBlob);
        console.log(`[STORAGE] Stored audio for ${poiCode}`);
        return true;
    }

    async getAudio(poiCode) {
        return this.audio.get(poiCode);
    }

    async saveQueueState(state) {
        this.queueState = JSON.parse(JSON.stringify(state));
        console.log('[STORAGE] Saved queue state');
    }

    async getQueueState() {
        return this.queueState ? JSON.parse(JSON.stringify(this.queueState)) : null;
    }

    async clear() {
        this.pois.clear();
        this.queueState = null;
        this.audio.clear();
    }
}

// FIX: Proper POI state model
class PoiQueueItem {
    constructor(poi) {
        this.poiCode = poi.code;
        this.poiData = poi;
        this.status = 'pending'; // pending | processing | completed | failed
        this.retryCount = 0;
    }
}

class FixedQueue {
    constructor(storage) {
        this.storage = storage;
        this.queue = []; // Array of PoiQueueItem
        this.isInterrupted = false; // FIX: Interruption flag
        this.processing = false;
        this.maxRetries = 3;
        this.retryDelay = 500;
        this.processingDelay = 100; // FIX: Delay between POIs for controlled processing
        this.shouldFailPoi = null;
        this.failCount = 0;
    }

    async init() {
        const state = await this.storage.getQueueState();
        if (state) {
            // FIX: Restore full queue with status
            this.queue = (state.queue || []).map(item => {
                const queueItem = new PoiQueueItem(item.poiData);
                queueItem.status = item.status;
                queueItem.retryCount = item.retryCount;
                return queueItem;
            });

            // FIX: Re-queue failed POIs (CRITICAL - never lose failed POIs)
            const failedItems = this.queue.filter(item => item.status === 'failed');
            if (failedItems.length > 0) {
                console.log(`[QUEUE] Found ${failedItems.length} failed POIs, re-queueing for retry`);
                failedItems.forEach(item => {
                    item.status = 'pending'; // Reset to pending for retry
                    item.retryCount = 0; // Reset retry count per session
                });
            }

            console.log('[QUEUE] Restored state:', {
                total: this.queue.length,
                pending: this.queue.filter(i => i.status === 'pending').length,
                completed: this.queue.filter(i => i.status === 'completed').length,
                failed: this.queue.filter(i => i.status === 'failed').length
            });

            // Auto-resume if there are pending items
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
                status: item.status,
                retryCount: item.retryCount
            }))
        });
    }

    async downloadZone(zoneCode, pois) {
        console.log(`[QUEUE] Starting download for zone: ${zoneCode}`);
        console.log(`[QUEUE] Fetched ${pois.length} POIs`);

        let added = 0;
        for (const poi of pois) {
            const exists = await this.storage.hasPoi(poi.code);
            const inQueue = this.queue.some(item => item.poiCode === poi.code);

            if (!exists && !inQueue) {
                this.queue.push(new PoiQueueItem(poi));
                added++;
            } else {
                console.log(`[QUEUE] Skipping ${poi.code} (already downloaded or in queue)`);
            }
        }

        console.log(`[QUEUE] Added ${added} POIs to queue`);
        await this.saveState();

        if (!this.processing) {
            await this.processQueue();
        }

        return { total: pois.length, added, skipped: pois.length - added };
    }

    // FIX: Controlled queue processing with proper interruption
    async processQueue() {
        if (this.processing) return;

        this.processing = true;
        this.isInterrupted = false; // Reset interruption flag
        await this.saveState();

        const pendingItems = this.queue.filter(i => i.status === 'pending');
        console.log(`[QUEUE] Processing ${pendingItems.length} pending POIs`);

        // FIX: Process ONE POI at a time with interruption check
        for (const item of this.queue) {
            // FIX: Check interruption flag BEFORE processing each POI
            if (this.isInterrupted) {
                console.log('[QUEUE] Interrupted by user');
                break;
            }

            // Skip non-pending items
            if (item.status !== 'pending') {
                continue;
            }

            console.log(`[QUEUE] Processing ${item.poiCode} (status: ${item.status})`);
            item.status = 'processing';
            await this.saveState();

            const success = await this.downloadPoiWithRetry(item);

            if (success) {
                item.status = 'completed';
                console.log(`[QUEUE] ✔ Completed: ${item.poiCode}`);
            } else {
                // FIX: Mark as failed but KEEP in queue (never lose)
                item.status = 'failed';
                console.log(`[QUEUE] ✖ Failed after ${this.maxRetries} retries: ${item.poiCode}`);
            }

            await this.saveState();

            // FIX: REQUIRED delay to allow interruption
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

                // Simulate failure for testing
                if (this.shouldFailPoi === item.poiCode && this.failCount < 2) {
                    this.failCount++;
                    throw new Error('Simulated network error');
                }

                const stored = await this.storage.storePoi(item.poiData);

                if (stored && item.poiData.narrationAudioUrl) {
                    await this.downloadAudio(item.poiData);
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

    async downloadAudio(poi) {
        if (!poi.narrationAudioUrl) return;

        console.log(`[AUDIO] Downloading audio for ${poi.code}`);
        const audioBlob = { data: 'mock audio data', size: 1024 };
        await this.storage.storeAudio(poi.code, audioBlob);
        await this.storage.updatePoiAudio(poi.code, `local://${poi.code}.mp3`);
        console.log(`[AUDIO] Stored audio for ${poi.code}`);
    }

    // FIX: Proper interrupt - sets flag immediately
    async interrupt() {
        console.log('[QUEUE] Interrupt requested');
        this.isInterrupted = true;
        this.processing = false;
        await this.saveState();
    }

    async resume() {
        console.log('[QUEUE] Resuming download...');
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

// Mock POIs
const mockPois = [
    { _id: '1', code: 'POI_001', name: 'POI 1', narrationShort: 'Short 1', narrationLong: 'Long 1', location: {}, narrationAudioUrl: 'http://audio1.mp3' },
    { _id: '2', code: 'POI_002', name: 'POI 2', narrationShort: 'Short 2', narrationLong: 'Long 2', location: {}, narrationAudioUrl: 'http://audio2.mp3' },
    { _id: '3', code: 'POI_003', name: 'POI 3', narrationShort: 'Short 3', narrationLong: 'Long 3', location: {}, narrationAudioUrl: 'http://audio3.mp3' },
    { _id: '4', code: 'POI_004', name: 'POI 4', narrationShort: 'Short 4', narrationLong: 'Long 4', location: {}, narrationAudioUrl: 'http://audio4.mp3' },
    { _id: '5', code: 'POI_005', name: 'POI 5', narrationShort: 'Short 5', narrationLong: 'Long 5', location: {}, narrationAudioUrl: 'http://audio5.mp3' }
];

async function runFixedTests() {
    console.log('==================================================');
    console.log('FIXED SYSTEM - RELIABILITY VALIDATION');
    console.log('==================================================\n');

    // TEST 1: INTERRUPT MID-DOWNLOAD
    console.log('### TEST 1: INTERRUPT MID-DOWNLOAD');
    console.log('---\n');

    let storage = new FixedTestStorage();
    await storage.init();

    let queue = new FixedQueue(storage);
    queue.processingDelay = 200; // Slower for testing
    await queue.init();

    console.log('Step 1: Start downloading 5 POIs');
    queue.downloadZone('ZONE_A', mockPois);

    // Wait for 2 POIs to complete (2 * 200ms + processing time)
    await new Promise(resolve => setTimeout(resolve, 600));

    console.log('\nStep 2: Interrupt after ~2 POIs');
    await queue.interrupt();

    const poisBefore = await storage.getAllPois();
    const statsBefore = queue.getStats();
    console.log('POIs stored before restart:', poisBefore.length);
    console.log('Queue stats before restart:', statsBefore);

    console.log('\nStep 3: Simulate app restart');
    const savedState = await storage.getQueueState();
    const savedPois = await storage.getAllPois();

    storage = new FixedTestStorage();
    for (const poi of savedPois) {
        storage.pois.set(poi.code, poi);
    }
    storage.queueState = savedState;

    queue = new FixedQueue(storage);
    await queue.init(); // Should auto-resume

    const poisAfter = await storage.getAllPois();
    const statsAfter = queue.getStats();
    console.log('\nPOIs after resume:', poisAfter.length);
    console.log('Queue stats after resume:', statsAfter);

    const test1Pass = poisAfter.length === 5 && poisBefore.length >= 2 && poisBefore.length < 5;
    console.log('\n' + (test1Pass ? '✔ PASS' : '❌ FAIL') + ': Interrupt worked, resume completed remaining POIs\n');

    // TEST 2: FAILED POI RECOVERY
    console.log('### TEST 2: FAILED POI RECOVERY (CRITICAL)');
    console.log('---\n');

    const tenPois = [
        ...mockPois,
        { _id: '6', code: 'POI_006', name: 'POI 6', narrationShort: 'Short 6', narrationLong: 'Long 6', location: {} },
        { _id: '7', code: 'POI_007', name: 'POI 7', narrationShort: 'Short 7', narrationLong: 'Long 7', location: {} },
        { _id: '8', code: 'POI_008', name: 'POI 8', narrationShort: 'Short 8', narrationLong: 'Long 8', location: {} },
        { _id: '9', code: 'POI_009', name: 'POI 9', narrationShort: 'Short 9', narrationLong: 'Long 9', location: {} },
        { _id: '10', code: 'POI_010', name: 'POI 10', narrationShort: 'Short 10', narrationLong: 'Long 10', location: {} }
    ];

    storage = new FixedTestStorage();
    await storage.init();

    queue = new FixedQueue(storage);
    queue.shouldFailPoi = 'POI_005';
    queue.failCount = 0;
    queue.maxRetries = 2; // Fail after 2 attempts
    queue.processingDelay = 50; // Faster
    await queue.init();

    console.log('Step 1: Download 10 POIs (POI_005 will fail)');
    await queue.downloadZone('ZONE_B', tenPois);

    const statsBefore2 = queue.getStats();
    const poisBefore2 = await storage.getAllPois();
    console.log('\nStats after first session:', statsBefore2);
    console.log('POIs stored:', poisBefore2.length);
    console.log('Failed POIs:', statsBefore2.failed);

    console.log('\nStep 2: Restart system');
    const savedState2 = await storage.getQueueState();
    const savedPois2 = await storage.getAllPois();

    storage = new FixedTestStorage();
    for (const poi of savedPois2) {
        storage.pois.set(poi.code, poi);
    }
    storage.queueState = savedState2;

    queue = new FixedQueue(storage);
    queue.maxRetries = 3; // Normal retries
    queue.processingDelay = 50;
    await queue.init(); // Should re-queue failed POIs

    const statsAfter2 = queue.getStats();
    const poisAfter2 = await storage.getAllPois();
    console.log('\nStats after restart:', statsAfter2);
    console.log('POIs stored:', poisAfter2.length);

    const test2Pass = poisAfter2.length === 10 && statsAfter2.completed === 10;
    console.log('\n' + (test2Pass ? '✔ PASS' : '❌ FAIL') + ': Failed POI recovered and completed (10/10 POIs)\n');

    // TEST 3: NO POI LOST
    console.log('### TEST 3: NO POI LOST GUARANTEE');
    console.log('---\n');

    storage = new FixedTestStorage();
    await storage.init();

    queue = new FixedQueue(storage);
    queue.processingDelay = 50;
    await queue.init();

    console.log('Step 1: Download 5 POIs');
    await queue.downloadZone('ZONE_C', mockPois);

    const finalPois = await storage.getAllPois();
    const finalStats = queue.getStats();

    console.log('Final POIs stored:', finalPois.length);
    console.log('Final stats:', finalStats);

    const test3Pass = finalPois.length === 5 && finalStats.completed === 5 && finalStats.failed === 0;
    console.log('\n' + (test3Pass ? '✔ PASS' : '❌ FAIL') + ': All POIs completed, none lost\n');

    // SUMMARY
    console.log('==================================================');
    console.log('VALIDATION SUMMARY');
    console.log('==================================================');
    console.log((test1Pass ? '✔' : '❌') + ' TEST 1: Interrupt works mid-download');
    console.log((test2Pass ? '✔' : '❌') + ' TEST 2: Failed POIs are NEVER lost');
    console.log((test3Pass ? '✔' : '❌') + ' TEST 3: Final count matches expected');

    const allPass = test1Pass && test2Pass && test3Pass;
    console.log('\n' + (allPass ? '✅ SYSTEM IS PRODUCTION-READY' : '❌ SYSTEM NOT PRODUCTION-READY'));
    console.log('==================================================\n');
}

runFixedTests().catch(err => {
    console.error('TEST ERROR:', err);
    process.exit(1);
});
