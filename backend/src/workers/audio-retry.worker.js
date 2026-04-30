const Audio = require('../models/audio.model');
const audioService = require('../services/audio.service');

class AudioRetryWorker {
    constructor() {
        this.interval = 60000; // Check every minute
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log('[AudioWorker] Starting background retry worker...');
        this.run();
    }

    async run() {
        try {
            const now = new Date();
            const pendingJobs = await Audio.find({
                status: 'failed',
                nextRetryAt: { $lte: now },
                retryCount: { $lt: 3 }
            });

            if (pendingJobs.length > 0) {
                console.log(`[AudioWorker] Found ${pendingJobs.length} jobs to retry.`);
                for (const job of pendingJobs) {
                    console.log(`[AudioWorker] Retrying: ${job.hash} (Attempt ${job.retryCount + 1})`);
                    // Call service directly (it will handle status update and next retry if fails)
                    audioService.generateAudioAsync({
                        text: job.text,
                        language: job.language,
                        voice: job.voice,
                        version: job.version,
                        poiCode: job.poiCode,
                        zoneCode: job.zoneCode
                    });
                }
            }
        } catch (err) {
            console.error('[AudioWorker] Error in worker loop:', err.message);
        } finally {
            setTimeout(() => this.run(), this.interval);
        }
    }
}

module.exports = new AudioRetryWorker();
