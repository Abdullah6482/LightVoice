import { StyleSheet } from 'react-native';
import { colors } from '../constants/theme';
export const libraryStyles = StyleSheet.create({
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  header: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', marginVertical: 12 },
  button: { padding: 12, borderRadius: 14, backgroundColor: colors.primaryMuted },
  back: { color: colors.primary, fontSize: 15, fontWeight: '700', paddingVertical: 6 },
  section: { color: colors.text, fontSize: 20, fontWeight: '700', marginVertical: 16 },
  book: { flexDirection: 'row', gap: 16, padding: 14, backgroundColor: colors.surface, borderRadius: 18, marginBottom: 12, alignItems: 'center' },
  cover: { width: 70, height: 100, borderRadius: 8 },
  largeCover: { width: '100%', height: 240, marginVertical: 16 },
  placeholder: { backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, justifyContent: 'center', gap: 8 },
  bookTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 22 },
  error: { color: colors.danger, marginVertical: 16 },
  empty: { marginTop: 80, alignItems: 'center', gap: 12 },
  paragraph: { color: colors.text, fontSize: 18, lineHeight: 29, marginBottom: 20 },
});
