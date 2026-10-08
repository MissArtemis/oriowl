import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Photo, Place } from '../../lib/types';
import { IconButton } from '../../ui/components';
import { colors, styles } from '../../ui/theme';
import { PhotoImage } from '../PhotoImage';

export function PhotoGrid({
  photos,
  remove,
  choose,
}: {
  photos: Photo[];
  remove: (index: number) => void;
  choose: (place: Place) => void;
}) {
  if (!photos.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
      {photos.map((photo, index) => (
        <View key={index} style={{ width: 132, gap: 5 }}>
          <PhotoImage photo={photo} style={{ width: 132, height: 150, borderRadius: 16 }} />
          <IconButton
            icon="x"
            label={`移除第 ${index + 1} 张照片`}
            onPress={() => remove(index)}
            style={{ position: 'absolute', right: 6, top: 6 }}
          />
          <Pressable
            accessibilityRole="button"
            disabled={!photo.place}
            hitSlop={6}
            style={{ minHeight: 48, paddingVertical: 6 }}
            onPress={() => {
              if (photo.place) choose(photo.place);
            }}
          >
            <Text style={styles.muted} numberOfLines={2}>
              {photo.place
                ? '⌖ ' + (photo.place.address || photo.place.name)
                : photo.gps
                  ? '已读取拍摄坐标'
                  : '未取得拍摄坐标，可尝试导入原图'}
            </Text>
            {photo.gps && (
              <Text style={styles.muted}>
                {photo.gps.longitude.toFixed(6)}, {photo.gps.latitude.toFixed(6)}
              </Text>
            )}
            {!!photo.capturedAt && <Text style={styles.muted}>{photo.capturedAt.slice(0, 10)}</Text>}
          </Pressable>
          {!!photo.locationError && (
            <Text style={[styles.muted, { color: colors.red }]}>{photo.locationError}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}
