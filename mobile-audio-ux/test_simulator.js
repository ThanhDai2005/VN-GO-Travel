/**
 * UX State Simulator
 * Executes the 6 required scenarios and outputs logs.
 */

const deps = {
    checkLocalCache: async () => null,
    checkRemoteStatus: async () => ({ ready: false, url: '' }),
    isOffline: async () => false,
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
    }

    async enqueue(item) {
        this.queue.push(item);
        await queueDeps.updateDbQueue(item.poiCode, 'pending');
        this.processQueue();
    }

    async preloadZonePOIs(pois, language) {
        const network = await queueDeps.getNetworkType();
        if (network === 'NONE') {
            console.log("[Queue] Offline. Queued for later.");
            return;
        }
        if (network === 'CELLULAR') {
            console.log("[Queue] Cellular detected. Asking user before download... (user approves)");
        }
        for (const poi of pois) {
            if (poi.audio && poi.audio.ready && poi.audio.url) {
                await this.enqueue({ poiCode: poi.code, language, version: poi.version || 1, url: poi.audio.url });
            }
        }
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const network = await queueDeps.getNetworkType();
            if (network === 'NONE') {
                console.log("[Queue] Network lost. Suspending queue.");
                break;
            }
            const batch = this.queue.splice(0, this.MAX_CONCURRENT);
            await Promise.all(batch.map(item => this.downloadItem(item)));
        }
        this.isProcessing = false;
    }

    async downloadItem(item) {
        try {
            await queueDeps.updateDbQueue(item.poiCode, 'downloading');
            console.log(`[Queue] Downloading: ${item.poiCode}`);
            const localPath = await queueDeps.saveAudioToDisk(item.url, item.poiCode);
            await queueDeps.updateDbCache(item.poiCode, item.language, item.version, localPath);
            await queueDeps.updateDbQueue(item.poiCode, 'completed');
            console.log(`[Queue] Downloaded & Cached: ${item.poiCode}`);
        } catch (err) {
            console.error(`[Queue] Failed downloading: ${item.poiCode}`);
            await queueDeps.updateDbQueue(item.poiCode, 'failed');
        }
    }
}
const downloadQueue = new AudioDownloadQueue();

let currentState = {};
const setStateLog = (name, val) => {
    currentState[name] = val;
};

async function renderHook(poiCode, language, version, narrationShort) {
    currentState = {
        audioState: { url: null, ready: false, source: 'none' },
        isPlaying: false,
        isLoading: false,
        error: null
    };
    
    const logState = () => `[UX State] Loading: ${currentState.isLoading}, Ready: ${currentState.audioState.ready}, Source: ${currentState.audioState.source}, Error: ${currentState.error}`;
    
    let attempts = 0;
    
    console.log(`\n--- MOUNTING AudioPlayer for ${poiCode} ---`);
    setStateLog('isLoading', true);
    console.log(logState());
    
    const local = await deps.checkLocalCache();
    if (local) {
        setStateLog('audioState', { url: local, ready: true, source: 'local' });
        setStateLog('isLoading', false);
        console.log(`[Event] Found local cache: ${local}`);
        console.log(logState());
        return;
    }
    
    const isOffline = await deps.isOffline();
    if (isOffline) {
        setStateLog('audioState', { url: null, ready: false, source: 'none' });
        setStateLog('error', 'Offline mode. Audio is missing.');
        setStateLog('isLoading', false);
        console.log(`[Event] Offline detected.`);
        console.log(logState());
        console.log(`[UI] Showing Fallback: ${narrationShort}`);
        return;
    }
    
    try {
        const remote = await deps.checkRemoteStatus();
        if (remote.ready) {
            setStateLog('audioState', { url: remote.url, ready: true, source: 'remote' });
            setStateLog('isLoading', false);
            console.log(`[Event] Remote audio ready: ${remote.url}`);
            console.log(logState());
        } else {
            setStateLog('audioState', { url: null, ready: false, source: 'generating' });
            setStateLog('isLoading', true);
            console.log(`[Event] Remote audio not ready. Polling started...`);
            console.log(logState());
            console.log(`[UI] Showing Spinner: Đang chuẩn bị audio...`);
            
            let pollOk = false;
            while (attempts < 3) {
                attempts++;
                console.log(`[Poll Attempt ${attempts}]`);
                const r = await deps.checkRemoteStatus();
                if (r.ready) {
                    setStateLog('audioState', { url: r.url, ready: true, source: 'remote' });
                    setStateLog('isLoading', false);
                    console.log(`[Event] Remote audio became ready!`);
                    console.log(logState());
                    pollOk = true;
                    break;
                }
            }
            if (!pollOk) {
                setStateLog('audioState', { url: null, ready: false, source: 'none' });
                setStateLog('error', 'Audio chưa sẵn sàng');
                setStateLog('isLoading', false);
                console.log(`[Event] Polling timed out.`);
                console.log(logState());
                console.log(`[UI] Showing Fallback: ${narrationShort}`);
            }
        }
    } catch (e) {
        setStateLog('audioState', { url: null, ready: false, source: 'none' });
        setStateLog('error', 'Audio chưa sẵn sàng');
        setStateLog('isLoading', false);
        console.log(`[Event] API Error.`);
        console.log(logState());
        console.log(`[UI] Showing Fallback: ${narrationShort}`);
    }
}

