import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <p className="mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page doesn&apos;t exist</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The link may be out of date, or your role may not have a page here. Go back to sign in and choose a workspace.
      </p>
      <Link
        href="/"
        className="inline-flex h-10 items-center rounded-md border border-primary bg-primary px-4 font-medium text-primary-foreground no-underline hover:bg-primary-hover hover:text-primary-foreground"
      >
        Back to sign in
      </Link>
    </main>
  );
}
