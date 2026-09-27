import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { getDatabase } from '@/services/database/database';
import { ExpoFileStorage } from '@/services/storage/ExpoFileStorage';
import { PlaybackLifecycle } from '@/components/PlaybackLifecycle';

export default function RootLayout() {
  const [error, setError] = useState<string>();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([getDatabase(), new ExpoFileStorage().ensureAppDirectories()])
      .then(() => setReady(true))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'LightVoice could not start.');
      });
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Unable to start LightVoice</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loading}>Preparing your library…</Text>
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <PlaybackLifecycle />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
    backgroundColor: colors.background,
  },
  loading: { color: colors.textMuted, fontSize: 15 },
  errorTitle: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  errorBody: { color: colors.danger, fontSize: 14, textAlign: 'center' },
});
