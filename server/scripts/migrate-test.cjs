const { execFileSync } = require('node:child_process');
require('dotenv').config({ quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('A dedicated TEST_DATABASE_URL ending in _test is required');
}
execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit',
});
