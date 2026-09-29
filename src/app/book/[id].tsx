import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { libraryStyles as s } from '@/components/libraryStyles';
import { colors } from '@/constants/theme';
import { SQLiteLibraryRepository } from '@/services/database/repositories/SQLiteLibraryRepository';
import type { Book, Chapter } from '@/types/domain';
import { ListenButton } from '@/components/ListenButton';
import { refreshTitles } from '@/services/epub/refreshTitles';
import { createChapterEdition, readPDFReport } from '@/services/pdf/chapterEdition';
import type { PDFReport } from '@/services/pdf/PDFReport';

export default function BookDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookDetails key={id} id={id} />;
}

function BookDetails({ id }: { id: string }) {
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [pdfReport, setPDFReport] = useState<PDFReport | null>(null);
  const [reportError, setReportError] = useState('');
  const [reportLoading, setReportLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  useEffect(() => {
    let active = true;
    const repository = new SQLiteLibraryRepository();
    Promise.all([repository.findById(id), repository.findChapters(id)]).then(([found, entries]) => {
      if (!active) return;
      if (!found) setError('This book is no longer in your library.');
      setBook(found); setChapters(entries);
      if (found?.format === 'pdf') void readPDFReport(found).then(report => { if (active) setPDFReport(report); }).catch(() => { if (active) setReportError('The PDF analysis report could not be loaded.'); }).finally(() => { if (active) setReportLoading(false); });
    }).catch(() => { if (active) setError('Unable to load this book.'); });
    return () => { active = false; };
  }, [id, attempt]);
  const ranges = pdfReport?.sections.filter(section => section.kind === 'chapter') || [];
  return <Screen>
    <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={s.back}>‹ Library</Text></Pressable>
    {error ? <Pressable onPress={() => { setError(''); setBook(null); setAttempt(attempt + 1); }}><Text style={s.error}>{error} Retry</Text></Pressable> : !book ? <ActivityIndicator color={colors.primary} /> : <FlatList
      data={chapters} keyExtractor={(chapter) => chapter.id}
      ListHeaderComponent={<View>
        {!!book.coverPath && <Image source={{ uri: book.coverPath }} style={s.largeCover} resizeMode="contain" />}
        <Text style={s.title}>{book.title}</Text><Text style={s.muted}>{book.author || 'Unknown author'}</Text>
        <Text style={s.muted}>{chapters.length} {book.format === 'pdf' && pdfReport?.mode !== 'chapters' ? 'page sections' : 'chapters'} · {chapters.reduce((sum, c) => sum + c.wordCount, 0).toLocaleString()} words</Text>
        <ListenButton bookId={book.id} />
        {!!reportError && <Text style={s.error}>{reportError}</Text>}
        {book.format === 'pdf' && !reportLoading && !pdfReport && !reportError && <Pressable disabled={refreshing} accessibilityRole="button" onPress={() => Alert.alert('Create chapter edition?', 'Creates a new copy with detected chapters. Your original book and saved listening position stay unchanged. The new edition starts at the beginning.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Create', onPress: async () => {
            setRefreshing(true); setStatus('Opening PDF…');
            try { const edition = await createChapterEdition(book, setStatus); router.replace({ pathname: '/book/[id]', params: { id: edition.id } }); }
            catch (reason) { Alert.alert('Unable to create chapter edition', reason instanceof Error ? reason.message : 'Please try again.'); }
            finally { setRefreshing(false); setStatus(''); }
          } },
        ])}><Text style={s.back}>{refreshing ? status : 'Create chapter edition'}</Text></Pressable>}
        {pdfReport && <View>
          {pdfReport.warnings.map((warning, index) => <Text key={index} style={s.muted}>{warning}</Text>)}
          <Pressable accessibilityRole="button" onPress={() => setShowExtras(value => !value)}><Text style={s.back}>{showExtras ? 'Hide' : 'Show'} PDF coverage &amp; extra material</Text></Pressable>
          {showExtras && <View>
            <Text style={s.muted}>{pdfReport.pageCount} source pages. Original PDF preserved; images are not narrated. OCR is not available.</Text>
            {pdfReport.sections.map((section, index) => <View key={index} style={s.book}>
              <View style={s.copy}><Text style={s.bookTitle}>{section.title}</Text><Text style={s.muted}>PDF pages {section.startPage}–{section.endPage}{section.imagePages?.length ? ` · Image/OCR pages: ${section.imagePages.join(', ')}` : ''}</Text>
                {section.kind === 'supplementary' && <Text selectable style={s.muted}>{section.text || 'No selectable text. See these pages in the original PDF.'}</Text>}
              </View>
            </View>)}
          </View>}
        </View>}
        {book.format === 'epub' && <Pressable disabled={refreshing} accessibilityRole="button" onPress={async () => {
          setRefreshing(true);
          try { await refreshTitles(book.id); setAttempt(value => value + 1); }
          catch (reason) { Alert.alert('Unable to refresh titles', reason instanceof Error ? reason.message : 'Please try again.'); }
          finally { setRefreshing(false); }
        }}><Text style={s.back}>{refreshing ? 'Reading contents…' : 'Refresh chapter titles'}</Text></Pressable>}
        <Text style={s.section}>{book.format === 'pdf' && pdfReport?.mode !== 'chapters' ? 'Page sections' : 'Chapters'}</Text>
      </View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" style={s.book} onPress={() => router.push({ pathname: '/chapter/[id]', params: { id: item.id, bookId: book.id } })}>
        <View style={s.copy}><Text style={s.bookTitle}>{item.title}</Text><Text style={s.muted}>{item.wordCount.toLocaleString()} words</Text>
          {ranges[item.index] && <Text style={s.muted}>PDF pages {ranges[item.index].startPage}–{ranges[item.index].endPage}</Text>}
        </View><Text style={s.back}>›</Text>
      </Pressable>}
    />}
  </Screen>;
}
