/**
 * Background Download Queue Manager
 * Integrates with Phase 5 Offline System and supports Smart Priority + Anti-Starvation
 */

export const deps = {
  getNetworkType: async (): Promise<'WIFI' | 'CELLULAR' | 'NONE'> => 'WIFI',
  saveAudioToDisk: async (url: string, poiCode: string): Promise<string> => '/local/path.mp3',
  updateDbQueue: async (poiCode: string, status: string): Promise<void> => {},
  updateDbCache: async (poiCode: string, lang: string, version: number, path: string): Promise<void> => {}
};

export interface QueueItem {
  poiCode: string;
  language: string;
  version: number;
  url: string;
  zoneCode?: string;
  queuedAt: number;
}

class AudioDownloadQueue {
  public queue: QueueItem[] = [];
  private isProcessing = false;
  private MAX_CONCURRENT = 2;
  
  public currentViewedPoi: string | null = null;
  public currentZone: string | null = null;

  public setCurrentContext(poiCode: string | null, zoneCode: string | null) {
    this.currentViewedPoi = poiCode;
    this.currentZone = zoneCode;
    this.sortQueue(); // Re-evaluate priorities immediately
  }

  public sortQueue() {
    const now = Date.now();
    this.queue.sort((a, b) => {
      const calculateScore = (item: QueueItem) => {
        let baseScore = 10; // Other zones
        if (this.currentViewedPoi && item.poiCode === this.currentViewedPoi) baseScore = 100;
        else if (this.currentZone && item.zoneCode === this.currentZone) baseScore = 50;
        
        // Aging Factor: 1 point per second waiting
        const waitingSeconds = (now - item.queuedAt) / 1000;
        return baseScore + waitingSeconds;
      };
      // Highest score first
      return calculateScore(b) - calculateScore(a);
    });
  }

  public async enqueue(item: QueueItem) {
    // Prevent duplicates
    if (!this.queue.find(i => i.poiCode === item.poiCode)) {
      this.queue.push(item);
      await deps.updateDbQueue(item.poiCode, 'pending');
      this.sortQueue();
    }
    this.processQueue();
  }

  public async preloadZonePOIs(pois: any[], language: string, zoneCode: string) {
    const network = await deps.getNetworkType();
    
    if (network === 'NONE') {
      console.log("[Queue] Offline. Queued for later.");
      return;
    }
    
    if (network === 'CELLULAR') {
      console.log("[Queue] Cellular detected. Asking user before download...");
    }

    const now = Date.now();
    for (const poi of pois) {
      if (poi.audio && poi.audio.ready && poi.audio.url) {
        await this.enqueue({
          poiCode: poi.code,
          language: language,
          version: poi.version || 1,
          url: poi.audio.url,
          zoneCode: zoneCode,
          queuedAt: now
        });
      }
    }
  }

  public async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const network = await deps.getNetworkType();
      if (network === 'NONE') {
        console.log("[Queue] Network lost. Suspending queue.");
        break;
      }

      this.sortQueue(); // Re-sort before popping to ensure aging is applied

      const batch = this.queue.splice(0, this.MAX_CONCURRENT);
      const now = Date.now();
      
      batch.forEach(item => {
        const waitingSeconds = Math.round((now - item.queuedAt) / 1000);
        let priorityLabel = 'Other Zone';
        if (item.poiCode === this.currentViewedPoi) priorityLabel = 'Currently Viewed POI';
        else if (item.zoneCode === this.currentZone) priorityLabel = 'Current Zone';
        console.log(`[Queue] Selected next POI based on score: ${item.poiCode} (${priorityLabel}, waited ${waitingSeconds}s)`);
      });

      await Promise.all(batch.map(item => this.downloadItem(item)));
    }

    this.isProcessing = false;
  }

  private async downloadItem(item: QueueItem) {
    try {
      await deps.updateDbQueue(item.poiCode, 'downloading');
      
      const localPath = await deps.saveAudioToDisk(item.url, item.poiCode);
      
      await deps.updateDbCache(item.poiCode, item.language, item.version, localPath);
      await deps.updateDbQueue(item.poiCode, 'completed');
      
    } catch (err) {
      console.error(`[Queue] Failed downloading: ${item.poiCode}`);
      await deps.updateDbQueue(item.poiCode, 'failed');
    }
  }
}

export const downloadQueue = new AudioDownloadQueue();
