import { describe, expect, it } from 'vitest';
import { scoreParkingOption } from '../src/modules/routing/service';

describe('scoreParkingOption', () => {
  it('is deterministic and favors faster, closer, lower cost options', () => {
    const a = scoreParkingOption({ driveSeconds: 300, walkMeters: 100, price: 100, provenance: { confidence: 0.9 } });
    const b = scoreParkingOption({ driveSeconds: 900, walkMeters: 600, price: 300, provenance: { confidence: 0.4 } });
    expect(a.total).toBeGreaterThan(b.total);
    expect(scoreParkingOption({ driveSeconds: 300, walkMeters: 100, price: 100, provenance: { confidence: 0.9 } })).toEqual(a);
  });
  it('handles missing metadata without throwing', () => {
    const result = scoreParkingOption({});
    expect(result.total).toBe(0);
    expect(result.reasons).toEqual([]);
  });
});
