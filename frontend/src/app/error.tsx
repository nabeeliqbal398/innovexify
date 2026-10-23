"use client";

/** Last-resort boundary. It never shows the error message or stack to the user. */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="mono text-sm text-muted-foreground">500</p>
      <h1 className="text-2xl font-semibold tracking-tight">Something on our side went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your changes up to now are safe. Try again, and if it keeps happening, tell your administrator the time it occurred.
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-10 cursor-pointer items-center rounded-md border border-primary bg-primary px-4 font-medium text-primary-foreground hover:bg-primary-hover"
      >
        Try again
      </button>
    </main>
  );
}
