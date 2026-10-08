import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView from '../../components/MapView';
import { PlaceSearch } from '../../components/PlaceSearch';
import { useAuth } from '../../context/AuthContext';
import { useTravel } from '../../context/TravelContext';
import { useExploreMap } from '../../lib/useExploreMap';
import type { MapHandle } from '../../lib/types';
import { Badge, BrandHeader, Button, Icon, IconButton } from '../../ui/components';
import { colors, styles } from '../../ui/theme';

export default function ExploreScreen() {
  const { apiUrl } = useTravel();
  return <ExploreMap key={apiUrl} />;
}
function ExploreMap() {
  const { apiUrl, entries, selectedPlace, notify } = useTravel();
  const { user } = useAuth();
  const [cardHeight, setCardHeight] = useState(200);
  const bridge = useRef<MapHandle>(null);
  const send = useCallback<MapHandle['send']>((command) => bridge.current?.send(command), []);
  const map = useExploreMap(send);
  const publish = () => {
    if (!user) {
      notify('请先登录，笔记会保存在手机和服务器');
      router.navigate('/settings');
      return;
    }
    router.push('/compose');
  };
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <BrandHeader
        subtitle="COLLECT MOMENTS, NOT MILES"
        right={
          <Pressable
            accessibilityRole="button"
            hitSlop={6}
            onPress={() => router.navigate('/footprints')}
            style={[styles.row, styles.tapTarget, { gap: 7, padding: 8 }]}
          >
            <Icon name="flag" size={16} color={colors.green} />
            <Text style={styles.muted}>{entries.length} 个足迹</Text>
          </Pressable>
        }
      />
      <View style={[styles.between, { paddingHorizontal: 24, paddingBottom: 17 }]}>
        <Text style={styles.text}>去走走，把片刻留下。</Text>
        <Text style={styles.eyebrow}>EXPLORE</Text>
      </View>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <MapView
          key={map.revision}
          ref={bridge}
          url={apiUrl + '/map'}
          onMessage={map.receive}
          onError={() => map.receive({ type: 'error', message: '无法连接地图，请检查服务地址和 Wi-Fi' })}
        />
        <PlaceSearch enabled={map.status === 'live' && map.searchConfigured} choose={map.focus} />
        {map.status === 'loading' && (
          <View pointerEvents="none" style={{ position: 'absolute', top: '42%', alignSelf: 'center' }}>
            <ActivityIndicator color={colors.green} size="large" />
          </View>
        )}
        {map.status === 'error' && (
          <View style={[styles.card, { position: 'absolute', top: '28%', left: 24, right: 24, gap: 12 }]}>
            <Text style={styles.text}>{map.error}</Text>
            <Button label="重新连接" onPress={map.reload} />
          </View>
        )}
        {map.status === 'demo' && (
          <View style={{ position: 'absolute', top: 80, left: 18 }}>
            <Badge warm text="待配置高德地图" />
          </View>
        )}
        <View
          style={{
            position: 'absolute',
            right: 18,
            bottom: cardHeight + 28,
            gap: 9,
            alignItems: 'flex-end',
          }}
        >
          <IconButton icon="refresh-cw" label="刷新地图" onPress={map.reload} style={styles.shadow} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="回到当前位置"
            hitSlop={10}
            pressRetentionOffset={24}
            onPress={() => void map.locate()}
            style={[
              styles.row,
              styles.shadow,
              { height: 48, paddingHorizontal: 16, gap: 8, borderRadius: 16, backgroundColor: colors.white },
            ]}
          >
            {map.locating ? (
              <ActivityIndicator color={colors.green} />
            ) : (
              <Icon name="crosshair" color={colors.green} size={18} />
            )}
            <Text style={{ color: colors.green, fontSize: 12 }}>
              {map.locating ? '正在定位…' : '回到当前位置'}
            </Text>
          </Pressable>
        </View>
        <View
          onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
          style={[
            styles.card,
            styles.shadow,
            { position: 'absolute', bottom: 16, left: 16, right: 16, padding: 18, gap: 9 },
          ]}
        >
          <Text style={[styles.eyebrow, { color: colors.green }]}>A MOMENT HERE</Text>
          <Text numberOfLines={1} style={{ color: colors.ink, fontSize: 20, fontWeight: '700' }}>
            {selectedPlace?.name || '故事，从一个地点开始'}
          </Text>
          <Text numberOfLines={1} style={styles.muted}>
            {selectedPlace?.address ||
              (selectedPlace
                ? `${selectedPlace.longitude.toFixed(6)}, ${selectedPlace.latitude.toFixed(6)}`
                : '点击地图选点，或导入照片的拍摄位置')}
          </Text>
          {selectedPlace && (
            <Text style={[styles.muted, { fontSize: 10 }]}>
              {selectedPlace.longitude.toFixed(6)}, {selectedPlace.latitude.toFixed(6)}
            </Text>
          )}
          <Button label="发布笔记" icon="plus" onPress={publish} />
        </View>
      </View>
    </SafeAreaView>
  );
}
