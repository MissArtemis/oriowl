import { Image } from 'react-native';

// Bound file-provider work after selection; the system picker itself stays open
// until the user confirms/cancels and is never subject to an import timeout.
export async function photoReadTimeout<T>(operation: Promise<T>, message: string, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export function originalImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ width: 0, height: 0 }), 3000);
    const finish = (width: number, height: number) => { clearTimeout(timer); resolve({ width, height }); };
    try { Image.getSize(uri, finish, () => finish(0, 0)); }
    catch { finish(0, 0); }
  });
}
