import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { stamp } from "@/lib/dates";
import { buildSeed } from "@/lib/seed";
import type { AuditEntry, Counters, DemoData, Role } from "@/types/domain";

/** Collections that hold records addressed by an `id`. */
type Collections = Pick<
  DemoData,
  | "users"
  | "projects"
  | "tasks"
  | "docs"
  | "reports"
  | "anns"
  | "tickets"
  | "followups"
  | "interactions"
  | "filings"
  | "services"
>;
export type CollectionKey = keyof Collections;
type Item<K extends CollectionKey> = Collections[K][number];

export type AddPayload = {
  [K in CollectionKey]: { key: K; item: Item<K>; prepend?: boolean };
}[CollectionKey];
export type PatchPayload = {
  [K in CollectionKey]: { key: K; id: Item<K>["id"]; patch: Partial<Item<K>> };
}[CollectionKey];

export interface DeniedNotice {
  title: string;
  body: string;
}
export interface ProbeEntry {
  role: string;
  label: string;
  ok: boolean;
}

export interface WorkspaceState {
  data: DemoData;
  meId: string;
  /** When set, the workspace only ever acts as this user (a role-locked screen). */
  lockedUid: string | null;
  denied: DeniedNotice | null;
  probeLog: ProbeEntry[];
}

const initialState: WorkspaceState = {
  data: buildSeed(),
  meId: "u1",
  lockedUid: null,
  denied: null,
  probeLog: [],
};

function findById<T extends { id: string | number }>(list: T[], id: string | number): T | undefined {
  return list.find((x) => x.id === id);
}

const slice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    /** Enter a workspace as one user. Re-seeds so every visit starts from the same data. */
    enterWorkspace(state, action: PayloadAction<{ meId: string; locked: boolean }>) {
      state.data = buildSeed();
      state.meId = action.payload.meId;
      state.lockedUid = action.payload.locked ? action.payload.meId : null;
      state.denied = null;
      state.probeLog = [];
    },
    resetData(state) {
      state.data = buildSeed();
      state.denied = null;
      state.probeLog = [];
    },
    added(state, action: PayloadAction<AddPayload>) {
      const { key, item, prepend } = action.payload;
      const list = state.data[key] as Array<typeof item>;
      if (prepend) list.unshift(item);
      else list.push(item);
    },
    patched(state, action: PayloadAction<PatchPayload>) {
      const { key, id, patch } = action.payload;
      const list = state.data[key] as Array<{ id: string | number }>;
      const target = findById(list, id);
      if (target) Object.assign(target, patch);
    },
    counterBumped(state, action: PayloadAction<keyof Counters>) {
      state.data.counters[action.payload] += 1;
    },
    messageAdded(
      state,
      action: PayloadAction<{
        clientId: string;
        readerId: string;
        message: DemoData["msgs"][string][number];
      }>,
    ) {
      const { clientId, readerId, message } = action.payload;
      const thread = (state.data.msgs[clientId] ??= []);
      thread.push(message);
      const reads = (state.data.lastRead[readerId] ??= {});
      reads[clientId] = thread.length;
    },
    threadOpened(state, action: PayloadAction<string>) {
      state.data.msgs[action.payload] ??= [];
    },
    conversationRead(state, action: PayloadAction<{ readerId: string; clientId: string }>) {
      const { readerId, clientId } = action.payload;
      const reads = (state.data.lastRead[readerId] ??= {});
      reads[clientId] = (state.data.msgs[clientId] ?? []).length;
    },
    notified(state, action: PayloadAction<{ ids: string[]; text: string; link: string }>) {
      const { ids, text, link } = action.payload;
      const time = stamp();
      const at = Date.now();
      ids.forEach((id) => {
        if (!id) return;
        const list = (state.data.notifs[id] ??= []);
        list.unshift({ text, time, at, unread: true, link });
      });
    },
    notificationRead(state, action: PayloadAction<{ userId: string; index: number }>) {
      const n = state.data.notifs[action.payload.userId]?.[action.payload.index];
      if (n) n.unread = false;
    },
    notificationsReadAll(state, action: PayloadAction<string>) {
      (state.data.notifs[action.payload] ?? []).forEach((n) => {
        n.unread = false;
      });
    },
    audited(state, action: PayloadAction<AuditEntry>) {
      state.data.audit.unshift(action.payload);
    },
    triggerPatched(
      state,
      action: PayloadAction<{ k: string; patch: Partial<DemoData["triggers"][number]> }>,
    ) {
      const t = state.data.triggers.find((x) => x.k === action.payload.k);
      if (t) Object.assign(t, action.payload.patch);
    },
    companyPatched(state, action: PayloadAction<Partial<DemoData["company"]>>) {
      Object.assign(state.data.company, action.payload);
    },
    announcementAcked(state, action: PayloadAction<{ id: number; userId: string }>) {
      const a = findById(state.data.anns, action.payload.id);
      if (a) a.acks[action.payload.userId] = true;
    },
    deniedSet(state, action: PayloadAction<DeniedNotice | null>) {
      state.denied = action.payload;
    },
    probeLogged(state, action: PayloadAction<ProbeEntry>) {
      state.probeLog = [action.payload, ...state.probeLog].slice(0, 5);
    },
  },
});

export const workspaceActions = slice.actions;
export const workspaceReducer = slice.reducer;
export type { Role };
