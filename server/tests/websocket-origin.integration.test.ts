import { describe, expect, it, vi } from 'vitest';
import { createServer, request as httpRequest } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { db, atomic } from '../src/database/client';
import { issue } from '../src/modules/auth/service';
import { emailProvider } from '../src/providers/email';
import { attachSockets } from '../src/realtime/socket';

async function upgrade(origin?: string) {
  const server = createServer();
  const sockets = attachSockets(server);
  // Allow the Redis adapter's queued subscriptions to finish before a fast
  // upgrade rejection closes the adapter and its connections.
  const adapter = sockets.io.of('/').adapter as unknown as {
    pubClient: { ping(): Promise<unknown> }; subClient: { ping(): Promise<unknown> };
  };
  await Promise.all([adapter.pubClient.ping(), adapter.subClient.ping()]);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    return await new Promise<number>((resolve, reject) => {
      const req = httpRequest({ host: '127.0.0.1', port, path: '/socket.io/?EIO=4&transport=websocket', headers: {
        Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': randomBytes(16).toString('base64'), ...(origin ? { Origin: origin } : {}),
      } });
      req.on('upgrade', (response, connection) => { connection.destroy(); resolve(response.statusCode!); });
      req.on('response', response => { response.resume(); resolve(response.statusCode!); });
      req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Upgrade timeout'))); req.end();
    });
  } finally { await sockets.close(); }
}

describe('actual WebSocket upgrade Origin gate', () => {
  it('rejects an untrusted browser before upgrading, independently of polling CORS', async () => {
    // Engine.IO uses HTTP 400 for a denied WebSocket upgrade (polling uses 403).
    expect(await upgrade('https://untrusted.invalid')).toBe(400);
  });
  it('preserves native and trusted browser upgrades before namespace authentication', async () => {
    expect(await upgrade()).toBe(101);
    expect(await upgrade('http://localhost:8081')).toBe(101);
  });
});

it('authenticates actual web namespaces with cookie/session/CSRF proof and retains native sockets', async () => {
  const app = createApp(), server = createServer(app), sockets = attachSockets(server);
  const adapter = sockets.io.of('/').adapter as unknown as { pubClient: { ping(): Promise<unknown> }; subClient: { ping(): Promise<unknown> } };
  await Promise.all([adapter.pubClient.ping(), adapter.subClient.ping()]);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const user = await db.user.create({ data: { email: `socket-${randomUUID()}@example.com`, fullName: 'Socket test', emailVerifiedAt: new Date(), profileCompletedAt: new Date() } });
  const delivered: string[] = [];
  const sending = vi.spyOn(emailProvider, 'sendOtp').mockImplementation(async (_email, code) => { delivered.push(code); });
  const headers = { Origin: 'http://localhost:8081', 'X-ParkFlow-App': 'customer' };
  const cookies = new Map<string, string>();
  const absorb = (response: any) => { for (const line of response.headers['set-cookie'] ?? []) { const pair = line.split(';')[0], at = pair.indexOf('='); cookies.set(pair.slice(0, at), pair.slice(at + 1)); } };
  const cookie = () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  const connect = (auth: unknown, browser = false) => new Promise<string>((resolve, reject) => {
    // ws is the same WebSocket implementation used by Engine.IO in the server.
    const WebSocket = require('ws');
    const socket = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`, { headers: browser ? { Origin: headers.Origin, Cookie: cookie() } : {} });
    const timeout = setTimeout(() => { socket.terminate(); reject(new Error('Namespace authentication timeout')); }, 5000);
    socket.on('error', (error: Error) => { clearTimeout(timeout); reject(error); });
    socket.on('message', (data: Buffer) => {
      const frame = String(data);
      if (frame.startsWith('0')) socket.send('40' + JSON.stringify(auth));
      else if (frame === '2') socket.send('3');
      else if (frame.startsWith('40') || frame.startsWith('44')) {
        clearTimeout(timeout); socket.terminate(); resolve(frame.startsWith('40') ? 'connected' : JSON.parse(frame.slice(2)).message);
      }
    });
  });
  try {
    absorb(await request(app).get('/api/v1/auth/web-session/bootstrap').set(headers));
    const challenge = await request(app).post('/api/v1/auth/request-otp').set(headers).set('Cookie', cookie()).send({ email: user.email, purpose: 'login' });
    expect(challenge.status).toBe(200);
    const verified = await request(app).post('/api/v1/auth/verify-otp').set(headers).set('Cookie', cookie()).send({ challengeId: challenge.body.challengeId, code: delivered[0] });
    expect(verified.status).toBe(200); absorb(verified);
    const session = verified.body.session;
    const auth = { application: 'customer', sessionId: session.sessionId, loginId: session.loginId, csrfToken: session.csrfToken };
    expect(await connect(auth, true)).toBe('connected');
    expect(await connect({ ...auth, csrfToken: 'invalid' }, true)).toBe('FORBIDDEN');
    const native = await atomic(tx => issue(tx, user, {}));
    expect(await connect({ token: native.accessToken })).toBe('connected');
    expect(await connect({ token: native.accessToken }, true)).toBe('FORBIDDEN');
  } finally {
    sending.mockRestore(); await sockets.close();
    await db.refreshToken.deleteMany({ where: { userId: user.id } }); await db.user.delete({ where: { id: user.id } });
  }
});
