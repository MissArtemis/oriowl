import { spawnSync } from 'node:child_process';
import { python, root } from './python.mjs';

const result = spawnSync(python(), ['-m', 'unittest', 'discover', '-s', 'tests', '-v'], {
  cwd: `${root}/api`, stdio: 'inherit', windowsHide: true,
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
