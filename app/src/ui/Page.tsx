import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { BrandHeader, Button, Icon, type IconName } from './components';
import { colors, styles } from './theme';

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <>
      <BrandHeader subtitle={subtitle} right={right} />
      <Text style={[styles.heading, { paddingHorizontal: 24, paddingBottom: 20 }]}>{title}</Text>
    </>
  );
}
export function EmptyState({
  title,
  text,
  icon = 'feather',
}: {
  title: string;
  text: string;
  icon?: IconName;
}) {
  return (
    <View style={{ padding: 30, alignItems: 'center', gap: 12 }}>
      <Icon name={icon} size={32} color={colors.green} />
      <Text style={[styles.text, { fontWeight: '600' }]}>{title}</Text>
      <Text style={[styles.muted, { textAlign: 'center' }]}>{text}</Text>
    </View>
  );
}
export function LoginPrompt() {
  return (
    <View style={{ padding: 24, gap: 16 }}>
      <EmptyState
        title="用一个账号，留住每段旅程"
        text="登录后可以备份笔记、添加好友和发送消息。"
        icon="user"
      />
      <Button label="去登录 / 注册" onPress={() => router.navigate('/settings')} />
    </View>
  );
}
