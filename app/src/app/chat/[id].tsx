import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { errorMessage, request } from '../../lib/api';
import type { ChatMessage, User } from '../../lib/types';
import { useRemote } from '../../lib/useRemote';
import { Button, IconButton } from '../../ui/components';
import { LoginPrompt } from '../../ui/Page';
import { colors, styles } from '../../ui/theme';

type Thread = { user: User | null; messages: ChatMessage[] };
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, token } = useAuth();
  const { apiUrl } = useConfig();
  const thread = useRemote<Thread>(
    '/api/messages/' + encodeURIComponent(id),
    { user: null, messages: [] },
    true,
    5000,
  );
  const [history, setHistory] = useState<ChatMessage[]>([]),
    [body, setBody] = useState('');
  const messages = merge(history, thread.data.messages);
  const [sending, setSending] = useState(false),
    [error, setError] = useState(''),
    [end, setEnd] = useState(false),
    [paging, setPaging] = useState(false);
  const scroll = useRef<ScrollView>(null),
    lastId = useRef('');
  const scrollToLatest = () => {
    const latest = messages.at(-1)?.id;
    if (latest && latest !== lastId.current) {
      lastId.current = latest;
      scroll.current?.scrollToEnd({ animated: true });
    }
  };
  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    setError('');
    try {
      const message = await request<ChatMessage>(apiUrl, '/api/messages/' + id, token, {
        method: 'POST',
        body: { body },
      });
      setHistory((current) => merge(current, [message]));
      setBody('');
      await thread.reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSending(false);
    }
  };
  const older = async () => {
    setPaging(true);
    setError('');
    try {
      const result = await request<Thread>(
        apiUrl,
        '/api/messages/' + id + '?before=' + encodeURIComponent(messages[0].createdAt),
        token,
      );
      setHistory((current) => merge(current, result.messages));
      setEnd(result.messages.length < 50);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPaging(false);
    }
  };
  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.row, { padding: 18, gap: 14 }]}>
        <IconButton
          icon="arrow-left"
          label="返回消息"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))}
        />
        <View>
          <Text style={[styles.text, { fontWeight: '700' }]}>{thread.data.user?.nickname || '好友对话'}</Text>
          <Text style={styles.muted}>旅途再远，也能聊一聊</Text>
        </View>
      </View>
      {!user ? (
        <LoginPrompt />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={scroll}
            onContentSizeChange={scrollToLatest}
            contentContainerStyle={{ padding: 20, gap: 12 }}
          >
            {!end && messages.length >= 50 && (
              <Button secondary label="更早的消息" busy={paging} onPress={() => void older()} />
            )}
            {!messages.length && (
              <Text style={[styles.muted, { textAlign: 'center' }]}>向朋友分享今天的见闻吧</Text>
            )}
            {messages.map((message) => (
              <View
                key={message.id}
                style={{
                  maxWidth: '85%',
                  alignSelf: message.senderId === user.id ? 'flex-end' : 'flex-start',
                }}
              >
                <View
                  style={{
                    backgroundColor: message.senderId === user.id ? colors.green : colors.white,
                    borderRadius: 18,
                    padding: 14,
                  }}
                >
                  <Text
                    style={{
                      color: message.senderId === user.id ? colors.white : colors.ink,
                      lineHeight: 23,
                    }}
                  >
                    {message.body}
                  </Text>
                </View>
                <Text style={[styles.muted, { fontSize: 9, marginTop: 4 }]}>
                  {new Date(message.createdAt).toLocaleString('zh-CN')}
                </Text>
              </View>
            ))}
          </ScrollView>
          {!!(error || thread.error) && (
            <Text style={{ color: colors.red, paddingHorizontal: 20 }}>{error || thread.error}</Text>
          )}
          <View style={[styles.row, { padding: 16, gap: 10 }]}>
            <TextInput
              accessibilityLabel="消息内容"
              value={body}
              onChangeText={setBody}
              maxLength={2000}
              placeholder="分享今天的小事…"
              multiline
              style={[styles.input, { flex: 1, maxHeight: 120 }]}
            />
            <Button label="发送" busy={sending} disabled={!body.trim()} onPress={() => void send()} />
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
function merge(first: ChatMessage[], second: ChatMessage[]) {
  return [...new Map([...first, ...second].map((message) => [message.id, message])).values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}
