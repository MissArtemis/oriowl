import { router } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DraftLocation } from '../components/compose/DraftLocation';
import { PhotoGrid } from '../components/compose/PhotoGrid';
import { PublishButton } from '../components/compose/PublishButton';
import { useComposeDraft } from '../lib/useComposeDraft';
import { categories } from '../lib/types';
import { Badge, Button, IconButton } from '../ui/components';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { colors, styles } from '../ui/theme';

export default function ComposeScreen() {
  const draft = useComposeDraft();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.between, { padding: 18 }]}>
        <IconButton icon="x" label="关闭发布" onPress={draft.close} />
        <Text style={[styles.text, { fontWeight: '700' }]}>留下一段旅程</Text>
        <Badge text={`${draft.photos.length}/9 照片`} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="always" contentContainerStyle={{ padding: 22, gap: 16 }}>
          <View style={[styles.row, { gap: 12 }]}>
            <Button
              secondary
              label="从相册添加"
              icon="image"
              onPress={() => void draft.pick('library')}
              busy={draft.busy}
              style={{ flex: 1 }}
            />
            <Button
              secondary
              label="拍照"
              icon="camera"
              onPress={() => void draft.pick('camera')}
              disabled={draft.busy}
            />
          </View>
          <Button
            secondary
            label="导入原图 · 读取拍摄地点"
            icon="folder"
            onPress={() => void draft.pick('original')}
            disabled={draft.busy}
          />
          <Text style={styles.muted}>相册未读到位置时，可从手机存储 DCIM/Camera 选择相机原图。</Text>
          <PhotoGrid photos={draft.photos} remove={draft.removePhoto} choose={draft.choosePlace} />
          <TextInput
            accessibilityLabel="笔记标题"
            placeholder="给这段回忆起个名字（可选）"
            value={draft.title}
            onChangeText={draft.setTitle}
            maxLength={60}
            style={[styles.input, { fontSize: 18, fontWeight: '600' }]}
          />
          <TextInput
            accessibilityLabel="笔记正文"
            placeholder="写下今天的风景、心情，或者推荐一处小店…"
            value={draft.body}
            onChangeText={draft.setBody}
            maxLength={5000}
            multiline
            textAlignVertical="top"
            style={[styles.input, { minHeight: 150, lineHeight: 24 }]}
          />
          <DraftLocation
            place={draft.place}
            current={draft.currentPlace}
            photoPlace={draft.photos.find((photo) => photo.place)?.place}
            choose={draft.choosePlace}
          />
          <View style={[styles.row, { gap: 8 }]}>
            {categories.map((item) => (
              <Pressable
                key={item}
                accessibilityRole="button"
                hitSlop={4}
                style={styles.tapTarget}
                onPress={() => draft.setCategory(item)}
              >
                <Badge text={item} warm={draft.category !== item} />
              </Pressable>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => draft.setVisibility((v) => (v === 'public' ? 'private' : 'public'))}
            style={[styles.between, styles.tapTarget]}
          >
            <Text style={styles.text}>可见范围</Text>
            <Badge text={draft.visibility === 'public' ? '公开 · 分享到社交' : '私密 · 仅自己可见'} />
          </Pressable>
          <Text style={styles.muted}>
            笔记与原图各保留一份在手机和服务器。公开后，其他用户可以查看照片和地点。
          </Text>
        </ScrollView>
        <View collapsable={false} style={{ padding: 18, gap: 10, flexShrink: 0, zIndex: 10,
          borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper }}>
          {!!draft.error && <Text accessibilityLiveRegion="polite" style={{ color: colors.red }}>{draft.error}</Text>}
          <PublishButton
            busy={draft.busy}
            publish={() => void draft.publish()}
          />
        </View>
      </KeyboardAvoidingView>
      <ConfirmDialog
        visible={draft.discard}
        text="放弃这篇未发布的笔记？"
        cancelLabel="继续编辑"
        confirmLabel="放弃草稿"
        cancel={() => draft.setDiscard(false)}
        confirm={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/');
        }}
      />
    </SafeAreaView>
  );
}
