/**
 * Topic tags for news articles, assigned at ingest from the title and summary.
 * An article can carry several topics; one that matches none is 'other'.
 * Ids must match the CHECK constraint in 10_news_topics.sql.
 */

export type TopicId = 'regulation' | 'grid' | 'generation' | 'distribution' | 'renewables' | 'other';

type TopicDef = { id: Exclude<TopicId, 'other'>; label: string; keywords: readonly string[] };

const TOPIC_DEFS: readonly TopicDef[] = [
  {
    id: 'regulation',
    label: 'Regulation & tariffs',
    keywords: [
      'nerc', 'regulator', 'regulators', 'regulatory', 'regulation', 'electricity act', 'tariff order', 'electricity tariff',
      'electricity tariffs', 'band a', 'myto', 'licence', 'licences', 'license', 'licensing', 'ministry of power',
      'minister of power', 'nbet', 'nemsa', 'subsidy', 'subsidies', 'policy', 'privatisation', 'privatization',
    ],
  },
  {
    id: 'grid',
    label: 'Grid & transmission',
    keywords: [
      'grid', 'national grid', 'grid collapse', 'grid disturbance', 'tcn', 'niso', 'transmission', 'substation',
      'substations', 'transformer', 'transformers', 'mva', 'kv', 'interconnector', 'blackout', 'blackouts',
      'load shedding', 'power outage', 'power outages',
    ],
  },
  {
    id: 'generation',
    label: 'Generation & gas',
    keywords: [
      'genco', 'gencos', 'power plant', 'power plants', 'power station', 'power stations', 'power generation', 'generation',
      'gas', 'gas supply', 'gas-to-power', 'gas to power', 'pipeline', 'hydro', 'hydropower', 'nuclear', 'smr', 'thermal',
      'independent power producer', 'independent power producers', 'ipp', 'ipps', 'egbin', 'kainji', 'jebba', 'shiroro',
      'zungeru', 'azura', 'mambilla', 'afam', 'okpai', 'geregu', 'olorunsogo', 'omotosho', 'transcorp power',
    ],
  },
  {
    id: 'distribution',
    label: 'Distribution & metering',
    keywords: [
      'disco', 'discos', 'distribution company', 'distribution companies', 'meter', 'meters', 'metering', 'prepaid meter',
      'prepaid meters', 'smart meter', 'smart meters', 'estimated billing', 'aedc', 'ikedc', 'ikeja electric',
      'eko electricity', 'ekedc', 'ibedc', 'phed', 'kaedco', 'bedc', 'eedc', 'kedco', 'yedc', 'jos electricity',
    ],
  },
  {
    id: 'renewables',
    label: 'Renewables & storage',
    keywords: [
      'solar', 'renewable', 'renewables', 'renewable energy', 'wind', 'offshore wind', 'battery', 'batteries',
      'battery storage', 'energy storage', 'bess', 'mini-grid', 'mini-grids', 'minigrid', 'off-grid', 'energy transition',
    ],
  },
];

/** Topics in display order, including the catch-all. */
export const TOPICS: readonly { id: TopicId; label: string }[] = [
  ...TOPIC_DEFS.map(({ id, label }) => ({ id, label })),
  { id: 'other', label: 'Other' },
];

export const ALL_TOPIC_IDS: readonly TopicId[] = TOPICS.map((t) => t.id);

export const TOPIC_LABELS: Record<TopicId, string> = Object.fromEntries(TOPICS.map((t) => [t.id, t.label])) as Record<
  TopicId,
  string
>;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PATTERNS = TOPIC_DEFS.map((t) => ({
  id: t.id,
  re: new RegExp(`\\b(?:${[...t.keywords].sort((a, b) => b.length - a.length).map(escape).join('|')})\\b`, 'i'),
}));

/** Quantities written against grid units ("330kV", "15,000 MVA") count as grid news. */
const GRID_QUANTITY = /\d(?:[\d,.]*\d)?\s?(?:mva|kv)\b/i;

export function classifyTopics(title: string, summary: string | null): TopicId[] {
  const text = `${title} ${summary ?? ''}`;
  const hit = new Set<TopicId>(PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id));
  if (GRID_QUANTITY.test(text)) hit.add('grid');
  const ordered = ALL_TOPIC_IDS.filter((id) => hit.has(id));
  return ordered.length ? ordered : ['other'];
}
