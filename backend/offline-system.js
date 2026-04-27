/**
 * OFFLINE-FIRST SYSTEM SIMULATION
 * Minimal implementation for zone downloads with local storage
 */

class OfflineStorage {
    constructor() {
        // Simulate local storage (in-memory for demo, would be SQLite in production)
        this.pois = new Map(); // key: poiCode, value: POI data
        this.downloadQueue = [];
        this.completedDownloads = new Set();
    }

    /**
     * Store POI locally
     * Prevents duplication
     */
    storePoi(poi) {
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
            downloadedAt: new Date().toISOString()
        });

        console.log(`[STORAGE] Stored POI ${poi.code}`);
        return true;
    }

    /**
     * Get POI from local storage
     */
    getPoi(poiCode) {
        return this.pois.get(poiCode);
    }

    /**
     * Check if POI exists locally
     */
    hasPoi(poiCode) {
        return this.pois.has(poiCode);
    }

    /**
     * Get all stored POIs
     */
    getAllPois() {
        return Array.from(this.pois.values());
    }

    /**
     * Clear all data (for testing)
     */
    clear() {
        this.pois.clear();
        this.downloadQueue = [];
        this.completedDownloads.clear();
    }
}

class DownloadQueue {
    constructor(storage) {
        this.storage = storage;
        this.queue = [];
        this.processing = false;
        this.completed = new Set();
    }

    /**
     * Add zone download to queue
     */
    async downloadZone(zoneCode, apiClient) {
        console.log(`\n[QUEUE] Starting download for zone: ${zoneCode}`);

        // Fetch POIs from API
        const pois = await apiClient.getZonePois(zoneCode);
        console.log(`[QUEUE] Fetched ${pois.length} POIs from API`);

        // Add to queue (skip already downloaded)
        let added = 0;
        for (const poi of pois) {
            if (!this.storage.hasPoi(poi.code) && !this.completed.has(poi.code)) {
                this.queue.push(poi);
                added++;
            } else {
                console.log(`[QUEUE] Skipping ${poi.code} (already downloaded)`);
            }
        }

        console.log(`[QUEUE] Added ${added} POIs to queue`);

        // Start processing
        if (!this.processing) {
            await this.processQueue();
        }

        return {
            total: pois.length,
            added: added,
            skipped: pois.length - added
        };
    }

    /**
     * Process download queue
     * Handles interruption and resume
     */
    async processQueue() {
        if (this.processing) {
            console.log('[QUEUE] Already processing');
            return;
        }

        this.processing = true;
        console.log(`[QUEUE] Processing ${this.queue.length} POIs`);

        while (this.queue.length > 0) {
            const poi = this.queue.shift();

            // Skip if already completed (resume logic)
            if (this.completed.has(poi.code)) {
                console.log(`[QUEUE] Skipping completed POI: ${poi.code}`);
                continue;
            }

            // Store POI
            const stored = this.storage.storePoi(poi);
            if (stored) {
                this.completed.add(poi.code);
            }

            // Simulate network delay
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.processing = false;
        console.log('[QUEUE] Processing complete');
    }

    /**
     * Simulate interruption
     */
    interrupt() {
        console.log('[QUEUE] Interrupted! Remaining:', this.queue.length);
        this.processing = false;
        // Queue remains intact for resume
    }

    /**
     * Resume download
     */
    async resume() {
        console.log('[QUEUE] Resuming download...');
        await this.processQueue();
    }

    /**
     * Get queue status
     */
    getStatus() {
        return {
            pending: this.queue.length,
            completed: this.completed.size,
            processing: this.processing
        };
    }
}

class OfflineAccessLayer {
    constructor(storage) {
        this.storage = storage;
    }

    /**
     * Get POI content with offline-first logic
     *
     * IF exists in local storage:
     *   → use narrationLong (full content)
     * ELSE:
     *   → fallback to narrationShort (preview only)
     */
    getPoiContent(poiCode, onlinePoi = null) {
        // Try local storage first
        const localPoi = this.storage.getPoi(poiCode);

        if (localPoi) {
            console.log(`[ACCESS] Using local data for ${poiCode}`);
            return {
                source: 'local',
                hasFullContent: true,
                poi: {
                    code: localPoi.code,
                    name: localPoi.name,
                    narrationShort: localPoi.narrationShort,
                    narrationLong: localPoi.narrationLong, // Full content available
                    location: localPoi.location
                }
            };
        }

        // Fallback to online data (restricted)
        if (onlinePoi) {
            console.log(`[ACCESS] Using online data for ${poiCode} (restricted)`);
            return {
                source: 'online',
                hasFullContent: false,
                poi: {
                    code: onlinePoi.code,
                    name: onlinePoi.name,
                    narrationShort: onlinePoi.narrationShort,
                    narrationLong: null, // Restricted - not downloaded
                    location: onlinePoi.location
                }
            };
        }

        console.log(`[ACCESS] POI ${poiCode} not found`);
        return null;
    }

    /**
     * Check if POI has full content available
     */
    hasFullContent(poiCode) {
        return this.storage.hasPoi(poiCode);
    }
}

// Mock API client for testing
class MockApiClient {
    constructor() {
        this.mockPois = [
            {
                _id: '1',
                code: 'DEMO_HOAN_KIEM_LAKE',
                name: 'Hồ Hoàn Kiếm',
                narrationShort: 'Hồ Hoàn Kiếm là biểu tượng của Hà Nội',
                narrationLong: 'Hồ Hoàn Kiếm, hay còn gọi là Hồ Gươm, là một hồ nước ngọt tự nhiên nằm ở trung tâm thành phố Hà Nội.',
                location: { type: 'Point', coordinates: [105.8522, 21.0285] }
            },
            {
                _id: '2',
                code: 'DEMO_NGOC_SON_TEMPLE',
                name: 'Đền Ngọc Sơn',
                narrationShort: 'Đền Ngọc Sơn là ngôi đền cổ trên Hồ Hoàn Kiếm',
                narrationLong: 'Đền Ngọc Sơn được xây dựng vào thế kỷ 18, nằm trên đảo Ngọc ở Hồ Hoàn Kiếm.',
                location: { type: 'Point', coordinates: [105.8525, 21.0290] }
            },
            {
                _id: '3',
                code: 'DEMO_DONG_XUAN_MARKET',
                name: 'Chợ Đồng Xuân',
                narrationShort: 'Chợ Đồng Xuân là chợ lớn nhất Hà Nội',
                narrationLong: 'Chợ Đồng Xuân được xây dựng từ năm 1889, là chợ đầu mối lớn nhất Hà Nội.',
                location: { type: 'Point', coordinates: [105.8490, 21.0365] }
            }
        ];
    }

    async getZonePois(zoneCode) {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 100));
        return this.mockPois;
    }
}

// Export for use
module.exports = {
    OfflineStorage,
    DownloadQueue,
    OfflineAccessLayer,
    MockApiClient
};
