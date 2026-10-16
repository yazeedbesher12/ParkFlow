const path = require('node:path');
require('./apply-frontend-security-patches.cjs').run({ verifyOnly: true });
const { getDefaultConfig } = require('expo/metro-config');

module.exports = function createFrontendMetroConfig(projectRoot) {
  const config = getDefaultConfig(projectRoot);
  const workspaceRoot = path.resolve(projectRoot, '../..');
  const otherFrontend = path.basename(projectRoot) === 'customer' ? 'management' : 'customer';
  const generatedOrUnrelated = [
    path.join(projectRoot, 'dist'),
    path.join(workspaceRoot, 'apps', otherFrontend),
    path.join(workspaceRoot, 'server'),
    path.join(workspaceRoot, '.runtime'),
    path.join(workspaceRoot, '.superpowers'),
    path.join(workspaceRoot, 'docs'),
  ];
  config.watchFolders = config.watchFolders.filter(root => !generatedOrUnrelated.some(directory =>
    root === directory || root.startsWith(directory + path.sep)));
  const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const watchRoots = [projectRoot, ...config.watchFolders];
  // The crawler tests absolute paths. FallbackWatcher tests paths relative to
  // each watched root and normalizes Windows separators to forward slashes.
  const patterns = new Set(generatedOrUnrelated.flatMap(directory => [
    directory, ...watchRoots.map(root => path.relative(root, directory)),
  ]).filter(Boolean));
  const blocks = [...patterns].map(directory => {
    const portablePath = directory.split(/[\\/]/).map(escaped).join('[\\\\/]');
    return new RegExp(`^${portablePath}(?:[\\\\/].*)?$`);
  });
  const previous = config.resolver.blockList;
  // Each app watches its own sources and the shared packages. Native/Web exports
  // and unrelated backend work must not enter Metro's Windows fallback watcher.
  config.resolver.blockList = [...(Array.isArray(previous) ? previous : previous ? [previous] : []), ...blocks];
  return config;
};
