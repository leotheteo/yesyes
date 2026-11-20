"use client";
import { createContext, useContext } from "react";
import type { HubRecord, Kind, Snapshot } from "@/lib/models";
export async function api<T = unknown>(
  path: string,
  data?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(
    path,
    data === undefined
      ? { cache: "no-store" }
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        },
  ).catch(() => {
    throw new Error("Connection failed. Check your connection and try again.");
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : typeof payload.message === "string"
          ? payload.message
          : "Could not complete the request. Try again.",
    );
  return payload;
}
export type HubContextValue = {
  snapshot: Snapshot;
  pending: boolean;
  run: (action: () => Promise<unknown>, success?: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  mutate: (command: unknown) => Promise<HubRecord>;
  setNotice: (text: string) => void;
};
export const HubContext = createContext<HubContextValue | null>(null);
export function useHub() {
  const value = useContext(HubContext);
  if (!value) throw new Error("Hub context is missing.");
  return value;
}
export function records<K extends Kind>(snapshot: Snapshot, kind: K) {
  return snapshot.records.filter((r) => r.kind === kind) as HubRecord<K>[];
}
export const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
