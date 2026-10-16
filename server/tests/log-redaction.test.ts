import { expect, it } from 'vitest';
import pino from 'pino';
import { logRedaction } from '../src/config/logger';

it('redacts credentials and web CSRF metadata using the actual logging configuration', () => {
  const output: string[] = [];
  const logger = pino({ redact: logRedaction }, { write: value => { output.push(value); } });
  const secret = 'isolated-redaction-fixture';
  logger.info({ req: { headers: { authorization: secret, cookie: secret, 'x-parkflow-csrf': secret, 'x-gate-key': secret }, body: { code: secret } },
    res: { headers: { 'set-cookie': secret } }, token: secret, refreshToken: secret,
    csrfToken: secret, session: { csrfToken: secret }, code: secret, password: secret, event: 'session' });
  expect(output.join('')).not.toContain(secret);
  expect(JSON.parse(output[0]).req.headers['x-gate-key']).toBe('[REDACTED]');
  expect(JSON.parse(output[0]).event).toBe('session');
  expect(JSON.parse(output[0]).req.headers['x-parkflow-csrf']).toBe('[REDACTED]');
  expect(JSON.parse(output[0]).res.headers['set-cookie']).toBe('[REDACTED]');
});
