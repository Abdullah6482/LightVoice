import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { libraryStyles as s } from '@/components/libraryStyles';
import { colors } from '@/constants/theme';
import { SQLiteLibraryRepository } from '@/services/database/repositories/SQLiteLibraryRepository';
import type { Book, Chapter } from '@/types/domain';
import { ListenButton } from '@/components/ListenButton';

export default function BookDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookDetails key={id} id={id} />;
}

function BookDetails({ id }: { id: string }) {
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const repository = new SQLiteLibraryRepository();
    Promise.all([repository.findById(id), repository.findChapters(id)]).then(([found, entries]) => {
      if (!active) return;
      if (!found) setError('This book is no longer in your library.');
      setBook(found); setChapters(entries);
    }).catch(() => { if (active) setError('Unable to load this book.'); });
    return () => { active = false; };
  }, [id, attempt]);
  return <Screen>
    <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>‹ Library</Text></Pressable>
    {error ? <Pressable onPress={() => { setError(''); setBook(null); setAttempt(attempt + 1); }}><Text style={s.error}>{error} Retry</Text></Pressable> : !book ? <ActivityIndicator color={colors.primary} /> : <FlatList
      data={chapters} keyExtractor={(chapter) => chapter.id}
      ListHeaderComponent={<View>
        {!!book.coverPath && <Image source={{ uri: book.coverPath }} style={s.largeCover} resizeMode="contain" />}
        <Text style={s.title}>{book.title}</Text><Text style={s.muted}>{book.author || 'Unknown author'}</Text>
        <Text style={s.muted}>{chapters.length} chapters · {chapters.reduce((sum, c) => sum + c.wordCount, 0).toLocaleString()} words</Text>
        <ListenButton bookId={book.id} />
        <Text style={s.section}>Chapters</Text>
      </View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" style={s.book} onPress={() => router.push({ pathname: '/chapter/[id]', params: { id: item.id, bookId: book.id } })}>
        <Text style={s.back}>{item.index + 1}</Text><View style={s.copy}><Text style={s.bookTitle}>{item.title}</Text><Text style={s.muted}>{item.wordCount.toLocaleString()} words</Text></View><Text style={s.back}>›</Text>
      </Pressable>}
    />}
  </Screen>;
}
