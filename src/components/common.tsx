"use client";
import {
  Children,
  cloneElement,
  useId,
  useState,
  type ReactElement,
} from "react";
import { Trash, X, Plus } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { useHub } from "./context";
import type { HubRecord } from "@/lib/models";
export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const generatedId = useId();
  const control = Children.only(children) as ReactElement<{ id?: string }>;
  const id = control.props.id || generatedId;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(control, { id })}
    </div>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function PageTitle({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        {detail && <p className="subtle mt-2">{detail}</p>}
      </div>
      {children}
    </div>
  );
}
export function ToggleForm({
  label,
  children,
  open = false,
}: {
  label: string;
  children: (close: () => void) => React.ReactNode;
  open?: boolean;
}) {
  const [shown, setShown] = useState(open);
  return (
    <div className="mb-6">
      {!shown ? (
        <Button onClick={() => setShown(true)}>
          <Plus />
          {label}
        </Button>
      ) : (
        <section className="panel">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">{label}</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close form"
              onClick={() => setShown(false)}
            >
              <X />
            </Button>
          </div>
          {children(() => setShown(false))}
        </section>
      )}
    </div>
  );
}
export function DeleteRecord({
  record,
  onDeleted,
}: {
  record: HubRecord;
  onDeleted?: () => void;
}) {
  const { pending, run, mutate, setNotice } = useHub();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Delete ${"name" in record.data ? record.data.name : "title" in record.data ? record.data.title : "item"}`}
      onClick={() =>
        void run(async () => {
          const deleted = await mutate({
            action: "delete",
            kind: record.kind,
            id: record.id,
            revision: record.revision,
          });
          undoRecord = deleted;
          setNotice("Deleted. Use Undo to restore.");
          onDeleted?.();
        })
      }
    >
      <Trash />
      Delete
    </Button>
  );
}
let undoRecord: HubRecord | null = null;
export function Undo() {
  const { pending, run, mutate } = useHub();
  if (!undoRecord) return null;
  return (
    <Button
      variant="link"
      size="sm"
      disabled={pending}
      onClick={() =>
        void run(async () => {
          const row = undoRecord!;
          await mutate({
            action: "restore",
            kind: row.kind,
            id: row.id,
            revision: row.revision,
          });
          undoRecord = null;
        }, "Restored.")
      }
    >
      Undo
    </Button>
  );
}
export function Submit({ children = "Save" }: { children?: React.ReactNode }) {
  const { pending } = useHub();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : children}
    </Button>
  );
}
