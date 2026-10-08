import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTravel } from '../context/TravelContext';
import { usePlaceSearch } from '../lib/usePlaceSearch';
import type { Place } from '../lib/types';
import { Icon, IconButton } from '../ui/components';
import { colors, styles } from '../ui/theme';

export function PlaceSearch({ enabled, choose }: { enabled: boolean; choose: (place: Place) => void }) {
  const { apiUrl, currentPlace, notify } = useTravel();
  const search = usePlaceSearch(apiUrl, enabled, currentPlace);
  const submit = () => {
    Keyboard.dismiss();
    if (enabled) search.search();
    else notify('地图与搜索服务连接后即可查找地址');
  };
  return (
    <View style={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10 }}>
      <View
        style={[
          styles.row,
          styles.shadow,
          { backgroundColor: colors.white, borderRadius: 18, paddingHorizontal: 8, height: 56, gap: 6 },
        ]}
      >
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput
          accessibilityLabel="搜索地址或地点"
          value={search.keyword}
          onChangeText={search.change}
          onSubmitEditing={submit}
          returnKeyType="search"
          maxLength={120}
          placeholder="搜索地址、景点，或一家小店"
          style={{ flex: 1, height: 48, color: colors.ink, fontSize: 13 }}
        />
        {!!search.keyword && <IconButton icon="x" label="清空搜索" onPress={() => search.change('')} />}
        <Pressable
          accessibilityRole="button"
          onPress={submit}
          accessibilityLabel="搜索"
          hitSlop={8}
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <View pointerEvents="none">
            {search.searching ? (
              <ActivityIndicator color={colors.green} />
            ) : (
              <Icon name="arrow-right" color={colors.green} />
            )}
          </View>
        </Pressable>
      </View>
      {search.results !== null && (
        <View style={[styles.card, styles.shadow, { marginTop: 8, maxHeight: 250, padding: 12 }]}>
          <View style={styles.between}>
            <Text style={[styles.muted, { flex: 1 }]}>
              {search.error || (currentPlace ? '按距当前位置由近到远' : '获取当前位置后可按距离排序')}
            </Text>
            <IconButton icon="x" label="关闭搜索结果" onPress={search.close} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {!search.results.length && <Text style={styles.muted}>暂无结果，试试城市加街道名</Text>}
            {search.results.map((place, i) => (
              <Pressable
                key={`${place.longitude}-${place.latitude}-${i}`}
                accessibilityRole="button"
                onPress={() => {
                  search.close();
                  Keyboard.dismiss();
                  choose(place);
                }}
                style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line }}
              >
                <View style={styles.between}>
                  <Text style={[styles.text, { flex: 1, fontWeight: '600' }]} numberOfLines={1}>
                    {place.name}
                  </Text>
                  {place.distance !== undefined && (
                    <Text style={styles.muted}>
                      {place.distance < 1000
                        ? `${Math.round(place.distance)} m`
                        : `${(place.distance / 1000).toFixed(1)} km`}
                    </Text>
                  )}
                </View>
                <Text numberOfLines={1} style={styles.muted}>
                  {place.address || place.city}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
