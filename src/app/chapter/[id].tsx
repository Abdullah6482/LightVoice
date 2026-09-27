import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, Text } from 'react-native';
import { Screen } from '@/components/Screen';
import { libraryStyles as s } from '@/components/libraryStyles';
import { colors } from '@/constants/theme';
import { SQLiteLibraryRepository } from '@/services/database/repositories/SQLiteLibraryRepository';
import { ExpoFileStorage } from '@/services/storage/ExpoFileStorage';
import { ListenButton } from '@/components/ListenButton';

export default function ChapterScreen() {
  const { id, bookId } = useLocalSearchParams<{ id: string; bookId: string }>();
  return <ChapterContent key={`${bookId}:${id}`} id={id} bookId={bookId} />;
}

function ChapterContent({ id, bookId }: { id: string; bookId: string }) {
  const [content, setContent] = useState<{ title: string; paragraphs: string[] }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    (async () => {
      const chapters = await new SQLiteLibraryRepository().findChapters(bookId);
      const chapter = chapters.find((c) => c.id === id);
      if (!chapter) throw new Error('Chapter not found.');
      const text = await new ExpoFileStorage().readText(chapter.textPath);
      if (active) setContent({ title: chapter.title, paragraphs: text.split('\n\n') });
    })().catch(() => { if (active) setError('Unable to open the chapter text.'); });
    return () => { active = false; };
  }, [id, bookId, attempt]);
  return <Screen>
    <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>‹ Chapters</Text></Pressable>
    {!!content && <ListenButton bookId={bookId} chapterId={id} />}
    {error ? <Pressable onPress={() => { setError(''); setContent(undefined); setAttempt(attempt + 1); }}><Text style={s.error}>{error} Retry</Text></Pressable> : !content ? <ActivityIndicator color={colors.primary} /> : <FlatList
      data={content.paragraphs} keyExtractor={(_, index) => String(index)}
      ListHeaderComponent={<Text style={s.title}>{content.title}</Text>}
      renderItem={({ item }) => <Text selectable style={s.paragraph}>{item}</Text>}
    />}
  </Screen>;
}
