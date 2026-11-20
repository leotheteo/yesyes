"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field } from "./common";
import { api } from "./context";
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-3">
        <img src="/icon.svg" width="40" height="40" alt="" />
        <span className="text-xl font-semibold">Family</span>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
      <form
        className="mt-8 grid gap-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setPending(true);
          setError("");
          try {
            await api("/api/auth/sign-in/email", {
              email: f.get("email"),
              password: f.get("password"),
            });
            onSignedIn();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not sign in. Try again.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password">
          <Input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        {error && (
          <p
            role="alert"
            className="rounded-md border border-border p-4 text-sm"
          >
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="subtle mt-6">
        Need an account or a password reset? Ask the person who set up the hub
        for a link.
      </p>
      <div className="subtle mt-12 flex gap-4">
        <a href="/privacy" className="underline">
          Privacy
        </a>
        <a href="/terms" className="underline">
          Terms
        </a>
      </div>
    </main>
  );
}
