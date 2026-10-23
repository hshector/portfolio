import { Skeleton } from "@/components/ui/primitives";

/** Shown the instant a tab is tapped, while the server prepares the screen. It fades in
 *  only after a short delay, so fast navigations never flash a placeholder. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="route-loading mx-auto flex max-w-[760px] flex-col gap-4">
      <Skeleton className="h-9 w-44" />
      <div className="card flex flex-col gap-3 px-5 py-6">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="card flex flex-col gap-4 px-5 py-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
