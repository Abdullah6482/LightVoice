import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';

interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  contentStyle?: ViewStyle;
}

export function Screen({ children, scroll = false, contentStyle }: ScreenProps) {
  const content = scroll ? (
    <ScrollView contentContainerStyle={[styles.content, contentStyle]}>{children}</ScrollView>
  ) : (
    <View style={[styles.content, styles.flex, contentStyle]}>{children}</View>
  );

  return <SafeAreaView style={styles.safeArea}>{content}</SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl },
  flex: { flex: 1 },
});
