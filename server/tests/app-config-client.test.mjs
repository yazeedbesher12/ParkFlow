import { describe, expect, it } from 'vitest';
import { configuredColors } from '../../src/theme/appConfigColors';
import { lightColors, darkColors } from '../../src/theme/colors';
import { readPublishedConfig, defaultAppConfig, appConfigSchema } from '../../src/types/appConfig';
import { appConfigSchema as serverSchema, defaultAppConfig as serverDefaults } from '../src/modules/appConfig/schema';

function contrast(a, b) {
  const luminance = color => {
    const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
describe('appearance client fallback and contrast', () => {
  it('falls back for unsupported versions and hostile configuration', () => {
    expect(readPublishedConfig({ version: 1, revisionId: 'a', config: { ...defaultAppConfig, schemaVersion: 999 } }).config.appName.en).toBe('ParkFlow');
    expect(readPublishedConfig({ version: 1, revisionId: 'a', config: { ...defaultAppConfig, logoUrl: 'javascript:alert(1)' } }).revisionId).toBeNull();
  });
  it('accepts the same public wire content on client and server', () => {
    expect(appConfigSchema.parse(serverDefaults)).toEqual(serverSchema.parse(defaultAppConfig));
  });
  it.each([['light', lightColors], ['dark', darkColors]])('keeps text and buttons readable in %s mode', (_, base) => {
    for (const requested of ['#ffffff', '#000000', '#ffff00', '#777777', '#123456', 'invalid']) {
      const colors = configuredColors(base, requested);
      expect(contrast(colors.brand, colors.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.brand, colors.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.brand, colors.onBrand)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('uses a requested brand that is readable on light surfaces', () => {
    expect(configuredColors(lightColors, '#223388').brand).toBe('#223388');
  });
});
