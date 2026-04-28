/**
 * MINIMAL UI SCREENS
 * React Native screens for zone purchase and offline access
 */

// ============================================
// SCREEN 1: ZONE SCREEN
// ============================================

const ZoneScreen = `
import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';

export default function ZoneScreen({ route, navigation }) {
    const { zoneData, accessStatus } = route.params;
    const [purchasing, setPurchasing] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const handlePurchase = async () => {
        setPurchasing(true);
        try {
            const response = await fetch('http://localhost:3000/api/v1/purchase/zone', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + global.authToken
                },
                body: JSON.stringify({ zoneCode: zoneData.code })
            });

            const result = await response.json();

            if (result.success) {
                Alert.alert('Success', 'Zone purchased successfully!');
                navigation.replace('Zone', {
                    zoneData,
                    accessStatus: { hasAccess: true, requiresPurchase: false }
                });
            } else {
                Alert.alert('Error', result.message || 'Purchase failed');
            }
        } catch (error) {
            Alert.alert('Error', error.message);
        } finally {
            setPurchasing(false);
        }
    };

    const handleDownload = async () => {
        setDownloading(true);
        navigation.navigate('Download', { zoneCode: zoneData.code });
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>{zoneData.name}</Text>
            <Text style={styles.description}>{zoneData.description}</Text>
            <Text style={styles.poiCount}>POIs: {zoneData.poiCount}</Text>
            <Text style={styles.price}>Price: {zoneData.price} credits</Text>

            {accessStatus.requiresPurchase && (
                <Button
                    title={\`Buy Zone (\${zoneData.price} credits)\`}
                    onPress={handlePurchase}
                    disabled={purchasing}
                />
            )}

            {accessStatus.hasAccess && (
                <Button
                    title="Download POIs"
                    onPress={handleDownload}
                    disabled={downloading}
                />
            )}

            {accessStatus.hasAccess && (
                <Button
                    title="View POIs"
                    onPress={() => navigation.navigate('POIList', { zoneCode: zoneData.code })}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10 },
    description: { fontSize: 16, marginBottom: 10 },
    poiCount: { fontSize: 14, marginBottom: 5 },
    price: { fontSize: 14, marginBottom: 20 }
});
`;

// ============================================
// SCREEN 2: DOWNLOAD PROGRESS SCREEN
// ============================================

const DownloadScreen = `
import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function DownloadScreen({ route, navigation }) {
    const { zoneCode } = route.params;
    const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        startDownload();
    }, []);

    const startDownload = async () => {
        setIsDownloading(true);

        try {
            // Fetch POIs from API
            const response = await fetch(\`http://localhost:3000/api/v1/zones/\${zoneCode}/download\`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + global.authToken
                }
            });

            const result = await response.json();

            if (result.success) {
                const pois = result.data.pois;

                // Start download queue
                const downloadResult = await global.downloadQueue.downloadZone(zoneCode, pois);

                if (downloadResult.cancelled) {
                    navigation.goBack();
                    return;
                }

                // Monitor progress
                const interval = setInterval(() => {
                    const currentProgress = global.downloadQueue.getProgress();
                    setProgress(currentProgress);

                    if (!currentProgress.isProcessing) {
                        clearInterval(interval);
                        setIsDownloading(false);
                    }
                }, 500);
            }
        } catch (error) {
            console.error('Download error:', error);
            setIsDownloading(false);
        }
    };

    const handleInterrupt = async () => {
        await global.downloadQueue.interrupt();
        setIsDownloading(false);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Downloading POIs</Text>
            <Text style={styles.progress}>
                {progress.current} / {progress.total} ({progress.percentage}%)
            </Text>

            {isDownloading && (
                <Button title="Pause Download" onPress={handleInterrupt} />
            )}

            {!isDownloading && progress.current < progress.total && (
                <Button title="Resume Download" onPress={startDownload} />
            )}

            {progress.current === progress.total && progress.total > 0 && (
                <View>
                    <Text style={styles.complete}>Download Complete!</Text>
                    <Button
                        title="View POIs"
                        onPress={() => navigation.navigate('POIList', { zoneCode })}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center' },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
    progress: { fontSize: 18, marginBottom: 20 },
    complete: { fontSize: 20, color: 'green', marginBottom: 20 }
});
`;

