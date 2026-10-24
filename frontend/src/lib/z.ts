import * as zod from "zod";

// Zod 4 compiles a faster parser with `new Function(...)` when the browser allows it, and finds out by trying. Under a
// Content-Security-Policy without 'unsafe-eval' that attempt is blocked and reported as a violation, even though zod copes. The switch
// has to be set BEFORE any schema is built, and schemas are built when their module loads, in no fixed order. So every file imports `z`
// from here (an ESLint rule forbids importing "zod" directly) and this module sets it first. Forms are small; the plain parser is fast enough.
zod.config({ jitless: true });

export * as z from "zod";
