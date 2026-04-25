const AudioQueueEntry = require('../models/audio-queue.model');
const intelligenceEventsService = require('./intelligence-events.service');

/**
 * Audio Queue Service
 * Manages audio playback queue to prevent conflicts when multiple users are at the same POI
 */
class AudioQueueService {
    /**
     * Send audio event to intelligence system
     */
    async _sendAudioEventToIntelligence(entry, interactionType) {
        const event = {
            contractVersion: 'v2',
            deviceId: entry.deviceId,
            correlationId: `audio-${entry._id}`,
            authState: entry.userId ? 'logged_in' : 'guest',
            sourceSystem: 'GAK',
            rbelEventFamily: 'user_interaction',
            rbelMappingVersion: '7.3.1',
            timestamp: new Date().toISOString(),
            userId: entry.userId ? String(entry.userId) : null,
            poiId: entry.poiCode,
            payload: {
                interaction_type: interactionType,
                audio_type: entry.narrationLength,
                duration_seconds: entry.actualDuration || 0,
                queue_position: entry.queuePosition,
                language: entry.language
            }
        };

        try {
            await intelligenceEventsService.ingestSingle(event, null, {
                headerDeviceId: entry.deviceId
            });
            console.log(`[AUDIO-INTELLIGENCE] Sent ${interactionType} event for ${entry.deviceId} at ${entry.poiCode}`);
        } catch (error) {
            console.error('[AUDIO-INTELLIGENCE] Failed to send event:', error);
        }
    }
    /**
     * Add user to audio queue for a POI
     */
    async enqueue(poiCode, userId, deviceId, language, narrationLength = 'short') {
        // Check if user already has an active entry for this POI
        const existing = await AudioQueueEntry.findOne({
            poiCode,
            userId,
            deviceId,
            status: { $in: ['QUEUED', 'PLAYING'] }
        });

        if (existing) {
            console.log(`[AUDIO-QUEUE] User ${userId} already in queue for ${poiCode}`);
            return existing;
        }

        // Get current queue length for this POI
        const queueLength = await AudioQueueEntry.countDocuments({
            poiCode,
            status: { $in: ['QUEUED', 'PLAYING'] }
        });

        // Estimate duration based on narration length
        const estimatedDuration = narrationLength === 'long' ? 60 : 30;

        const entry = await AudioQueueEntry.create({
            poiCode,
            userId,
            deviceId,
            language,
            narrationLength,
            queuePosition: queueLength,
            estimatedDuration,
            status: queueLength === 0 ? 'PLAYING' : 'QUEUED',
            startedAt: queueLength === 0 ? new Date() : null
        });

        console.log(`[AUDIO-QUEUE] Enqueued ${userId} for ${poiCode} at position ${queueLength}`);

        // Send audio_start event if immediately playing
        if (queueLength === 0) {
            await this._sendAudioEventToIntelligence(entry, 'audio_start');
        }

        return entry;
    }

    /**
     * Get queue status for a POI
     */
    async getQueueStatus(poiCode) {
        const entries = await AudioQueueEntry.find({
            poiCode,
            status: { $in: ['QUEUED', 'PLAYING'] }
        })
        .sort({ createdAt: 1 })
        .populate('userId', 'email');

        const playing = entries.find(e => e.status === 'PLAYING');
        const queued = entries.filter(e => e.status === 'QUEUED');

        return {
            poiCode,
            totalInQueue: entries.length,
            currentlyPlaying: playing ? {
                userId: playing.userId._id,
                deviceId: playing.deviceId,
                startedAt: playing.startedAt,
                estimatedDuration: playing.estimatedDuration
            } : null,
            queuedUsers: queued.map((e, idx) => ({
                userId: e.userId._id,
                deviceId: e.deviceId,
                position: idx + 1,
                estimatedWaitTime: this._calculateWaitTime(playing, queued, idx)
            }))
        };
    }

