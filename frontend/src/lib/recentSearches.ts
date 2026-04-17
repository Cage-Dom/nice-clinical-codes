export interface RecentSearch {
  query: string;
  codeCount: number;
  at: string; // ISO
}

const KEY = "nice:recentSearches";
const MAX = 5;

export function getRecent(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentSearch) {
  const current = getRecent().filter((r) => r.query !== entry.query);
  const next = [entry, ...current].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function formatAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr > 1 ? "s" : ""} ago`;
  const day = Math.floor(hr / 24);
  return day === 1 ? "Yesterday" : `${day} days ago`;
}
