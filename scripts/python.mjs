import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function python() {
  const local = fileURLToPath(new URL(process.platform === 'win32' ? '../api/.venv/Scripts/python.exe' : '../api/.venv/bin/python', import.meta.url));
  if (existsSync(local)) return local;
  throw new Error('请先创建 Python 环境：python -m venv api/.venv，然后用该环境的 pip install -r api/requirements.txt');
}
