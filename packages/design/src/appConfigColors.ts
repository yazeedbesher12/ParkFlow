import type { ColorScheme } from './colors';
const rgb = (color: string) => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
function luminance(color: string) {
  const [r, g, b] = rgb(color).map(n => { const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
const mix = (a: string, b: string, weight: number) => '#' + rgb(a).map((v, i) => Math.round(v * weight + rgb(b)[i] * (1 - weight)).toString(16).padStart(2, '0')).join('');
/** Brand also appears as small foreground text; preserve its contrast on both surfaces. */
export function configuredColors(base: ColorScheme, brandColor: string): ColorScheme {
  const valid = /^#[0-9a-f]{6}$/i.test(brandColor) && contrast(brandColor, base.background) >= 4.5 && contrast(brandColor, base.surface) >= 4.5;
  const brand = valid ? brandColor : base.brand;
  const onBrand = contrast(brand, '#ffffff') >= contrast(brand, '#000000') ? '#ffffff' : '#000000';
  const candidateSoft = mix(brand, base.background, 0.08);
  const brandSoft = contrast(brand, candidateSoft) >= 4.5 ? candidateSoft : base.background;
  return { ...base, brand, onBrand, brandPressed: brand, brandSoft, brandSofter: mix(brand, base.background, 0.03) };
}
