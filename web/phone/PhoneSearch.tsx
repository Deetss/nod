import type { ReactNode } from 'react';
import { filterBadge, filterButtonLabel, filterCountText, resultsLine } from './bottom-search';
import { FilterIcon, SearchIcon } from './PhoneIcons';
import { EmptyBlock } from './PhoneStates';

/** Floating search pill and filter button, 16px above the tab bar. */
export function BottomBar(p: { placeholder: string; filtersOn: number; onSearch: () => void; onFilters: () => void }) {
  const badge = filterBadge(p.filtersOn);
  return (
    <div className="ph-bottombar">
      <button type="button" className="ph-pill" aria-label={p.placeholder} onClick={p.onSearch}>
        <SearchIcon />
        <span className="ph-pill-text">{p.placeholder}</span>
      </button>
      <button
        type="button"
        className={`ph-iconbtn ph-filterbtn${badge ? ' is-on' : ''}`}
        aria-label={filterButtonLabel(p.filtersOn)}
        aria-haspopup="dialog"
        onClick={p.onFilters}
      >
        <FilterIcon />
        {badge ? (
          <span className="ph-filter-badge" aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </button>
    </div>
  );
}

/** The search field on top of the keyboard, with Cancel. */
export function SearchBand(p: {
  placeholder: string;
  query: string;
  keyboard: boolean;
  onQuery: (q: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className={`ph-searchband${p.keyboard ? ' has-keyboard' : ''}`}>
      <label className="ph-searchfield">
        <SearchIcon />
        <input
          type="search"
          autoFocus
          enterKeyHint="search"
          placeholder={p.placeholder}
          aria-label={p.placeholder}
          value={p.query}
          onChange={(e) => p.onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') p.onCancel();
          }}
        />
      </label>
      <button type="button" className="ph-btn ph-search-cancel" onClick={p.onCancel}>
        Cancel
      </button>
    </div>
  );
}

/** Flat result rows under a sticky results line. */
export function SearchResults(p: {
  query: string;
  /** Labels of the ticked filters. */
  filterLabels: readonly string[];
  onClearFilters: () => void;
  onEscape: () => void;
  children: ReactNode[];
}) {
  const on = p.filterLabels.length;
  return (
    <div
      className="ph-list is-results"
      onKeyDown={(e) => {
        if (e.key === 'Escape') p.onEscape();
      }}
    >
      <div className="ph-results-line" role="status">
        {resultsLine(p.children.length, p.query, p.filterLabels)}
      </div>
      {p.children.length > 0 ? (
        p.children
      ) : (
        <EmptyBlock
          title={`Nothing matches “${p.query.trim()}”`}
          body={on > 0 ? `${filterCountText(on)} ${on === 1 ? 'is' : 'are'} on.` : undefined}
          action={
            on > 0 ? (
              <button type="button" className="ph-btn" onClick={p.onClearFilters}>
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
