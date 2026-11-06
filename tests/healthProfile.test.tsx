import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { afterVerificationRoute } from '../src/utils/healthOnboarding';
import { EMPTY_MOBILITY, toggleHealthCondition } from '../src/types/health';
import { translate } from '../src/i18n';
import { HealthProfileForm } from '../src/components/domain/HealthProfileForm';
import { MobilityRouteNotice } from '../src/components/map/MobilityRouteNotice';
import { buildNavigationRoute } from '../src/utils/navigation/maneuvers';
import type { RouteResult } from '../src/types';

vi.mock('react-native', () => ({ View: ({ children }: any) => <div>{children}</div> }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/services/http/healthProfileService', () => ({ healthProfileService: {} }));
vi.mock('@/store/authStore', () => ({ useAuthStore: (select: any) => select({ user: { id: 'test-user' } }) }));
vi.mock('@/hooks/useLocale', () => ({ useLocale: () => ({ t: (key: any) => translate('en', key) }) }));
vi.mock('@/utils/errors', () => ({ errorMessage: () => 'Error' }));
vi.mock('@/components/ui', () => ({
  AppText: ({ children }: any) => <span>{children}</span>,
  Card: ({ children }: any) => <div>{children}</div>,
  InlineNotice: ({ title, body }: any) => <p>{title}{body}</p>,
  SwitchRow: ({ label, value, disabled }: any) => <label><input type="checkbox" checked={value} disabled={disabled} readOnly />{label}</label>,
  AppButton: ({ label, disabled }: any) => <button disabled={disabled}>{label}</button>,
}));

describe('health onboarding choices', () => {
  it('requires health onboarding for both new and existing accounts without a completion marker', () => {
    expect(afterVerificationRoute({ fullName: '' })).toBe('/(onboarding)/health');
    expect(afterVerificationRoute({ fullName: 'Existing User', healthProfileCompletedAt: null })).toBe('/(onboarding)/health');
    expect(afterVerificationRoute({ fullName: '', healthProfileCompletedAt: 'completed' })).toBe('/(onboarding)/name');
    expect(afterVerificationRoute({ fullName: 'Existing User', healthProfileCompletedAt: 'completed' })).toBe('/(tabs)/map');
  });
  it('supports multiple diagnoses and exclusive non-disclosure/none choices without inferring mobility', () => {
    expect(toggleHealthCondition(['diabetes'], 'hypertension')).toEqual(['diabetes', 'hypertension']);
    expect(toggleHealthCondition(['diabetes'], 'none')).toEqual(['none']);
    expect(toggleHealthCondition(['diabetes'], 'prefer_not_to_disclose')).toEqual(['prefer_not_to_disclose']);
    expect(toggleHealthCondition(['none'], 'disability')).toEqual(['disability']);
    expect(toggleHealthCondition(['diabetes', 'disability'], 'diabetes')).toEqual(['disability']);
    expect(Object.values(EMPTY_MOBILITY).every(value => !value)).toBe(true);
  });
  it('renders disclosure alternatives, explicit consent and mobility controls with saving off by default', () => {
    const html = renderToStaticMarkup(<HealthProfileForm onSaved={() => {}} />);
    for (const label of ['Diabetes', 'Hypertension', 'Other chronic diseases', 'Disabilities / accessibility needs', 'None', 'Prefer not to disclose', 'Avoid highways', 'Prefer smoother roads', 'Prefer accessible parking', 'Prefer step-free walking routes']) expect(html).toContain(label);
    expect(html).toContain('I consent to saving and using these selections');
    expect(html).toContain('Continue without saving');
    expect(html).not.toContain('checked=""');
    expect(html).toContain('<button disabled="">');
  });
  it('provides both language versions and displays unverified route warnings', () => {
    expect(translate('ar', 'health.condition.prefer_not_to_disclose')).toBe('أفضل عدم الإفصاح');
    const html = renderToStaticMarkup(<MobilityRouteNotice mobility={{ notices: ['highways_unavailable', 'parking_unverified', 'step_free_unverified'] }} />);
    expect(html).toContain('may use highways');
    expect(html).toContain('Accessible parking at the destination is unverified');
    expect(html).toContain('Step-free access is unverified');
  });
  it('carries mobility warnings into turn-by-turn navigation', () => {
    const a = { latitude: 31.9, longitude: 35.2 }, b = { latitude: 31.91, longitude: 35.21 };
    const route: RouteResult = {
      source: 'osrm', coordinates: [a, b], distanceMeters: 1000, durationSeconds: 100, penaltySeconds: 0,
      alternatives: [], rejected: [], closuresOnRoute: [], mobility: { notices: ['parking_unverified'] },
      steps: [{ type: 'depart', location: a, bearingBefore: 0, bearingAfter: 90, name: '', distanceMeters: 1000, durationSeconds: 100, geometry: [a, b], leg: 0 }],
    };
    expect(buildNavigationRoute(route)?.mobility).toEqual(route.mobility);
  });
});
