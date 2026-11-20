import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <p className="meta-label">404</p>
      <h1 className="mt-4 text-3xl font-semibold">Page not found</h1>
      <Link className="mt-8 inline-block text-primary underline" href="/">
        Go home
      </Link>
    </main>
  );
}
