export default function Loading() {
  return (
    <main id="main" aria-busy="true" className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
      <p className="sr-only" role="status">
        Loading the gallery…
      </p>
      <div className="mb-16 h-20 max-w-md animate-pulse bg-subtle" />
      <ul className="grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="h-80 animate-pulse border border-subtle bg-subtle sm:h-96" />
        ))}
      </ul>
    </main>
  );
}