    /**
     * Get user's position in queue
     */
    async getUserQueuePosition(poiCode, userId, deviceId) {
        const entry = await AudioQueueEntry.findOne({
            poiCode,
            userId,
            deviceId,
            status: { $in: ['QUEUED', 'PLAYING'] }
        });

        if (!entry) {
            return null;
        }

        if (entry.status === 'PLAYING') {
            return {
                status: 'PLAYING',
                position: 0,
                estimatedWaitTime: 0,
                startedAt: entry.startedAt
            };
        }

        // Count how many are ahead in queue
        const position = await AudioQueueEntry.countDocuments({
            poiCode,
            status: { $in: ['QUEUED', 'PLAYING'] },
            createdAt: { $lt: entry.createdAt }
        });

        const queueStatus = await this.getQueueStatus(poiCode);
        const estimatedWaitTime = this._calculateWaitTime(
            queueStatus.currentlyPlaying,
            queueStatus.queuedUsers,
            position - 1
        );

        return {
            status: 'QUEUED',
            position,
            estimatedWaitTime,
            queuedAt: entry.createdAt
        };
    }

    /**
     * Mark audio as completed and advance queue
     */
    async completeAudio(poiCode, userId, deviceId) {
        const entry = await AudioQueueEntry.findOne({
            poiCode,
            userId,
            deviceId,
            status: 'PLAYING'
        });

        if (!entry) {
            console.log(`[AUDIO-QUEUE] No playing entry found for ${userId} at ${poiCode}`);
            return null;
        }

        // Mark as completed
        entry.status = 'COMPLETED';
        entry.completedAt = new Date();
        entry.actualDuration = Math.round((entry.completedAt - entry.startedAt) / 1000);
        await entry.save();

        console.log(`[AUDIO-QUEUE] Completed audio for ${userId} at ${poiCode}`);

        // Send audio_completed event
        await this._sendAudioEventToIntelligence(entry, 'audio_completed');

        // Advance queue - start next person
        const nextEntry = await AudioQueueEntry.findOne({
            poiCode,
            status: 'QUEUED'
        }).sort({ createdAt: 1 });

        if (nextEntry) {
            nextEntry.status = 'PLAYING';
            nextEntry.startedAt = new Date();
            await nextEntry.save();
            console.log(`[AUDIO-QUEUE] Started audio for ${nextEntry.userId} at ${poiCode}`);

            // Send audio_start event for next user
            await this._sendAudioEventToIntelligence(nextEntry, 'audio_start');

            return nextEntry;
        }

        return null;
    }

    /**
     * Cancel user's queue entry
     */
    async cancelQueue(poiCode, userId, deviceId) {
        const entry = await AudioQueueEntry.findOne({
            poiCode,
            userId,
            deviceId,
            status: { $in: ['QUEUED', 'PLAYING'] }
        });

        if (!entry) {
            return null;
        }

        const wasPlaying = entry.status === 'PLAYING';
        entry.status = 'CANCELLED';
        entry.completedAt = new Date();
        if (wasPlaying && entry.startedAt) {
            entry.actualDuration = Math.round((entry.completedAt - entry.startedAt) / 1000);
        }
        await entry.save();

        console.log(`[AUDIO-QUEUE] Cancelled queue for ${userId} at ${poiCode}`);

        // Send audio_cancelled event
        await this._sendAudioEventToIntelligence(entry, 'audio_cancelled');

        // If was playing, advance to next
        if (wasPlaying) {
            return await this.completeAudio(poiCode, userId, deviceId);
        }

        return null;
    }

    /**
     * Clean up old completed/cancelled entries (older than 1 hour)
     */
    async cleanup() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const result = await AudioQueueEntry.deleteMany({
            status: { $in: ['COMPLETED', 'CANCELLED'] },
            completedAt: { $lt: oneHourAgo }
        });
        console.log(`[AUDIO-QUEUE] Cleaned up ${result.deletedCount} old entries`);
        return result.deletedCount;
    }

    /**
     * Calculate estimated wait time in seconds
     */
    _calculateWaitTime(currentlyPlaying, queuedUsers, userIndex) {
        if (!currentlyPlaying) return 0;

        let waitTime = 0;

        // Time remaining for current player
        const elapsed = (Date.now() - new Date(currentlyPlaying.startedAt).getTime()) / 1000;
        const remaining = Math.max(0, currentlyPlaying.estimatedDuration - elapsed);
        waitTime += remaining;

        // Add time for users ahead in queue
        for (let i = 0; i < userIndex; i++) {
            waitTime += 30; // Default 30s per person
        }

        return Math.round(waitTime);
    }
}

module.exports = new AudioQueueService();
