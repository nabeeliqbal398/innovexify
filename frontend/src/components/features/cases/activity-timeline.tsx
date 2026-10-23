import { Badge } from "@/components/ui/badge";
import { Timeline } from "@/components/ui/primitives";
import type { TimelineEntry } from "./case-data";

/** Dot-and-line list of case, document, ticket and message events. */
export function ActivityTimeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Timeline
      items={entries.map((e) => ({
        id: e.id,
        dotClass: e.dot,
        content: (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={e.tone} compact>
                {e.kind}
              </Badge>
              <span className="text-sm">{e.text}</span>
            </div>
            {e.note ? <div className="mini">{e.note}</div> : null}
            <div className="help">
              {e.who} · {e.role} · {e.time}
            </div>
          </>
        ),
      }))}
    />
  );
}
