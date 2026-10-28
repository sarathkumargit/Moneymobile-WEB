// Instant placeholder shown inside the dashboard shell while a page's server data loads.
// Having a loading.tsx also lets Next.js prefetch the sidebar routes, so clicks feel immediate.
export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border bg-card p-4">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="mt-4 h-6 w-28 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card">
        <div className="border-b p-4"><div className="h-4 w-48 rounded bg-muted" /></div>
        <div className="divide-y">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="h-3 w-1/4 rounded bg-muted" />
              <div className="h-3 w-1/5 rounded bg-muted" />
              <div className="h-3 w-1/6 rounded bg-muted" />
              <div className="ml-auto h-3 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
