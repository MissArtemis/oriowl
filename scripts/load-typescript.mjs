import vm from 'node:vm';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const appRequire = createRequire(new URL('../app/package.json', import.meta.url));
const ts = appRequire('typescript');

// Execute app/source TypeScript with Metro-style extensionless imports in Node.
// Native adapters can be substituted; production code keeps platform resolution.
export function loadTs(filename, overrides = new Map(), cache = new Map()) {
  if (overrides.has(filename)) return overrides.get(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const require = (name) => {
    if (overrides.has(name)) return overrides.get(name);
    if (!name.startsWith('.')) return appRequire(name);
    const path = resolve(dirname(filename), name);
    return loadTs(/\.tsx?$/.test(path) ? path : path + '.ts', overrides, cache);
  };
  vm.runInThisContext(`(function(exports,require,module){${code}\n})`, { filename })(module.exports, require, module);
  return module.exports;
}
