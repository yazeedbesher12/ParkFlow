import { beforeEach, expect, it, vi } from "vitest";
import { defaultAppConfig } from "../../src/types/appConfig";
const { published } = vi.hoisted(() => ({ published: vi.fn() }));
vi.mock("../../src/services/http/appConfigService", () => ({
  appConfigService: { published },
}));
beforeEach(() => {
  vi.resetModules();
  published.mockReset();
});
const publication = (version) => ({
  version,
  revisionId: `revision-${version}`,
  config: {
    ...defaultAppConfig,
    appName: { en: `Brand ${version}`, ar: "الهوية" },
  },
});

it("fetches the new publication after a pre-publication request is already pending", async () => {
  let resolveOld;
  published
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(publication(2));
  const { useAppConfigStore } = await import("../../src/store/appConfigStore");
  const oldRequest = useAppConfigStore.getState().refresh();
  const afterPublish = useAppConfigStore.getState().refresh({ force: true });
  resolveOld(publication(1));
  await Promise.all([oldRequest, afterPublish]);
  expect(published).toHaveBeenCalledTimes(2);
  expect(useAppConfigStore.getState().version).toBe(2);
});
it("never replaces a newer publication with an older response or schema fallback", async () => {
  const { useAppConfigStore } = await import("../../src/store/appConfigStore");
  useAppConfigStore.setState(publication(4));
  published
    .mockResolvedValueOnce(publication(3))
    .mockResolvedValueOnce(publication(0));
  await useAppConfigStore.getState().refresh();
  await useAppConfigStore.getState().refresh({ force: true });
  expect(useAppConfigStore.getState().version).toBe(4);
  expect(useAppConfigStore.getState().config.appName.en).toBe("Brand 4");
});
it("deduplicates routine refreshes while one request is pending", async () => {
  let resolve;
  published.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { useAppConfigStore } = await import("../../src/store/appConfigStore");
  const first = useAppConfigStore.getState().refresh();
  const second = useAppConfigStore.getState().refresh();
  resolve(publication(1));
  await Promise.all([first, second]);
  expect(published).toHaveBeenCalledTimes(1);
});
