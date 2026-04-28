/**
 * MOBILE DOWNLOAD QUEUE
 * Network-aware download queue with resume support
 */

class MobileDownloadQueue {
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

            // Re-queue failed POIs
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

        // Check network status
        const networkStatus = await this.networkChecker.getStatus();
        console.log(`[NETWORK] Status: ${networkStatus}`);

        if (networkStatus === 'offline') {
            console.log('[QUEUE] Offline - queueing for later');
            // Queue but don't process
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

        console.log(`[QUEUE] Fetched ${pois.length} POIs`);

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

module.exports = MobileDownloadQueue;
