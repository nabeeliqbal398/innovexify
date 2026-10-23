import { NOTIFICATION_PREF_DEFAULTS } from "@/constants/vocab";
import type { NotificationPrefs, User } from "@/types/domain";
import { PREF_CATEGORY, ROLES, USER_STATUS, type PrefCategoryKey } from "./enums";

/** `GET /auth/me`. */
export interface ApiMe {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  clientProfile: { caseNumber: string; csrId: string | null; businessName?: string; formationState?: string } | null;
}

export function mapMe(me: ApiMe): User {
  const profile = me.clientProfile;
  return {
    id: me.id,
    name: me.name,
    email: me.email,
    role: ROLES.toLabel(me.role),
    status: USER_STATUS.toLabel(me.status),
    ...(profile
      ? { caseId: profile.caseNumber, csr: profile.csrId, biz: profile.businessName ?? "", state: profile.formationState ?? "" }
      : {}),
  };
}

export interface ApiPreference {
  category: PrefCategoryKey;
  email: boolean;
  inApp: boolean;
}

/** The five categories, each with both channels; a category the server doesn't list stays on (the server's default). */
export function mapPrefs(items: readonly ApiPreference[]): NotificationPrefs {
  const prefs: NotificationPrefs = structuredClone(NOTIFICATION_PREF_DEFAULTS);
  for (const item of items) {
    const key = PREF_CATEGORY[item.category];
    if (key) prefs[key] = { email: item.email, app: item.inApp };
  }
  return prefs;
}
