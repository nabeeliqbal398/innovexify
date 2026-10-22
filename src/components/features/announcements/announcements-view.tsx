"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/primitives";
import { ROLE_LABEL, type BadgeTone } from "@/constants/vocab";
import { useAppDispatch, useData } from "@/hooks/useStore";
import { setAnnouncementStatus } from "@/store/actions/comms";
import { userById, userName } from "@/store/selectors";
import type { Announcement, AnnouncementPriority, AnnouncementStatus } from "@/types/domain";

import { AnnouncementForm } from "./announcement-form";

const PRIORITY_TONE: Record<AnnouncementPriority, BadgeTone> = { Urgent: "err", Important: "warn", Normal: "q" };
const STATUS_TONE: Record<AnnouncementStatus, BadgeTone> = { Published: "ok", Draft: "q", Archived: "violet" };

/** Publish to all clients or one client, and track acknowledgements. */
export function AnnouncementsView() {
  const data = useData();
  const dispatch = useAppDispatch();

  const ackText = (a: Announcement): string => {
    if (!a.ack) return "";
    const targets = a.aud === "all" ? data.users.filter((u) => u.role === "CLIENT" && u.status === "Active") : [userById(data, a.aud)];
    const done = targets.filter((c) => c && a.acks[c.id]).length;
    return `${done}/${targets.length} acknowledged`;
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Announcements" description="Publish to all clients or one client. Clients only ever see announcements meant for them." />
      <AnnouncementForm />
      <section className="card overflow-hidden">
        {data.anns.map((a, i) => {
          const author = userById(data, a.by);
          return (
            <div key={a.id} className={i === 0 ? "row border-t-0" : "row"}>
              <div className="min-w-0 flex-[1_1_220px]">
                <div className="font-semibold">{a.title}</div>
                <div className="help">
                  {a.aud === "all" ? "All clients" : `${userName(data, a.aud)} only`} · by {author?.name ?? "—"} ({author ? ROLE_LABEL[author.role] : ""}) ·{" "}
                  {a.date || "not published"}
                  {a.exp ? ` · expires ${a.exp}` : ""}
                </div>
              </div>
              <Badge tone={PRIORITY_TONE[a.prio]}>{a.prio}</Badge>
              <Badge tone={STATUS_TONE[a.status]}>{a.status}</Badge>
              <span className="help">{ackText(a)}</span>
              {a.status === "Draft" ? (
                <Button size="sm" variant="primary" onClick={() => dispatch(setAnnouncementStatus(a.id, "Published"))}>
                  Publish
                </Button>
              ) : null}
              {a.status === "Published" ? (
                <Button size="sm" onClick={() => dispatch(setAnnouncementStatus(a.id, "Archived"))}>
                  Archive
                </Button>
              ) : null}
            </div>
          );
        })}
        {data.anns.length === 0 ? <div className="row help border-t-0">No announcements yet.</div> : null}
      </section>
    </div>
  );
}
