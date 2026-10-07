import { expect, it, vi } from "vitest";
import { hoursSchema } from "../src/modules/management/schemas";
const { api } = vi.hoisted(() => ({
  api: vi.fn(async (_path, request) => request.body),
}));
vi.mock("../../src/services/http/apiClient", () => ({
  api,
  segment: encodeURIComponent,
  query: () => "",
}));
import { managementService } from "../../src/services/http/managementService";

it("round-trips fetched weekly hours using only writable fields", async () => {
  const fetchedHours = Array.from({ length: 7 }, (_, weekday) => ({
    id: `hour-${weekday}`,
    zoneId: "managed-zone",
    weekday,
    opensAt: "08:00",
    closesAt: "18:00",
    closed: false,
  }));
  fetchedHours[1].opensAt = "09:00";
  await managementService.hours("managed-zone", 7, fetchedHours);
  const [path, options] = api.mock.calls.at(-1);
  expect(path).toBe("/management/zones/managed-zone/hours");
  expect(hoursSchema.safeParse(options.body).success).toBe(true);
  expect(options.body.hours[1]).toEqual({
    weekday: 1,
    opensAt: "09:00",
    closesAt: "18:00",
    closed: false,
  });
  expect(fetchedHours[1].id).toBe("hour-1");
});
