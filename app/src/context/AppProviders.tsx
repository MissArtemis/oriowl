import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from './AuthContext';
import { ConfigProvider, useConfig } from './ConfigContext';
import { TravelProvider } from './TravelContext';
import { colors } from '../ui/theme';

function AccountScope({ children }: { children: ReactNode }) {
  const { apiUrl } = useConfig();
  const { ready, user } = useAuth();
  if (!ready)
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  return <TravelProvider key={apiUrl + '/' + (user?.id || 'guest')}>{children}</TravelProvider>;
}
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider>
      <ServerScope>{children}</ServerScope>
    </ConfigProvider>
  );
}
function ServerScope({ children }: { children: ReactNode }) {
  const { apiUrl, ready } = useConfig();
  if (!ready) return null;
  return (
    <AuthProvider key={apiUrl}>
      <AccountScope>{children}</AccountScope>
    </AuthProvider>
  );
}
