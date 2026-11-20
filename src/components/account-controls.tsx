"use client";
import { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { TIME_ZONE } from "@/lib/calendar";
import { api, useHub } from "./context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Empty, Field, Submit } from "./common";
type Accounts = {
  ownerId?: string;
  accounts: {
    id: string;
    name: string;
    email: string;
    disabled: boolean;
    jellyfinProfile: { jellyfinUserId: string } | null;
  }[];
  sessions: {
    id: string;
    userId: string;
    userAgent: string | null;
    ipAddress: string | null;
    updatedAt: string;
  }[];
  links: {
    id: string;
    email: string | null;
    kind: string;
    expiresAt: string;
  }[];
};
export function AccountControls() {
  const { snapshot, pending, run } = useHub();
  const [data, setData] = useState<Accounts | null>(null),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState("");
  const [profiles, setProfiles] = useState<
    { id: string; name: string }[] | null
  >(null);
  useEffect(() => {
    let active = true;
    api<Accounts>("/api/accounts")
      .then((v) => {
        if (active) {
          setData(v);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [snapshot.revision]);
  const perform = (action: string, fields: object = {}, message?: string) =>
    run(async () => {
      await api("/api/accounts", { action, ...fields });
      setConfirm("");
    }, message);
  return (
    <>
      <section className="panel">
        <h2 className="mb-6 text-xl font-semibold">Account details</h2>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void perform("rename", { name: f.get("name") }, "Name saved.");
          }}
        >
          <Field label="Display name">
            <Input
              name="name"
              required
              maxLength={100}
              defaultValue={snapshot.user.name}
            />
          </Field>
          <div>
            <Submit>Save name</Submit>
          </div>
        </form>
      </section>
      {error && <p role="alert">{error} Reload Settings to try again.</p>}
      {!data ? (
        <div
          className="skeleton h-32"
          aria-label="Loading accounts"
          role="status"
        />
      ) : (
        <>
          {snapshot.isOwner && (
            <section className="panel">
              <h2 className="mb-4 text-xl font-semibold">Family accounts</h2>
              {data.accounts.map((person) => (
                <div key={person.id} className="py-4">
                  <p className="break-words font-medium">{person.name}</p>
                  <p className="subtle mt-1 break-all">{person.email}</p>
                  {person.disabled && (
                    <p className="subtle mt-2">Access disabled</p>
                  )}
                  {person.id !== data.ownerId && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          void perform(
                            person.disabled ? "enable" : "disable",
                            { userId: person.id },
                            person.disabled
                              ? "Access restored."
                              : "Access disabled and sessions signed out.",
                          )
                        }
                      >
                        {person.disabled ? "Restore access" : "Disable access"}
                      </Button>
                      {confirm === person.id ? (
                        <div className="mt-2 w-full rounded-md border border-border p-4">
                          <p className="subtle mb-3">
                            Remove {person.name}’s account? Shared content will
                            remain. This cannot be undone.
                          </p>
                          <div className="flex flex-wrap gap-3">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending}
                              onClick={() =>
                                void perform(
                                  "remove",
                                  { userId: person.id },
                                  "Account removed.",
                                )
                              }
                            >
                              Remove account
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirm("")}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirm(person.id)}
                        >
                          Remove account
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}
          <section className="panel">
            <h2 className="mb-4 text-xl font-semibold">Active sessions</h2>
            <p className="subtle mb-4">
              Signing out a session also signs out that browser or device.
            </p>
            {!data.sessions.length ? (
              <Empty>No active sessions.</Empty>
            ) : (
              data.sessions.map((session) => (
                <div key={session.id} className="row flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {data.accounts.find((p) => p.id === session.userId)
                        ?.name || "Family member"}
                    </p>
                    <p className="subtle mt-1 break-words [overflow-wrap:anywhere]">
                      {session.userAgent || "Unknown browser"}
                    </p>
                    <p className="subtle mt-1">
                      Last active{" "}
                      {formatInTimeZone(
                        new Date(session.updatedAt),
                        TIME_ZONE,
                        "MMM d, h:mm a zzz",
                      )}
                      {session.ipAddress ? ` · ${session.ipAddress}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      void perform(
                        "revokeSession",
                        { id: session.id },
                        "Session signed out.",
                      )
                    }
                  >
                    Sign out session
                  </Button>
                </div>
              ))
            )}
            <Button
              className="mt-4"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                void perform("revokeAll", {}, "Sessions signed out.")
              }
            >
              Sign out all my sessions
            </Button>
          </section>
          {snapshot.isOwner && (
            <section className="panel">
              <h2 className="mb-4 text-xl font-semibold">
                Unused account links
              </h2>
              {!data.links.length ? (
                <Empty>No unused invitations or password reset links.</Empty>
              ) : (
                data.links.map((link) => (
                  <div className="row flex-wrap" key={link.id}>
                    <div className="min-w-0 flex-1">
                      <p className="break-all text-sm">{link.email}</p>
                      <p className="subtle mt-1">
                        {link.kind === "invite"
                          ? "Invitation"
                          : "Password reset"}{" "}
                        · Expires{" "}
                        {formatInTimeZone(
                          new Date(link.expiresAt),
                          TIME_ZONE,
                          "MMM d, h:mm a zzz",
                        )}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        void perform(
                          "revokeLink",
                          { id: link.id },
                          "Link revoked.",
                        )
                      }
                    >
                      Revoke link
                    </Button>
                  </div>
                ))
              )}
            </section>
          )}
          {snapshot.isOwner && snapshot.integrations.includes("jellyfin") && (
            <section className="panel">
              <h2 className="mb-4 text-xl font-semibold">Jellyfin profiles</h2>
              <p className="subtle mb-4">
                Link each person to their Jellyfin profile for personal
                favorites, watch history, and continue watching. Unlinked
                accounts can browse the configured default profile without
                changing it.
              </p>
              {!profiles ? (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    void run(async () =>
                      setProfiles(await api("/api/jellyfin?view=profiles")),
                    )
                  }
                >
                  Load Jellyfin profiles
                </Button>
              ) : (
                data.accounts
                  .filter((p) => !p.disabled)
                  .map((person) => (
                    <form
                      className="mt-4 flex flex-wrap items-end gap-3"
                      key={person.id}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void run(
                          () =>
                            api("/api/jellyfin", {
                              action: "profile",
                              userId: person.id,
                              jellyfinUserId: f.get("profile") || null,
                            }),
                          "Jellyfin profile saved.",
                        );
                      }}
                    >
                      <Field
                        label={`${person.name}’s Jellyfin profile`}
                        className="min-w-0 flex-1"
                      >
                        <select
                          name="profile"
                          defaultValue={
                            person.jellyfinProfile?.jellyfinUserId || ""
                          }
                        >
                          <option value="">Not linked</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Submit>Save profile</Submit>
                    </form>
                  ))
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}
