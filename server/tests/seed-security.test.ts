import { beforeEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { db } from '../src/database/client';

const executeFile = promisify(execFile);
const knownCameraHash = createHash('sha256').update('pfg_dev_camera_key').digest('hex');
const demoPeople = [
  { id: 'demo-host-lina', email: 'lina.demo@parkflow.local' },
  { id: 'demo-host-omar', email: 'omar.demo@parkflow.local' },
  { id: 'demo-host-sara', email: 'sara.demo@parkflow.local' },
  { id: 'demo-driver', email: 'demo@parkflow.ps' },
];

async function runSeed(overrides: Record<string, string> = {}) {
  const fixture: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'development',
    // Do not let a developer's private .env opt the child process into other seeding.
    DOTENV_CONFIG_PATH: resolve('tests/.seed-security-no-env'),
    SEED_ADMIN_EMAIL: '',
    SEED_GATE_DEVICE_KEY: '',
  };
  delete fixture.SEED_SHARING_DEMO;
  Object.assign(fixture, overrides);
  try {
    const result = await executeFile(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], {
      env: fixture,
      timeout: 20000,
      encoding: 'utf8',
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const result = error as { code?: number | string; stdout?: string; stderr?: string };
    return { exitCode: result.code ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }
}

async function createUnrelatedAccount(email: string) {
  return db.user.create({ data: {
    id: 'existing-customer',
    email,
    fullName: 'Existing Customer',
    firstName: 'Existing',
    gender: 'male',
    role: 'USER',
    wallet: { create: { balance: 1250 } },
  } });
}

async function expectUnrelatedAccountUnchanged() {
  expect(await db.user.findUnique({ where: { id: 'existing-customer' }, select: {
    role: true, fullName: true, firstName: true, gender: true, emailVerifiedAt: true,
  } })).toEqual({ role: 'USER', fullName: 'Existing Customer', firstName: 'Existing', gender: 'male', emailVerifiedAt: null });
  expect(await db.wallet.findUnique({ where: { userId: 'existing-customer' }, select: { balance: true } })).toEqual({ balance: 1250 });
  expect(await db.userVehicle.count({ where: { userId: 'existing-customer' } })).toBe(0);
  expect(await db.walletTransaction.count()).toBe(0);
}

beforeEach(async () => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')) throw new Error('Refusing a non-test database');
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map(t => '"' + t.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
});

describe('sharing demo seed security', () => {
  it('leaves an existing demo-email customer untouched and creates no sharing fixtures or camera by default', async () => {
    await createUnrelatedAccount('demo@parkflow.ps');
    const result = await runSeed();
    expect(result.exitCode).toBe(0);
    await expectUnrelatedAccountUnchanged();
    expect(await db.user.count({ where: { id: { in: demoPeople.map(person => person.id) } } })).toBe(0);
    expect(await db.ride.count()).toBe(0);
    expect(await db.hostSpot.count()).toBe(0);
    expect(await db.gateDevice.count()).toBe(0);
    expect(await db.gateDevice.findUnique({ where: { keyHash: knownCameraHash } })).toBeNull();
    // The ordinary catalog and non-production road-report fixtures still run.
    expect(await db.parkingZone.count()).toBeGreaterThan(0);
    expect(await db.roadReport.count({ where: { isDemo: true } })).toBe(4);
  });

  it.each(['test', 'production', 'staging', ''])('ignores sharing opt-in outside development (%s)', async nodeEnv => {
    await createUnrelatedAccount('demo@parkflow.ps');
    const result = await runSeed({ NODE_ENV: nodeEnv, SEED_SHARING_DEMO: 'true', SEED_GATE_DEVICE_KEY: randomBytes(16).toString('hex') });
    expect(result.exitCode).toBe(0);
    await expectUnrelatedAccountUnchanged();
    expect(await db.user.count({ where: { id: { in: demoPeople.map(person => person.id) } } })).toBe(0);
    expect(await db.ride.count()).toBe(0);
    expect(await db.hostSpot.count()).toBe(0);
    expect(await db.gateDevice.count()).toBe(0);
  });

  it.each(demoPeople)('refuses to reuse $email when its account has a different ID', async person => {
    await createUnrelatedAccount(person.email);
    const result = await runSeed({ SEED_SHARING_DEMO: 'true' });
    await expectUnrelatedAccountUnchanged();
    expect(result.exitCode).not.toBe(0);
    expect(await db.user.findUnique({ where: { id: person.id } })).toBeNull();
    expect(await db.ride.count({ where: { driverId: 'existing-customer' } })).toBe(0);
    expect(await db.hostSpot.count({ where: { hostId: 'existing-customer' } })).toBe(0);
  });

  it('seeds the development demo for its expected account and credits it only once without creating a camera', async () => {
    await db.user.create({ data: {
      id: 'demo-driver', email: 'demo@parkflow.ps', fullName: 'Previous Demo', gender: 'male', role: 'USER',
      wallet: { create: { balance: 1250 } },
    } });
    expect((await runSeed({ SEED_SHARING_DEMO: 'true' })).exitCode).toBe(0);
    expect((await runSeed({ SEED_SHARING_DEMO: 'true' })).exitCode).toBe(0);
    expect(await db.user.findUnique({ where: { id: 'demo-driver' }, select: { email: true, fullName: true, role: true, gender: true } })).toEqual({
      email: 'demo@parkflow.ps', fullName: 'Demo Driver', role: 'ADMIN', gender: 'female',
    });
    expect(await db.wallet.findUnique({ where: { userId: 'demo-driver' }, select: { balance: true } })).toEqual({ balance: 21250 });
    expect(await db.walletTransaction.count({ where: { reference: 'demo-credit:demo-driver' } })).toBe(1);
    expect(await db.userVehicle.count({ where: { userId: 'demo-driver' } })).toBe(1);
    expect(await db.ride.count()).toBe(5);
    expect(await db.hostSpot.count()).toBe(4);
    expect(await db.gateDevice.count()).toBe(0);
  });

  it('skips the demo camera when the supplied device credential is shorter than 32 characters', async () => {
    expect((await runSeed({ SEED_SHARING_DEMO: 'true', SEED_GATE_DEVICE_KEY: 'x'.repeat(31) })).exitCode).toBe(0);
    expect(await db.ride.count()).toBe(5);
    expect(await db.gateDevice.count()).toBe(0);
  });

  it('creates the demo camera only from an explicitly supplied private credential and never prints it', async () => {
    const key = randomBytes(16).toString('hex');
    const result = await runSeed({ SEED_SHARING_DEMO: 'true', SEED_GATE_DEVICE_KEY: key });
    expect(result.exitCode).toBe(0);
    expect(await db.gateDevice.findUnique({ where: { keyHash: createHash('sha256').update(key).digest('hex') }, select: {
      parkingZoneId: true, kind: true, active: true,
    } })).toEqual({ parkingZoneId: 'zone_municipality', kind: 'camera', active: true });
    expect(await db.gateDevice.count()).toBe(1);
    expect(await db.gateDevice.findUnique({ where: { keyHash: knownCameraHash } })).toBeNull();
    expect(result.stdout).not.toContain(key);
    expect(result.stderr).not.toContain(key);
  });
});