export async function downloadPhoto(url: string, token: string): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('照片下载失败，请重试');
    return await response.blob();
  } catch (error) {
    if (controller.signal.aborted) throw new Error('照片下载超时，请检查网络后重试');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