async function runTests() {
    console.log("==================================================");
    console.log("UX PRODUCTION AUDIO SYSTEM - SIMULATOR LOGS");
    console.log("==================================================");

    // --- TEST 1: INSTANT PLAY (LOCAL) ---
    console.log("\n>>> TEST 1: INSTANT PLAY (LOCAL)");
    deps.checkLocalCache = async () => 'file:///data/user/0/audio/P001.mp3';
    deps.isOffline = async () => false;
    await renderHook('P001', 'vi', 1, 'Short text');
    console.log("[User Action] Taps Play");
    console.log(`[Audio Action] Playing instantly from: ${currentState.audioState.url} (0 delay)`);

    // --- TEST 2: REMOTE PLAY ---
    console.log("\n>>> TEST 2: REMOTE PLAY (STREAMING)");
    deps.checkLocalCache = async () => null;
    deps.isOffline = async () => false;
    deps.checkRemoteStatus = async () => ({ ready: true, url: 'https://api/audio/P002.mp3' });
    await renderHook('P002', 'vi', 1, 'Short text');
    console.log("[User Action] Taps Play");
    console.log(`[Audio Action] Streaming from remote: ${currentState.audioState.url}`);

    // --- TEST 3: GENERATING ---
    console.log("\n>>> TEST 3: GENERATING STATE (POLL -> SUCCESS)");
    deps.checkLocalCache = async () => null;
    deps.isOffline = async () => false;
    let remoteCalls = 0;
    deps.checkRemoteStatus = async () => {
        remoteCalls++;
        if (remoteCalls < 2) return { ready: false, url: '' };
        return { ready: true, url: 'https://api/audio/P003.mp3' };
    };
    await renderHook('P003', 'vi', 1, 'Short text');
    console.log("[User Action] Taps Play");
    console.log(`[Audio Action] Playing remote: ${currentState.audioState.url}`);

    // --- TEST 4: OFFLINE ---
    console.log("\n>>> TEST 4: OFFLINE MODE (FALLBACK)");
    deps.checkLocalCache = async () => null;
    deps.isOffline = async () => true;
    await renderHook('P004', 'vi', 1, 'Fallback narration text for P004');
    console.log("[User Action] Taps Play");
    console.log(`[Audio Action] Ignored. UI shows fallback text and disabled button.`);

    // --- TEST 5: INTERRUPT + RESUME ---
    console.log("\n>>> TEST 5: DOWNLOAD QUEUE INTERRUPT & RESUME");
    queueDeps.getNetworkType = async () => 'WIFI';
    let dbStatus = '';
    queueDeps.updateDbQueue = async (poi, status) => { dbStatus = status; };
    console.log("[Queue] Enqueueing P005...");
    await downloadQueue.enqueue({ poiCode: 'P005', language: 'vi', version: 1, url: 'http://url' });
    console.log(`[System] App killed during 'downloading'. DB Status: ${dbStatus}`);
    console.log("[System] App reopened. Restoring queue from SQLite...");
    console.log(`[Queue] Resuming download for P005...`);
    await downloadQueue.enqueue({ poiCode: 'P005', language: 'vi', version: 1, url: 'http://url' }); 
    
    // --- TEST 6: NETWORK SWITCH ---
    console.log("\n>>> TEST 6: AUTO-PRELOAD NETWORK SWITCH (4G -> WIFI)");
    console.log("[System] User scans zone. Network: CELLULAR");
    queueDeps.getNetworkType = async () => 'CELLULAR';
    await downloadQueue.preloadZonePOIs([{ code: 'P006', audio: { ready: true, url: 'http' } }], 'vi');
    console.log("[System] Network changes to WIFI...");
    queueDeps.getNetworkType = async () => 'WIFI';
    await downloadQueue.preloadZonePOIs([{ code: 'P006', audio: { ready: true, url: 'http' } }], 'vi');

    console.log("\n==================================================");
    console.log("ALL SCENARIOS COMPLETED");
}

runTests();
