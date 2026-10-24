import { normaliseEmail } from "./throttle.decorators";

describe("normaliseEmail", () => {
  it("writes one mailbox one way", () => {
    expect(normaliseEmail(" Ann@Example.COM ")).toBe("ann@example.com");
  });

  it("ignores anything that is not a non-empty string", () => {
    for (const value of [undefined, null, 5, {}, ["a@b.co"], "", "   "]) expect(normaliseEmail(value)).toBeUndefined();
  });
});
