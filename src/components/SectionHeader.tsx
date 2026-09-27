import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

export function SectionHeader({ title, action }: { title: string; action?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  action: { color: colors.primary, fontSize: 14, fontWeight: '600' },
});
