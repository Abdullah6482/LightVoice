import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { player, usePlayer } from '../stores/player';
import { libraryStyles as s } from './libraryStyles';

export function ListenButton({ bookId, chapterId }: { bookId: string; chapterId?: string }) {
  const state = usePlayer();
  return <Pressable accessibilityRole="button" disabled={!state.ready || state.mode === 'loading'} style={s.button} onPress={() => {
    void player.select(bookId, chapterId);
    router.navigate('/player');
  }}><Text style={s.back}>{chapterId ? '▶ Listen to chapter' : '▶ Listen / resume book'}</Text></Pressable>;
}
