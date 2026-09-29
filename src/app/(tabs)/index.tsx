import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { colors } from '@/constants/theme';
import { libraryStyles as s } from '@/components/libraryStyles';
import { SQLiteLibraryRepository } from '@/services/database/repositories/SQLiteLibraryRepository';
import { pickAndImport } from '@/services/epub/pickAndImport';
import type { Book } from '@/types/domain';
import { usePlayer } from '@/stores/player';

const repository = new SQLiteLibraryRepository();
export default function LibraryScreen() {
  const playback = usePlayer();
  const [books, setBooks] = useState<Book[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setBooks(await repository.findAll()); setError(''); }
    catch { setError('Your library could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const startImport = async () => {
    if (busy) return;
    setBusy(true); setStatus('Choose an EPUB or PDF…');
    try {
      const result = await pickAndImport(setStatus);
      if (result) {
        await refresh();
        if (result.duplicate) Alert.alert('Already in your library', result.book.title);
        else if (result.warnings.length) Alert.alert('Book imported', result.warnings.join('\n'));
        router.push({ pathname: '/book/[id]', params: { id: result.book.id } });
      }
    } catch (reason) {
      Alert.alert('Unable to import book', reason instanceof Error ? reason.message : 'Please try again.');
    } finally { setBusy(false); setStatus(''); }
  };
  return <Screen>
    <Text style={s.eyebrow}>YOUR AUDIOBOOKS</Text>
    <View style={s.header}><Text style={s.title}>LightVoice</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void startImport()} style={s.button}><Text style={s.back}>{busy ? 'Importing…' : '+ Import book'}</Text></Pressable>
    </View>
    {busy && <View accessibilityLiveRegion="polite" style={s.header}><ActivityIndicator color={colors.primary} /><Text style={s.muted}>{status}</Text></View>}
    {!!error && <Pressable onPress={() => void refresh()}><Text style={s.error}>{error} Retry</Text></Pressable>}
    {!!playback.book && <Pressable accessibilityRole="button" style={s.book} onPress={() => router.navigate('/player')}>
      <View style={s.copy}><Text style={s.eyebrow}>{playback.mode === 'playing' ? 'NOW LISTENING' : 'CONTINUE LISTENING'}</Text><Text style={s.bookTitle}>{playback.book.title}</Text><Text style={s.muted}>{playback.chapter?.title}</Text></View><Text style={s.back}>▶</Text>
    </Pressable>}
    <Text style={s.section}>Your Library · {books.length} books</Text>
    {loading ? <ActivityIndicator color={colors.primary} /> : <FlatList data={books} keyExtractor={(book) => book.id}
      renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/book/[id]', params: { id: item.id } })} style={s.book}>
        {item.coverPath ? <Image source={{ uri: item.coverPath }} style={s.cover} /> : <View style={[s.cover, s.placeholder]}><Text style={s.back}>LV</Text></View>}
        <View style={s.copy}><Text style={s.bookTitle}>{item.title}</Text><Text style={s.muted}>{item.author || 'Unknown author'}</Text><Text style={s.eyebrow}>{item.format.toUpperCase()} · ON THIS DEVICE</Text></View>
      </Pressable>}
      ListEmptyComponent={<View style={s.empty}><Text style={s.bookTitle}>Your next story starts here</Text><Text style={s.muted}>Import an EPUB or a text-based PDF to start reading and listening.</Text></View>}
    />}
  </Screen>;
}
