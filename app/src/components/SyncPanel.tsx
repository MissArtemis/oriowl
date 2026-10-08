import { useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { useTravel } from '../context/TravelContext';
import { errorMessage } from '../lib/api';
import { Badge, Button } from '../ui/components';
import { colors, styles } from '../ui/theme';

export function SyncPanel() {
  const { pendingCount, ready, syncing, syncError, storageError, sync, clearCache, importLegacy, notify } =
    useTravel();
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [clearError, setClearError] = useState('');
  const pending = pendingCount;
  const clear = async () => {
    setBusy(true);
    setClearError('');
    try {
      await clearCache();
      setConfirm(false);
      notify('本地副本已清除；同步时会从服务器恢复');
    } catch (cause) {
      setClearError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.card, { gap: 12 }]}>
      <View style={styles.between}>
        <Text style={[styles.text, { fontWeight: '600' }]}>双份保存，安心出发</Text>
        <Badge
          warm={!!pending}
          text={
            !ready
              ? '正在加载'
              : pending
                ? `${pending} 项待同步`
                : syncing
                  ? '同步中'
                  : syncError
                    ? '连接待恢复'
                    : '已同步'
          }
        />
      </View>
      <Text style={styles.muted}>
        手机保存笔记和原图；服务器保存另一份。打开应用、回到前台或点击同步时，会补回缺少的本地副本。
      </Text>
      {!!(syncError || storageError) && (
        <Text style={{ color: colors.red }}>{storageError || syncError}</Text>
      )}
      <Button
        label="同步 / 从服务器恢复"
        icon="refresh-cw"
        busy={syncing || busy}
        onPress={() => void sync()}
      />
      <Button
        secondary
        label="导入旧版本地相册（私密）"
        disabled={busy || syncing}
        onPress={() => {
          setBusy(true);
          void importLegacy()
            .then((count) => notify(`已导入 ${count} 篇旧笔记，仅自己可见`))
            .catch((cause) => notify(errorMessage(cause)))
            .finally(() => setBusy(false));
        }}
      />
      <Button
        secondary
        label="清除本地副本"
        disabled={!ready || !!pending || busy || syncing}
        onPress={() => { setClearError(''); setConfirm(true); }}
      />
      <Modal visible={confirm} transparent onRequestClose={() => setConfirm(false)}>
        <View style={{ flex: 1, padding: 28, backgroundColor: '#17271FCC', justifyContent: 'center' }}>
          <View style={[styles.card, { gap: 16 }]}>
            <Text style={styles.text}>
              清除手机上的副本？服务器里的笔记和原图会保留，下次同步会重新下载。
            </Text>
            {!!clearError && <Text style={{ color: colors.red }}>{clearError}</Text>}
            <Button label="保留副本" disabled={busy} onPress={() => setConfirm(false)} />
            <Button secondary label="确认清除" busy={busy} onPress={() => void clear()} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
