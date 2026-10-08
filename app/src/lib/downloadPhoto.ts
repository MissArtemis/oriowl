import * as FileSystem from 'expo-file-system/legacy';

export async function downloadPhoto(url: string, uri: string, token: string) {
  const task = FileSystem.createDownloadResumable(url, uri, {
    headers: { Authorization: 'Bearer ' + token },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      task.downloadAsync(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void task.cancelAsync().catch(() => {});
          reject(new Error('照片下载超时，请检查网络后重试'));
        }, 60000);
      }),
    ]);
    if (result?.status !== 200) throw new Error('照片下载失败，请重试');
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
