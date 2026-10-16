const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const createConfig = require('../scripts/metro-config.cjs');
const { AbstractWatcher } = require('../node_modules/@expo/metro-file-map/build/watchers/AbstractWatcher');

const workspaceRoot = path.resolve(__dirname, '..');

for (const application of ['customer', 'management']) {
  test(`${application} Metro ignores generated output and the other frontend at the crawler and watcher boundaries`, () => {
    const projectRoot = path.join(workspaceRoot, 'apps', application);
    const config = createConfig(projectRoot);
    const ignored = new RegExp(config.resolver.blockList.map(pattern => pattern.source).join('|'));
    const otherApplication = application === 'customer' ? 'management' : 'customer';
    const excluded = [
      path.join(projectRoot, 'dist'),
      path.join(projectRoot, 'dist', '_expo', 'static', 'js', 'web', 'entry.js'),
      path.join(workspaceRoot, 'apps', otherApplication, 'app', 'index.tsx'),
      path.join(workspaceRoot, 'server', 'src', 'index.ts'),
      path.join(workspaceRoot, '.runtime', 'build.log'),
    ];
    for (const root of [projectRoot, ...config.watchFolders]) {
      const watcher = new AbstractWatcher(root, { ignored, included: [] });
      for (const file of excluded) {
        assert.equal(ignored.test(file), true, `crawler must exclude ${file}`);
        assert.equal(watcher.doIgnore(path.relative(root, file)), true, `watcher at ${root} must exclude ${file}`);
      }
      for (const file of [
        path.join(projectRoot, 'app', 'index.tsx'),
        path.join(workspaceRoot, 'packages', 'client', 'src', 'store', 'authStore.ts'),
        path.join(workspaceRoot, 'node_modules', 'zustand', 'index.js'),
      ]) {
        assert.equal(ignored.test(file), false, `crawler must include ${file}`);
        assert.equal(watcher.doIgnore(path.relative(root, file)), false, `watcher must include ${file}`);
      }
    }
  });
}
