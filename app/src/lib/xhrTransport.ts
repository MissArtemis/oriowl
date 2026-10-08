import type { HttpOptions, HttpResponse } from './httpTransport';

export function sendXhr(url: string, options: HttpOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => {
      options.signal.removeEventListener('abort', abort);
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = () => {
      fail(new Error('请求已取消'));
      xhr.abort();
    };
    if (options.signal.aborted) return fail(new Error('请求已取消'));
    try {
      xhr.open(options.method, url, true);
      xhr.responseType = 'text';
      for (const [name, value] of Object.entries(options.headers)) xhr.setRequestHeader(name, value);
      xhr.onload = () => {
        if (settled) return;
        if (!xhr.status) return fail(new Error(xhr.responseText || 'Network request failed'));
        const status = xhr.status, body = xhr.responseText;
        settled = true;
        cleanup();
        resolve({ status, ok: status >= 200 && status < 300, text: async () => body });
      };
      xhr.onerror = () => fail(new Error(xhr.responseText || 'Network request failed'));
      xhr.onabort = () => fail(new Error('请求已取消'));
      xhr.ontimeout = () => fail(new Error('网络请求超时'));
      options.signal.addEventListener('abort', abort);
      xhr.send(options.body ?? null);
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
