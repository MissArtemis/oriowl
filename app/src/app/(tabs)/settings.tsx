import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountPanel } from '../../components/AccountPanel';
import { BackendSettings } from '../../components/BackendSettings';
import { SyncPanel } from '../../components/SyncPanel';
import { TrashPanel } from '../../components/TrashPanel';
import { useAuth } from '../../context/AuthContext';
import { useTravel } from '../../context/TravelContext';
import { Button } from '../../ui/components';
import { PageHeader } from '../../ui/Page';
import { styles } from '../../ui/theme';

export default function MyScreen() {
  const { user } = useAuth();
  const { entries } = useTravel();
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PageHeader title="我的旅行手帐" subtitle="YOUR LITTLE CORNER" />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 18 }}
        keyboardShouldPersistTaps="always"
      >
        <AccountPanel />
        {user && (
          <>
            <View style={[styles.card, { gap: 12 }]}>
              <Text style={styles.text}>已经留下 {entries.length} 段回忆</Text>
              <Button secondary label="查看我的笔记" icon="book-open" onPress={() => router.push('/album')} />
            </View>
            <SyncPanel />
            <TrashPanel />
          </>
        )}
        <BackendSettings />
        <Text style={[styles.eyebrow, { textAlign: 'center', padding: 18 }]}>OWLTRACE · 鹰迹 / 0.2</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
