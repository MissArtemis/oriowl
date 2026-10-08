import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from '../../ui/components';
import { colors } from '../../ui/theme';

export function PublishButton({ busy, publish }: { busy: boolean; publish: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="发布笔记"
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={publish}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ width: '100%', minHeight: 56, borderRadius: 16, backgroundColor: colors.green,
        justifyContent: 'center', alignItems: 'center', opacity: busy ? 0.6 : 1 }}
    >
      <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {busy ? <ActivityIndicator color={colors.white} /> : <Icon name="arrow-up-right" color={colors.white} size={18} />}
        <Text style={{ color: colors.white, fontSize: 15, fontWeight: '600' }}>
          {busy ? '正在保存 / 读取照片…' : '发布笔记'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
