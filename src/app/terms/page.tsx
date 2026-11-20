import Link from "next/link";
export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16">
      <Link href="/" className="text-primary underline">
        Back to Family
      </Link>
      <h1 className="text-3xl font-semibold">Terms</h1>
      <p>
        This hub is for invited household members. Keep account credentials and
        invitation links private. Upload only files you have permission to share
        with the household.
      </p>
      <p>
        Restaurant prices and distances are estimates. Confirm opening hours,
        availability, and event details with the venue or organizer.
      </p>
      <p>
        Google Places features are subject to the{" "}
        <a
          className="text-primary underline"
          href="https://maps.google.com/help/terms_maps/"
        >
          Google Maps Terms of Service
        </a>{" "}
        and{" "}
        <a
          className="text-primary underline"
          href="https://policies.google.com/privacy"
        >
          Google Privacy Policy
        </a>
        .
      </p>
      <p>
        The household operator maintains the server and backups. Availability
        depends on the server and connected services. Contact the operator about
        access, deletion, or incorrect content.
      </p>
    </main>
  );
}
