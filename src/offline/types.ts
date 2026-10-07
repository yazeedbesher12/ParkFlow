import type { CreateRoadReportInput } from '@/types';

export const OFFLINE_SCHEMA_VERSION = 1;

export type QueueMutation =
  | { kind: 'road-report'; payload: CreateRoadReportInput }
  | { kind: 'parking-feedback'; payload: { zoneId: string; outcome: 'found' | 'not_found' | 'delayed'; delayBucket?: string } };

export interface QueueItem extends QueueMutationBase {
  mutation: QueueMutation;
}

interface QueueMutationBase {
  idempotencyKey: string;
  userId: string;
  createdAt: string;
}

export interface FlushResult {
  sent: number;
  remaining: number;
  failed?: unknown;
}
