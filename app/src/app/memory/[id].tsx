import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LocationLink } from '../../components/NoteCard';
import { PhotoImage } from '../../components/PhotoImage';
import { useAuth } from '../../context/AuthContext';
import { useTravel } from '../../context/TravelContext';
import { errorMessage } from '../../lib/api';
import { remoteEntry } from '../../lib/noteSync';
import type { Entry } from '../../lib/types';
import { useRemote } from '../../lib/useRemote';
import { Badge, Button, IconButton } from '../../ui/components';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { EmptyState } from '../../ui/Page';
import { colors, styles } from '../../ui/theme';

export default function MemoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entries, apiUrl, toggleFavorite, deleteEntry, notify } = useTravel();
  const { user } = useAuth();
  const remote = useRemote<Entry | null>('/api/notes/' + encodeURIComponent(id), null, false);
  const entry =
    entries.find((note) => note.id === id) || (remote.data ? remoteEntry(remote.data, apiUrl) : null);
  const own = !!user && entry?.author?.id === user.id;
  const [preview, setPreview] = useState(-1),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const dimensions = useWindowDimensions();
  const width = Platform.OS === 'web' ? Math.min(480, dimensions.width) : dimensions.width;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/social'));
  const action = async (work: () => Promise<void>) => {
    if (busy) return;
    setActionError('');
    setBusy(true);
    try {
      await work();
    } catch (cause) {
      setActionError(errorMessage(cause));
      notify(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.between, { padding: 18 }]}>
        <IconButton icon="arrow-left" label="返回" onPress={back} />
        <Text style={styles.eyebrow}>A LITTLE MEMORY</Text>
        {own ? (
          <IconButton icon="trash-2" label="删除笔记" onPress={() => { setActionError(''); setConfirm(true); }} />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>
      {!entry ? (
        <>
          <EmptyState
            title={remote.loading ? '正在寻找这段回忆…' : '暂时无法打开笔记'}
            text={remote.error || '请检查网络连接后重新加载'}
          />
          <View style={{ padding: 24 }}>
            <Button secondary label="重新加载" busy={remote.loading} onPress={() => void remote.reload()} />
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
          {!!entry.photos.length && (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {entry.photos.map((photo, index) => (
                <Pressable
                  key={index}
                  onPress={() => setPreview(index)}
                  accessibilityLabel={`查看第 ${index + 1} 张照片`}
                >
                  <PhotoImage photo={photo} style={{ width, height: 340 }} resizeMode="cover" />
                </Pressable>
              ))}
            </ScrollView>
          )}
          <View style={{ padding: 24, gap: 14 }}>
            <View style={styles.between}>
              <Text style={styles.muted}>
                {entry.author?.nickname || '旅人'} · {new Date(entry.createdAt).toLocaleDateString('zh-CN')}
              </Text>
              <Badge text={entry.visibility === 'private' ? '仅自己可见' : '公开笔记'} />
            </View>
            <Text style={styles.heading}>{entry.title}</Text>
            <Text style={[styles.text, { lineHeight: 28 }]}>{entry.body}</Text>
            <LocationLink entry={entry} />
            <Text style={styles.muted}>
              {entry.place.address}
              {'\n'}
              {entry.place.longitude.toFixed(6)}, {entry.place.latitude.toFixed(6)}
            </Text>
            {entry.photos
              .filter((photo) => photo.gps)
              .map((photo, index) => (
                <View key={index} style={[styles.card, { padding: 14, gap: 4 }]}>
                  <Text style={styles.muted}>照片拍摄位置（原始 GPS）</Text>
                  <Text style={styles.text}>
                    {photo.gps!.longitude.toFixed(6)}, {photo.gps!.latitude.toFixed(6)}
                  </Text>
                  <Text style={styles.muted}>
                    {photo.place?.address || photo.locationError || '拍摄坐标已保存'}
                    {photo.capturedAt ? '\n' + photo.capturedAt.replace('T', ' ') : ''}
                  </Text>
                </View>
              ))}
            {own && (
              <>
                <Badge
                  warm={entry.syncStatus !== 'synced'}
                  text={entry.syncStatus === 'synced' ? '手机与服务器已保存' : '已存手机，等待服务器备份'}
                />
                {!!entry.syncError && <Text style={{ color: colors.red }}>{entry.syncError}</Text>}
                <Button
                  secondary
                  label={entry.favorite ? '已收藏' : '收藏这段回忆'}
                  icon="heart"
                  busy={busy}
                  onPress={() => void action(() => toggleFavorite(id))}
                />
              </>
            )}
          </View>
        </ScrollView>
      )}
      <Modal visible={preview >= 0} transparent onRequestClose={() => setPreview(-1)}>
        <SafeAreaView
          style={{ flex: 1, backgroundColor: '#17221C', justifyContent: 'center', alignItems: 'center' }}
        >
          <IconButton
            icon="x"
            label="关闭大图"
            onPress={() => setPreview(-1)}
            style={{ position: 'absolute', top: 40, right: 22, zIndex: 2 }}
          />
          {entry?.photos[preview] && (
            <PhotoImage
              photo={entry.photos[preview]}
              style={{ width: '100%', height: '80%' }}
              resizeMode="contain"
            />
          )}
        </SafeAreaView>
      </Modal>
      <ConfirmDialog
        visible={confirm}
        text="删除这篇笔记？会移入回收站，并同步从服务器和公开列表中移除，可在「我的」恢复。"
        cancelLabel="保留笔记"
        confirmLabel="确认删除"
        busy={busy}
        error={actionError}
        cancel={() => setConfirm(false)}
        confirm={() => void action(async () => {
          await deleteEntry(id, entry || undefined);
          setConfirm(false);
          router.replace('/album');
          notify('已移入回收站，联网后同步删除');
        })}
      />
    </SafeAreaView>
  );
}
