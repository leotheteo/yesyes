export default function Loading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading page"
      className="mx-auto max-w-7xl space-y-8 px-6 py-16"
    >
      <div className="skeleton h-12 w-48" />
      <div className="skeleton h-64" />
    </main>
  );
}
