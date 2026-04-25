const intelligenceEventsService = require('./intelligence-events.service');

/**
 * User Audio Queue Service
 * Per-user independent audio queue system
 *
 * Architecture: User-centric (each user has their own queue)
 * Concurrency: Protected by per-user locks
 * State: In-memory with optional Redis backend
 */

const MAX_QUEUE_LENGTH = 5;
const LOCK_TIMEOUT_MS = 5000;

class UserAudioQueueService {
    constructor() {
        // In-memory state: userId -> userState
        this.userStates = new Map();

        // Per-user operation locks (prevents race conditions)
        this.userLocks = new Map();

        // Cleanup interval
        this.startCleanupJob();
    }

    /**
     * Get or create user state
     */
    _getUserState(userId) {
        if (!this.userStates.has(userId)) {
            this.userStates.set(userId, {
                currentAudioId: null,
                queue: [],
                status: 'idle',  // idle | loading | playing
                playbackState: null,
                lastUpdated: Date.now(),
                deviceId: null
            });
        }
        return this.userStates.get(userId);
    }

    /**
     * Execute operation with per-user lock (prevents race conditions)
     */
    async _withLock(userId, operation) {
        // Get or create lock chain for this user
        if (!this.userLocks.has(userId)) {
            this.userLocks.set(userId, Promise.resolve());
        }

        // Chain this operation after previous ones
        const previousOperation = this.userLocks.get(userId);

        const currentOperation = previousOperation
            .then(() => operation())
            .catch(error => {
                console.error(`[USER-AUDIO-QUEUE] Lock operation failed for ${userId}:`, error);
                throw error;
            });

        this.userLocks.set(userId, currentOperation);

        // Add timeout protection
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Lock timeout')), LOCK_TIMEOUT_MS);
        });

        return Promise.race([currentOperation, timeoutPromise]);
    }

    /**
     * Enqueue audio for user
     * Returns: { action: 'playing' | 'queued' | 'ignored' | 'rejected', position, reason }
     */
    async enqueue(userId, poiCode, audioId, deviceId, metadata = {}) {
        return this._withLock(userId, () => {
            const userState = this._getUserState(userId);
            userState.deviceId = deviceId;
            userState.lastUpdated = Date.now();

            // Rule 1: Same audio already playing → IGNORE
            if (userState.currentAudioId === audioId && userState.status === 'playing') {
                console.log(`[USER-AUDIO-QUEUE] ${userId}: Same audio already playing, ignoring`);
                return {
                    action: 'ignored',
                    reason: 'already_playing',
                    currentAudioId: audioId,
                    queueLength: userState.queue.length
                };
            }

            // Rule 2: Same audio in queue → IGNORE
            if (userState.queue.some(item => item.audioId === audioId)) {
                console.log(`[USER-AUDIO-QUEUE] ${userId}: Audio already in queue, ignoring`);
                return {
                    action: 'ignored',
                    reason: 'already_queued',
                    currentAudioId: userState.currentAudioId,
                    queueLength: userState.queue.length
                };
            }

            // Rule 3: Queue full → REJECT
            if (userState.queue.length >= MAX_QUEUE_LENGTH) {
                console.log(`[USER-AUDIO-QUEUE] ${userId}: Queue full, rejecting`);
                return {
                    action: 'rejected',
                    reason: 'queue_full',
                    maxLength: MAX_QUEUE_LENGTH,
                    queueLength: userState.queue.length
                };
            }

            // Rule 4: User idle → PLAY IMMEDIATELY
            if (userState.status === 'idle') {
                userState.currentAudioId = audioId;
                userState.status = 'playing';  // Changed from 'loading' to 'playing'
                userState.playbackState = {
                    audioId,
                    poiCode,
                    startedAt: Date.now(),
                    language: metadata.language || 'vi',
                    narrationLength: metadata.narrationLength || 'short',
                    queuePosition: 0
                };

                console.log(`[USER-AUDIO-QUEUE] ${userId}: Playing immediately - ${audioId}`);

                // Track audio_start event (async, non-blocking)
                this._trackAudioEvent(userId, deviceId, poiCode, audioId, 'audio_start', metadata)
                    .catch(err => console.error('[USER-AUDIO-QUEUE] Failed to track audio_start:', err));

                return {
                    action: 'playing',
                    position: 0,
                    audioId,
                    queueLength: 0
                };
            }

            // Rule 5: User busy → ENQUEUE
            const queueItem = {
                audioId,
                poiCode,
                enqueuedAt: Date.now(),
                language: metadata.language || 'vi',
                narrationLength: metadata.narrationLength || 'short'
            };

            userState.queue.push(queueItem);
            const position = userState.queue.length;

            console.log(`[USER-AUDIO-QUEUE] ${userId}: Enqueued ${audioId} at position ${position}`);

            return {
                action: 'queued',
                position,
                audioId,
                queueLength: userState.queue.length,
                estimatedWaitTime: this._calculateWaitTime(userState)
            };
        });
    }

    /**
     * Mark current audio as completed and play next
     */
    async completeAudio(userId, deviceId) {
        return this._withLock(userId, () => {
            const userState = this._getUserState(userId);

            if (userState.status !== 'playing' || !userState.playbackState) {
                console.log(`[USER-AUDIO-QUEUE] ${userId}: No audio playing to complete`);
                return { completed: false, reason: 'not_playing' };
            }

            const completedAudio = userState.playbackState;
            const duration = Math.round((Date.now() - completedAudio.startedAt) / 1000);

            console.log(`[USER-AUDIO-QUEUE] ${userId}: Completed ${completedAudio.audioId} (${duration}s)`);

            // Track audio_completed event (async, non-blocking)
            this._trackAudioEvent(
                userId,
                deviceId,
                completedAudio.poiCode,
                completedAudio.audioId,
                'audio_completed',
                { ...completedAudio, actualDuration: duration }
            ).catch(err => console.error('[USER-AUDIO-QUEUE] Failed to track audio_completed:', err));

            // Play next in queue
            return this._playNext(userId, deviceId);
        });
    }

    /**
     * Interrupt current audio and play next (or go idle)
     */
    async interruptAudio(userId, deviceId, reason = 'user_action') {
        return this._withLock(userId, () => {
            const userState = this._getUserState(userId);

            if (userState.status !== 'playing' || !userState.playbackState) {
                console.log(`[USER-AUDIO-QUEUE] ${userId}: No audio playing to interrupt`);
                return { interrupted: false, reason: 'not_playing' };
            }

            const interruptedAudio = userState.playbackState;
            const duration = Math.round((Date.now() - interruptedAudio.startedAt) / 1000);

            console.log(`[USER-AUDIO-QUEUE] ${userId}: Interrupted ${interruptedAudio.audioId} after ${duration}s`);

            // Track audio_interrupted event (async, non-blocking)
            this._trackAudioEvent(
                userId,
                deviceId,
                interruptedAudio.poiCode,
                interruptedAudio.audioId,
                'audio_interrupted',
                { ...interruptedAudio, actualDuration: duration, reason }
            ).catch(err => console.error('[USER-AUDIO-QUEUE] Failed to track audio_interrupted:', err));

            // Play next in queue
            return this._playNext(userId, deviceId);
        });
    }

    /**
     * Cancel current audio and clear queue
     */
    async cancelAll(userId, deviceId) {
        return this._withLock(userId, () => {
            const userState = this._getUserState(userId);

            const hadAudio = userState.status === 'playing' && userState.playbackState;
            const queueLength = userState.queue.length;

            if (hadAudio) {
                const cancelledAudio = userState.playbackState;
                const duration = Math.round((Date.now() - cancelledAudio.startedAt) / 1000);

                console.log(`[USER-AUDIO-QUEUE] ${userId}: Cancelled ${cancelledAudio.audioId} and cleared ${queueLength} queued items`);

                // Track audio_cancelled event (async, non-blocking)
                this._trackAudioEvent(
                    userId,
                    deviceId,
                    cancelledAudio.poiCode,
                    cancelledAudio.audioId,
                    'audio_cancelled',
                    { ...cancelledAudio, actualDuration: duration }
                ).catch(err => console.error('[USER-AUDIO-QUEUE] Failed to track audio_cancelled:', err));
            }

            // Reset to idle
            userState.currentAudioId = null;
            userState.status = 'idle';
            userState.playbackState = null;
            userState.queue = [];
            userState.lastUpdated = Date.now();

            return {
                cancelled: true,
                hadAudio,
                clearedQueueItems: queueLength
            };
        });
    }

    /**
     * Get user's current state
     */
    async getUserState(userId) {
        const userState = this._getUserState(userId);

        return {
            status: userState.status,
            currentAudio: userState.playbackState ? {
                audioId: userState.playbackState.audioId,
                poiCode: userState.playbackState.poiCode,
                startedAt: userState.playbackState.startedAt,
                elapsedSeconds: Math.round((Date.now() - userState.playbackState.startedAt) / 1000)
            } : null,
            queue: userState.queue.map((item, idx) => ({
                position: idx + 1,
                audioId: item.audioId,
                poiCode: item.poiCode,
                enqueuedAt: item.enqueuedAt
            })),
            queueLength: userState.queue.length,
            estimatedWaitTime: this._calculateWaitTime(userState)
        };
    }

    /**
     * Play next audio in queue (internal)
     */
    _playNext(userId, deviceId) {
        const userState = this._getUserState(userId);

        if (userState.queue.length === 0) {
            // Queue empty, go idle
            userState.currentAudioId = null;
            userState.status = 'idle';
            userState.playbackState = null;
            userState.lastUpdated = Date.now();

            console.log(`[USER-AUDIO-QUEUE] ${userId}: Queue empty, going idle`);

            return {
                completed: true,
                nextAudio: null,
                status: 'idle'
            };
        }

        // Dequeue next audio (FIFO)
        const nextItem = userState.queue.shift();
        userState.currentAudioId = nextItem.audioId;
        userState.status = 'playing';  // Changed from 'loading' to 'playing'
        userState.playbackState = {
            audioId: nextItem.audioId,
            poiCode: nextItem.poiCode,
            startedAt: Date.now(),
            language: nextItem.language,
            narrationLength: nextItem.narrationLength,
            queuePosition: 0  // Now playing
        };
        userState.lastUpdated = Date.now();

        console.log(`[USER-AUDIO-QUEUE] ${userId}: Playing next - ${nextItem.audioId}`);

        // Track audio_start event (async, non-blocking)
        this._trackAudioEvent(
            userId,
            deviceId,
            nextItem.poiCode,
            nextItem.audioId,
            'audio_start',
            nextItem
        ).catch(err => console.error('[USER-AUDIO-QUEUE] Failed to track audio_start:', err));

        return {
            completed: true,
            interrupted: true,
            nextAudio: {
                audioId: nextItem.audioId,
                poiCode: nextItem.poiCode
            },
            status: 'playing',
            queueLength: userState.queue.length
        };
    }

    /**
     * Calculate estimated wait time for queued items
     */
    _calculateWaitTime(userState) {
        if (userState.status === 'idle') return 0;

        let waitTime = 0;

        // Time remaining for current audio (estimate 30s per audio)
        if (userState.playbackState) {
            const elapsed = (Date.now() - userState.playbackState.startedAt) / 1000;
            const estimatedDuration = userState.playbackState.narrationLength === 'long' ? 60 : 30;
            waitTime += Math.max(0, estimatedDuration - elapsed);
        }

        // Add time for queued items
        waitTime += userState.queue.length * 30;

        return Math.round(waitTime);
    }

    /**
     * Track audio event to intelligence system
     */
    async _trackAudioEvent(userId, deviceId, poiCode, audioId, interactionType, metadata = {}) {
        const event = {
            contractVersion: 'v2',
            eventId: `audio-${userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            deviceId,
            correlationId: `audio-session-${userId}-${poiCode}`,
            authState: userId ? 'logged_in' : 'guest',
            sourceSystem: 'GAK',
            rbelEventFamily: 'user_interaction',
            rbelMappingVersion: '7.3.1',
            timestamp: new Date().toISOString(),
            userId: userId ? String(userId) : null,
            poiId: poiCode,
            payload: {
                poi_id: poiCode,
                poi_code: poiCode,
                interaction_type: interactionType,
                audio_id: audioId,
                audio_type: metadata.narrationLength || 'short',
                language: metadata.language || 'vi',
                duration_seconds: metadata.actualDuration || 0,
                queue_position: metadata.queuePosition || 0
            }
        };

        try {
            await intelligenceEventsService.ingestSingle(event, null, { headerDeviceId: deviceId });
            console.log(`[USER-AUDIO-QUEUE] Tracked ${interactionType} for ${userId} at ${poiCode}`);
        } catch (error) {
            console.error(`[USER-AUDIO-QUEUE] Failed to track ${interactionType}:`, error.message);
            // Don't throw - tracking failures shouldn't break audio playback
        }
    }

    /**
     * Cleanup stale user states (idle for > 1 hour)
     */
    _cleanup() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        let cleaned = 0;

        for (const [userId, userState] of this.userStates.entries()) {
            if (userState.status === 'idle' && userState.lastUpdated < oneHourAgo) {
                this.userStates.delete(userId);
                this.userLocks.delete(userId);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[USER-AUDIO-QUEUE] Cleaned up ${cleaned} stale user states`);
        }
    }

    /**
     * Start cleanup job (runs every 10 minutes)
     */
    startCleanupJob() {
        setInterval(() => {
            this._cleanup();
        }, 10 * 60 * 1000);  // 10 minutes

        console.log('[USER-AUDIO-QUEUE] Cleanup job started (runs every 10 minutes)');
    }

    /**
     * Get system statistics
     */
    getStats() {
        let totalUsers = this.userStates.size;
        let playing = 0;
        let loading = 0;
        let idle = 0;
        let totalQueued = 0;

        for (const userState of this.userStates.values()) {
            if (userState.status === 'playing') playing++;
            else if (userState.status === 'loading') loading++;
            else idle++;

            totalQueued += userState.queue.length;
        }

        return {
            totalUsers,
            playing,
            loading,
            idle,
            totalQueued,
            avgQueueLength: totalUsers > 0 ? (totalQueued / totalUsers).toFixed(2) : 0
        };
    }
}

module.exports = new UserAudioQueueService();
