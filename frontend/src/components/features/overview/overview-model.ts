import type { BadgeTone } from "@/constants/vocab";
import type { Project } from "@/types/domain";
import type { Bucket } from "./buckets";

/** Where a tile, bar or row leads. Query names are the contract with the destination views. */
export interface Target {
  view: string;
  id?: string;
  query?: Record<string, string>;
}

export interface Kpi {
  label: string;
  value: string;
  sub: string;
  tone?: "warn" | "err";
  target: Target;
}
export interface Shortcut {
  label: string;
  icon: "plus" | "tasks" | "userPlus" | "file" | "ticket" | "msg" | "clipboard" | "filePlus" | "megaphone";
  primary?: boolean;
  target: Target;
}
export interface StageBar {
  label: string;
  n: number;
  target: Target;
}
export interface Deadline {
  key: string;
  title: string;
  kind: string;
  rel: string;
  day: string;
  tone: BadgeTone;
  target: Target;
}
export interface WorkloadRow {
  id: string;
  name: string;
  a: string;
  b: string;
  c: string;
  load: number;
  target: Target;
}
export interface ListItem {
  key: string;
  title: string;
  meta: string;
  tone: BadgeTone;
  tag: string;
  cta: string;
  target: Target;
}
export interface ActivityItem {
  key: string;
  actor: string;
  initials: string;
  isClient: boolean;
  role: string;
  roleTone: BadgeTone;
  action: string;
  target: string;
  time: string;
}
export interface ReviewItem {
  key: string;
  title: string;
  meta: string;
  tone: BadgeTone;
  tag: string;
}

export interface Overview {
  title: string;
  sub: string;
  kpis: Kpi[];
  shortcuts: Shortcut[];
  biz: boolean;
  comp: boolean;
  stageDist: StageBar[];
  trendMonthly: Bucket[];
  trendWeekly: Bucket[];
  tasksMonthly: Bucket[];
  tasksWeekly: Bucket[];
  deadlines: Deadline[];
  workCsr: WorkloadRow[];
  workComp: WorkloadRow[];
  listTitle: string;
  list: ListItem[];
  activity: ActivityItem[];
  reviews: ReviewItem[];
}

export const isDone = (p: Project): boolean => p.stageIdx >= 10 || p.status === "Completed";
