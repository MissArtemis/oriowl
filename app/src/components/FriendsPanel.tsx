import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigContext';
import { errorMessage, request } from '../lib/api';
import type { FriendRequest, User } from '../lib/types';
import { Button } from '../ui/components';
import { colors, styles } from '../ui/theme';

type Match = User & { friendStatus: 'friend' | 'pending' | 'none' };
export function FriendsPanel({
  requests,
  refresh,
}: {
  requests: FriendRequest[];
  refresh: () => Promise<void>;
}) {
  const { apiUrl } = useConfig();
  const { token } = useAuth();
  const [query, setQuery] = useState(''),
    [matches, setMatches] = useState<Match[] | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const action = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const search = () =>
    action(async () => {
      if (!query.trim()) throw new Error('输入好友的账号或昵称');
      setMatches(await request<Match[]>(apiUrl, '/api/users?q=' + encodeURIComponent(query.trim()), token));
    });
  const add = (userId: string) =>
    action(async () => {
      await request(apiUrl, '/api/friends/requests', token, { method: 'POST', body: { userId } });
      setMatches(
        (current) => current?.map((u) => (u.id === userId ? { ...u, friendStatus: 'pending' } : u)) || [],
      );
    });
  return (
    <View style={[styles.card, { gap: 12, marginBottom: 20 }]}>
      <Text style={[styles.text, { fontWeight: '600' }]}>和朋友一起，把旅途聊下去</Text>
      <TextInput
        accessibilityLabel="搜索好友"
        placeholder="搜索账号或昵称"
        value={query}
        onChangeText={setQuery}
        maxLength={24}
        style={styles.input}
        onSubmitEditing={() => void search()}
      />
      <Button secondary label="查找好友" icon="user-plus" busy={busy} onPress={() => void search()} />
      {matches?.length === 0 && <Text style={styles.muted}>没有找到这个用户</Text>}
      {matches?.map((user) => (
        <View key={user.id} style={styles.between}>
          <View style={{ flex: 1 }}>
            <Text style={styles.text}>{user.nickname}</Text>
            <Text style={styles.muted}>@{user.username}</Text>
          </View>
          <Button
            secondary
            label={
              user.friendStatus === 'friend'
                ? '已是好友'
                : user.friendStatus === 'pending'
                  ? '已申请'
                  : '加好友'
            }
            disabled={busy || user.friendStatus !== 'none'}
            onPress={() => void add(user.id)}
          />
        </View>
      ))}
      {requests.map((item) => (
        <View key={item.id} style={styles.between}>
          <Text style={[styles.text, { flex: 1 }]}>{item.user.nickname} 请求加你为好友</Text>
          <Button
            secondary
            label="接受"
            disabled={busy}
            onPress={() =>
              void action(async () => {
                await request(apiUrl, '/api/friends/requests/' + item.id + '/accept', token, {
                  method: 'POST',
                });
                await refresh();
              })
            }
          />
        </View>
      ))}
      {!!error && <Text style={{ color: colors.red }}>{error}</Text>}
    </View>
  );
}
