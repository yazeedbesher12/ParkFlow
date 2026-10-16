import { describe, expect, it } from 'vitest';
import { appConfigSchema, defaultAppConfig } from '../src/modules/appConfig/schema';

describe('public appearance configuration boundary', () => {
  it('accepts the fallback and bilingual supported content', () => {
    expect(appConfigSchema.safeParse(defaultAppConfig).success).toBe(true);
  });
  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'http://images.example.com/logo.png', 'https://user:pass@example.com/a.png', 'https://localhost/a.png', 'https://127.0.0.1/a.png', 'https://169.254.169.254/a.png'])('rejects unsafe image URL %s', (logoUrl) => {
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, logoUrl }).success).toBe(false);
  });
  it('accepts an HTTPS image and rejects hidden configuration keys', () => {
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, logoUrl: 'https://images.example.com/logo.png' }).success).toBe(true);
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, authToken: 'not-allowed' }).success).toBe(false);
  });
  it('rejects HTML and scripts in otherwise plain text', () => {
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, appName: { en: '<script>alert(1)</script>', ar: 'اسم' } }).success).toBe(false);
  });
  it('rejects malformed colors and unsupported schema versions', () => {
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, brandColor: 'red' }).success).toBe(false);
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, schemaVersion: 2 }).success).toBe(false);
  });
  it('restricts action destinations and requires unique section identifiers', () => {
    const action = { id: 'signup', type: 'action', visible: true, label: { en: 'Start', ar: 'ابدأ' }, path: '/(onboarding)/name' };
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, sections: [action] }).success).toBe(true);
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, sections: [{ ...action, path: '/admin' }] }).success).toBe(false);
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, sections: [{ ...action, path: 'https://example.com' }] }).success).toBe(false);
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, sections: [action, action] }).success).toBe(false);
  });
  it('bounds content and number of blocks', () => {
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, appName: { en: 'x'.repeat(81), ar: 'اسم' } }).success).toBe(false);
    expect(appConfigSchema.safeParse({ ...defaultAppConfig, sections: Array.from({ length: 13 }, (_, i) => ({ id: String(i), type: 'title', visible: true, text: { en: 'Title', ar: 'عنوان' } })) }).success).toBe(false);
  });
});
