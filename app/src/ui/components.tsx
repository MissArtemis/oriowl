import { Feather } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, styles } from './theme';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof Feather>['name'];
export function Icon({
  name,
  size = 20,
  color = colors.ink,
}: {
  name: IconName;
  size?: number;
  color?: ComponentProps<typeof Feather>['color'];
}) {
  return <Feather name={name} size={size} color={color} />;
}
export function IconButton({
  icon,
  onPress,
  label,
  style,
}: {
  icon: IconName;
  onPress: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      pressRetentionOffset={24}
      collapsable={false}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 48,
          height: 48,
          borderRadius: 16,
          backgroundColor: colors.white,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <View pointerEvents="none">
        <Icon name={icon} />
      </View>
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  icon,
  secondary,
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const foreground = secondary ? colors.green : colors.white;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy || disabled}
      hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
      pressRetentionOffset={24}
      collapsable={false}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 49,
          minWidth: 48,
          borderRadius: 16,
          backgroundColor: secondary ? colors.pale : colors.green,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 9,
          paddingHorizontal: 18,
          opacity: disabled || busy ? 0.5 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <View pointerEvents="none" style={[styles.row, { gap: 9 }]}>
        {busy ? (
          <ActivityIndicator size="small" color={foreground} />
        ) : icon ? (
          <Icon name={icon} size={17} color={foreground} />
        ) : null}
        <Text style={{ color: foreground, fontSize: 14, fontWeight: '600' }}>{label}</Text>
      </View>
    </Pressable>
  );
}
export function Badge({ text, warm = false }: { text: string; warm?: boolean }) {
  return (
    <View
      style={{
        backgroundColor: warm ? colors.sand : colors.pale,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
      }}
    >
      <Text style={{ color: warm ? '#AD7855' : colors.green, fontSize: 10, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}
export function BrandHeader({ subtitle, right }: { subtitle: string; right?: React.ReactNode }) {
  return (
    <View style={[styles.between, { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 18 }]}>
      <View style={[styles.row, { gap: 8, flexShrink: 1 }]}>
        <Image
          source={require('../../assets/owltrace-mark.png')}
          accessibilityLabel="鹰迹猫头鹰 Logo"
          style={{ width: 46, height: 54 }}
          resizeMode="contain"
        />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: colors.green, fontSize: 19, fontWeight: '800', letterSpacing: 0.3 }}>
            OwlTrace <Text style={{ color: colors.ink, fontSize: 14 }}>鹰迹</Text>
          </Text>
          <Text numberOfLines={1} style={[styles.eyebrow, { fontSize: 7, letterSpacing: 1, marginTop: 5 }]}>
            {subtitle}
          </Text>
        </View>
      </View>
      {right}
    </View>
  );
}
