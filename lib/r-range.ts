/**
 * Date-range presets for the R-multiple page.
 *
 * Deliberately its own module: the page (a server component) resolves the range
 * and the picker (a client component) renders it, and a value exported from a
 * "use client" file reaches the server as a client-reference proxy rather than
 * as the array itself - which throws the moment anything reads it.
 */

export const RANGE_PRESETS = [
  { key: "1w", label: "1W", days: 7 },
  { key: "2w", label: "2W", days: 14 },
  { key: "1m", label: "1M", days: 30 },
  { key: "3m", label: "3M", days: 90 },
  { key: "6m", label: "6M", days: 182 },
  { key: "1y", label: "1Y", days: 365 },
  { key: "all", label: "All", days: null },
] as const;

/** The window a review defaults to when the URL says nothing. */
export const DEFAULT_RANGE_KEY = "3m";

export type MonthOption = {
  /** "2026-08" - what travels in the URL. */
  key: string;
  /** "Aug", or "Aug 25" once the month is in a previous year. */
  label: string;
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The last `count` calendar months, newest first: Aug, Jul, Jun.
 *
 * Calendar months, not rolling 30-day windows - "how did July go" is a question
 * about July, and the 1M preset already covers the rolling case. The year is
 * appended once a month falls outside the current one, so a December sitting
 * next to a January is not ambiguous.
 *
 * Computed from a date passed in rather than from the clock, so the server
 * decides and the client renders what it was given - a month boundary crossed
 * between render and hydration would otherwise mismatch.
 */
export function recentMonths(today: Date, count = 3): MonthOption[] {
  const currentYear = today.getFullYear();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
    const year = date.getFullYear();
    const month = date.getMonth();

    return {
      key: `${year}-${String(month + 1).padStart(2, "0")}`,
      label:
        year === currentYear
          ? MONTH_NAMES[month]
          : `${MONTH_NAMES[month]} ${String(year).slice(2)}`,
    };
  });
}

/** "2026-08" -> the first and last instant of that month, or null if unparseable. */
export function monthBounds(key: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (month < 0 || month > 11) return null;

  const start = new Date(year, month, 1);
  // Day 0 of the next month is the last day of this one, which sidesteps
  // month lengths and February entirely.
  const end = new Date(year, month + 1, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}
