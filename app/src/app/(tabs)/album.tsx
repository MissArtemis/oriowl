import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoteCard } from '../../components/NoteCard';
import { useAuth } from '../../context/AuthContext';
import { useTravel } from '../../context/TravelContext';
import { categories, type Category } from '../../lib/types';
import { Badge, IconButton } from '../../ui/components';
import { EmptyState, LoginPrompt, PageHeader } from '../../ui/Page';
import { styles } from '../../ui/theme';

export default function AlbumScreen() {
  const { user } = useAuth();
  const { entries, syncing, sync } = useTravel();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [favorites, setFavorites] = useState(false);
  const notes = entries.filter(
    (entry) =>
      (!category || entry.category === category) &&
      (!favorites || entry.favorite) &&
      `${entry.title} ${entry.body} ${entry.place.name} ${entry.place.address}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PageHeader
        title="我的笔记"
        subtitle="EVERY MOMENT MATTERS"
        right={<IconButton icon="arrow-left" label="返回我的" onPress={() => router.navigate('/settings')} />}
      />
      {!user ? (
        <LoginPrompt />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void sync()} />}
          contentContainerStyle={{ padding: 20, paddingTop: 0 }}
        >
          <TextInput
            accessibilityLabel="搜索我的笔记"
            placeholder="搜索笔记、地点或心情"
            value={query}
            onChangeText={setQuery}
            style={[styles.input, { marginBottom: 12 }]}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
          >
            <Pressable
              accessibilityRole="button"
              hitSlop={4}
              style={styles.tapTarget}
              onPress={() => setCategory(null)}
            >
              <Badge text="全部" warm={category !== null} />
            </Pressable>
            {categories.map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                hitSlop={4}
                style={styles.tapTarget}
                onPress={() => setCategory(item)}
              >
                <Badge text={item} warm={category !== item} />
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              hitSlop={4}
              style={styles.tapTarget}
              onPress={() => setFavorites((value) => !value)}
            >
              <Badge text="收藏" warm={!favorites} />
            </Pressable>
          </ScrollView>
          {!notes.length && (
            <EmptyState title="把今天留在这里" text="去探索页发布你的第一篇笔记，或从服务器恢复已有笔记。" />
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {notes.map((entry) => (
              <View key={entry.id} style={{ width: '48%' }}>
                <NoteCard entry={entry} compact />
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
