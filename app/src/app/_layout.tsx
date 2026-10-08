import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProviders } from '../context/AppProviders';
import { colors } from '../ui/theme';
import { Platform, View } from 'react-native';

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: '#E3EFEB', alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined }}>
        <SafeAreaProvider>
          <AppProviders>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="compose" options={{ presentation: 'modal', gestureEnabled: false }} />
              <Stack.Screen name="memory/[id]" />
              <Stack.Screen name="chat/[id]" />
            </Stack>
          </AppProviders>
        </SafeAreaProvider>
      </View>
    </View>
  );
}
