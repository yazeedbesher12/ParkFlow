// Pure validation tests deliberately avoid database/Redis setup.
export default { test: { include: ['tests/app-config-schema.test.ts', 'tests/app-config-client.test.mjs'] } };
