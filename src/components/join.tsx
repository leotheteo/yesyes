"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./context";
import { Field } from "./common";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function Join() {
  const [token, setToken] = useState(""),
    [link, setLink] = useState<{ kind: string; email: string | null } | null>(
      null,
    );
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [done, setDone] = useState(false);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    void api<typeof link>(`/api/access?token=${encodeURIComponent(t)}`)
      .then(setLink)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <img src="/icon.svg" width="40" height="40" alt="" />
        <span className="text-xl font-semibold">Family</span>
      </Link>
      <h1 className="text-3xl font-semibold">
        {done
          ? "Account saved"
          : link?.kind === "reset"
            ? "Reset password"
            : "Create account"}
      </h1>
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-border p-4 text-sm"
        >
          {error}
        </p>
      )}
      {done ? (
        <Link href="/" className="mt-8 text-primary underline">
          Sign in
        </Link>
      ) : (
        link && (
          <form
            className="mt-8 grid gap-6"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setPending(true);
              setError("");
              try {
                await api("/api/access", {
                  action: "redeem",
                  token,
                  name: f.get("name") || undefined,
                  email: f.get("email") || undefined,
                  password: f.get("password"),
                });
                setDone(true);
                window.history.replaceState(null, "", "/join");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            {link.kind !== "reset" && (
              <>
                <Field label="Name">
                  <Input
                    name="name"
                    autoComplete="name"
                    maxLength={100}
                    required
                  />
                </Field>
                <Field label="Email">
                  <Input
                    name="email"
                    type="email"
                    autoComplete="email"
                    defaultValue={link.email || ""}
                    readOnly={!!link.email}
                    required
                  />
                </Field>
              </>
            )}
            <Field label="Password (at least 12 characters)">
              <Input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save account"}
            </Button>
          </form>
        )
      )}
      {!link && !error && (
        <p role="status" className="subtle mt-6">
          Checking link…
        </p>
      )}
      <Link href="/" className="subtle mt-8 underline">
        Back to sign in
      </Link>
    </main>
  );
}
