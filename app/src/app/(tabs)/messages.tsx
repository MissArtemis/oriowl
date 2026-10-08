import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FriendsPanel } from '../../components/FriendsPanel';
import { useAuth } from '../../context/AuthContext';
import type { Conversation, FriendRequest } from '../../lib/types';
import { useRemote } from '../../lib/useRemote';
import { Badge, Icon } from '../../ui/components';
import { EmptyState, LoginPrompt, PageHeader } from '../../ui/Page';
import { colors, styles } from '../../ui/theme';

export default function MessagesScreen() {
  const { user } = useAuth();
  const conversations = useRemote<Conversation[]>('/api/conversations', [], true, 5000);
  const requests = useRemote<FriendRequest[]>('/api/friends/requests', [], true, 5000);
  const refresh = async () => {
    await Promise.all([conversations.reload(), requests.reload()]);
  };
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PageHeader title="旅途里的来信" subtitle="KEEP IN TOUCH" />
      {!user ? (
        <LoginPrompt />
      ) : (
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={conversations.loading} onRefresh={() => void refresh()} />
          }
          contentContainerStyle={{ padding: 20, paddingTop: 0 }}
        >
          <FriendsPanel requests={requests.data} refresh={refresh} />
          {!!(conversations.error || requests.error) && (
            <Text style={{ color: colors.red }}>{conversations.error || requests.error}</Text>
          )}
          {!conversations.data.length && (
            <EmptyState
              icon="message-circle"
              title="还没有好友"
              text="查找朋友的账号，接受申请后即可互发消息。"
            />
          )}
          {conversations.data.map((item) => (
            <Pressable
              key={item.user.id}
              accessibilityRole="button"
              accessibilityLabel={'聊天 ' + item.user.nickname}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.user.id } })}
              style={[styles.card, styles.row, { gap: 12, marginBottom: 12 }]}
            >
              <View style={{ borderRadius: 18, backgroundColor: colors.pale, padding: 14 }}>
                <Icon name="user" color={colors.green} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.text, { fontWeight: '600' }]}>{item.user.nickname}</Text>
                <Text numberOfLines={1} style={styles.muted}>
                  {item.lastMessage?.body || '打个招呼，开启对话'}
                </Text>
              </View>
              {!!item.unread && <Badge text={String(item.unread)} />}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
