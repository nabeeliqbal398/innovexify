import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeStore } from "@/store";
import { sessionActions } from "@/store/sessionSlice";
import type { Role, User } from "@/types/domain";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/features/workspace/workspace-shell", () => ({ WorkspaceShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }));
vi.mock("@/components/features/workspace/view-registry", () => ({ ViewOutlet: () => <div>the view</div> }));

import { WorkspacePage } from "@/components/features/workspace/workspace-page";

const person = (role: Role): User => ({ id: "x", name: "Test Person", email: "t@example.com", role, status: "Active" });

function renderPage(rolePath: string, slug: string[], user: User | null) {
  const store = makeStore();
  if (user) store.dispatch(sessionActions.signedIn({ accessToken: "t", user }));
  else store.dispatch(sessionActions.ended(null));
  return render(
    <Provider store={store}>
      <WorkspacePage rolePath={rolePath} slug={slug} />
    </Provider>,
  );
}

beforeEach(() => {
  replace.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined); // React logs a thrown render error
});

describe("the role guard on workspace routes", () => {
  it("lets each role into its own workspace", () => {
    renderPage("admin", ["overview"], person("ADMIN"));
    expect(screen.getByTestId("shell")).toBeInTheDocument();
  });

  it.each<[Role, string]>([
    ["CLIENT", "admin"],
    ["CLIENT", "manager"],
    ["CSR", "admin"],
    ["COMPLIANCE", "admin"],
    ["MANAGER", "admin"],
    ["ADMIN", "client"],
  ])("a %s is shown the not-available page at /%s", (role, path) => {
    expect(() => renderPage(path, ["overview"], person(role))).toThrow("NEXT_NOT_FOUND");
    expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
  });

  it("sends someone who is not signed in to the sign-in page", () => {
    renderPage("admin", ["overview"], null);
    expect(screen.queryByTestId("shell")).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("refuses a view the role does not have", () => {
    expect(() => renderPage("csr", ["analytics"], person("CSR"))).toThrow("NEXT_NOT_FOUND");
  });
});
