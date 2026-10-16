const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const serverDirectory = path.resolve(__dirname, '..', 'server');
const vitest = path.join(serverDirectory, 'node_modules', 'vitest', 'vitest.mjs');
const temporaryDirectory = path.resolve(__dirname, '..', '.runtime', 'client-contracts-temp');
fs.mkdirSync(temporaryDirectory, { recursive: true });
const configurations = [
  'vitest.management-client.config.mjs',
  'vitest.app-config.config.mjs',
  'vitest.app-config-store.config.mjs',
];

let exitCode = 0;
for (const configuration of configurations) {
  const result = spawnSync(process.execPath, [vitest, 'run', '--config', configuration, '--maxWorkers', '1'], {
    cwd: serverDirectory,
    stdio: 'inherit',
    // Keep Vitest's atomic cache writes in a writable, ignored local directory.
    env: { ...process.env, TEMP: temporaryDirectory, TMP: temporaryDirectory, TMPDIR: temporaryDirectory },
  });
  if (result.error) console.error(result.error.message);
  const status = result.status ?? 1;
  if (status !== 0 && exitCode === 0) exitCode = status;
}
process.exitCode = exitCode;
