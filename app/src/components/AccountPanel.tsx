import { useState } from 'react';
import { Alert, Keyboard, Platform, Text, TextInput, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';
import { Button } from '../ui/components';
import { colors, styles } from '../ui/theme';

export function AccountPanel() {
  const { user, authenticate, logout } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const action = async (work: () => Promise<void>) => {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true);
    setError('');
    try {
      await work();
      setPassword('');
    } catch (cause) {
      const message = errorMessage(cause);
      setError(message);
      if (Platform.OS !== 'web') Alert.alert('操作未完成', message, [{ text: '知道了' }]);
    } finally {
      setBusy(false);
    }
  };
  const submit = () => void action(() => authenticate(mode, username, password, nickname));
  return (
    <View style={[styles.card, { gap: 12 }]}>
      {user ? (
        <>
          <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700' }}>{user.nickname}</Text>
          <Text style={styles.muted}>@{user.username}</Text>
          <Button label="退出账号" secondary busy={busy} onPress={() => void action(logout)} />
        </>
      ) : (
        <>
          <Text style={[styles.text, { fontWeight: '600' }]}>
            {mode === 'login' ? '登录，继续你的旅程' : '注册一个旅人账号'}
          </Text>
          {mode === 'register' && <Text style={styles.muted}>账号用于登录，中文名字填写在昵称里。</Text>}
          <TextInput
            accessibilityLabel="账号"
            placeholder="账号：3–24 位字母、数字或下划线"
            value={username}
            editable={!busy}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
            style={styles.input}
          />
          {mode === 'register' && (
            <TextInput
              accessibilityLabel="昵称"
              placeholder="你希望朋友叫你什么？"
              value={nickname}
              editable={!busy}
              onChangeText={setNickname}
              maxLength={24}
              style={styles.input}
            />
          )}
          <TextInput
            accessibilityLabel="密码"
            placeholder="密码：至少 8 位"
            value={password}
            editable={!busy}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            maxLength={128}
            returnKeyType="done"
            onSubmitEditing={submit}
            style={styles.input}
          />
          {!!error && (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.red }}>
              {error}
            </Text>
          )}
          <Button
            label={
              busy
                ? mode === 'login'
                  ? '正在登录…'
                  : '正在创建账号…'
                : mode === 'login'
                  ? '登录'
                  : '创建账号'
            }
            busy={busy}
            onPress={submit}
          />
          <Button
            secondary
            label={mode === 'login' ? '还没有账号？去注册' : '已有账号？去登录'}
            disabled={busy}
            onPress={() => {
              setError('');
              setMode((m) => (m === 'login' ? 'register' : 'login'));
            }}
          />
        </>
      )}
      {user && !!error && <Text style={{ color: colors.red }}>{error}</Text>}
    </View>
  );
}
