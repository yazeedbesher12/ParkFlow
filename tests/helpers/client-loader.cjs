const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const projectRoot = path.resolve(__dirname, '../..');

function resolveWorkspace(id) {
  const match = /^@parkflow\/([^/]+)(.*)$/.exec(id);
  if (!match) return undefined;
  const packageRoot = path.join(projectRoot, 'packages', match[1]);
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const entry = manifest.exports[match[2] ? `.${match[2]}` : '.'];
  if (typeof entry !== 'string') throw new Error(`Missing workspace export for ${id}`);
  return resolveSource(path.resolve(packageRoot, entry));
}

function resolveSource(filename) {
  for (const candidate of [filename, `${filename}.ts`, `${filename}.tsx`, path.join(filename, 'index.ts'), path.join(filename, 'index.tsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve client test source ${filename}`);
}

// Each loader models a separate frontend bundle: local production modules are
// isolated, while React/Zustand and explicitly supplied external boundaries stay real.
function createClientLoader({ application = 'customer', stubs = {} } = {}) {
  const modules = new Map();
  const boundaries = {
    'expo-constants': { expoConfig: { extra: { parkflowApplication: application } } },
    ...stubs,
  };
  const sourceBoundaries = new Map(Object.entries(stubs)
    .filter(([id]) => id.startsWith('@parkflow/'))
    .map(([id, value]) => [resolveWorkspace(id), value]));

  function load(relative) {
    const filename = resolveWorkspace(relative) ?? resolveSource(path.resolve(projectRoot, relative));
    if (sourceBoundaries.has(filename)) return sourceBoundaries.get(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    if (filename.endsWith('.json')) return JSON.parse(fs.readFileSync(filename, 'utf8'));
    const loaded = new Module(filename, module);
    loaded.filename = filename;
    loaded.paths = Module._nodeModulePaths(path.dirname(filename));
    modules.set(filename, loaded);
    const originalRequire = loaded.require.bind(loaded);
    loaded.require = id => {
      if (Object.hasOwn(boundaries, id)) return boundaries[id];
      if (id.startsWith('@parkflow/')) return load(id);
      if (id.startsWith('@/')) return load(`apps/${application}/src/${id.slice(2)}`);
      if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id));
      return originalRequire(id);
    };
    loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText, filename);
    return loaded.exports;
  }

  return load;
}

module.exports = { createClientLoader };
