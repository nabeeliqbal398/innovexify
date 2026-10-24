import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeStore } from "@/store";
import { sessionActions } from "@/store/sessionSlice";

import { failure, okEnvelope } from "./fake-api";

const push = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { ForgotPasswordScreen, ResetPasswordScreen } from "@/components/features/auth/password-reset-screens";

const NEW_PASSWORD = "Brand-New-Passw0rd!";
const SAME = "If an account exists for that email, we've sent a link to reset the password.";

type Call = { method: string; path: string; body: unknown };

/** A fake server: one handler per route, every request recorded. */
function serve(handler: (call: Call) => Response | undefined): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request) => {
      const url = new URL(input.url);
      const text = input.method === "GET" ? "" : await input.clone().text();
      const call = { method: input.method, path: url.pathname, body: text ? (JSON.parse(text) as unknown) : undefined };
      calls.push(call);
      return handler(call) ?? failure(500, "INTERNAL_ERROR", "unhandled in test");
    }),
  );
  return calls;
}

function renderScreen(ui: React.ReactNode) {
  const store = makeStore();
  store.dispatch(sessionActions.ended(null));
  return render(<Provider store={store}>{ui}</Provider>);
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the forgot-password page", () => {
  it("asks for the email and shows the server's same-for-everyone answer", async () => {
    const calls = serve((c) => (c.path === "/api/v1/auth/forgot-password" ? new Response(JSON.stringify({ success: true, statusCode: 200, message: SAME, data: null, timestamp: "", path: "" }), { status: 200, headers: { "content-type": "application/json" } }) : undefined));
    renderScreen(<ForgotPasswordScreen />);
    await userEvent.type(screen.getByLabelText("Email"), "  Ann@Example.com ");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText(SAME)).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/forgot-password"))?.body).toEqual({ email: "Ann@Example.com" });
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/");
  });

  it("checks the address before sending anything", async () => {
    const calls = serve(() => undefined);
    renderScreen(<ForgotPasswordScreen />);
    await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("puts a field error from the server on the email input", async () => {
    serve(() => failure(422, "VALIDATION_FAILED", "Enter a valid email address.", [{ field: "email", message: "Enter a valid email address." }]));
    renderScreen(<ForgotPasswordScreen />);
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    const input = screen.getByLabelText("Email");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
  });

  it("shows the throttle message from the server and stays on the form", async () => {
    serve(() => failure(429, "TOO_MANY_REQUESTS", "Too many requests in a short time. Wait a minute and try again."));
    renderScreen(<ForgotPasswordScreen />);
    await userEvent.type(screen.getByLabelText("Email"), "ann@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many requests in a short time. Wait a minute and try again.");
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });
});

describe("the reset-password page", () => {
  const link = (route: Response) => serve((c) => (c.method === "GET" && c.path.includes("/auth/reset-password/") ? route : undefined));

  it("says when the link has expired, and offers a new one", async () => {
    link(failure(410, "PASSWORD_RESET_EXPIRED", "This password reset link has expired."));
    renderScreen(<ResetPasswordScreen token={"t".repeat(48)} />);
    expect(await screen.findByRole("heading", { name: "This reset link has expired" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Request a new link" }));
    expect(push).toHaveBeenCalledWith("/forgot-password");
  });

  it("says when the link was already used", async () => {
    link(failure(409, "PASSWORD_RESET_USED", "This password reset link was already used."));
    renderScreen(<ResetPasswordScreen token={"t".repeat(48)} />);
    expect(await screen.findByRole("heading", { name: "This link was already used" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to sign in" }));
    expect(push).toHaveBeenCalledWith("/");
  });

  it("says when the link is not valid", async () => {
    link(failure(404, "PASSWORD_RESET_INVALID", "This password reset link isn't valid."));
    renderScreen(<ResetPasswordScreen token={"t".repeat(48)} />);
    expect(await screen.findByRole("heading", { name: "This link isn't valid" })).toBeInTheDocument();
  });

  it("offers a retry, not a verdict on the link, when the server could not be reached", async () => {
    link(failure(503, "SERVICE_UNAVAILABLE", "The database is not reachable right now."));
    renderScreen(<ResetPasswordScreen token={"t".repeat(48)} />);
    expect(await screen.findByRole("heading", { name: "We couldn't check this link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  async function openForm(extra?: (call: Call) => Response | undefined) {
    const calls = serve((c) => {
      if (c.method === "GET") return okEnvelope({ expiresAt: new Date(Date.now() + 20 * 60_000).toISOString() });
      return extra?.(c);
    });
    renderScreen(<ResetPasswordScreen token={"t".repeat(48)} />);
    await screen.findByRole("heading", { name: "Choose a new password" });
    return calls;
  }

  it("holds the button back until the two passwords agree and follow the rules", async () => {
    const calls = await openForm();
    await userEvent.type(screen.getByLabelText("New password"), "short");
    await userEvent.type(screen.getByLabelText("Confirm new password"), "different");
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("Use at least 12 characters with upper and lowercase letters and a number.")).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("changes the password and tells the person every device was signed out", async () => {
    const calls = await openForm(() => okEnvelope({ sessionsEnded: 2 }));
    await userEvent.type(screen.getByLabelText("New password"), NEW_PASSWORD);
    await userEvent.type(screen.getByLabelText("Confirm new password"), NEW_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("heading", { name: "Password changed" })).toBeInTheDocument();
    expect(screen.getByText(/signed out of every device/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/v1/auth/reset-password", body: { token: "t".repeat(48), password: NEW_PASSWORD } });
    await userEvent.click(screen.getByRole("button", { name: "Go to sign in" }));
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("puts the server's password-rule error on the field", async () => {
    await openForm(() => failure(422, "VALIDATION_FAILED", "Use 12 to 128 characters.", [{ field: "password", message: "The server wants a different password." }]));
    await userEvent.type(screen.getByLabelText("New password"), NEW_PASSWORD);
    await userEvent.type(screen.getByLabelText("Confirm new password"), NEW_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByText("The server wants a different password.")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toHaveAttribute("aria-invalid", "true");
  });

  it("switches to the right message when the link is used up between opening the page and sending the form", async () => {
    await openForm(() => failure(409, "PASSWORD_RESET_USED", "This password reset link was already used."));
    await userEvent.type(screen.getByLabelText("New password"), NEW_PASSWORD);
    await userEvent.type(screen.getByLabelText("Confirm new password"), NEW_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("heading", { name: "This link was already used" })).toBeInTheDocument();
  });

  it("shows an unexpected failure inline and lets the person try again", async () => {
    await openForm(() => failure(500, "INTERNAL_ERROR", "Something on our side went wrong."));
    await userEvent.type(screen.getByLabelText("New password"), NEW_PASSWORD);
    await userEvent.type(screen.getByLabelText("Confirm new password"), NEW_PASSWORD);
    await userEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something on our side went wrong.");
    expect(screen.getByRole("button", { name: "Change password" })).toBeEnabled();
  });
});
