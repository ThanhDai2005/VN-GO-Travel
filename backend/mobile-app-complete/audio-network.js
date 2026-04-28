/**
 * AUDIO PLAYER
 * Offline-capable audio playback system
 */

class AudioPlayer {
    constructor(storage) {
        this.storage = storage;
        this.currentSound = null;
        this.isPlaying = false;
    }

    async play(poiCode) {
        try {
            // Get POI from storage
            const poi = await this.storage.getPoi(poiCode);

            if (!poi) {
                throw new Error('POI not found in local storage');
            }

            if (!poi.localAudioPath) {
                throw new Error('Audio not downloaded for this POI');
            }

            console.log(`[AUDIO] Playing ${poiCode} from ${poi.localAudioPath}`);

            // Stop current audio if playing
            if (this.currentSound) {
                this.currentSound.stop();
                this.currentSound.release();
            }

            // Load and play audio from local file
            // This is a placeholder - actual implementation depends on React Native Sound library
            this.currentSound = {
                path: poi.localAudioPath,
                duration: poi.audioDuration || 0
            };

            this.isPlaying = true;

            return {
                success: true,
                duration: poi.audioDuration,
                path: poi.localAudioPath
            };
        } catch (error) {
            console.error('[AUDIO] Play error:', error);
            throw error;
        }
    }

    async pause() {
        if (this.currentSound && this.isPlaying) {
            console.log('[AUDIO] Paused');
            this.isPlaying = false;
        }
    }

    async stop() {
        if (this.currentSound) {
            console.log('[AUDIO] Stopped');
            this.currentSound = null;
            this.isPlaying = false;
        }
    }

    getStatus() {
        return {
            isPlaying: this.isPlaying,
            currentAudio: this.currentSound ? this.currentSound.path : null
        };
    }
}

/**
 * NETWORK CHECKER
 * Detects network status and asks user confirmation for cellular downloads
 */

class NetworkChecker {
    constructor() {
        this.status = 'wifi'; // wifi | cellular | offline
    }

    async getStatus() {
        // This is a placeholder - actual implementation uses NetInfo from React Native
        // Example: const state = await NetInfo.fetch();
        // return state.type === 'wifi' ? 'wifi' : state.type === 'cellular' ? 'cellular' : 'offline';
        return this.status;
    }

    async askUserConfirmation() {
        // This is a placeholder - actual implementation shows Alert dialog
        // Example:
        // return new Promise((resolve) => {
        //     Alert.alert(
        //         'Download on Cellular',
        //         'You are on cellular data. Download may use significant data. Continue?',
        //         [
        //             { text: 'Cancel', onPress: () => resolve(false) },
        //             { text: 'Download', onPress: () => resolve(true) }
        //         ]
        //     );
        // });
        console.log('[NETWORK] Asking user for cellular download confirmation');
        return true; // Default to true for testing
    }

    setStatus(status) {
        this.status = status;
    }
}

module.exports = {
    AudioPlayer,
    NetworkChecker
};
