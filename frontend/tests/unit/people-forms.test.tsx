import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmailDialog } from "@/components/features/people/person-dialogs";
import { makeStore } from "@/store";
import { sessionActions } from "@/store/sessionSlice";
import type { User } from "@/types/domain";

const admin: User = { id: "u1", name: "Sarah Bennett", email: "sarah@example.com", role: "ADMIN", status: "Active" };
const target: User = { id: "u3", name: "John Smith", email: "john@example.com", role: "CSR", status: "Active" };

const failure = (status: number, errorCode: string, message: string, errors: Array<{ field: string; message: string }> = []): Response =>
  new Response(JSON.stringify({ success: false, statusCode: status, errorCode, message, errors, timestamp: "", path: "" }), { status, headers: { "content-type": "application/json" } });

function renderWithStore(ui: ReactNode) {
  const store = makeStore();
  store.dispatch(sessionActions.signedIn({ accessToken: "good", user: admin }));
  return { store, ...render(<Provider store={store}>{ui}</Provider>) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the change-email form (people)", () => {
  it("puts the server's field error on the email input", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => failure(409, "EMAIL_IN_USE", "The email taken@example.com is already used.", [{ field: "email", message: "This email is already in use." }])));
    renderWithStore(<EmailDialog user={target} onClose={() => undefined} />);
    const input = await screen.findByLabelText("New email");
    await userEvent.clear(input);
    await userEvent.type(input, "taken@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Update email" }));
    expect(await screen.findByText("This email is already in use.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("closes after a successful change", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ success: true, statusCode: 200, data: { id: "u3", email: "new@example.com", name: "John Smith", role: "CSR", status: "ACTIVE", invitedById: null, invitedByName: null, lastLoginAt: null, caseNumber: null }, timestamp: "", path: "" }), { status: 200, headers: { "content-type": "application/json" } })),
    );
    const onClose = vi.fn();
    renderWithStore(<EmailDialog user={target} onClose={onClose} />);
    const input = await screen.findByLabelText("New email");
    await userEvent.clear(input);
    await userEvent.type(input, "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Update email" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("opens the permission dialog with the server's own reason on a 403", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => failure(403, "PERMISSION_DENIED", "You can't change this user's email.")));
    const { store } = renderWithStore(<EmailDialog user={target} onClose={() => undefined} />);
    const input = await screen.findByLabelText("New email");
    await userEvent.clear(input);
    await userEvent.type(input, "other@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Update email" }));
    await waitFor(() => expect(store.getState().ui.denied?.body).toBe("You can't change this user's email."));
  });
});
