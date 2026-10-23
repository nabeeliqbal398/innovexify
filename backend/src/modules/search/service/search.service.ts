import { Injectable } from "@nestjs/common";

import type { ActorContext } from "../../../common/interfaces/actor-context";
import { isoDay } from "../../../common/utils/dates";
import type { SearchGroup, SearchItem, SearchResult } from "../dto/search.dto";
import { containsPattern } from "../interfaces/like";
import { SearchRepository } from "../repository/search.repository";

const SNIPPET = 120;
const snippet = (text: string): string => (text.length > SNIPPET ? `${text.slice(0, SNIPPET - 1)}…` : text);
const dayLabel = (date: Date): string => isoDay(date) ?? "";

/**
 * Global search over what the caller may see: the same data scope as the list endpoints, applied inside each query, so a
 * record outside it cannot appear. At most 5 results per kind. Staff search clients, cases, tasks (Admin and Manager only),
 * tickets and conversation messages; a client searches their own case, tickets, messages and documents. Result shape and
 * navigation targets follow the screen's global search.
 */
@Injectable()
export class SearchService {
  constructor(private readonly repo: SearchRepository) {}

  async search(c: ActorContext, q: string): Promise<SearchResult> {
    const actor = { id: c.actor.id, role: c.actor.role };
    const pattern = containsPattern(q);
    const groups: SearchGroup[] = [];
    const add = (key: string, label: string, items: SearchItem[]): void => {
      if (items.length > 0) groups.push({ key, label, items });
    };

    if (c.actor.role === "CLIENT") {
      const [cases, tickets, messages, documents] = await Promise.all([
        this.repo.cases(actor, pattern),
        this.repo.tickets(actor, pattern),
        this.repo.messages(actor, pattern),
        this.repo.documents(c.actor.id, pattern),
      ]);
      add("cases", "Your case", cases.slice(0, 1).map((x) => ({ title: `PRJ-${x.number}`, meta: x.stage, target: { view: "home" } })));
      add("tickets", "Your tickets", tickets.map((x) => ({ title: `TKT-${x.number} · ${x.title}`, meta: x.status, target: { view: "home", query: { view: "tickets", ticket: `TKT-${x.number}` } } })));
      add("messages", "Messages", messages.map((x) => ({ title: `${x.senderName}: ${snippet(x.text)}`, meta: x.createdAt.toISOString(), target: { view: "cmsgs" } })));
      add("documents", "Documents", documents.map((x) => ({ title: x.name, meta: x.status, target: { view: "cdocs", query: { doc: x.id } } })));
      return { query: q, groups };
    }

    const seesTasks = c.actor.role === "ADMIN" || c.actor.role === "MANAGER";
    const [clients, cases, tasks, tickets, messages] = await Promise.all([
      this.repo.clients(actor, pattern),
      this.repo.cases(actor, pattern),
      seesTasks ? this.repo.tasks(actor, pattern) : Promise.resolve([]),
      this.repo.tickets(actor, pattern),
      this.repo.messages(actor, pattern),
    ]);
    add("clients", "Clients", clients.map((x) => ({ title: x.name, meta: `${x.caseNumber} · ${x.businessName || "No business name yet"}`, target: { view: "clients", query: { client: x.id } } })));
    add("cases", "Cases", cases.map((x) => ({ title: `PRJ-${x.number} · ${x.clientName}`, meta: `${x.stage} · ${x.status}`, target: { view: seesTasks ? "cases" : "clients", id: x.id } })));
    add("tasks", "Tasks", tasks.map((x) => ({ title: x.title, meta: `PRJ-${x.caseNumber} · due ${dayLabel(x.due)}${x.done ? " · done" : ""}`, target: { view: "tasks", query: { task: x.id } } })));
    add("tickets", "Tickets", tickets.map((x) => ({ title: `TKT-${x.number} · ${x.title}`, meta: `${x.clientName} · ${x.status}`, target: { view: "tickets", query: { ticket: `TKT-${x.number}`, filter: "all" } } })));
    add("messages", "Messages", messages.map((x) => ({ title: `${x.senderName}: ${snippet(x.text)}`, meta: `Conversation with ${x.clientName} · ${x.createdAt.toISOString()}`, target: { view: "messages", query: { c: x.clientId } } })));
    return { query: q, groups };
  }
}
