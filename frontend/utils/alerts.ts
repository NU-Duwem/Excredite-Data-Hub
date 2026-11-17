/**
 * Alerts tab: every kind of alert stored in public.anomaly_alerts
 * (see 13_alerts.sql). Pure helpers, so the page logic can be unit-tested.
 */

export const ALERT_CATEGORIES = [
  { value: 'LEGAL_COMPLIANCE', label: 'Legal & compliance', one: 'Legal & compliance' },
  { value: 'URGENT_DEVELOPMENT', label: 'Urgent developments', one: 'Urgent development' },
  { value: 'DOCUMENT_CONTRADICTION', label: 'Document contradictions', one: 'Document contradiction' },
  { value: 'GRID_DATA', label: 'Grid & data', one: 'Grid & data' },
  { value: 'SYSTEM', label: 'System', one: 'System' },
] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number]['value'];

export const ALERT_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
export const SEVERITY_LABELS: Record<AlertSeverity, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' };

/** Database statuses, grouped the way the page shows them. */
export type StatusGroup = 'open' | 'investigating' | 'resolved' | 'dismissed';
export const STATUS_GROUP_LABELS: Record<StatusGroup, string> = {
  open: 'Open',
  investigating: 'Investigating',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};
export const OPEN_STATUSES = ['UNREVIEWED', 'ASSIGNED'];

/** Roles that can take, resolve and dismiss alerts (mirrors the RLS update policy). */
export const TRIAGE_ROLES = ['power_admin', 'power_ceo', 'power_legal', 'power_analyst', 'power_app'];

export function statusGroup(status: string): StatusGroup {
  if (status === 'ASSIGNED') return 'investigating';
  if (status === 'RESOLVED' || status === 'REVIEWED') return 'resolved';
  if (status === 'DISMISSED') return 'dismissed';
  return 'open';
}

export function isOpen(a: Pick<Alert, 'status'>): boolean {
  return OPEN_STATUSES.includes(a.status);
}

export function categoryLabel(value: string, one = true): string {
  const c = ALERT_CATEGORIES.find((x) => x.value === value);
  return c ? (one ? c.one : c.label) : humanise(value);
}

