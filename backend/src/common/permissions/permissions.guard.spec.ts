import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuditService } from "../audit/audit.service";
import { PermissionDeniedException } from "../exceptions";
import type { PrismaService } from "../../prisma/prisma.service";
import { REASON } from "./permissions";
import { PermissionsGuard } from "./permissions.guard";
import { RequirePermission, type ResourceResolver } from "./require-permission.decorator";

class Probe {
  @RequirePermission("removeUser")
  remove(): void {}

  @RequirePermission("viewClient", ({ request }) => ({ id: String(request.params.clientId), csr: "csr-1" }))
  view(): void {}

  open(): void {}
}

function contextFor(handler: () => void, user: unknown, extra: Record<string, unknown> = {}): ExecutionContext {
  const request = { user, method: "GET", path: "/x", route: { path: "/x" }, ip: "127.0.0.1", id: "req-1", params: {}, ...extra };
  return {
    getHandler: () => handler,
    getClass: () => Probe,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("PermissionsGuard", () => {
  const record = jest.fn().mockResolvedValue(undefined);
  const guard = new PermissionsGuard(new Reflector(), {} as PrismaService, { record } as unknown as AuditService);
  const probe = new Probe();

  beforeEach(() => record.mockClear());

  it("lets a route with no requirement through", async () => {
    await expect(guard.canActivate(contextFor(probe.open, undefined))).resolves.toBe(true);
    expect(record).not.toHaveBeenCalled();
  });

  it("allows a permitted role without writing an audit row", async () => {
    const admin = { id: "admin-1", role: "ADMIN", status: "ACTIVE" };
    await expect(guard.canActivate(contextFor(probe.remove, admin))).resolves.toBe(true);
    expect(record).not.toHaveBeenCalled();
  });

  it("refuses with the rule's reason and writes an ok=false audit row", async () => {
    const csr = { id: "csr-1", role: "CSR", status: "ACTIVE" };
    await expect(guard.canActivate(contextFor(probe.remove, csr))).rejects.toThrow(PermissionDeniedException);
    await expect(guard.canActivate(contextFor(probe.remove, csr))).rejects.toMatchObject({
      response: { errorCode: "PERMISSION_DENIED", message: REASON.removeUser },
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "csr-1", actorRole: "CSR", ok: false, category: "users", requestId: "req-1" }),
    );
  });

  it("refuses when nobody is signed in", async () => {
    await expect(guard.canActivate(contextFor(probe.remove, undefined))).rejects.toThrow(PermissionDeniedException);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ actorId: undefined, ok: false }));
  });

  it("passes the resolved resource to the ownership rules", async () => {
    const own = { id: "csr-1", role: "CSR", status: "ACTIVE" };
    const other = { id: "csr-2", role: "CSR", status: "ACTIVE" };
    await expect(guard.canActivate(contextFor(probe.view, own, { params: { clientId: "client-a" } }))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(probe.view, other, { params: { clientId: "client-a" } }))).rejects.toThrow(
      PermissionDeniedException,
    );
  });

  it("resolvers may load the resource from the database", async () => {
    const resolver: ResourceResolver = async ({ prisma }) => ({ id: String((prisma as unknown as { marker: string }).marker) });
    expect(await resolver({ request: {} as never, prisma: { marker: "from-db" } as unknown as PrismaService })).toEqual({ id: "from-db" });
  });
});
