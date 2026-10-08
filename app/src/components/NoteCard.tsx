import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useTravel } from '../context/TravelContext';
import type { Entry } from '../lib/types';
import { Badge, Icon } from '../ui/components';
import { colors, styles } from '../ui/theme';
import { PhotoImage } from './PhotoImage';

export function LocationLink({ entry }: { entry: Entry }) {
  const { setFocusPlace } = useTravel();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={'查看地点 ' + entry.place.name}
      onPress={() => {
        setFocusPlace(entry.place);
        router.navigate('/');
      }}
      hitSlop={4}
      style={[styles.row, styles.tapTarget, { gap: 6, paddingVertical: 10 }]}
    >
      <Icon name="map-pin" size={14} color={colors.green} />
      <Text numberOfLines={1} style={{ color: colors.green, flex: 1, fontSize: 12 }}>
        {entry.place.name}
      </Text>
      <Icon name="arrow-up-right" size={15} color={colors.green} />
    </Pressable>
  );
}
export function NoteCard({ entry, compact = false }: { entry: Entry; compact?: boolean }) {
  const open = () => router.push({ pathname: '/memory/[id]', params: { id: entry.id } });
  return (
    <View style={[styles.card, { padding: 0, overflow: 'hidden', marginBottom: 14 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={'打开笔记 ' + entry.title} onPress={open}>
        {entry.photos[0] ? (
          <PhotoImage
            photo={entry.photos[0]}
            style={{ width: '100%', height: compact ? 150 : 235 }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              height: compact ? 100 : 135,
              padding: 20,
              backgroundColor: colors.pale,
              justifyContent: 'center',
            }}
          >
            <Text numberOfLines={4} style={styles.text}>
              {entry.body}
            </Text>
          </View>
        )}
        <View style={{ padding: 16, paddingBottom: 0 }}>
          <Text numberOfLines={2} style={[styles.text, { fontWeight: '700', fontSize: 16 }]}>
            {entry.title}
          </Text>
          {!compact && !!entry.body && (
            <Text numberOfLines={3} style={[styles.muted, { marginTop: 6 }]}>
              {entry.body}
            </Text>
          )}
        </View>
      </Pressable>
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <LocationLink entry={entry} />
        <View style={styles.between}>
          <Text numberOfLines={1} style={[styles.muted, { flex: 1, marginRight: 6 }]}>
            {entry.author?.nickname || '我的旅程'}
          </Text>
          <Badge
            warm={entry.syncStatus !== 'synced'}
            text={
              entry.syncStatus === 'synced'
                ? entry.visibility === 'private'
                  ? '仅自己可见'
                  : '已发布'
                : '待备份'
            }
          />
        </View>
      </View>
    </View>
  );
}
