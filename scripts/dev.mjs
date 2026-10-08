import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { printQr } from '../app/scripts/qr.mjs';
import { python } from './python.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
async function probe(url, json = true) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return json ? await response.json() : await response.text();
  } catch { return null; }
}
function start(script, args, cwd, executable = process.execPath) {
  const child = spawn(executable, [script, ...args], { cwd, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(error.message); shutdown(1); });
  child.on('exit', code => { if (code !== null && code !== 0) shutdown(code); });
}
function shutdown(code = 0) {
  for (const child of children) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

const api = await probe('http://localhost:8787/health');
if (api && api.service !== 'oriowl-map-api') throw new Error('8787 端口已被其他服务占用，请先检查端口');
if (api && api.backend !== 'fastapi') throw new Error('8787 端口仍在运行旧版服务，请停止该项目的旧服务后重新启动');
if (!api) start(fileURLToPath(new URL('../api/run.py', import.meta.url)), [], root, python());

const metro = await probe('http://localhost:8081/status', false);
if (metro?.includes('packager-status:running')) {
  const manifest = await fetch('http://localhost:8081', { headers: { 'expo-platform': 'android', accept: 'application/expo+json' }, signal: AbortSignal.timeout(5000) }).then(r => r.json());
  if (manifest.extra?.expoClient?.slug !== 'oriowl-travel-journal') throw new Error('8081 端口正在运行其他 Expo 项目');
  console.log('Reusing the running OwlTrace Expo server.');
} else {
  start(fileURLToPath(new URL('../app/node_modules/expo/bin/cli', import.meta.url)), ['start', '--lan', '--port', '8081'], fileURLToPath(new URL('../app/', import.meta.url)));
}
for (let attempt = 0; attempt < 40; attempt++) {
  if ((await probe('http://localhost:8081/status', false))?.includes('packager-status:running') && (await probe('http://localhost:8787/health'))?.ok) {
    const manifest = await fetch('http://localhost:8081', { headers: { 'expo-platform': 'android', accept: 'application/expo+json' }, signal: AbortSignal.timeout(5000) }).then(r => r.json());
    const host = manifest.extra?.expoClient?.hostUri?.split(':')[0];
    await printQr(host);
    console.log('手机与电脑连接同一 Wi-Fi，用支持 SDK 57 的 Expo Go 扫码。');
    if (children.length) await new Promise(() => {});
    break;
  }
  if (attempt === 39) shutdown(1);
  await new Promise(resolve => setTimeout(resolve, 1000));
}
