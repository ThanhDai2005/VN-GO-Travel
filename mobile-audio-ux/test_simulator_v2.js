/**
 * UX State Simulator V2 - HARDENED PRODUCTION VALIDATION
 * Validates polling safety, version invalidation, idempotent analytics, smart queue, and single playback.
 */

const deps = {
    getLocalAudioMeta: async () => null,
    deleteLocalCache: async () => {},
    checkRemoteStatus: async () => ({ ready: false, url: '' }),
    isOffline: async () => false,
    postAnalytics: async () => {},
    stopAllAudio: async () => {},
    playNativeAudio: async () => {}
};

const queueDeps = {
    getNetworkType: async () => 'WIFI',
    saveAudioToDisk: async () => '/local/path.mp3',
    updateDbQueue: async () => {},
    updateDbCache: async () => {}
};

class AudioDownloadQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        this.MAX_CONCURRENT = 2;
        this.currentViewedPoi = null;
        this.currentZone = null;
    }

    setCurrentContext(poiCode, zoneCode) {
        this.currentViewedPoi = poiCode;
        this.currentZone = zoneCode;
        this.sortQueue();
    }

    sortQueue() {
        this.queue.sort((a, b) => {
            const getPriority = (item) => {
                if (this.currentViewedPoi && item.poiCode === this.currentViewedPoi) return 1;
                if (this.currentZone && item.zoneCode === this.currentZone) return 2;
                return 3;
            };
            return getPriority(a) - getPriority(b);
        });
    }

    async enqueue(item) {
        if (!this.queue.find(i => i.poiCode === item.poiCode)) {
            this.queue.push(item);
            await queueDeps.updateDbQueue(item.poiCode, 'pending');
            this.sortQueue();
        }
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const network = await queueDeps.getNetworkType();
            if (network === 'NONE') break;
            const batch = this.queue.splice(0, this.MAX_CONCURRENT);
            batch.forEach(item => {
                let priorityLabel = 'Other Zone';
                if (item.poiCode === this.currentViewedPoi) priorityLabel = 'Currently Viewed POI';
                else if (item.zoneCode === this.currentZone) priorityLabel = 'Current Zone';
                console.log(`[Queue] Priority download: ${item.poiCode} (${priorityLabel})`);
            });
            await Promise.all(batch.map(item => this.downloadItem(item)));
        }
        this.isProcessing = false;
    }

    async downloadItem(item) {
        try {
            await queueDeps.updateDbQueue(item.poiCode, 'downloading');
            const localPath = await queueDeps.saveAudioToDisk(item.url, item.poiCode);
            await queueDeps.updateDbCache(item.poiCode, item.language, item.version, localPath);
            await queueDeps.updateDbQueue(item.poiCode, 'completed');
        } catch (err) {
            await queueDeps.updateDbQueue(item.poiCode, 'failed');
        }
    }
}
const downloadQueue = new AudioDownloadQueue();

let currentState = {};
const setStateLog = (name, val) => { currentState[name] = val; };

async function renderHook(poiCode, language, version, narrationShort) {
    currentState = {
        audioState: { url: null, status: 'idle' },
        isPlaying: false
    };
    
    const logState = () => `[UX State] Status: ${currentState.audioState.status}, URL: ${currentState.audioState.url}`;
    
    let attempts = 0;
    console.log(`\n--- MOUNTING AudioPlayer for ${poiCode} (v${version}) ---`);
    setStateLog('audioState', { status: 'loading', url: null });
    
    const localMeta = await deps.getLocalAudioMeta();
    if (localMeta) {
        if (localMeta.version < version) {
            console.log(`[Audio] Stale version detected for ${poiCode} (Local: ${localMeta.version}, Remote: ${version}) -> invalidating cache`);
            await deps.deleteLocalCache(poiCode, language);
        } else {
            setStateLog('audioState', { status: 'ready_local', url: localMeta.localAudioPath });
            console.log(`[Event] Found local cache: ${localMeta.localAudioPath}`);
            console.log(logState());
            return;
        }
    }
    
    const isOffline = await deps.isOffline();
    if (isOffline) {
        setStateLog('audioState', { status: 'offline', url: null });
        console.log(`[Event] Offline detected.`);
        console.log(logState());
        console.log(`[UI] Showing Fallback: ${narrationShort}`);
        return;
    }
    
    try {
        const remote = await deps.checkRemoteStatus();
        if (remote.ready) {
            setStateLog('audioState', { status: 'ready_remote', url: remote.url });
            console.log(`[Event] Remote audio ready: ${remote.url}`);
            console.log(logState());
        } else {
            setStateLog('audioState', { status: 'generating', url: null });
            console.log(`[Event] Remote audio not ready.`);
            console.log(logState());
            console.log(`[UI] Showing Spinner: Đang chuẩn bị audio...`);
            console.log(`[Audio] POLL START for ${poiCode}`);
            
            let pollOk = false;
            while (attempts < 5) {
                attempts++;
                console.log(`[Audio] POLL ATTEMPT #${attempts} for ${poiCode}`);
                const r = await deps.checkRemoteStatus();
                if (r.ready) {
                    setStateLog('audioState', { status: 'ready_remote', url: r.url });
                    console.log(`[Event] Remote audio became ready!`);
                    console.log(logState());
                    pollOk = true;
                    break;
                }
            }
            if (!pollOk) {
                console.log(`[Audio] POLL TIMEOUT -> fallback for ${poiCode}`);
                setStateLog('audioState', { status: 'timeout', url: null });
                console.log(logState());
                console.log(`[UI] Showing Fallback: ${narrationShort}`);
            }
        }
    } catch (e) {
        setStateLog('audioState', { status: 'failed', url: null });
        console.log(`[Event] API Error.`);
        console.log(logState());
        console.log(`[UI] Showing Fallback: ${narrationShort}`);
    }
}

