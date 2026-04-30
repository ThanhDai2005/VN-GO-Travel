import React from 'react';
import { useAudio } from './useAudio';

interface AudioPlayerProps {
  poiCode: string;
  language: string;
  version: number;
  narrationShort: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ poiCode, language, version, narrationShort }) => {
  const { audioState, isPlaying, play, pause, retry, fallbackText } = useAudio({
    poiCode,
    language,
    version,
    narrationShort
  });

  const isLoading = ['loading', 'generating', 'retrying'].includes(audioState.status);
  const isError = ['failed', 'timeout', 'offline'].includes(audioState.status);
  const isReady = ['ready_local', 'ready_remote'].includes(audioState.status);

  const getStatusText = () => {
    if (audioState.status === 'offline') return "Offline mode. Audio is missing.";
    if (audioState.status === 'timeout') return "POLL TIMEOUT -> fallback";
    if (audioState.status === 'failed') return "Audio chưa sẵn sàng";
    if (audioState.status === 'retrying') return "Đang thử lại...";
    return "Đang chuẩn bị audio...";
  };

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.statusBox}>
          <ActivityIndicator size="small" color="#0000ff" />
          <Text style={styles.loadingText}>{getStatusText()}</Text>
        </View>
      )}

      {isError && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{getStatusText()}</Text>
          <Text style={styles.fallbackText}>{fallbackText}</Text>
          <TouchableOpacity onPress={retry} style={styles.retryButton}>
            <Text>Thử lại</Text>
          </TouchableOpacity>
        </View>
      )}

      {isReady && (
        <View style={styles.playerControls}>
          <Text style={styles.sourceTag}>
            Source: {audioState.status === 'ready_local' ? 'Offline (Local)' : 'Streaming (Remote)'}
          </Text>
          <TouchableOpacity 
            style={styles.playButton} 
            onPress={isPlaying ? pause : play}
          >
            <Text style={styles.playButtonText}>{isPlaying ? 'Pause' : 'Play'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = {
  container: { padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8 },
  statusBox: { flexDirection: 'row', alignItems: 'center' },
  loadingText: { marginLeft: 8, fontStyle: 'italic', color: '#666' },
  errorBox: { marginTop: 8 },
  errorText: { color: 'red', fontWeight: 'bold' },
  fallbackText: { marginTop: 4, color: '#333' },
  retryButton: { marginTop: 8, padding: 8, backgroundColor: '#ddd', borderRadius: 4, alignItems: 'center' },
  playerControls: { marginTop: 8 },
  sourceTag: { fontSize: 10, color: '#888', marginBottom: 4 },
  playButton: { padding: 12, backgroundColor: '#007AFF', borderRadius: 8, alignItems: 'center' },
  playButtonText: { color: '#fff', fontWeight: 'bold' }
};

// Dummy definitions for simulation compilation
const View = ({ children, style }: any) => <div style={style}>{children}</div>;
const Text = ({ children, style }: any) => <span style={style}>{children}</span>;
const TouchableOpacity = ({ children, onPress, style }: any) => <button onClick={onPress} style={style}>{children}</button>;
const ActivityIndicator = () => <span>[Loading Spinner]</span>;
