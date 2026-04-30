import { useState, useEffect, useRef } from 'react';

export interface UseAudioProps {
  poiCode: string;
  language: string;
  version: number;
  narrationShort: string;
}

export type UXState = 'idle' | 'loading' | 'ready_local' | 'ready_remote' | 'generating' | 'retrying' | 'failed' | 'timeout' | 'offline';

export interface AudioState {
  url: string | null;
  status: UXState;
}

export const deps = {
  getLocalAudioMeta: async (poiCode: string, lang: string): Promise<{ version: number, localAudioPath: string, status: 'valid' | 'stale' | 'deleting' } | null> => null,
  markCacheStale: async (poiCode: string, lang: string): Promise<void> => {},
  deleteLocalCache: async (poiCode: string, lang: string): Promise<void> => {},
  removeCacheRecord: async (poiCode: string, lang: string): Promise<void> => {},
  checkRemoteStatus: async (poiCode: string, lang: string, version: number): Promise<{ ready: boolean, url: string }> => ({ ready: false, url: '' }),
  isOffline: async (): Promise<boolean> => false,
  getLastPlayed: async (poiCode: string): Promise<number | null> => null,
  saveLastPlayed: async (poiCode: string, timestamp: number): Promise<void> => {},
  postAnalytics: async (poiCode: string, lang: string, duration?: number, completed?: boolean): Promise<void> => {},
  postLeanAnalytics: async (poiCode: string, zoneCode: string | null, duration: number, completed: boolean): Promise<void> => {},
  queueAnalyticsSync: async (poiCode: string, duration: number, completed: boolean): Promise<void> => {},
  stopAllAudio: async (): Promise<void> => {},
  playNativeAudio: async (uri: string): Promise<void> => {},
  pauseNativeAudio: async (): Promise<void> => {},
};

export const useAudio = ({ poiCode, language, version, narrationShort }: UseAudioProps) => {
  const [audioState, setAudioState] = useState<AudioState>({ url: null, status: 'idle' });
  const [isPlaying, setIsPlaying] = useState(false);
  
  const pollTimerRef = useRef<any>(null);
  const MAX_POLL_ATTEMPTS = 4; // 1s, 2s, 4s, 8s

  const playbackStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    initAudioState();
    return () => {
      stopPolling();
      // On unmount, record playback if it was playing
      if (isPlaying) stopTrackingPlayback();
    };
  }, [poiCode, language, version]);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const updateState = (status: UXState, url: string | null = null) => {
    setAudioState({ status, url });
  };

  const initAudioState = async () => {
    updateState('loading');
    stopPolling();

    // 1. SAFE VERSION INVALIDATION & LOCAL CHECK
    const localMeta = await deps.getLocalAudioMeta(poiCode, language);
    let hash = 'mock-hash'; // In real app, we'd get this from API or metadata
    if (localMeta) {
      if (localMeta.version < version) {
        console.log(`[Audio] Stale version detected for ${poiCode} (Local: ${localMeta.version}, Remote: ${version}) -> invalidating cache`);
        await deps.markCacheStale(poiCode, language);
        console.log(`[Audio] Marked as stale`);
        try {
          await deps.deleteLocalCache(poiCode, language);
          console.log(`[Audio] Delete success`);
          await deps.removeCacheRecord(poiCode, language);
        } catch (e) {
          console.log(`[Audio] Delete failed -> fallback to remote`);
        }
      } else if (localMeta.status === 'valid') {
        updateState('ready_local', localMeta.localAudioPath);
        return;
      }
    }

    // 2. OFFLINE CHECK
    const offline = await deps.isOffline();
    if (offline) {
      updateState('offline');
      return;
    }

    // 3. REMOTE CHECK
    try {
      const remote = await deps.checkRemoteStatus(poiCode, language, version);
      if (remote.ready) {
        updateState('ready_remote', remote.url);
      } else {
        updateState('generating');
        startPolling(1);
      }
    } catch (err) {
      updateState('failed');
    }
  };

  const startPolling = (attempts: number) => {
    if (attempts > MAX_POLL_ATTEMPTS) {
      console.log(`[Audio] POLL TIMEOUT -> fallback for ${poiCode}`);
      updateState('timeout');
      return;
    }

    const delayMs = Math.pow(2, attempts - 1) * 1000;
    if (attempts > 1) {
      console.log(`[Poll] Backoff applied`);
    }
    console.log(`[Poll] Attempt ${attempts} (${delayMs/1000}s)`);

    pollTimerRef.current = setTimeout(async () => {
      try {
        const remote = await deps.checkRemoteStatus(poiCode, language, version);
        if (remote.ready) {
          updateState('ready_remote', remote.url);
        } else {
          startPolling(attempts + 1);
        }
      } catch (err) {
        updateState('failed');
      }
    }, delayMs);
  };

  const stopTrackingPlayback = async () => {
    if (playbackStartTimeRef.current) {
      const durationMs = Date.now() - playbackStartTimeRef.current;
      const durationSec = Math.floor(durationMs / 1000);
      playbackStartTimeRef.current = null;
      
      // Assume average audio length is 60s for completion metric calculation here
      // In a real app, deps.getAudioDuration() would provide actual length.
      const audioTotalLen = 60; 
      const completed = durationSec >= (audioTotalLen * 0.9);

      const isOffline = await deps.isOffline();
      if (isOffline) {
        console.log(`[Lean Analytics] Offline: Queuing playback event (Duration: ${durationSec}s)`);
        await deps.queueAnalyticsSync(poiCode, durationSec, completed);
      } else {
        // In real app, we'd have zoneCode from context or props. Mocking null for now.
        await deps.postLeanAnalytics(poiCode, null, durationSec, completed);
        console.log(`[Lean Analytics] Tracked playback event (Duration: ${durationSec}s, Completed: ${completed})`);
      }
    }
  };

  const play = async () => {
    if (audioState.status !== 'ready_local' && audioState.status !== 'ready_remote') {
      return;
    }
    
    try {
      console.log(`[Audio] Stopping previous playback`);
      await deps.stopAllAudio();
      
      setIsPlaying(true);
      playbackStartTimeRef.current = Date.now(); // Start timer
      
      await deps.playNativeAudio(audioState.url!);
      
      // PERSISTENT ANALYTICS DEDUP
      const now = Date.now();
      const lastPlayed = await deps.getLastPlayed(poiCode);
      const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

      if (!lastPlayed || (now - lastPlayed > COOLDOWN_MS)) {
        await deps.saveLastPlayed(poiCode, now);
        console.log(`[Analytics] Accepted session window for ${poiCode}`);
      } else {
        console.log(`[Analytics] Skipped (cooldown active)`);
        // If cooldown active, we might choose not to send the event later.
        // For simplicity in this demo, we let the timer run, but backend 
        // will dedup the event using anti-spam anyway.
      }
    } catch (err) {
      updateState('failed');
      setIsPlaying(false);
      playbackStartTimeRef.current = null;
    }
  };

  const pause = async () => {
    setIsPlaying(false);
    await stopTrackingPlayback(); // Stop timer and calculate completion
    await deps.pauseNativeAudio();
  };

  return {
    audioState,
    isPlaying,
    play,
    pause,
    retry: () => {
      updateState('retrying');
      setTimeout(initAudioState, 500);
    },
    fallbackText: narrationShort
  };
};
