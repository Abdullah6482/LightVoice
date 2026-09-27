import { Tabs } from 'expo-router';
import { StyleSheet, Text, type ColorValue } from 'react-native';

import { colors } from '@/constants/theme';

const icons = { library: '▤', player: '▶', settings: '⚙' } as const;

function TabIcon({ name, color }: { name: keyof typeof icons; color: ColorValue }) {
  return <Text style={[styles.icon, { color }]}>{icons[name]}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Library', tabBarIcon: ({ color }) => <TabIcon name="library" color={color} /> }}
      />
      <Tabs.Screen
        name="player"
        options={{ title: 'Player', tabBarIcon: ({ color }) => <TabIcon name="player" color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { height: 70, paddingTop: 8, paddingBottom: 10, backgroundColor: colors.surface, borderTopColor: colors.border },
  label: { fontSize: 11, fontWeight: '600' },
  icon: { fontSize: 20, fontWeight: '700' },
});
