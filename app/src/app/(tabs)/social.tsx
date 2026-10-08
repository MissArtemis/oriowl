import { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoteCard } from '../../components/NoteCard';
import { useConfig } from '../../context/ConfigContext';
import { errorMessage, request } from '../../lib/api';
import { remoteEntry } from '../../lib/noteSync';
import type { Entry } from '../../lib/types';
import { useRemote } from '../../lib/useRemote';
import { Button } from '../../ui/components';
import { EmptyState, PageHeader } from '../../ui/Page';
import { colors, styles } from '../../ui/theme';

export default function SocialScreen() {
  const { apiUrl } = useConfig();
  const feed = useRemote<Entry[]>('/api/notes/feed', [], false);
  const [older, setOlder] = useState<Entry[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [end, setEnd] = useState(false);
  const notes = [...feed.data, ...older].filter(
    (note, i, all) => all.findIndex((n) => n.id === note.id) === i,
  );
  const refresh = async () => {
    setOlder([]);
    setEnd(false);
    await feed.reload();
  };
  const more = async () => {
    if (!notes.length) return;
    setLoading(true);
    setError('');
    try {
      const next = await request<Entry[]>(
        apiUrl,
        '/api/notes/feed?before=' + encodeURIComponent(notes.at(-1)!.createdAt),
      );
      setOlder((current) => [...current, ...next]);
      setEnd(next.length < 20);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  };
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PageHeader title="相遇在旅途中" subtitle="STORIES FROM EVERYWHERE" />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={feed.loading}
            onRefresh={() => void refresh()}
            tintColor={colors.green}
          />
        }
        contentContainerStyle={{ padding: 20, paddingTop: 0 }}
      >
        {!!(feed.error || error) && (
          <View style={{ gap: 10, marginBottom: 16 }}>
            <Text style={{ color: colors.red }}>{feed.error || error}</Text>
            <Button secondary label="重新加载" onPress={() => void refresh()} />
          </View>
        )}
        {!notes.length && !feed.loading && (
          <EmptyState
            title="第一段故事，等你来写"
            text="这里会展示所有人的公开笔记。去探索页选个地点，分享你的旅程。"
          />
        )}
        {notes.map((entry) => (
          <NoteCard key={entry.id} entry={remoteEntry(entry, apiUrl)} />
        ))}
        {!end && notes.length >= 20 && (
          <Button secondary label="更多旅程" busy={loading} onPress={() => void more()} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
