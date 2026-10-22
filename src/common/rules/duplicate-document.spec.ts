import { findDuplicateRequest, normalizeTitle } from "./duplicate-document";

const open = [{ name: "Proof of address (utility bill)" }, { name: "Passport copy" }, { name: "EIN" }];

describe("duplicate document request (ported from findDuplicateDocument)", () => {
  it("normalises like the prototype", () => {
    expect(normalizeTitle("Upload the NEW Passport (scan)")).toBe("passport");
    expect(normalizeTitle("Proof-of-address!")).toBe("proof address");
  });

  it("finds an open request that the title repeats, whichever contains the other", () => {
    expect(findDuplicateRequest("Upload proof of address", open)?.name).toBe("Proof of address (utility bill)");
    expect(findDuplicateRequest("Send updated passport", open)?.name).toBe("Passport copy");
    expect(findDuplicateRequest("Proof of address and utility bills for 2025", open)?.name).toBe("Proof of address (utility bill)");
  });

  it("ignores titles that don't match, are too short, or match too little", () => {
    expect(findDuplicateRequest("Call the client", open)).toBeNull();
    expect(findDuplicateRequest("ID", open)).toBeNull();
    // "EIN" normalises to 3 characters, under the 4-character floor, so it never matches anything.
    expect(findDuplicateRequest("Get the EIN letter", open)).toBeNull();
    expect(findDuplicateRequest("Passport", [])).toBeNull();
  });
});
