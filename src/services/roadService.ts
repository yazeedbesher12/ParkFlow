import type { RoadService } from './types';
import type {
  CheckpointState,
  CheckpointStatus,
  RoadEvent,
  RoadFeedItem,
  RoadSource,
  ZoneReport,
} from '@/types';
import { AppError } from '@/utils/errors';
import { createId } from '@/utils/id';
import { networkDelay } from '@/utils/async';
import { nowIso } from '@/utils/time';
import { matchCheckpoint, parseRoadStatus } from '@/utils/roadParser';
import { ZONES } from './mock/catalog';
import { CHECKPOINTS, SEED_POSTS } from './mock/roads';
import { getDb, mutate, type MockDatabase } from './mock/db';
import { awardReportPoints } from './mock/points';
import { needsZoneSeed, seedZoneReports } from './mock/community';

/**
 * Road intelligence, ported from Wusool. A checkpoint's status is whichever
 * status has the most evidence, where each report counts by source credibility
 * times freshness decay exp(-ageMinutes / 90). No recent report means "open",
 * flagged as assumed rather than claimed.
 */

const SOURCE_WEIGHT: Record<RoadSource, number> = { driver: 0.5, telegram: 0.35, whatsapp: 0.3 };
const HALF_LIFE_MIN = 90;
const WINDOW_MS = 6 * 60 * 60_000;

const ageMinutes = (iso: string, now: number) => (now - new Date(iso).getTime()) / 60_000;

function recentEvents(db: MockDatabase, now: number): RoadEvent[] {
  return db.roadEvents.filter((e) => now - new Date(e.reportedAt).getTime() < WINDOW_MS);
}

/** The feed is re-seeded whenever it has gone quiet, so the demo never shows a dead network. */
function seedRoadEvents(db: MockDatabase): void {
  const now = Date.now();
  for (const post of SEED_POSTS) {
    const checkpoint = matchCheckpoint(post.text, CHECKPOINTS);
    const status = parseRoadStatus(post.text);
    if (!checkpoint || !status) continue;
    db.roadEvents.push({
      id: createId('rev'),
      checkpointId: checkpoint.id,
      status,
      source: post.source,
      rawText: post.text,
      reportedAt: new Date(now - post.minutesAgo * 60_000).toISOString(),
    });
  }
}

export function computeCheckpointStates(db: MockDatabase): CheckpointState[] {
  const now = Date.now();
  const events = recentEvents(db, now);

  return CHECKPOINTS.map((checkpoint): CheckpointState => {
    const mine = events.filter((e) => e.checkpointId === checkpoint.id);
    if (!mine.length) return { ...checkpoint, status: 'open', assumed: true, reportCount: 0 };

    const score: Record<CheckpointStatus, number> = { open: 0, congested: 0, closed: 0 };
    for (const event of mine) {
      score[event.status] +=
        SOURCE_WEIGHT[event.source] * Math.exp(-ageMinutes(event.reportedAt, now) / HALF_LIFE_MIN);
    }
    const statuses = Object.keys(score) as CheckpointStatus[];
    const status = statuses.sort((a, b) => score[b] - score[a])[0]!;
    const newest = Math.min(...mine.map((e) => ageMinutes(e.reportedAt, now)));

    return {
      ...checkpoint,
      status,
      assumed: false,
      minutesSinceReport: Math.max(0, Math.round(newest)),
      reportCount: mine.length,
    };
  });
}

/** Current checkpoint states, seeding the feed first if it has gone quiet. */
export async function loadCheckpointStates(): Promise<CheckpointState[]> {
  const db = await getDb();
  if (!recentEvents(db, Date.now()).length) await mutate(seedRoadEvents);
  return computeCheckpointStates(await getDb());
}

function toFeedItem(event: RoadEvent): RoadFeedItem {
  const checkpoint = CHECKPOINTS.find((c) => c.id === event.checkpointId);
  return {
    ...event,
    checkpointNameAr: checkpoint?.nameAr ?? '',
    checkpointNameEn: checkpoint?.nameEn ?? '',
  };
}

export const mockRoadService: RoadService = {
  async listCheckpoints() {
    await networkDelay(120, 260);
    return loadCheckpointStates();
  },

  async feed(limit = 25) {
    await networkDelay(120, 260);
    await loadCheckpointStates();
    const db = await getDb();
    return [...db.roadEvents]
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
      .slice(0, limit)
      .map(toFeedItem);
  },

  async submitPost({ text, source = 'telegram' }) {
    await networkDelay();
    const checkpoint = matchCheckpoint(text, CHECKPOINTS);
    const status = parseRoadStatus(text);
    if (!checkpoint || !status) return { checkpoint, status };

    return mutate((db) => {
      const event: RoadEvent = {
        id: createId('rev'),
        checkpointId: checkpoint.id,
        status,
        source,
        rawText: text.trim(),
        reportedAt: nowIso(),
      };
      db.roadEvents.push(event);
      return { event: toFeedItem(event), checkpoint, status };
    });
  },

  async report({ userId, checkpointId, status }) {
    await networkDelay();
    if (!CHECKPOINTS.some((c) => c.id === checkpointId)) {
      throw new AppError('not_found', 'Checkpoint not found');
    }

    return mutate((db) => {
      const event: RoadEvent = {
        id: createId('rev'),
        checkpointId,
        status,
        source: 'driver',
        userId,
        reportedAt: nowIso(),
      };
      db.roadEvents.push(event);
      const points = awardReportPoints(db, {
        userId,
        reason: 'road_report',
        placeId: checkpointId,
        refId: event.id,
      });
      return { event: toFeedItem(event), points };
    });
  },

  async reportZone({ userId, zoneId, availability }) {
    await networkDelay();
    if (!ZONES.some((z) => z.id === zoneId)) throw new AppError('not_found', 'Parking zone not found');

    return mutate((db) => {
      if (needsZoneSeed(db)) seedZoneReports(db);
      const report: ZoneReport = {
        id: createId('zrp'),
        zoneId,
        userId,
        availability,
        reportedAt: nowIso(),
      };
      db.zoneReports.push(report);
      const points = awardReportPoints(db, {
        userId,
        reason: 'zone_report',
        placeId: zoneId,
        refId: report.id,
      });
      return { report, points };
    });
  },
};
