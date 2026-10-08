import { useState } from 'react';
import { Platform, Text, TextInput, View } from 'react-native';
import { useConfig } from '../context/ConfigContext';
import { useTravel } from '../context/TravelContext';
import { errorMessage, request } from '../lib/api';
import { Button } from '../ui/components';
import { colors, styles } from '../ui/theme';
import { defaultApiUrl, validateApiUrl } from '../lib/config';

type Health = { backend: string; mapConfigured: boolean; searchConfigured: boolean };
export function BackendSettings() {
  const { apiUrl, saveApiUrl } = useConfig();
  const { notify } = useTravel();
  const [url, setUrl] = useState(apiUrl),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [failed, setFailed] = useState(false);
  const check = async (save: boolean, address = url) => {
    setBusy(true);
    setStatus('');
    setFailed(false);
    try {
      const target = validateApiUrl(address);
      const result = await request<Health>(target, '/health', null, { timeout: 8000 });
      if (result.backend !== 'fastapi') throw new Error('请填写鹰迹 FastAPI 服务地址');
      const notes = await request<unknown>(target, '/api/notes/feed', null, { timeout: 8000 });
      if (!Array.isArray(notes)) throw new Error('笔记接口返回不正确，请检查服务地址');
      if (save) {
        await saveApiUrl(target);
        notify('服务地址已保存');
      }
      setStatus(
        `FastAPI 与笔记接口已连接 · 地图${result.mapConfigured ? '已配置' : '待配置'} · 地址搜索${result.searchConfigured ? '已配置' : '待配置'}`,
      );
    } catch (cause) {
      setFailed(true);
      setStatus(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const diagnose = async () => {
    setBusy(true);
    setStatus('正在分别检测应用请求和默认 fetch…');
    setFailed(false);
    try {
      const target = validateApiUrl(url);
      const results = await Promise.allSettled([
        request<Health>(target, '/health?owltraceDiagnostic=xhr', null, { timeout: 8000 }),
        request<Health>(target, '/health?owltraceDiagnostic=fetch', null, { timeout: 8000, transport: 'global-fetch' }),
        request<unknown>(target, '/api/notes/feed?owltraceDiagnostic=api', null, { timeout: 8000 }),
      ]);
      const names = [Platform.OS === 'web' ? '应用 fetch /health' : '应用 XHR /health', '默认 fetch /health', '应用 /api/notes/feed'];
      setFailed(results.some((result) => result.status === 'rejected'));
      setStatus(results.map((result, i) => {
        if (result.status === 'rejected') return `${names[i]}：${errorMessage(result.reason)}`;
        const valid = i === 2 ? Array.isArray(result.value) : (result.value as Health)?.backend === 'fastapi';
        return `${names[i]}：${valid ? '成功' : '已收到响应，但不是鹰迹接口'}`;
      }).join('\n\n'));
    } catch (cause) {
      setFailed(true);
      setStatus(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.card, { gap: 12 }]}>
      <Text style={[styles.text, { fontWeight: '600' }]}>服务设置</Text>
      <Text style={styles.muted}>当前连接：{apiUrl}</Text>
      <Text style={styles.muted}>当前扫码电脑：{defaultApiUrl()}</Text>
      <Text style={styles.muted}>调试版本：10.08-3 · 网络兼容修复</Text>
      <TextInput
        accessibilityLabel="后端服务地址"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
        style={styles.input}
      />
      <View style={[styles.row, { gap: 10 }]}>
        <Button
          secondary
          label="检测连接"
          busy={busy}
          onPress={() => void check(false)}
          style={{ flex: 1 }}
        />
        <Button label="保存地址" disabled={busy} onPress={() => void check(true)} style={{ flex: 1 }} />
      </View>
      <Button
        secondary
        label="使用当前扫码电脑的地址"
        disabled={busy}
        onPress={() => void check(true, defaultApiUrl())}
      />
      <Button secondary label="运行连接诊断" disabled={busy} onPress={() => void diagnose()} />
      {!!status && (
        <Text
          accessibilityLiveRegion="polite"
          selectable
          style={{ color: failed ? colors.red : colors.green, fontSize: 12, lineHeight: 20 }}
        >
          {status}
        </Text>
      )}
      <Text style={styles.muted}>手机与电脑连接同一 Wi-Fi。高德 Key 和安全密钥保存在后端 api/.env。</Text>
    </View>
  );
}
