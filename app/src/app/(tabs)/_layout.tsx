import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../../ui/components';
import { colors } from '../../ui/theme';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const icons: Record<string, IconName> = {
    index: 'compass',
    footprints: 'map',
    social: 'grid',
    messages: 'message-circle',
    settings: 'user',
  };
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          height: 76 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 3 },
        tabBarIcon: ({ color }) => <Icon name={icons[route.name]} color={color} size={21} />,
      })}
    >
      <Tabs.Screen name="index" options={{ title: '探索' }} />
      <Tabs.Screen name="footprints" options={{ title: '地图足迹' }} />
      <Tabs.Screen name="social" options={{ title: '社交' }} />
      <Tabs.Screen name="messages" options={{ title: '消息' }} />
      <Tabs.Screen name="settings" options={{ title: '我的' }} />
      <Tabs.Screen name="album" options={{ href: null }} />
    </Tabs>
  );
}
