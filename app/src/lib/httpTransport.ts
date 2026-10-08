export type HttpResponse = { status: number; ok: boolean; text: () => Promise<string> };
export type HttpOptions = { method: string; headers: Record<string, string>; body?: string | FormData; signal: AbortSignal };

// Web and Node use fetch. Metro selects httpTransport.native.ts on phones.
export const transportName = 'fetch';
export function sendHttp(url: string, options: HttpOptions): Promise<HttpResponse> {
  return fetch(url, options);
}