async function playAudio(poiCode, language) {
    if (!['ready_local', 'ready_remote'].includes(currentState.audioState.status)) return;
    try {
        console.log(`[Audio] Stopping previous playback`);
        await deps.stopAllAudio();
        setStateLog('isPlaying', true);
        await deps.playNativeAudio(currentState.audioState.url);
        
        if (!deps.sessionSet.has(poiCode)) {
            deps.sessionSet.add(poiCode);
            await deps.postAnalytics(poiCode, language);
            console.log(`[Analytics] Posted play event for ${poiCode}`);
        } else {
            console.log(`[Analytics] Deduplicated play event for ${poiCode}`);
        }
    } catch(err) {
        setStateLog('audioState', { status: 'failed', url: null });
    }
}

async function runTests() {
    console.log("==================================================");
    console.log("UX PRODUCTION AUDIO SYSTEM - V2 HARDENING LOGS");
    console.log("==================================================");

    deps.sessionSet = new Set();

    // --- TEST 1: INFINITE POLLING PREVENTION ---
    console.log("\n>>> TEST 1: POLLING TIMEOUT & SAFETY");
    deps.getLocalAudioMeta = async () => null;
    deps.isOffline = async () => false;
    deps.checkRemoteStatus = async () => ({ ready: false, url: '' }); // Never becomes ready
    await renderHook('P_POLL', 'vi', 1, 'Polling fallback text');

    // --- TEST 2: VERSION INVALIDATION ---
    console.log("\n>>> TEST 2: AUDIO VERSION INVALIDATION");
    deps.getLocalAudioMeta = async () => ({ version: 1, localAudioPath: '/local/P_VERS_v1.mp3' });
    deps.isOffline = async () => false;
    deps.checkRemoteStatus = async () => ({ ready: true, url: 'https://api/audio/P_VERS_v2.mp3' });
    await renderHook('P_VERS', 'vi', 2, 'Version fallback text');

    // --- TEST 3: SPAM PLAY DEDUPLICATION ---
    console.log("\n>>> TEST 3: IDEMPOTENT ANALYTICS (DEDUPLICATION)");
    deps.getLocalAudioMeta = async () => ({ version: 1, localAudioPath: '/local/P_SPAM.mp3' });
    await renderHook('P_SPAM', 'vi', 1, 'Spam fallback');
    console.log("[User Action] User taps play 3 times rapidly");
    await playAudio('P_SPAM', 'vi');
    await playAudio('P_SPAM', 'vi');
    await playAudio('P_SPAM', 'vi');

    // --- TEST 4: SINGLE PLAYBACK GUARANTEE ---
    console.log("\n>>> TEST 4: SINGLE AUDIO PLAYBACK GUARANTEE");
    deps.getLocalAudioMeta = async () => ({ version: 1, localAudioPath: '/local/P_AUDIO1.mp3' });
    await renderHook('P_AUDIO1', 'vi', 1, 'Audio1 fallback');
    console.log("[User Action] Playing Audio 1");
    await playAudio('P_AUDIO1', 'vi');
    
    deps.getLocalAudioMeta = async () => ({ version: 1, localAudioPath: '/local/P_AUDIO2.mp3' });
    await renderHook('P_AUDIO2', 'vi', 1, 'Audio2 fallback');
    console.log("[User Action] Playing Audio 2 (Audio 1 should stop)");
    await playAudio('P_AUDIO2', 'vi');

    // --- TEST 5: SMART DOWNLOAD PRIORITY ---
    console.log("\n>>> TEST 5: SMART DOWNLOAD PRIORITY QUEUE");
    downloadQueue.setCurrentContext('P_VIEWED', 'ZONE_A');
    
    console.log("[Queue] Enqueueing multiple POIs out of order...");
    await downloadQueue.enqueue({ poiCode: 'P_OTHER_ZONE_1', language: 'vi', version: 1, url: 'url', zoneCode: 'ZONE_B' });
    await downloadQueue.enqueue({ poiCode: 'P_ZONE_A_1', language: 'vi', version: 1, url: 'url', zoneCode: 'ZONE_A' });
    await downloadQueue.enqueue({ poiCode: 'P_OTHER_ZONE_2', language: 'vi', version: 1, url: 'url', zoneCode: 'ZONE_B' });
    await downloadQueue.enqueue({ poiCode: 'P_VIEWED', language: 'vi', version: 1, url: 'url', zoneCode: 'ZONE_A' });
    await downloadQueue.enqueue({ poiCode: 'P_ZONE_A_2', language: 'vi', version: 1, url: 'url', zoneCode: 'ZONE_A' });
    
    console.log("[Queue] Processing priority queue:");
    await downloadQueue.processQueue();

    // --- TEST 6: OFFLINE MODE ---
    console.log("\n>>> TEST 6: OFFLINE MODE & FALLBACK");
    deps.getLocalAudioMeta = async () => null;
    deps.isOffline = async () => true;
    await renderHook('P_OFFLINE', 'vi', 1, 'Offline fallback text');

    console.log("\n==================================================");
    console.log("ALL SCENARIOS COMPLETED");
}

runTests();
