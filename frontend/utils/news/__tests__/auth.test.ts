import { describe, expect, it } from 'vitest';
import { hasCronSecret } from '../auth';

describe('hasCronSecret', () => {
  const secret = 's3cret-value';

  it('accepts the exact bearer token', () => {
    expect(hasCronSecret(`Bearer ${secret}`, secret)).toBe(true);
  });

  it.each([
    ['wrong token', 'Bearer nope'],
    ['prefix of the secret', 'Bearer s3cret'],
    ['secret plus extra', `Bearer ${secret}x`],
    ['missing Bearer prefix', secret],
    ['lower-case scheme', `bearer ${secret}`],
    ['empty header', ''],
    ['no header', null],
  ])('rejects %s', (_label, header) => {
    expect(hasCronSecret(header, secret)).toBe(false);
  });

  it('rejects everything when CRON_SECRET is unset or empty', () => {
    expect(hasCronSecret('Bearer undefined', undefined)).toBe(false);
    expect(hasCronSecret('Bearer ', '')).toBe(false);
    expect(hasCronSecret('Bearer ', undefined)).toBe(false);
  });

  it('handles multi-byte characters without throwing', () => {
    expect(hasCronSecret('Bearer ₦₦₦', 'abc')).toBe(false);
    expect(hasCronSecret('Bearer ₦', '₦')).toBe(true);
  });
});
