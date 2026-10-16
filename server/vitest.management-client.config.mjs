// Client request tests are isolated from the database/Redis integration setup.
export default {
  test: { include: ["tests/management-client.test.mjs"], setupFiles: [] },
};