export function humanise(value: string): string {
  const s = value.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type Evidence = { label: string; url: string | null; excerpt: string | null };

export type Alert = {
  id: string;
  category: AlertCategory;
  severity: AlertSeverity;
  status: string;
  title: string;
  explanation: string | null;
  affects: string | null;
  suggestedAction: string | null;
  dismissReason: string | null;
  evidence: Evidence[];
  assignedTo: string | null;
  reportedBy: string | null;
  source: string;
  createdAt: string;
  plantName: string | null;
  documentId: string | null;
  documentTitle: string | null;
  matterId: string | null;
  matterLabel: string | null;
  newsTitle: string | null;
  newsUrl: string | null;
};

/** Only http(s) links are ever rendered; anything else (javascript:, data:, …) is dropped. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

export function parseEvidence(raw: unknown): Evidence[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const r = e as Record<string, unknown>;
      const url = safeUrl(r.url);
      const label = text(r.label, 200) ?? (url ? new URL(url).hostname : null);
      const excerpt = text(r.excerpt, 1000);
      return label || excerpt ? { label: label ?? 'Evidence', url, excerpt } : null;
    })
    .filter((e): e is Evidence => e !== null);
}

const GRID_TITLES: Record<string, string> = {
  HIGH_OUTPUT: 'Unusually high output',
  LOW_OUTPUT: 'Unusually low output',
  ZERO_OUTPUT: 'Zero output',
  CURTAILMENT_SPIKE: 'Curtailment spike',
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped in this project */
export function toAlert(row: any): Alert {
  const plant = one<any>(row.power_plants);
  const doc = one<any>(row.documents);
  const matter = one<any>(row.matters);
  const news = one<any>(row.news_articles);
  const category = (ALERT_CATEGORIES.some((c) => c.value === row.category) ? row.category : 'GRID_DATA') as AlertCategory;
  const severity = (ALERT_SEVERITIES.includes(row.severity) ? row.severity : 'MEDIUM') as AlertSeverity;
  const plantName = text(plant?.name, 200);
  const base = GRID_TITLES[row.alert_type] ?? humanise(String(row.alert_type ?? 'Alert'));
  const title = text(row.title, 300) ?? (plantName ? `${base} at ${plantName}` : base);
  return {
    id: String(row.id),
    category,
    severity,
    status: String(row.status ?? 'UNREVIEWED'),
    title,
    explanation: text(row.explanation, 8000),
    affects: text(row.affects, 300),
    suggestedAction: text(row.suggested_action, 2000),
    dismissReason: text(row.dismiss_reason, 2000),
    evidence: parseEvidence(row.evidence),
    assignedTo: row.assigned_to ?? null,
    reportedBy: row.reported_by ?? null,
    source: String(row.source_type ?? 'GENERATION'),
    createdAt: String(row.created_at ?? ''),
    plantName,
    documentId: row.document_id ?? null,
    documentTitle: text(doc?.title, 300),
    matterId: row.matter_id ?? null,
    matterLabel: matter ? [matter.matter_reference, matter.title].filter(Boolean).join(' · ') || null : null,
    newsTitle: text(news?.title, 300),
    newsUrl: safeUrl(news?.url),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const SEVERITY_RANK: Record<AlertSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Most severe first, then newest first. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function newestFirst(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export type Tile = { category: AlertCategory; label: string; open: number; sub: string; hot: boolean };

/** One tile per kind of alert: open count, plus the most severe level among them. */
export function buildTiles(alerts: Alert[]): Tile[] {
  return ALERT_CATEGORIES.map((c) => {
    const open = alerts.filter((a) => a.category === c.value && isOpen(a));
    const worst = ALERT_SEVERITIES.find((s) => open.some((a) => a.severity === s));
    const n = worst ? open.filter((a) => a.severity === worst).length : 0;
    return {
      category: c.value,
      label: c.label,
      open: open.length,
      sub: worst ? `${n} ${SEVERITY_LABELS[worst].toLowerCase()}` : 'None open',
      hot: worst === 'CRITICAL',
    };
  });
}

/** What an alert is about, for the "most alerts" list. */
export function subjectOf(a: Alert): string | null {
  return a.affects ?? a.plantName ?? a.documentTitle ?? a.newsTitle ?? null;
}

/** Companies, plants and documents with the most alerts in the last `days` days (any status). */
export function watchlist(alerts: Alert[], now: number, days = 30, limit = 5): { name: string; count: number }[] {
  const since = now - days * 86_400_000;
  const counts = new Map<string, { name: string; count: number }>();
  for (const a of alerts) {
    const t = Date.parse(a.createdAt);
    if (Number.isNaN(t) || t < since) continue;
    const name = subjectOf(a);
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = counts.get(key) ?? { name, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)).slice(0, limit);
}

/** "just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago", then a date. */
export function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
}

export type ReportDraft = {
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  explanation: string;
  affects: string;
  evidenceUrl: string;
  evidenceExcerpt: string;
  matterId: string;
};

export const EMPTY_REPORT: ReportDraft = {
  category: 'LEGAL_COMPLIANCE',
  severity: 'MEDIUM',
  title: '',
  explanation: '',
  affects: '',
  evidenceUrl: '',
  evidenceExcerpt: '',
  matterId: '',
};

export function validateReport(d: ReportDraft): string[] {
  const errors: string[] = [];
  if (!d.title.trim()) errors.push('Say in a line what happened.');
  if (d.title.trim().length > 300) errors.push('Keep the headline under 300 characters.');
  if (d.explanation.length > 8000) errors.push('Keep the details under 8,000 characters.');
  if (d.affects.trim().length > 300) errors.push('Keep “Who or what it affects” under 300 characters.');
  if (d.evidenceUrl.trim() && !safeUrl(d.evidenceUrl)) errors.push('The evidence link must start with https:// or http://.');
  if (d.evidenceExcerpt.length > 1000) errors.push('Keep the quoted evidence under 1,000 characters.');
  return errors;
}

const MANUAL_TYPES: Record<AlertCategory, string> = {
  LEGAL_COMPLIANCE: 'LEGAL_BREACH',
  URGENT_DEVELOPMENT: 'URGENT_DEVELOPMENT',
  DOCUMENT_CONTRADICTION: 'DOCUMENT_DISCREPANCY',
  GRID_DATA: 'OTHER',
  SYSTEM: 'SYSTEM_CHECK',
};

/** The row a hand-filed report inserts (allowed by the report_anomaly_alerts policy). */
export function reportToRow(d: ReportDraft, me: string) {
  const url = safeUrl(d.evidenceUrl);
  const excerpt = d.evidenceExcerpt.trim();
  return {
    alert_type: MANUAL_TYPES[d.category],
    source_type: 'MANUAL',
    category: d.category,
    severity: d.severity,
    title: d.title.trim(),
    explanation: d.explanation.trim() || null,
    affects: d.affects.trim() || null,
    evidence: url || excerpt ? [{ label: url ? new URL(url).hostname : 'Reported by hand', url, excerpt: excerpt || null }] : [],
    matter_id: d.matterId || null,
    reported_by: me,
    status: 'UNREVIEWED',
  };
}
