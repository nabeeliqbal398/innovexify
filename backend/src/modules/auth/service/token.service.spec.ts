import { TokenService } from "./token.service";

const tokens = new TokenService({} as never, {} as never);

describe("TokenService", () => {
  it("accepts the raw token whose hash is stored", () => {
    const raw = tokens.generateOpaqueToken();
    expect(tokens.matches(raw, tokens.hash(raw))).toBe(true);
  });

  it("rejects another token, a truncated hash and an empty hash", () => {
    const raw = tokens.generateOpaqueToken();
    const stored = tokens.hash(raw);
    expect(tokens.matches(`${raw}x`, stored)).toBe(false);
    expect(tokens.matches(raw, stored.slice(0, -1))).toBe(false);
    expect(tokens.matches(raw, "")).toBe(false);
  });

  it("generates long, unique, URL-safe tokens and hashes them to 64 hex characters", () => {
    const a = tokens.generateOpaqueToken();
    const b = tokens.generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[\w-]{64}$/);
    expect(tokens.hash(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
