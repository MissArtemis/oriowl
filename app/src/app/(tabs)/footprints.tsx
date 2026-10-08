import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView from '../../components/MapView';
import { PhotoImage } from '../../components/PhotoImage';
import { useTravel } from '../../context/TravelContext';
import { footprintNodes } from '../../lib/footprintNodes';
import type { MapHandle, MapMessage, Place } from '../../lib/types';
import { Badge, Button, IconButton } from '../../ui/components';
import { PageHeader } from '../../ui/Page';
import { colors, styles } from '../../ui/theme';

export default function FootprintsScreen() {
  const { apiUrl, entries } = useTravel();
  return <WorldMap key={apiUrl} entries={entries} />;
}
function WorldMap({ entries }: { entries: ReturnType<typeof useTravel>['entries'] }) {
  const { apiUrl } = useTravel();
  const bridge = useRef<MapHandle>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState('');
  const [point, setPoint] = useState<Place | null>(null);
  const entry = entries.find((note) => note.id === selected);
  const nodes = footprintNodes(entries);
  useEffect(() => {
    if (ready && selected && point) bridge.current?.send({ type: 'focus', place: point, zoom: 12 });
  }, [ready, selected, point]);
  useEffect(() => {
    if (ready) bridge.current?.send({ type: 'entries', entries: footprintNodes(entries) });
  }, [entries, ready]);
  useEffect(() => {
    if (ready || error) return;
    const timer = setTimeout(() => setError('地图加载超时，请检查网络后重试'), 20000);
    return () => clearTimeout(timer);
  }, [ready, error, revision]);
  const receive = (message: MapMessage) => {
    if (message.type === 'ready') {
      if (message.configured) setReady(true);
      else setError('请先配置高德地图');
    }
    if (message.type === 'entry' && message.id) {
      setSelected(message.id);
      setPoint(message.place || null);
    }
    if (message.type === 'error') setError(message.message || '地图加载失败');
  };
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <PageHeader
        title="走过的世界"
        subtitle="A WORLD OF YOUR MEMORIES"
        right={<Badge text={`${nodes.length} 个节点`} />}
      />
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <MapView
          key={revision}
          ref={bridge}
          url={apiUrl + '/map?mode=footprints'}
          onMessage={receive}
          onError={() => setError('无法连接地图服务')}
        />
        <IconButton
          icon="globe"
          label="查看世界全图"
          onPress={() => {
            bridge.current?.send({ type: 'overview' });
            setSelected('');
          }}
          style={[styles.shadow, { position: 'absolute', top: 18, right: 18 }]}
        />
        {!ready && !error && (
          <ActivityIndicator
            color={colors.green}
            size="large"
            style={{ position: 'absolute', top: '42%', alignSelf: 'center' }}
          />
        )}
        {!!error && (
          <View style={[styles.card, { position: 'absolute', top: '30%', left: 20, right: 20, gap: 12 }]}>
            <Text style={styles.text}>{error}</Text>
            <Button
              label="重新加载"
              onPress={() => {
                setReady(false);
                setError('');
                setRevision((v) => v + 1);
              }}
            />
          </View>
        )}
        {entry ? (
          <View
            style={[
              styles.card,
              styles.shadow,
              { position: 'absolute', bottom: 18, left: 16, right: 16, padding: 16, gap: 10 },
            ]}
          >
            <View style={styles.between}>
              <Text style={styles.eyebrow}>这一站的故事</Text>
              <IconButton
                icon="x"
                label="关闭笔记预览"
                onPress={() => setSelected('')}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/memory/[id]', params: { id: entry.id } })}
              style={[styles.row, { gap: 14 }]}
            >
              {entry.photos[0] && (
                <PhotoImage photo={entry.photos[0]} style={{ width: 70, height: 80, borderRadius: 14 }} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.text, { fontWeight: '700' }]}>{entry.title}</Text>
                <Text numberOfLines={2} style={styles.muted}>
                  {point?.address || entry.body || entry.place.address}
                </Text>
              </View>
            </Pressable>
            <Button
              label="展开笔记"
              secondary
              onPress={() => router.push({ pathname: '/memory/[id]', params: { id: entry.id } })}
            />
          </View>
        ) : (
          <View
            style={[
              styles.card,
              { position: 'absolute', bottom: 18, left: 16, right: 16, padding: 16, gap: 8 },
            ]}
          >
            <Text style={styles.text}>
              {entries.length ? '点击足迹节点，放大重温这一站' : '发布第一篇笔记，点亮你的世界'}
            </Text>
            <Text style={styles.muted}>世界轮廓地图 · 笔记地点与照片拍摄地点</Text>
            {!!nodes.length && (
              <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                {nodes.map((node, i) => (
                  <Pressable
                    key={node.id + '-' + i}
                    accessibilityRole="button"
                    accessibilityLabel={`回看足迹 ${node.title} ${i + 1}`}
                    hitSlop={4}
                    style={styles.tapTarget}
                    onPress={() => {
                      setSelected(node.id);
                      setPoint(node.place);
                    }}
                  >
                    <Badge text={node.title} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
