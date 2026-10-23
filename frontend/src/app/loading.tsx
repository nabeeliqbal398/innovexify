export default function Loading() {
  return (
    <div className="min-h-screen bg-background" aria-busy="true" aria-label="Loading">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10">
        <div className="skel h-8 w-1/3" />
        <div className="skel h-24" />
        <div className="skel h-24" />
      </div>
    </div>
  );
}
