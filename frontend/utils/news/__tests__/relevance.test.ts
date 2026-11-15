import { describe, expect, it } from 'vitest';
import { isElectricityRelated } from '../relevance';

describe('isElectricityRelated', () => {
  it.each([
    'NERC approves new electricity tariff for Band A customers',
    'TCN restores national grid after collapse',
    "NERC's order on DisCos sparks reaction", // possessive
    'Egbin plant back online',
    'Plant adds 500MW to supply',
    'Firm commissions 4,000MWh battery project',
    'TCN adds 15,000 MVA capacity in three years',
    'New 330kV line energised',
    '1.2 GW solar farm approved',
    'Mini-grid developers seek funding',
    'Ikeja Electric rolls out prepaid meters',
    'Residents decry estimated billing',
  ])('keeps: %s', (title) => {
    expect(isElectricityRelated(title, null)).toBe(true);
  });

  it.each([
    'Tinubu begins power struggle with governors', // "power" alone
    'US raises tariffs on Chinese steel', // trade tariff
    'Telecom outage hits MTN subscribers', // outage alone
    'Traffic gridlock on Third Mainland Bridge', // "grid" inside a word
    'Hydrocarbon exports rise', // "hydro" inside a word
    'Lagos targets $1tn economy by 2052',
    'Super Eagles win in Uyo',
  ])('drops: %s', (title) => {
    expect(isElectricityRelated(title, null)).toBe(false);
  });

  it('checks the summary as well as the title', () => {
    expect(isElectricityRelated('Senate passes bill', 'The bill amends the Electricity Act 2023.')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isElectricityRelated('ELECTRICITY SUPPLY IMPROVES', null)).toBe(true);
  });

  it('handles empty input', () => {
    expect(isElectricityRelated('', null)).toBe(false);
    expect(isElectricityRelated('', '')).toBe(false);
  });
});
