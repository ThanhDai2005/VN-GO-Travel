const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const googleTTS = require('google-tts-api');
const Audio = require('../models/audio.model');
const AudioSession = require('../models/audio_session.model');
const AudioPlayEvent = require('../models/audio_play_event.model');
const { AppError } = require('../middlewares/error.middleware');

class AudioService {
    constructor() {
        this.storageDir = path.join(process.cwd(), 'storage', 'audio');
        this.MAX_FILES = 5000;
        this.STALE_TIMEOUT_MS = 120000;
        this.MAX_RETRIES = 3;
        this.MAX_CONCURRENT = 3;
        this.activeGenerations = 0;
        this.generationQueue = [];
        this.ensureDirectoryExists();
    }

    async acquireGenerationSlot() {
        if (this.activeGenerations < this.MAX_CONCURRENT) {
            this.activeGenerations++;
            return;
        }
        return new Promise(resolve => {
            this.generationQueue.push(resolve);
        });
    }

    releaseGenerationSlot() {
        this.activeGenerations--;
        if (this.generationQueue.length > 0) {
            const next = this.generationQueue.shift();
            this.activeGenerations++;
            next();
        }
    }

    ensureDirectoryExists() {
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
    }

    normalizeText(text) {
        if (!text) return "";
        return text.trim().toLowerCase();
    }

    getHash(text, language, voice, version = 1) {
        const normalized = this.normalizeText(text);
        return crypto.createHash('sha1')
            .update(normalized + language + voice + version)
            .digest('hex');
    }

    async getAudioStatus(text, language, voice, version, poiCode) {
        const hash = this.getHash(text, language, voice, version);
        const fileName = `${hash}.mp3`;
        const filePath = path.join(this.storageDir, fileName);

        // FIX: Check file existence FIRST to prevent 404 race condition
        const fileExists = fs.existsSync(filePath);
        let audio = await Audio.findOne({ hash });

        if (audio && audio.status === 'ready') {
            if (fileExists) {
                return { url: audio.audioUrl, ready: true, hash };
            } else {
                // FIX: File missing but DB says ready - mark as failed and regenerate
                console.warn(`[Audio] File missing for ready audio: ${hash}. Marking as failed.`);
                audio.status = 'failed';
                audio.retryCount = 0;
                audio.nextRetryAt = null;
                await audio.save();
                return { url: `/storage/audio/${hash}.mp3`, ready: false, hash, status: 'failed' };
            }
        }

        return { url: `/storage/audio/${hash}.mp3`, ready: false, hash, status: audio ? audio.status : 'not_started' };
    }

