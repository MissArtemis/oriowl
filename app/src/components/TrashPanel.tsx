import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTravel } from '../context/TravelContext';
import { errorMessage } from '../lib/api';
import { Button } from '../ui/components';
import { colors, styles } from '../ui/theme';

export function TrashPanel() {
  const { trashEntries, restoreEntry, notify } = useTravel();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  if (!trashEntries.length) return null;
  const restore = async (id: string) => {
    if (busy) return;
    setBusy(id);
    setError('');
    try {
      await restoreEntry(id);
      notify('笔记已恢复，联网后同步服务器');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy('');
    }
  };
  return (
    <View style={[styles.card, { gap: 12 }]}>
      <Text style={[styles.text, { fontWeight: '600' }]}>回收站 · {trashEntries.length} 篇</Text>
      <Text style={styles.muted}>删除后不再出现在笔记、足迹和公开列表中，可以在这里恢复。</Text>
      {trashEntries.map((entry) => (
        <View key={entry.id} style={[styles.between, { gap: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={styles.text}>{entry.title}</Text>
            <Text style={styles.muted}>{entry.syncStatus === 'synced' ? '已同步删除' : '等待同步删除'}</Text>
            {entry.deletionBackup === false && <Text style={styles.muted}>原笔记仅保存在本机</Text>}
          </View>
          <Button label="恢复" secondary busy={busy === entry.id} disabled={!!busy}
            onPress={() => void restore(entry.id)} />
        </View>
      ))}
      {!!error && <Text style={{ color: colors.red }}>{error}</Text>}
    </View>
  );
}
