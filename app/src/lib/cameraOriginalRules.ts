// Accept the camera directory itself, never its parent, a look-alike, or a
// nested directory. Volume IDs also allow a removable SD card's Camera folder.
function safIds(uri: string) {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'content:' || url.hostname !== 'com.android.externalstorage.documents' || url.search || url.hash) return;
    const tree = url.pathname.match(/^\/tree\/([^/]+)(?:\/document\/([^/]+))?$/);
    if (tree) return { tree: decodeURIComponent(tree[1]), document: tree[2] ? decodeURIComponent(tree[2]) : undefined };
    // ACTION_OPEN_DOCUMENT returns a document URI rather than a granted tree.
    const document = url.pathname.match(/^\/document\/([^/]+)$/);
    if (document) return { tree: undefined, document: decodeURIComponent(document[1]) };
  } catch { return; }
}

export function isCameraDirectory(uri: string) {
  const ids = safIds(uri);
  return !!ids?.tree && /^[a-zA-Z\d-]+:DCIM\/Camera$/.test(ids.tree) && (!ids.document || ids.document === ids.tree);
}

export function cameraPhotoName(uri: string): string | undefined {
  const ids = safIds(uri);
  if (!ids || (ids.tree && !isCameraDirectory(`content://com.android.externalstorage.documents/tree/${encodeURIComponent(ids.tree)}`))) return;
  const match = ids.document?.match(/^([a-zA-Z\d-]+:DCIM\/Camera)\/([^/]+)$/);
  if (!match || (ids.tree && ids.tree !== match[1])) return;
  const name = match[2];
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.') || !/\.(jpe?g|png|webp|heic|heif)$/i.test(name)) return;
  return name;
}

export function originalImageMime(bytes: Uint8Array): string | undefined {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) return 'image/png';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  if (text(4, 8) === 'ftyp') {
    const brands = [text(8, 12)];
    for (let index = 16; index + 4 <= bytes.length; index += 4) brands.push(text(index, index + 4));
    if (brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand))) return 'image/heic';
  }
}

export function originalImageMimeFromBase64(encoded: string) {
  // Hermes does not guarantee a browser atob global. Decode only the 64-byte
  // file header ourselves instead of loading/re-encoding the full photo.
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let value = 0, bits = 0;
  for (const letter of encoded.replace(/\s/g, '')) {
    if (letter === '=') break;
    const digit = alphabet.indexOf(letter);
    if (digit < 0) return;
    value = (value << 6) | digit;
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); }
  }
  return originalImageMime(new Uint8Array(bytes));
}
