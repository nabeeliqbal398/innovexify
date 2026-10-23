import type { UserStatus } from "@/types/domain";

export function statusTone(status: UserStatus): "ok" | "brand" | "err" {
  if (status === "Active") return "ok";
  return status === "Invited" ? "brand" : "err";
}
