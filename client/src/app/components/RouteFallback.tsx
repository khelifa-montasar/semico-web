/**
 * Shown while a lazily-loaded route is being fetched.
 *
 * Deliberately minimal and chrome-free: the surrounding layout keeps its navbar or sidebar, so this
 * only has to occupy the content area without jumping the layout around.
 */
export function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24">
      <div
        className="w-6 h-6 rounded-full border-2 animate-spin"
        style={{ borderColor: "rgba(0,168,89,0.25)", borderTopColor: "#00A859" }}
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
