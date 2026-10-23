export type RangeKey = "30" | "90" | "365" | "730";

/** The server accepts at most 24 months, so the longest choice is 24 months. */
export const RANGES: ReadonlyArray<{ value: RangeKey; label: string; phrase: string; days: number }> = [
  { value: "30", label: "Last 30 days", phrase: "last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", phrase: "last 90 days", days: 90 },
  { value: "365", label: "Last 12 months", phrase: "last 12 months", days: 365 },
  { value: "730", label: "Last 24 months", phrase: "last 24 months", days: 730 },
];

export interface Bucket {
  label: string;
  n: number;
}
export interface CsrRow {
  id: string;
  name: string;
  clients: number;
  open: number;
  done: number;
  inter: number;
  tickets: number;
}
export interface CompRow {
  id: string;
  name: string;
  reviews: number;
  cases: number;
  tasks: number;
  reports: number;
}
export interface OnboardRow {
  label: string;
  n: number;
  pct: number;
}

export interface Analytics {
  stage: Bucket[];
  status: Bucket[];
  monthly: Bucket[];
  completed: number;
  avgDuration: string;
  revN: number;
  revAvg: string;
  revRejected: number;
  tkN: number;
  tkAvg: string;
  tkOpen: number;
  tkReopened: number;
  tDone: number;
  tOver: number;
  tOpen: number;
  csr: CsrRow[];
  comp: CompRow[];
  onboard: OnboardRow[];
  clientsN: number;
}
