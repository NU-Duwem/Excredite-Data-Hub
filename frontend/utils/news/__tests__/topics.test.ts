import { describe, expect, it } from 'vitest';
import { ALL_TOPIC_IDS, classifyTopics, TOPIC_LABELS, TOPICS } from '../topics';

describe('classifyTopics', () => {
  it.each([
    ['NERC approves new electricity tariff for Band A customers', ['regulation']],
    ['Tegbe: Over 15,000 MVA Capacity Added to Grid in Three Years', ['grid']],
    ['New 330kV line energised in Kano', ['grid']],
    ['AKK gas pipeline set for commissioning amid protest by Kano manufacturers', ['generation']],
    ['OPG says Darlington SMR won’t meet 2030 start date or cost target', ['generation']],
    ['Ikeja Electric rolls out prepaid meters to 50,000 customers', ['distribution']],
    ['NGYouthSDGs launches national solar energy competition for young Nigerians', ['renewables']],
    ['AirTrunk secures exclusivity on 800MWh+ battery storage as part of 1GW Hunter renewables deal', ['renewables']],
  ])('%s → %j', (title, expected) => {
    expect(classifyTopics(title, null)).toEqual(expected);
  });

  it('assigns several topics, in display order', () => {
    expect(classifyTopics('TCN and DisCos blame grid collapse on gas shortage at Egbin', null)).toEqual([
      'grid',
      'generation',
      'distribution',
    ]);
  });

  it('reads the summary as well as the title', () => {
    expect(classifyTopics('Senate passes bill', 'It amends the Electricity Act 2023.')).toEqual(['regulation']);
  });

  it('falls back to "other"', () => {
    expect(classifyTopics('Electrifying ambitions meet tough reality in Europe', null)).toEqual(['other']);
    expect(classifyTopics('', null)).toEqual(['other']);
  });

  it('matches whole words only', () => {
    expect(classifyTopics('Traffic gridlock on Third Mainland Bridge', null)).toEqual(['other']); // not "grid"
    expect(classifyTopics('Gasoline prices rise', null)).toEqual(['other']); // not "gas"
    expect(classifyTopics('Windfall tax debated', null)).toEqual(['other']); // not "wind"
  });

  it('is case-insensitive and handles possessives', () => {
    expect(classifyTopics("NERC's ORDER ON DISCOS", null)).toEqual(['regulation', 'distribution']);
  });

  it('only ever returns ids allowed by the database constraint', () => {
    const allowed = new Set(['regulation', 'grid', 'generation', 'distribution', 'renewables', 'other']);
    expect(ALL_TOPIC_IDS.every((id) => allowed.has(id))).toBe(true);
    for (const t of ['grid gas solar meter tariff order', 'nothing here']) {
      expect(classifyTopics(t, null).every((id) => allowed.has(id))).toBe(true);
    }
  });

  it('has a label for every topic', () => {
    expect(TOPICS.map((t) => TOPIC_LABELS[t.id])).toEqual([
      'Regulation & tariffs',
      'Grid & transmission',
      'Generation & gas',
      'Distribution & metering',
      'Renewables & storage',
      'Other',
    ]);
  });
});
