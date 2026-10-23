import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnouncementForm } from "@/components/features/announcements/announcement-form";
import { EditCaseDialog } from "@/components/features/cases/edit-case-dialog";
import { CompleteFollowupDialog } from "@/components/features/followups/followup-dialogs";
import { ReportForm } from "@/components/features/reports/report-form";
import { BrandingForm } from "@/components/features/system/branding-form";
import type { FollowUp, Project } from "@/types/domain";
import { failure, fakeApi, okEnvelope, page, renderSignedIn } from "./fake-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a form per area: the server's field errors land on the right inputs", () => {
  it("announcements: a title error from the server shows under Title", async () => {
    fakeApi(({ url, method }) => (url.pathname === "/api/v1/announcements" && method === "POST" ? failure(422, "VALIDATION_FAILED", "Please fix 1 field.", [{ field: "title", message: "That title is already used by a draft." }]) : undefined));
    renderSignedIn(<AnnouncementForm />);
    await userEvent.type(await screen.findByLabelText("Title"), "Office closed");
    await userEvent.type(screen.getByLabelText("Message"), "We are closed on Monday.");
    await userEvent.click(screen.getByRole("button", { name: /save draft/i }));
    expect(await screen.findByText("That title is already used by a draft.")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  });

  it("reports: a field error on the subject shows under Subject and nothing is sent twice", async () => {
    const requests = fakeApi(
      ({ url, method }) => (url.pathname === "/api/v1/clients" && method === "GET" ? page([{ id: "c42", name: "Alex Morgan", email: "a@b.co", status: "ACTIVE", caseNumber: "CASE-2026-0042", businessName: "", formationState: "", phone: "", contactPreference: "PORTAL_MESSAGE", csr: null, joinedAt: null, createdAt: "2026-10-01T00:00:00.000Z", case: null }]) : undefined),
      ({ url, method }) => (url.pathname === "/api/v1/reports" && method === "POST" ? failure(422, "VALIDATION_FAILED", "Fix the subject.", [{ field: "title", message: "Use a more specific subject." }]) : undefined),
    );
    renderSignedIn(<ReportForm onSubmitted={() => undefined} />, { id: "u3", name: "John Smith", email: "j@b.co", role: "CSR", status: "Active" });
    await screen.findByRole("option", { name: /Alex Morgan/ });
    await userEvent.selectOptions(screen.getByLabelText("Client and case"), "c42");
    await userEvent.type(screen.getByLabelText("Subject"), "Missing papers");
    await userEvent.type(screen.getByLabelText("Description"), "The client has not sent the lease.");
    await userEvent.click(screen.getByRole("button", { name: /submit to compliance/i }));
    expect(await screen.findByText("Use a more specific subject.")).toBeInTheDocument();
    expect(requests.filter((r) => r.method === "POST")).toHaveLength(1);
  });

  it("follow-ups: the outcome error shows under Outcome", async () => {
    fakeApi(({ url, method }) => (url.pathname.endsWith("/done") && method === "POST" ? failure(422, "FOLLOWUP_OUTCOME_REQUIRED", "Say what happened.", [{ field: "outcome", message: "Say what happened on the call." }]) : undefined));
    const followup = { id: "f1", client: "c42", clientName: "Alex Morgan", clientCaseId: "CASE-2026-0042", csr: "u3", csrName: "John", type: "Call", due: "2026-11-01", status: "Open", overdue: false, note: "Check in", createdAt: 0 } as FollowUp;
    renderSignedIn(<CompleteFollowupDialog followup={followup} onClose={() => undefined} />);
    await userEvent.type(await screen.findByLabelText("Outcome"), "Spoke to Alex");
    await userEvent.click(screen.getByRole("button", { name: "Mark complete" }));
    expect(await screen.findByText("Say what happened on the call.")).toBeInTheDocument();
  });

  it("settings: the company name error shows under Company name", async () => {
    fakeApi(
      ({ url, method }) => (url.pathname === "/api/v1/company" && method === "GET" ? okEnvelope({ name: "Innovexify", casePrefix: "CASE", logo: "", updatedAt: "2026-10-01T00:00:00.000Z" }) : undefined),
      ({ url, method }) => (url.pathname === "/api/v1/company" && method === "PATCH" ? failure(422, "VALIDATION_FAILED", "Bad name.", [{ field: "name", message: "That name is not allowed." }]) : undefined),
    );
    renderSignedIn(<BrandingForm />);
    const input = await screen.findByLabelText("Company name");
    await waitFor(() => expect(input).toHaveValue("Innovexify"));
    await userEvent.clear(input);
    await userEvent.type(input, "Acme Filings");
    await userEvent.click(screen.getByRole("button", { name: "Save branding" }));
    expect(await screen.findByText("That name is not allowed.")).toBeInTheDocument();
  });
});

describe("a stale case edit opens the reload prompt and keeps what was typed", () => {
  const project = {
    id: "PRJ-118",
    apiId: "case-1",
    version: 3,
    client: "c42",
    clientName: "Alex Morgan",
    clientCaseId: "CASE-2026-0042",
    biz: "",
    state: "",
    csr: null,
    csrName: null,
    stageIdx: 3,
    status: "Active",
    filing: "",
    service: "llc",
    serviceName: "LLC formation",
    priority: "Normal",
    deadline: "2026-11-01",
    createdAt: 0,
    last: 0,
    notes: [],
    events: [],
  } as Project;

  it("shows the conflict prompt on a 409 and sends the version it was given", async () => {
    const requests = fakeApi(({ url, method }) => (url.pathname === "/api/v1/cases/case-1" && method === "PATCH" ? failure(409, "CONCURRENT_MODIFICATION", "Someone else changed this case. Reload to see their changes.") : undefined));
    const { store } = renderSignedIn(<EditCaseDialog project={project} onClose={() => undefined} />);
    await userEvent.selectOptions(await screen.findByLabelText("Priority"), "High");
    await userEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(store.getState().ui.conflict?.message).toMatch(/Someone else changed this case/));
    expect(requests.find((r) => r.method === "PATCH")?.body).toMatchObject({ version: 3, priority: "HIGH" });
    expect(screen.getByLabelText("Priority")).toHaveValue("High"); // what was typed is still there
  });
});
