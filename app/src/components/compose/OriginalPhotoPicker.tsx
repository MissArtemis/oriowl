import { ActivityIndicator, FlatList, Image, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { useOriginalPhotoPicker } from '../../lib/useOriginalPhotoPicker';
import { Button, Icon } from '../../ui/components';
import { colors, styles } from '../../ui/theme';

export function OriginalPhotoPicker({ picker }: { picker: ReturnType<typeof useOriginalPhotoPicker> }) {
  return (
    <Modal visible={picker.visible} animationType="slide" onRequestClose={picker.cancel}>
      <SafeAreaView style={styles.screen}>
        <View style={{ padding: 20, gap: 12 }}>
          <View style={styles.between}>
            <Text style={[styles.text, { fontWeight: '700' }]}>选择相机原图</Text>
            <Button label="取消" secondary disabled={picker.busy} onPress={picker.cancel} />
          </View>
          <Text style={styles.muted}>DCIM/Camera · 仅显示原图照片，保留拍摄坐标和时间。首次请授权这个相机目录。</Text>
          {!!picker.error && <Text accessibilityLiveRegion="polite" style={{ color: colors.red }}>{picker.error}</Text>}
          <Button label="重新授权相机目录" secondary disabled={picker.busy} onPress={() => void picker.reload(true)} />
        </View>
        {picker.busy ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator color={colors.green} />
          <Text style={styles.muted}>正在读取原图…</Text>
        </View> : <FlatList
          data={picker.files}
          keyExtractor={(file) => file.uri}
          numColumns={3}
          initialNumToRender={12}
          windowSize={5}
          contentContainerStyle={{ padding: 14, gap: 10, flexGrow: 1 }}
          columnWrapperStyle={{ gap: 10 }}
          ListEmptyComponent={<Text style={[styles.muted, { padding: 20 }]}>相机目录中没有可读取的 JPG、PNG、WebP 或 HEIC 原图。</Text>}
          renderItem={({ item }) => {
            const selected = picker.selected.includes(item.uri);
            return <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={item.name}
              onPress={() => picker.toggle(item.uri)}
              style={{ width: '31%', gap: 5 }}
            >
              <Image source={{ uri: item.uri }} resizeMethod="resize" style={{ width: '100%', aspectRatio: 1, borderRadius: 12,
                borderWidth: selected ? 3 : 0, borderColor: colors.green }} />
              <View pointerEvents="none" style={{ position: 'absolute', right: 6, top: 6, padding: 4, borderRadius: 12, backgroundColor: selected ? colors.green : colors.white }}>
                <Icon name={selected ? 'check' : 'circle'} color={selected ? colors.white : colors.green} size={16} />
              </View>
              <Text numberOfLines={1} style={styles.muted}>{item.name}</Text>
            </Pressable>;
          }}
        />}
        <View style={{ padding: 20 }}>
          <Button label={`添加原图（${picker.selected.length}/${picker.limit}）`} disabled={picker.busy || !picker.selected.length} onPress={() => void picker.confirm()} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
