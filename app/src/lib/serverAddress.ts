export function apiFromHost(host: string | undefined) {
  if (!host) return undefined;
  try {
    const address = host.includes('://') ? host.replace(/^[a-z][a-z\d+.-]*:\/\//i, 'http://') : 'http://' + host;
    const url = new URL(address);
    if (!url.hostname || url.username || url.password) return undefined;
    return `http://${url.hostname}:${url.port || '8081'}`;
  } catch {
    return undefined;
  }
}

export function deviceApiUrl(hosts: (string | undefined)[]) {
  const candidates = hosts.map(apiFromHost).filter((value): value is string => !!value);
  return candidates.find((value) => !isLoopbackServer(value)) || candidates[0];
}

export function isLoopbackServer(value: string) {
  const host = new URL(value).hostname;
  return ['localhost', '0.0.0.0', '[::1]', '::1'].includes(host) || host.startsWith('127.');
}

export function isLanDevServer(value: string) {
  const url = new URL(value),
    parts = url.hostname.split('.').map(Number);
  return (
    url.protocol === 'http:' &&
    ['8787', '8081'].includes(url.port) &&
    url.pathname === '/' &&
    (isLoopbackServer(value) ||
      parts[0] === 10 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31))
  );
}

export function preferredDevServer(stored: string, detected: string, nativeDev: boolean) {
  if (nativeDev && isLanDevServer(detected) && new URL(detected).port === '8081' &&
      (isLanDevServer(stored) || isLoopbackServer(stored))) return detected;
  return stored;
}

// Expo's 8081 gateway forwards to this same computer's 8787 FastAPI server.
export function sameDevBackend(from: string, to: string) {
  try {
    const old = new URL(from), next = new URL(to);
    return isLanDevServer(from) && isLanDevServer(to) && old.hostname === next.hostname &&
      old.port === '8787' && next.port === '8081';
  } catch {
    return false;
  }
}