    /**
     * ATOMIC PERSISTENT LOCK
     */
    async generateAudio({ text, language = 'vi', voice = 'female', version = 1, poiCode = null, zoneCode = null }) {
        const normalizedText = this.normalizeText(text);
        const hash = this.getHash(normalizedText, language, voice, version);
        const fileName = `${hash}.mp3`;
        const filePath = path.join(this.storageDir, fileName);
        const audioUrl = `/storage/audio/${fileName}`;
        const requestId = crypto.randomBytes(8).toString('hex');

        // 1. Atomic Upsert for Lock
        let audio = await Audio.findOneAndUpdate(
            { hash },
            {
                $setOnInsert: {
                    text: text.substring(0, 1000),
                    normalizedText: normalizedText.substring(0, 1000),
                    language,
                    voice,
                    status: 'generating',
                    version,
                    poiCode,
                    zoneCode,
                    audioUrl,
                    retryCount: 0,
                    error: requestId // Ownership
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true, returnDocument: 'after' }
        );

        const now = new Date();
        const isStale = audio.status === 'generating' && (now - audio.updatedAt) > this.STALE_TIMEOUT_MS;

        // 2. Already ready?
        if (audio.status === 'ready' && fs.existsSync(filePath)) {
            return { audioUrl, ready: true, cached: true, hash };
        }

        // 3. Wait if someone else is generating
        const isLockOwner = audio.status === 'generating' && audio.error === requestId;
        if (audio.status === 'generating' && !isLockOwner && !isStale) {
            console.log(`[Audio] Instance waiting for lock: ${hash}`);
            return this.waitForReady(hash, audioUrl);
        }

        // 4. Take ownership if stale or failed
        if (isStale || audio.status === 'failed') {
            console.warn(`[Audio] Taking lock for ${isStale ? 'stale' : 'failed'} job: ${hash}`);
            audio = await Audio.findOneAndUpdate(
                { hash, status: { $in: ['generating', 'failed'] } },
                { $set: { error: requestId, updatedAt: now, status: 'generating' } },
                { new: true }
            );
            if (!audio) {
                // Someone else took it
                return this.waitForReady(hash, audioUrl);
            }
        }

        // 5. Perform Generation
        let slotAcquired = false;
        try {
            await this.acquireGenerationSlot();
            slotAcquired = true;
            console.log(`[Audio] Generating: ${fileName} (Attempt: ${audio.retryCount + 1}) [Active: ${this.activeGenerations}]`);
            
            const results = googleTTS.getAllAudioUrls(text, {
                lang: language,
                slow: false,
                host: 'https://translate.google.com',
            });

            const buffers = [];
            for (const item of results) {
                const response = await axios({
                    method: 'get',
                    url: item.url,
                    responseType: 'arraybuffer',
                    timeout: 20000
                });
                buffers.push(Buffer.from(response.data));
            }

            const finalBuffer = Buffer.concat(buffers);
            fs.writeFileSync(filePath, finalBuffer);

            audio.status = 'ready';
            audio.filePath = filePath;
            audio.error = null;
            audio.retryCount = 0;
            audio.nextRetryAt = null;
            await audio.save();
            
            console.log(`[Audio] Success: ${hash}`);
            this.releaseGenerationSlot();
            slotAcquired = false;
            
            this.cleanupOldFiles(poiCode, hash);
            
            return { audioUrl, ready: true, cached: false, hash };
        } catch (error) {
            if (slotAcquired) {
                this.releaseGenerationSlot();
                slotAcquired = false;
            }
            console.error(`[Audio] Failed for ${hash}:`, error.message);
            
            // PERSISTENT RETRY LOGIC
            audio.retryCount += 1;
            audio.lastError = error.message;
            
            if (audio.retryCount < this.MAX_RETRIES) {
                audio.status = 'failed';
                // Exponential backoff: 5s, 30s, 2m
                const backoffSec = [5, 30, 120][audio.retryCount - 1] || 300;
                audio.nextRetryAt = new Date(Date.now() + backoffSec * 1000);
                await audio.save();
                console.log(`[Audio] Scheduled retry in ${backoffSec}s for ${hash}`);
                throw new AppError(`Retry scheduled (${audio.retryCount})`, 503);
            } else {
                audio.status = 'failed';
                audio.nextRetryAt = null;
                await audio.save();
                throw new AppError("Max retries exceeded", 500);
            }
        }
    }

    async waitForReady(hash, audioUrl) {
        let attempts = 0;
        while (attempts < 60) {
            await new Promise(r => setTimeout(r, 1000));
            const check = await Audio.findOne({ hash }).lean();
            if (check && check.status === 'ready') return { audioUrl, ready: true, cached: true, hash };
            if (check && check.status === 'failed' && !check.nextRetryAt) {
                throw new AppError("Generation failed", 500);
            }
            attempts++;
        }
        throw new AppError("Timeout waiting for audio", 504);
    }

    async trackPlayback({ poiCode, audioHash, duration, completed, userId = 'anonymous' }) {
        // Prevent spam: Same user + same audio within 10s
        const tenSecondsAgo = new Date(Date.now() - 10000);
        const recentSession = await AudioSession.findOne({
            userId,
            audioHash,
            playedAt: { $gte: tenSecondsAgo }
        });
        
        if (recentSession) {
            console.log(`[Analytics] Anti-spam: Ignored playback for ${audioHash} by ${userId}`);
            return false;
        }

        // Insert Session
        await AudioSession.create({
            poiCode,
            userId,
            audioHash,
            duration,
            completed
        });

        // Update Audio Aggregates
        const audio = await Audio.findOne({ hash: audioHash });
        if (audio) {
            audio.playCount += 1;
            audio.totalPlayTime += duration;
            audio.lastPlayedAt = new Date();
            
            // Re-calculate uniqueUsers
            const uniqueUsersList = await AudioSession.distinct('userId', { audioHash });
            audio.uniqueUsers = uniqueUsersList.length;

            // Re-calculate completionRate
            const totalSessions = await AudioSession.countDocuments({ audioHash });
            const completedSessions = await AudioSession.countDocuments({ audioHash, completed: true });
            audio.completionRate = totalSessions > 0 ? (completedSessions / totalSessions) : 0;
            
            await audio.save();
            console.log(`[Analytics] Tracked playback for ${audioHash}. Completed: ${completed}`);
            return true;
        }
        return false;
    }

    /**
     * PHASE 6.8 - LEAN ANALYTICS TRACKING
     */
    async trackLeanPlayback({ poiCode, zoneCode, duration, completed, userId = 'anonymous' }) {
        // Validation: No negative or zero duration
        if (!duration || duration <= 0) {
            console.log(`[Lean Analytics] Rejected: Invalid duration ${duration}`);
            return false;
        }

        // Clamp extreme duration (max 1 hour / 3600s for a single POI audio)
        const validatedDuration = Math.min(duration, 3600);
        if (duration > 3600) {
            console.warn(`[Lean Analytics] Clamped extreme duration: ${duration}s -> 3600s`);
        }

        // Prevent spam: Check last 10s for same user and poi
        const tenSecondsAgo = new Date(Date.now() - 10000);
        const recentEvent = await AudioPlayEvent.findOne({
            userId,
            poiCode,
            createdAt: { $gte: tenSecondsAgo }
        });
        
        if (recentEvent) {
            console.log(`[Lean Analytics] Anti-spam: Ignored playback for ${poiCode} by ${userId}`);
            return false;
        }

        // Insert new record
        await AudioPlayEvent.create({
            poiCode,
            zoneCode,
            userId,
            duration: validatedDuration,
            completed
        });

        console.log(`[Lean Analytics] Tracked playback for ${poiCode}. Duration: ${validatedDuration}s, Completed: ${completed}`);
        return true;
    }

    async getLeanStats() {
        const stats = await AudioPlayEvent.aggregate([
            {
                $facet: {
                    totalPlays: [{ $count: "count" }],
                    completionStats: [
                        { $group: { _id: null, totalCompleted: { $sum: { $cond: ["$completed", 1, 0] } }, total: { $sum: 1 } } }
                    ],
                    topPois: [
                        { $match: { poiCode: { $ne: null } } },
                        { $group: { _id: "$poiCode", plays: { $sum: 1 } } },
                        { $sort: { plays: -1 } },
                        { $limit: 5 }
                    ],
                    topZones: [
                        { $match: { zoneCode: { $ne: null } } },
                        { $group: { _id: "$zoneCode", plays: { $sum: 1 } } },
                        { $sort: { plays: -1 } },
                        { $limit: 5 }
                    ]
                }
            }
        ]);

        const result = stats[0];
        const totalPlays = result.totalPlays[0]?.count || 0;
        
        let completionRate = 0;
        if (result.completionStats[0]?.total > 0) {
            completionRate = result.completionStats[0].totalCompleted / result.completionStats[0].total;
        }

        return {
            totalPlays,
            completionRate,
            topPois: result.topPois.map(p => ({ poiCode: p._id, plays: p.plays })),
            topZones: result.topZones.map(z => ({ zoneCode: z._id, plays: z.plays }))
        };
    }

    /**
     * ORPHAN CLEANUP
     */
    async cleanupOrphans() {
        console.log("[Audio] Starting orphan cleanup...");
        const files = fs.readdirSync(this.storageDir);
        let deleted = 0;
        const now = Date.now();
        const SAFE_AGE_MS = 10 * 60 * 1000; // 10 minutes
        
        for (const file of files) {
            if (!file.endsWith('.mp3')) continue;
            const filePath = path.join(this.storageDir, file);
            
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs < SAFE_AGE_MS) {
                console.log(`[Audio] Skipping recent file: ${file}`);
                continue; // Too recent, might be currently generating
            }
            
            const hash = file.replace('.mp3', '');
            const exists = await Audio.findOne({ hash });
            if (!exists) {
                fs.unlinkSync(filePath);
                deleted++;
            }
        }
        console.log(`[Audio] Cleanup finished. Deleted ${deleted} orphans.`);
        return deleted;
    }

