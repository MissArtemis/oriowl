import { sendHttp, transportName } from './httpTransport';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Options = { method?: string; body?: unknown; timeout?: number; signal?: AbortSignal; transport?: 'global-fetch' };

function underlyingError(error: unknown) {
  const parts: string[] = [];
  let current = error;
  for (let depth = 0; current && depth < 3; depth++) {
    if (current instanceof Error) {
      parts.push(`${current.name}: ${current.message}`);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return parts.join('；').replace(/Bearer\s+\S+/gi, 'Bearer [隐藏]').replace(/(https?:\/\/[^\s?]+)\?[^\s]*/g, '$1?[隐藏]').slice(0, 400);
}

export async function request<T>(
  base: string,
  path: string,
  token: string | null = null,
  options: Options = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 20000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort);
  if (options.signal?.aborted) controller.abort();
  const form = options.body instanceof FormData;
  const engine = options.transport === 'global-fetch' ? 'global fetch' : transportName;
  let phase = '发送请求';
  let receivedStatus = 0;
  try {
    const send = options.transport === 'global-fetch' ? fetch : sendHttp;
    const response = await send(base + path, {
      method: options.method || 'GET',
      signal: controller.signal,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(!form && options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? (form ? (options.body as FormData) : JSON.stringify(options.body)) : undefined,
    });
    receivedStatus = response.status;
    phase = '读取响应';
    const text = await response.text();
    let data: { detail?: unknown } | undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new ApiError(`接口 ${path} 返回 HTTP ${response.status}，但内容不是 JSON。请检查服务地址或电脑后端日志`, response.status);
      }
    }
    if (!response.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail : `接口 ${path} 返回 HTTP ${response.status}，请检查填写内容或电脑后端日志`;
      throw new ApiError(detail, response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const endpoint = path.split('?')[0];
    if (controller.signal.aborted) throw new ApiError(`请求 ${base}${endpoint} 已取消或超时（${engine} · ${phase}）`, receivedStatus);
    throw new ApiError(`请求 ${base}${endpoint} 失败（${engine} · ${phase}${receivedStatus ? ' · HTTP ' + receivedStatus : ''}）：${underlyingError(error)}`, receivedStatus);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : '操作失败，请重试');
