import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { colors, spacing } from '@/constants/theme';
import { player, usePlayer } from '@/stores/player';
import { playbackRates } from '@/services/narration/passages';
import type { AppSettings } from '@/types/domain';


export default function SettingsScreen() {
  const { settings, ready: loaded, error } = usePlayer();
  const update = (next: AppSettings) => { void player.updateSettings(next); };

  return (
    <Screen scroll>
      <Text style={styles.eyebrow}>PREFERENCES</Text>
      <Text style={styles.title}>Settings</Text>
      {!!error && <Text style={styles.rowBody}>{error}</Text>}

      <Text style={styles.sectionLabel}>PLAYBACK</Text>
      <View style={styles.card}>
        <Text style={styles.rowTitle}>Default speed</Text>
        <View style={styles.rates}>
          {playbackRates.map((rate) => {
            const selected = settings.playbackRate === rate;
            return (
              <Pressable
                key={rate}
                disabled={!loaded}
                onPress={() => update({ ...settings, playbackRate: rate })}
                style={[styles.rate, selected && styles.rateSelected]}
              >
                <Text style={[styles.rateText, selected && styles.rateTextSelected]}>{rate}×</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.rowTitle}>Continuous listening</Text>
            <Text style={styles.rowBody}>Automatically continue to the next chapter.</Text>
          </View>
          <Switch
            disabled={!loaded}
            value={settings.continueToNextChapter}
            onValueChange={(value) => update({ ...settings, continueToNextChapter: value })}
            trackColor={{ false: colors.border, true: colors.primaryMuted }}
            thumbColor={settings.continueToNextChapter ? colors.primary : colors.textMuted}
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>ABOUT</Text>
      <View style={styles.card}>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.rowTitle}>Local by design</Text>
            <Text style={styles.rowBody}>Books, chapter text, settings, and progress remain on this device.</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.versionRow}>
          <Text style={styles.rowTitle}>LightVoice</Text>
          <Text style={styles.version}>0.1.0 · Local narration</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1, marginBottom: spacing.xl },
  sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: spacing.sm, marginTop: spacing.md },
  card: { padding: spacing.md, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rowBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  rates: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: spacing.md },
  rate: { minWidth: 58, alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: colors.surfaceElevated },
  rateSelected: { backgroundColor: colors.primaryMuted },
  rateText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  rateTextSelected: { color: '#C9C0FF' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  settingCopy: { flex: 1 },
  versionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  version: { color: colors.textMuted, fontSize: 13 },
});
