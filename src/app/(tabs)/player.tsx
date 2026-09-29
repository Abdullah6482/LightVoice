import { useState } from 'react';
import { router } from 'expo-router';
import Slider from '@react-native-community/slider';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { colors } from '@/constants/theme';
import { player, usePlayer } from '@/stores/player';
import { playbackRates } from '@/services/narration/passages';

const timers = [10, 15, 30, 45, 60] as const;
function Control({ label, onPress, disabled = false, active = false }: { label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={onPress} style={[styles.control, active && styles.active, disabled && styles.disabled]}><Text style={styles.controlText}>{label}</Text></Pressable>;
}
export default function PlayerScreen() {
  const state = usePlayer();
  const [menu, setMenu] = useState<'speed' | 'timer' | 'chapters' | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const busy = !state.ready || state.mode === 'loading';
  const percent = state.length ? Math.round(state.offset / state.length * 100) : 0;
  const chapterIndex = state.chapters.findIndex((chapter) => chapter.id === state.chapter?.id);
  const timerLabel = state.sleep === 'chapter' ? 'End of chapter' : typeof state.sleep === 'number' ? `Until ${new Date(state.sleep).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Off';
  return <>
    <Screen scroll>
      <Text style={styles.eyebrow}>NOW PLAYING · DEVICE VOICE</Text>
      {state.book?.coverPath ? <Image source={{ uri: state.book.coverPath }} resizeMode="contain" style={styles.cover} /> : <View style={styles.placeholder}><Text style={styles.logo}>LV</Text></View>}
      <Text style={styles.title}>{state.book?.title ?? 'Choose your next story'}</Text>
      <Text style={styles.subtitle}>{state.chapter?.title ?? 'Open a book in your Library and tap Listen.'}</Text>
      {busy && <ActivityIndicator color={colors.primary} />}
      {!!state.error && <Text accessibilityLiveRegion="polite" style={styles.error}>{state.error}</Text>}
      {!state.ready && !!state.error && <Control label="Retry loading player" onPress={() => { void player.initialize(); }} />}
      {state.chapter ? <>
        <Slider accessibilityLabel="Chapter progress" minimumValue={0} maximumValue={100} value={scrub ?? percent}
          disabled={busy} minimumTrackTintColor={colors.primary} maximumTrackTintColor={colors.border} thumbTintColor={colors.primary}
          onSlidingStart={() => setScrub(percent)} onValueChange={setScrub}
          onSlidingComplete={(value) => { setScrub(null); void player.seek(state.length * value / 100); }}
        />
        <Text style={styles.subtitle}>{Math.round(scrub ?? percent)}% of chapter · {state.mode === 'ended' ? 'Chapter complete' : state.mode === 'playing' ? 'Speaking' : 'Paused'}</Text>
        <View style={styles.controls}>
          <Control label="‹ Previous" disabled={busy || chapterIndex <= 0} onPress={() => { void player.moveChapter(-1); }} />
          <Control label={state.mode === 'playing' ? 'Ⅱ Pause' : '▶ Play'} active disabled={busy} onPress={() => { void (state.mode === 'playing' ? player.pause() : player.play()); }} />
          <Control label="Next ›" disabled={busy || chapterIndex >= state.chapters.length - 1} onPress={() => { void player.moveChapter(1); }} />
        </View>
        <View style={styles.controls}>
          <Control label={`${state.settings.playbackRate}× Speed`} onPress={() => setMenu('speed')} />
          <Control label={`Timer · ${timerLabel}`} onPress={() => setMenu('timer')} />
          <Control label="Chapters" onPress={() => setMenu('chapters')} />
        </View>
        <View style={styles.passage}><Text style={styles.eyebrow}>CURRENT PASSAGE</Text><Text style={styles.passageText}>{state.excerpt}</Text></View>
        <View style={styles.controls}>
          <Control label="Read chapter" onPress={() => router.push({ pathname: '/chapter/[id]', params: { id: state.chapter!.id, bookId: state.book!.id } })} />
          <Control label="Restart chapter" disabled={busy} onPress={() => { void player.seek(0); }} />
        </View>
        <Text style={styles.note}>{player.supportsBackground
          ? 'Android background narration is enabled. Use the notification or lock-screen controls while the screen is off. Calls and disconnected headphones pause playback; tap Play to resume. Force-stopping the app stops narration. Resume may repeat the current word or short passage.'
          : 'Foreground narration: keep LightVoice open to listen. Install the Android development build for screen-off playback and notification controls. Resume may repeat the current word or short passage.'}</Text>
      </> : <Control label="Open Library" onPress={() => router.navigate('/')} />}
    </Screen>
    <Modal visible={menu !== null} animationType="slide" onRequestClose={() => setMenu(null)}>
      <Screen>
        <Control label="Done" onPress={() => setMenu(null)} />
        <Text style={styles.title}>{menu === 'speed' ? 'Playback speed' : menu === 'timer' ? 'Sleep timer' : 'Chapters'}</Text>
        {menu === 'speed' && <View style={styles.controls}>{playbackRates.map(rate => <Control key={rate} label={`${rate}×`} active={state.settings.playbackRate === rate} onPress={() => { void player.updateSettings({ playbackRate: rate }); setMenu(null); }} />)}</View>}
        {menu === 'timer' && <View style={styles.controls}>
          <Control label="Off" active={state.sleep === null} onPress={() => { void player.setSleep(null); setMenu(null); }} />
          {timers.map(minutes => <Control key={minutes} label={`${minutes} minutes`} onPress={() => { void player.setSleep(minutes); setMenu(null); }} />)}
          <Control label="End of chapter" active={state.sleep === 'chapter'} onPress={() => { void player.setSleep('chapter'); setMenu(null); }} />
        </View>}
        {menu === 'chapters' && <FlatList data={state.chapters} keyExtractor={chapter => chapter.id} renderItem={({ item }) => <Control label={item.title} active={item.id === state.chapter?.id} onPress={() => { if (state.book) void player.select(state.book.id, item.id); setMenu(null); }} />} />}
      </Screen>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  cover: { width: '100%', height: 230, marginVertical: 20 },
  placeholder: { height: 210, marginVertical: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderRadius: 24 },
  logo: { color: colors.primary, fontSize: 48, fontWeight: '800' },
  title: { color: colors.text, fontSize: 25, fontWeight: '800', marginVertical: 12 },
  subtitle: { color: colors.textMuted, fontSize: 14, marginBottom: 14, lineHeight: 21 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginVertical: 10 },
  control: { backgroundColor: colors.surfaceElevated, paddingHorizontal: 15, paddingVertical: 14, borderRadius: 14, marginVertical: 3 },
  controlText: { color: colors.text, fontWeight: '600', fontSize: 14 },
  active: { backgroundColor: colors.primaryMuted, borderWidth: 1, borderColor: colors.primary },
  disabled: { opacity: 0.4 },
  passage: { backgroundColor: colors.surface, padding: 18, borderRadius: 16, marginVertical: 16, gap: 10 },
  passageText: { color: colors.text, fontSize: 16, lineHeight: 25 },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 19, marginTop: 14 },
  error: { color: colors.danger, fontSize: 14, marginVertical: 12 },
});
