import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { db } from '../src/database/client';
import * as auth from '../src/modules/auth/service';
import { emailProvider } from '../src/providers/email';
import { defaultAppConfig } from '../src/modules/appConfig/schema';

const app = createApp();
let token: string;
let driverToken: string;
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(emailProvider, 'sendOtp').mockResolvedValue();
  await db.appConfigState.deleteMany();
  await db.appConfigRevision.deleteMany();
  await db.auditLog.deleteMany({ where: { resourceType: 'app-config' } });
  async function signIn(role: 'ADMIN' | 'USER') {
    const challenge = await auth.requestOtp({ email: `appearance-${role}-${Date.now()}-${Math.random()}@example.com` });
    const code = vi.mocked(emailProvider.sendOtp).mock.calls.at(-1)![1];
    const result = await auth.verifyOtp({ challengeId: challenge.challengeId, code }, {});
    await db.user.update({ where: { id: result.user.id }, data: { role } });
    return result.session.accessToken;
  }
  token = await signIn('ADMIN');
  driverToken = await signIn('USER');
});
const config = (name: string) => ({ ...defaultAppConfig, appName: { en: name, ar: 'باركفلو' } });
const save = (version: number, name: string) => request(app).patch('/api/v1/admin/app-config/draft').auth(token, { type: 'bearer' }).send({ expectedVersion: version, config: config(name) });
const publish = (version: number, revisionId: string) => request(app).post('/api/v1/admin/app-config/publish').auth(token, { type: 'bearer' }).send({ expectedVersion: version, revisionId, reason: 'Reviewed both language previews' });

describe('appearance publication lifecycle', () => {
  it('serves safe defaults anonymously and denies non-admin reads and writes', async () => {
    expect((await request(app).get('/api/v1/app-config')).body.config.appName.en).toBe('ParkFlow');
    for (const path of ['/api/v1/admin/app-config', '/api/v1/admin/app-config/history']) {
      expect((await request(app).get(path)).status).toBe(401);
      expect((await request(app).get(path).auth(driverToken, { type: 'bearer' })).status).toBe(403);
    }
    expect((await request(app).patch('/api/v1/admin/app-config/draft').auth(driverToken, { type: 'bearer' }).send({ expectedVersion: 0, config: config('Hidden') })).status).toBe(403);
    for (const endpoint of ['publish', 'rollback']) {
      expect((await request(app).post(`/api/v1/admin/app-config/${endpoint}`).auth(driverToken, { type: 'bearer' }).send({ expectedVersion: 0, revisionId: '00000000-0000-4000-8000-000000000000', reason: 'Unauthorized publication' })).status).toBe(403);
    }
  });
  it('keeps drafts private and publishes a separate immutable revision with an audit', async () => {
    const draft = await save(0, 'New public name');
    expect(draft.status).toBe(200);
    expect((await request(app).get('/api/v1/app-config')).body.config.appName.en).toBe('ParkFlow');
    const published = await publish(1, draft.body.draftRevisionId);
    expect(published.status).toBe(200);
    expect(published.body.publishedRevisionId).not.toBe(draft.body.draftRevisionId);
    expect((await request(app).get('/api/v1/app-config')).body.config.appName.en).toBe('New public name');
    expect((await db.appConfigRevision.findUniqueOrThrow({ where: { id: draft.body.draftRevisionId } })).publishedAt).toBeNull();
    expect(await db.auditLog.count({ where: { resourceType: 'app-config', action: 'publish' } })).toBe(1);
  });
  it('rejects stale saves and publishing an older draft', async () => {
    const first = await save(0, 'First');
    expect((await save(0, 'Lost update')).status).toBe(409);
    expect((await save(1, 'Second')).status).toBe(200);
    expect((await publish(2, first.body.draftRevisionId)).status).toBe(409);
    expect((await request(app).get('/api/v1/app-config')).body.config.appName.en).toBe('ParkFlow');
  });
  it('allows exactly one concurrent save against the same version', async () => {
    const results = await Promise.all([save(0, 'A'), save(0, 'B')]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await db.appConfigRevision.count()).toBe(1);
  });
  it('rolls back by publishing a new revision without changing history', async () => {
    const draftA = await save(0, 'A');
    const a = await publish(1, draftA.body.draftRevisionId);
    const original = await db.appConfigRevision.findUniqueOrThrow({ where: { id: a.body.publishedRevisionId } });
    const draftB = await save(2, 'B');
    await publish(3, draftB.body.draftRevisionId);
    const rollback = await request(app).post('/api/v1/admin/app-config/rollback').auth(token, { type: 'bearer' }).send({ expectedVersion: 4, revisionId: original.id, reason: 'Restore previous reviewed appearance' });
    expect(rollback.status).toBe(200);
    expect(rollback.body.publishedRevisionId).not.toBe(original.id);
    expect((await request(app).get('/api/v1/app-config')).body.config.appName.en).toBe('A');
    expect(await db.appConfigRevision.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
    expect(await db.auditLog.count({ where: { resourceType: 'app-config', action: 'rollback' } })).toBe(1);
  });
  it('rejects unsafe payloads and rollback to an unpublished draft', async () => {
    const bad = await request(app).patch('/api/v1/admin/app-config/draft').auth(token, { type: 'bearer' }).send({ expectedVersion: 0, config: { ...defaultAppConfig, logoUrl: 'javascript:alert(1)' } });
    expect(bad.status).toBe(400);
    expect(await db.appConfigRevision.count()).toBe(0);
    const draft = await save(0, 'Draft');
    const rollback = await request(app).post('/api/v1/admin/app-config/rollback').auth(token, { type: 'bearer' }).send({ expectedVersion: 1, revisionId: draft.body.draftRevisionId, reason: 'Not yet published' });
    expect(rollback.status).toBe(400);
  });
  it('does not leak author details and falls back for unsupported stored versions', async () => {
    const draft = await save(0, 'Supported');
    const published = await publish(1, draft.body.draftRevisionId);
    const publicValue = (await request(app).get('/api/v1/app-config')).body;
    expect(Object.keys(publicValue).sort()).toEqual(['config', 'revisionId', 'version']);
    // Simulates data from a future deployment; the public response must stay safe.
    await db.appConfigRevision.update({ where: { id: published.body.publishedRevisionId }, data: { payload: { schemaVersion: 999, secret: 'must-not-leak' } } });
    const fallback = await request(app).get('/api/v1/app-config');
    expect(fallback.body).toEqual({ version: 0, revisionId: null, config: defaultAppConfig });
  });
});