    /**
     * ANALYTICS AGGREGATION
     */
    async getAnalytics() {
        const topPois = await Audio.aggregate([
            { $match: { playCount: { $gt: 0 }, poiCode: { $ne: null } } },
            { $group: { 
                _id: "$poiCode", 
                totalPlays: { $sum: "$playCount" },
                totalPlayTime: { $sum: "$totalPlayTime" },
                avgCompletionRate: { $avg: "$completionRate" }
            } },
            { $sort: { totalPlays: -1 } },
            { $limit: 10 }
        ]);

        const langStats = await Audio.aggregate([
            { $group: { _id: "$language", count: { $sum: 1 }, totalPlays: { $sum: "$playCount" } } },
            { $sort: { totalPlays: -1 } }
        ]);

        const totals = await Audio.aggregate([
            { $group: {
                _id: null,
                totalPlays: { $sum: "$playCount" },
                totalPlayTime: { $sum: "$totalPlayTime" },
                avgCompletionRate: { $avg: "$completionRate" }
            }}
        ]);

        return { 
            topPois, 
            langStats, 
            totalPlays: totals[0]?.totalPlays || 0,
            totalPlayTime: totals[0]?.totalPlayTime || 0,
            avgCompletionRate: totals[0]?.avgCompletionRate || 0
        };
    }

    generateAudioAsync(params) {
        this.generateAudio(params).catch(() => {});
    }

    async cleanupOldFiles(poiCode, currentHash) {
        try {
            if (poiCode) {
                const oldAudios = await Audio.find({ poiCode, hash: { $ne: currentHash } });
                for (const old of oldAudios) {
                    this.safeDelete(old);
                    await Audio.deleteOne({ _id: old._id });
                }
            }
            const count = await Audio.countDocuments({ status: 'ready' });
            if (count > this.MAX_FILES) {
                const candidates = await Audio.find({ status: 'ready' })
                    .sort({ playCount: 1, updatedAt: 1 })
                    .limit(count - this.MAX_FILES);
                for (const c of candidates) {
                    this.safeDelete(c);
                    await Audio.deleteOne({ _id: c._id });
                }
            }
        } catch (err) {
            console.error("[Audio] Cleanup error:", err.message);
        }
    }

    safeDelete(audioDoc) {
        const p = path.join(this.storageDir, `${audioDoc.hash}.mp3`);
        if (fs.existsSync(p)) fs.unlinkSync(p);
    }
}

module.exports = new AudioService();
