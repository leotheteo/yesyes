"use client";
import { useState } from "react";
import { api, useHub } from "./context";
import { Field, PageTitle, Submit } from "./common";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export function Settings() {
  const { snapshot, run, pending } = useHub();
  const [link, setLink] = useState("");
  return (
    <>
      <PageTitle title="Settings" />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid gap-6">
          <section className="panel">
            <h2 className="mb-6 text-xl font-semibold">Your account</h2>
            <p className="font-medium">{snapshot.user.name}</p>
            <p className="subtle mt-2 break-all">{snapshot.user.email}</p>
            <p className="subtle mt-4">
              Pacific time
            </p>
          </section>
          <section className="panel">
            <h2 className="mb-4 text-xl font-semibold">Family</h2>
            {snapshot.people.map((p) => (
              <div className="row" key={p.id}>
                <div className="min-w-0">
                  <p className="break-words">{p.name}</p>
                  <p className="subtle mt-1 break-all">{p.email}</p>
                </div>
              </div>
            ))}
          </section>
        </div>
        {snapshot.isOwner && (
          <div className="grid gap-6">
            <section className="panel">
              <h2 className="mb-6 text-xl font-semibold">Invites and password resets</h2>
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void run(async () => {
                    const result = await api<{ url: string }>("/api/access", {
                      action: f.get("action"),
                      email: f.get("email"),
                    });
                    setLink(result.url);
                  });
                }}
              >
                <Field label="Email">
                  <Input name="email" type="email" required />
                </Field>
                <Field label="Link type">
                  <select name="action">
                    <option value="invite">Invitation</option>
                    <option value="reset">Password reset</option>
                  </select>
                </Field>
                <div>
                  <Submit>Create link</Submit>
                </div>
              </form>
              {link && (
                <div className="mt-6 rounded-md bg-secondary p-4">
                  <p className="subtle mb-3">
                    Share this link privately with the intended person.
                  </p>
                  <a
                    href={link}
                    className="break-all text-sm text-primary underline"
                  >
                    {link}
                  </a>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void run(
                        () => navigator.clipboard.writeText(link),
                        "Link copied.",
                      )
                    }
                  >
                    Copy link
                  </Button>
                </div>
              )}
            </section>
            {(["seerr", "jellyfin", "google"] as const).map((id) => (
              <details key={id} className="panel connection">
                <summary className="flex items-center gap-3">
                  <span className="grow font-semibold">
                    {id === "seerr"
                      ? "Seerr"
                      : id === "jellyfin"
                        ? "Jellyfin"
                        : "Google Places"}
                  </span>
                  <span className="tag">
                    {snapshot.integrations.includes(id)
                      ? "Configured"
                      : "Not connected"}
                  </span>
                </summary>
                <form
                  className="grid gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      f = new FormData(form);
                    void run(async () => {
                      await api("/api/settings", {
                        id,
                        ...(id !== "google" ? { url: f.get("url") } : {}),
                        key: f.get("key"),
                        ...(f.get("publicUrl")
                          ? { publicUrl: f.get("publicUrl") }
                          : {}),
                        ...(f.get("userId") ? { userId: f.get("userId") } : {}),
                      });
                      form.reset();
                    }, "Connection saved.");
                  }}
                >
                  {id !== "google" && (
                    <Field label="Internal service URL">
                      <Input
                        name="url"
                        type="url"
                        placeholder={
                          id === "seerr"
                            ? "http://seerr:5055"
                            : "http://jellyfin:8096"
                        }
                        required
                      />
                    </Field>
                  )}
                  <Field label="API key">
                    <Input
                      name="key"
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </Field>
                  {id === "seerr" && (
                    <>
                      <Field label="Seerr user ID (optional)">
                        <Input name="userId" type="number" min="1" />
                      </Field>
                      <p className="subtle">
                        Use a service account with automatic request processing
                        enabled in Seerr.
                      </p>
                    </>
                  )}
                  {id === "jellyfin" && (
                    <>
                      <Field label="Public Jellyfin URL (optional)">
                        <Input
                          name="publicUrl"
                          type="url"
                          placeholder="https://jellyfin.example.com"
                        />
                      </Field>
                      <Field label="Jellyfin user ID (optional)">
                        <Input name="userId" />
                      </Field>
                    </>
                  )}
                  {id === "google" && (
                    <p className="subtle">
                      Enable Places API (New) in your Google project. Requests
                      use your Google billing account. Manual restaurant entry
                      works without this connection.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <Submit>Save connection</Submit>
                    {snapshot.integrations.includes(id) && (
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          void run(
                            () => api("/api/settings", { remove: id }),
                            "Connection removed.",
                          )
                        }
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>
                </form>
              </details>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
