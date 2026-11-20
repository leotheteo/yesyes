import Link from "next/link";
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-16">
      <Link href="/" className="text-primary underline">
        Back to Family
      </Link>
      <h1 className="text-3xl font-semibold">Privacy</h1>
      <p>
        This household server stores account details, shared lists, calendar
        events, attachments, restaurant preferences, votes, and media requests.
        Signed-in household members can access shared content. Passwords are
        hashed. Connection credentials are encrypted.
      </p>
      <p>
        The person operating this server manages access, backups, retention, and
        deletion. Contact them to remove your account or household information.
      </p>
      <p>
        When Google Places is configured, restaurant searches are sent to
        Google. Google receives the search text and server connection
        information. Google results are retrieved on demand; this hub stores
        linked place IDs. See{" "}
        <a
          className="text-primary underline"
          href="https://policies.google.com/privacy"
        >
          Google’s Privacy Policy
        </a>
        .
      </p>
      <p>
        Media searches and requests are sent to the configured Seerr server.
        Jellyfin library searches, title details, posters, and recently added
        media come from the configured Jellyfin server. The hub stores assigned
        Jellyfin profile IDs. Favorites and watch-history changes are sent to
        the linked profile on that server. Those services apply their own access
        and retention settings. File previews render in your browser without
        sending attachments to a third-party viewer.
      </p>
      <p>
        The hub uses necessary session cookies. It contains no advertising or
        analytics trackers. Files remain on the household server and in any
        backups its operator creates.
      </p>
    </main>
  );
}
