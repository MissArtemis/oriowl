import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import type { Place } from '../../lib/types';
import { Button } from '../../ui/components';
import { styles } from '../../ui/theme';
import { PlaceSearch } from '../PlaceSearch';

export function DraftLocation({
  place,
  current,
  photoPlace,
  choose,
}: {
  place: Place | null;
  current: Place | null;
  photoPlace?: Place;
  choose: (place: Place, automatic?: boolean) => void;
}) {
  const [searching, setSearching] = useState(false);
  return (
    <View style={[styles.card, { gap: 10 }]}>
      <Text style={styles.eyebrow}>笔记的位置</Text>
      <Text numberOfLines={2} style={styles.text}>
        {place?.address || place?.name || '添加带位置的照片，或搜索地点'}
      </Text>
      {place && (
        <Text style={styles.muted}>
          {place.longitude.toFixed(6)}, {place.latitude.toFixed(6)}
        </Text>
      )}
      {place && !place.address && <Text style={styles.muted}>拍摄坐标已可用于发布，联网后补充地址。</Text>}
      <View style={[styles.row, { gap: 10, flexWrap: 'wrap' }]}>
        <Button label="搜索地点" secondary onPress={() => setSearching(true)} />
        {current && <Button label="当前位置" secondary onPress={() => choose(current)} />}
        {photoPlace && <Button label="照片拍摄地" secondary onPress={() => choose(photoPlace, true)} />}
      </View>
      <Modal visible={searching} animationType="slide" onRequestClose={() => setSearching(false)}>
        <SafeAreaView style={styles.screen}>
          <View style={{ padding: 20 }}>
            <Button label="返回笔记" secondary onPress={() => setSearching(false)} />
          </View>
          <View style={{ flex: 1 }}>
            <PlaceSearch
              enabled
              choose={(point) => {
                choose(point);
                setSearching(false);
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
