import QRCode from 'qrcode';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

export async function printQr(host) {
  // Expo manifests requested through localhost advertise a loopback host. Phones need the LAN address.
  const lanAddress = Object.values(networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal)?.address;
  const address = host && !/^(localhost|127\.|0\.0\.0\.0|\[?::1\]?$)/i.test(host) ? host : lanAddress;
  if (!address) throw new Error('未找到局域网 IPv4 地址，请先连接 Wi-Fi');
  const url = `exp://${address}:8081`;
  const path = fileURLToPath(new URL('../scan-to-open.png', import.meta.url));
  await QRCode.toFile(path, url, { width: 420, margin: 3, color: { dark: '#263E33', light: '#FFFFFF' } });
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
  console.log(`Expo Go: ${url}`);
  console.log(`QR image: ${path}`);
  return { url, path };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await printQr(process.argv[2]);
