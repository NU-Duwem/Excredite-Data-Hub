'use client';

import { useState } from 'react';
import { TOPICS, type TopicId } from '@/utils/news/topics';
import { formatClock, TIME_RANGES, type SourceStatus, type TimeRange } from '@/utils/news/feedView';

const COLLAPSED_SOURCE_COUNT = 6;

type Props = {
  /** Shown in the drawer only; on wide screens the toolbar has the time range. */
  showTimeRange: boolean;
  timeRange: TimeRange;
  onTimeRange: (r: TimeRange) => void;
  topics: ReadonlySet<TopicId>;
  onToggleTopic: (id: TopicId) => void;
  sources: readonly SourceStatus[];
  /** null = all sources selected */
  selectedSources: ReadonlySet<string> | null;
  onToggleSource: (name: string) => void;
  onSelectAllSources: () => void;
  onClear: () => void;
  lastPullAt: string | null;
  nextPullAt: Date | null; // null = automatic pulls not connected
  idPrefix: string;
};

const legend = 'text-[11px] font-extrabold tracking-wider uppercase text-gray-600 mb-1.5';

export default function FilterPanel(p: Props) {
  const [showAllSources, setShowAllSources] = useState(false);
  const visibleSources = showAllSources ? p.sources : p.sources.slice(0, COLLAPSED_SOURCE_COUNT);
  const sourceChecked = (name: string) => p.selectedSources === null || p.selectedSources.has(name);
  const allSourcesSelected = p.selectedSources === null || p.selectedSources.size === p.sources.length;

  return (
    <div className="flex flex-col gap-5">
      {p.showTimeRange && (
        <fieldset className="flex flex-col">
          <legend className={legend}>Time range</legend>
          {TIME_RANGES.map((r) => (
            <label key={r.value} className="flex items-center gap-2.5 min-h-10 text-sm text-gray-900 cursor-pointer">
              <input
                type="radio"
                name={`${p.idPrefix}-time`}
                checked={p.timeRange === r.value}
                onChange={() => p.onTimeRange(r.value)}
                className="h-4 w-4 accent-brand"
              />
              {r.label}
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="flex flex-col">
        <legend className={legend}>Topics</legend>
        {TOPICS.map((t) => (
          <label key={t.id} className="flex items-center gap-2.5 min-h-9 text-sm text-gray-900 cursor-pointer">
            <input
              type="checkbox"
              checked={p.topics.has(t.id)}
              onChange={() => p.onToggleTopic(t.id)}
              className="h-4 w-4 rounded accent-brand"
            />
            {t.label}
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col">
        <legend className={legend}>Sources</legend>
        {p.sources.length > 1 && !allSourcesSelected && (
          <button type="button" onClick={p.onSelectAllSources} className="self-start min-h-8 text-xs font-semibold text-brand hover:underline">
            Select all sources
          </button>
        )}
        {visibleSources.map((s) => {
          const failed = s.last_status === 'ERROR';
          return (
            <label key={s.name} className="flex items-center gap-2.5 min-h-9 text-sm text-gray-900 cursor-pointer">
              <input
                type="checkbox"
                checked={sourceChecked(s.name)}
                onChange={() => p.onToggleSource(s.name)}
                className="h-4 w-4 rounded accent-brand shrink-0"
              />
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full shrink-0 ${failed ? 'bg-orange-600' : s.last_status === 'OK' ? 'bg-green-700' : 'bg-gray-300'}`}
              />
              <span className="truncate">{s.name}</span>
              {failed && <span className="ml-auto shrink-0 text-[11px] font-medium text-orange-800">not reached</span>}
            </label>
          );
        })}
        {p.sources.length > COLLAPSED_SOURCE_COUNT && (
          <button
            type="button"
            onClick={() => setShowAllSources((v) => !v)}
            aria-expanded={showAllSources}
            className="self-start min-h-8 text-xs font-semibold text-brand hover:underline"
          >
            {showAllSources ? 'Show fewer' : `Show all ${p.sources.length}`}
          </button>
        )}
        {p.sources.length === 0 && <p className="text-sm text-gray-600">No sources configured.</p>}
      </fieldset>

      <div className="pt-3 border-t border-gray-100 flex flex-col gap-1 text-xs text-gray-600">
        <span>
          Last pull: <strong className="text-gray-900">{p.lastPullAt ? formatClock(p.lastPullAt) : 'not yet'}</strong>
          {p.nextPullAt && <> · next {formatClock(p.nextPullAt.toISOString())}</>}
        </span>
        {!p.nextPullAt && <span>Automatic hourly pulls start once the app is connected.</span>}
        <button type="button" onClick={p.onClear} className="self-start mt-1 min-h-8 text-xs font-semibold text-brand hover:underline">
          Reset filters
        </button>
      </div>
    </div>
  );
}
