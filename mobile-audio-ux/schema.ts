/**
 * Phase 6.6.2 - Enterprise Audio UX System
 * Local SQLite Schema
 */

// 1. POI Audio Cache Table
export const AudioCacheSchema = `
  CREATE TABLE IF NOT EXISTS AudioCache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poiCode TEXT NOT NULL,
    language TEXT NOT NULL,
    version INTEGER NOT NULL,
    localAudioPath TEXT NOT NULL,
    status TEXT DEFAULT 'valid', -- 'valid', 'stale', 'deleting'
    downloadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(poiCode, language, version)
  );
`;

// 2. Offline Download Queue Table
export const AudioQueueSchema = `
  CREATE TABLE IF NOT EXISTS AudioDownloadQueue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poiCode TEXT NOT NULL,
    language TEXT NOT NULL,
    version INTEGER NOT NULL,
    audioUrl TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, downloading, failed, completed
    retryCount INTEGER DEFAULT 0,
    queuedAt DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

// 3. Persistent Analytics Dedup Table
export const AnalyticsCacheSchema = `
  CREATE TABLE IF NOT EXISTS AnalyticsCache (
    poiCode TEXT PRIMARY KEY,
    lastPlayedAt DATETIME NOT NULL
  );
`;

/**
 * Expected Models
 */
export interface AudioCacheRecord {
  poiCode: string;
  language: string;
  version: number;
  localAudioPath: string;
  status: 'valid' | 'stale' | 'deleting';
}

export interface POIAudioState {
  url: string | null;
  ready: boolean;
  source: "local" | "remote" | "generating" | "none";
}

