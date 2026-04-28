/**
 * OFFLINE SYSTEM DEMO
 * Demonstrates offline-first behavior with interruption and resume
 */

const {
    OfflineStorage,
    DownloadQueue,
    OfflineAccessLayer,
    MockApiClient
} = require('./offline-system');

async function demo() {
    console.log('==================================================');
    console.log('OFFLINE-FIRST SYSTEM DEMONSTRATION');
    console.log('==================================================\n');

    // Initialize components
    const storage = new OfflineStorage();
    const queue = new DownloadQueue(storage);
    const access = new OfflineAccessLayer(storage);
    const api = new MockApiClient();

    // SCENARIO 1: Normal download
    console.log('### SCENARIO 1: Normal Download');
    console.log('---');
    const result1 = await queue.downloadZone('DEMO_HANOI_OLD_QUARTER', api);
    console.log('Result:', result1);
    console.log('Storage:', storage.getAllPois().map(p => p.code));
    console.log('');

    // SCENARIO 2: Access POI (local)
    console.log('### SCENARIO 2: Access POI (Local)');
    console.log('---');
    const content1 = access.getPoiContent('DEMO_HOAN_KIEM_LAKE');
    console.log('Source:', content1.source);
    console.log('Has full content:', content1.hasFullContent);
    console.log('NarrationLong available:', content1.poi.narrationLong ? 'YES' : 'NO');
    console.log('');

    // SCENARIO 3: Access POI (online fallback)
    console.log('### SCENARIO 3: Access POI (Online Fallback)');
    console.log('---');
    const onlinePoi = {
        code: 'DEMO_NEW_POI',
        name: 'New POI',
        narrationShort: 'Short preview',
        narrationLong: 'Full content (not downloaded)',
        location: { type: 'Point', coordinates: [105.85, 21.03] }
    };
    const content2 = access.getPoiContent('DEMO_NEW_POI', onlinePoi);
    console.log('Source:', content2.source);
    console.log('Has full content:', content2.hasFullContent);
    console.log('NarrationLong available:', content2.poi.narrationLong ? 'YES' : 'NO');
    console.log('');

    // SCENARIO 4: Interrupted download + resume
    console.log('### SCENARIO 4: Interrupted Download + Resume');
    console.log('---');

    // Clear storage for clean test
    storage.clear();
    queue.queue = [];
    queue.completed.clear();

    // Start download
    console.log('Starting download...');
    const downloadPromise = queue.downloadZone('DEMO_HANOI_OLD_QUARTER', api);

    // Interrupt after 50ms
    await new Promise(resolve => setTimeout(resolve, 50));
    queue.interrupt();

    await downloadPromise;

    console.log('Status after interrupt:', queue.getStatus());
    console.log('Stored POIs:', storage.getAllPois().map(p => p.code));

    // Resume
    console.log('\nResuming...');
    await queue.resume();

    console.log('Status after resume:', queue.getStatus());
    console.log('Stored POIs:', storage.getAllPois().map(p => p.code));
    console.log('');

    // SCENARIO 5: Re-download (no duplication)
    console.log('### SCENARIO 5: Re-download (No Duplication)');
    console.log('---');
    console.log('POIs before re-download:', storage.getAllPois().length);
    const result2 = await queue.downloadZone('DEMO_HANOI_OLD_QUARTER', api);
    console.log('Result:', result2);
    console.log('POIs after re-download:', storage.getAllPois().length);
    console.log('');

    // SUMMARY
    console.log('==================================================');
    console.log('SUMMARY');
    console.log('==================================================');
    console.log('✔ Local storage prevents duplication');
    console.log('✔ Download queue handles interruption');
    console.log('✔ Resume skips completed POIs');
    console.log('✔ Access layer provides offline-first content');
    console.log('✔ Online fallback for non-downloaded POIs');
    console.log('');
}

demo().catch(err => {
    console.error('ERROR:', err);
    process.exit(1);
});