// ============================================
// SCREEN 3: POI DETAIL SCREEN
// ============================================

const POIDetailScreen = `
import React, { useState, useEffect } from 'react';
import { View, Text, Button, StyleSheet, ScrollView } from 'react-native';

export default function POIDetailScreen({ route }) {
    const { poiCode } = route.params;
    const [poi, setPoi] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        loadPoi();
    }, []);

    const loadPoi = async () => {
        // Load from local storage
        const localPoi = await global.storage.getPoi(poiCode);
        setPoi(localPoi);
    };

    const handlePlayAudio = async () => {
        try {
            if (isPlaying) {
                await global.audioPlayer.pause();
                setIsPlaying(false);
            } else {
                await global.audioPlayer.play(poiCode);
                setIsPlaying(true);
            }
        } catch (error) {
            console.error('Audio error:', error);
            alert('Audio not available: ' + error.message);
        }
    };

    if (!poi) {
        return (
            <View style={styles.container}>
                <Text>Loading...</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.title}>{poi.name}</Text>

            <Text style={styles.sectionTitle}>Short Narration (Preview)</Text>
            <Text style={styles.text}>{poi.narrationShort}</Text>

            {poi.narrationLong && (
                <View>
                    <Text style={styles.sectionTitle}>Full Narration</Text>
                    <Text style={styles.text}>{poi.narrationLong}</Text>
                </View>
            )}

            {!poi.narrationLong && (
                <Text style={styles.locked}>
                    Full content locked. Purchase zone to unlock.
                </Text>
            )}

            {poi.localAudioPath && (
                <Button
                    title={isPlaying ? 'Pause Audio' : 'Play Audio'}
                    onPress={handlePlayAudio}
                />
            )}

            {!poi.localAudioPath && poi.narrationAudioUrl && (
                <Text style={styles.audioStatus}>Audio not downloaded</Text>
            )}

            {poi.localAudioPath && (
                <Text style={styles.audioStatus}>
                    Audio available offline ({poi.audioDuration}s)
                </Text>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 15, marginBottom: 10 },
    text: { fontSize: 16, lineHeight: 24 },
    locked: { fontSize: 16, color: 'red', fontStyle: 'italic', marginTop: 10 },
    audioStatus: { fontSize: 14, color: 'gray', marginTop: 10 }
});
`;

// ============================================
// APP INITIALIZATION
// ============================================

const AppInit = `
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import SQLite from 'react-native-sqlite-storage';
import RNFS from 'react-native-fs';

import MobileStorage from './storage';
import MobileDownloadQueue from './download-queue';
import { AudioPlayer, NetworkChecker } from './audio-network';

const Stack = createStackNavigator();

export default function App() {
    useEffect(() => {
        initializeApp();
    }, []);

    const initializeApp = async () => {
        // Initialize storage
        global.storage = new MobileStorage(SQLite, RNFS);
        await global.storage.init();

        // Initialize network checker
        global.networkChecker = new NetworkChecker();

        // Initialize download queue
        global.downloadQueue = new MobileDownloadQueue(global.storage, global.networkChecker);
        await global.downloadQueue.init(); // Auto-resumes pending downloads

        // Initialize audio player
        global.audioPlayer = new AudioPlayer(global.storage);

        console.log('[APP] Initialized successfully');
    };

    return (
        <NavigationContainer>
            <Stack.Navigator>
                <Stack.Screen name="Zone" component={ZoneScreen} />
                <Stack.Screen name="Download" component={DownloadScreen} />
                <Stack.Screen name="POIDetail" component={POIDetailScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
`;

module.exports = {
    ZoneScreen,
    DownloadScreen,
    POIDetailScreen,
    AppInit
};
