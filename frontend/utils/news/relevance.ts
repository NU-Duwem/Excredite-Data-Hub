/**
 * Keyword filter for general-news feeds: decides whether an item is about
 * the electricity/power sector. Energy-specific feeds skip this filter
 * (news_sources.filter_by_keywords = false).
 *
 * Phrases are matched case-insensitively on word boundaries against the
 * title + summary. Bare "power" is deliberately NOT a keyword (it matches
 * politics: "power struggle", "in power"); bare "tariff" and "outage" are
 * excluded too (trade tariffs, telecom outages).
 */
const KEYWORDS = [
  // Sector terms
  'electricity', 'electric power', 'power sector', 'power supply', 'power generation', 'power plant',
  'power plants', 'power station', 'power stations', 'power project', 'power grid', 'national grid',
  'grid collapse', 'grid disturbance', 'grid', 'blackout', 'blackouts', 'power outage', 'power outages',
  'electricity outage', 'load shedding',
  'megawatt', 'megawatts', 'gigawatt', 'gigawatts', 'kilowatt', 'kwh', 'mwh', 'gwh', 'mw', 'gw',
  'transmission line', 'transmission lines', 'substation', 'substations', 'transformer', 'transformers',
  'metering', 'prepaid meter', 'prepaid meters', 'smart meter', 'smart meters', 'estimated billing',
  'band a', 'electricity tariff', 'electricity tariffs', 'tariff order', 'myto', 'energy transition', 'renewable energy',
  'renewables', 'solar', 'mini-grid', 'mini-grids', 'minigrid', 'off-grid', 'hydropower', 'hydro',
  'gas-to-power', 'gas to power', 'independent power producer', 'independent power producers', 'ipp', 'ipps',
  'battery storage', 'energy storage', 'interconnector', 'nuclear power',
  // Nigerian institutions and market players
  'nerc', 'tcn', 'niso', 'nbet', 'nemsa', 'rea', 'ministry of power', 'minister of power',
  'genco', 'gencos', 'disco', 'discos', 'distribution company', 'distribution companies',
  'electricity act', 'aedc', 'ikedc', 'ikeja electric', 'eko electricity', 'ekedc', 'ibedc', 'phed',
  'kaedco', 'jos electricity', 'bedc', 'eedc', 'kedco', 'yedc', 'egbin', 'kainji', 'jebba', 'shiroro', 'zungeru',
  'azura', 'mambilla', 'transcorp power', 'geregu', 'afam', 'okpai', 'olorunsogo', 'omotosho',
] as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PATTERN = new RegExp(`\\b(?:${[...KEYWORDS].sort((a, b) => b.length - a.length).map(escape).join('|')})\\b`, 'i');

export function isElectricityRelated(title: string, summary: string | null): boolean {
  return PATTERN.test(`${title} ${summary ?? ''}`);
}
