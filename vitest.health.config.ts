import { fileURLToPath } from 'node:url';

export default {
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/healthProfile.test.tsx'], environment: 'node' },
};
