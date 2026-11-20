"use client";
import { useState } from "react";
import { Basket, Check } from "@phosphor-icons/react";
import { type HubRecord } from "@/lib/models";
import { records, useHub, money } from "./context";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  DeleteRecord,
  Empty,
  Field,
  PageTitle,
  Submit,
  ToggleForm,
} from "./common";

export function Shopping() {
  const { snapshot, run, mutate } = useHub();
  const lists = records(snapshot, "list"),
    items = records(snapshot, "item");
  const [chosen, setChosen] = useState("");
  const selected = lists.find((l) => l.id === chosen) ?? lists[0];
  const activeItems = items.filter((i) => i.data.listId === selected?.id);
  const remaining = activeItems.filter((i) => !i.data.checked);
  const groups = [
    ...new Set(remaining.map((i) => i.data.category || "Other")),
  ].sort();
  const total = activeItems.reduce(
    (sum, i) => sum + (i.data.price ?? 0) * i.data.quantity,
    0,
  );
  return (
    <>
      <PageTitle
        title="Shopping"
        detail={`${remaining.length} items remaining${total ? ` · ${money(total)} estimated` : ""}`}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-6">
          <nav aria-label="Shopping lists" className="grid gap-2">
            {lists.map((l) => (
              <Button
                className="justify-between text-left"
                key={l.id}
                variant={selected?.id === l.id ? "secondary" : "ghost"}
                onClick={() => setChosen(l.id)}
                aria-pressed={selected?.id === l.id}
              >
                <span className="min-w-0 break-words">{l.data.name}</span>
                <span className="tag">
                  {
                    items.filter(
                      (i) => i.data.listId === l.id && !i.data.checked,
                    ).length
                  }
                </span>
              </Button>
            ))}
          </nav>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = new FormData(form).get("name");
              void run(async () => {
                const row = await mutate({
                  action: "create",
                  kind: "list",
                  data: { name },
                });
                setChosen(row.id);
                form.reset();
              });
            }}
          >
            <Field label="New list">
              <Input
                name="name"
                placeholder="Groceries"
                maxLength={200}
                required
              />
            </Field>
            <Submit>Create list</Submit>
          </form>
        </aside>
        <div className="min-w-0">
          {!selected ? (
            <section className="panel">
              <Basket size={32} className="text-primary" />
              <Empty>No shopping lists. Create a list to add items.</Empty>
            </section>
          ) : (
            <>
              <div className="mb-6 flex items-center justify-between gap-4">
                <h2 className="break-words text-2xl font-semibold">
                  {selected.data.name}
                </h2>
                {activeItems.length === 0 && <DeleteRecord record={selected} />}
              </div>
              <ToggleForm label="Add item" open={activeItems.length === 0}>
                {(close) => <ItemForm listId={selected.id} onSaved={close} />}
              </ToggleForm>
              <section className="panel">
                {remaining.length === 0 && (
                  <Empty>
                    {activeItems.length
                      ? "Everything is checked off."
                      : "No items in this list."}
                  </Empty>
                )}
                {groups.map((group) => (
                  <div key={group} className="mb-6 last:mb-0">
                    <h3 className="meta-label mb-2">{group}</h3>
                    {remaining
                      .filter((i) => (i.data.category || "Other") === group)
                      .map((i) => (
                        <ItemRow key={i.id} item={i} />
                      ))}
                  </div>
                ))}
              </section>
              {activeItems.some((i) => i.data.checked) && (
                <section className="panel mt-6">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Check size={16} />
                    Checked off
                  </h3>
                  {activeItems
                    .filter((i) => i.data.checked)
                    .map((i) => (
                      <ItemRow key={i.id} item={i} />
                    ))}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
function ItemRow({ item }: { item: HubRecord<"item"> }) {
  const { run, mutate, pending } = useHub();
  return (
    <div className="py-3">
      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          aria-label={`${item.data.checked ? "Uncheck" : "Check off"} ${item.data.name}`}
          checked={item.data.checked}
          disabled={pending}
          onChange={() =>
            void run(() =>
              mutate({
                action: "update",
                kind: "item",
                id: item.id,
                revision: item.revision,
                data: { ...item.data, checked: !item.data.checked },
              }),
            )
          }
        />
        <div className="min-w-0 flex-1">
          <p
            className={`break-words font-medium ${item.data.checked ? "text-muted-foreground line-through" : ""}`}
          >
            {item.data.name}
          </p>
          <p className="subtle mt-1 break-words">
            {item.data.quantity} {item.data.unit}
            {item.data.store ? ` · ${item.data.store}` : ""}
            {item.data.price !== null
              ? ` · ${money(item.data.price)} each`
              : ""}
          </p>
          <details className="mt-2">
            <summary className="text-sm text-muted-foreground">
              Edit item
            </summary>
            <div className="mt-4">
              <ItemForm listId={item.data.listId} item={item} />
              <div className="mt-4">
                <DeleteRecord record={item} />
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
function ItemForm({
  listId,
  item,
  onSaved,
}: {
  listId: string;
  item?: HubRecord<"item">;
  onSaved?: () => void;
}) {
  const { run, mutate } = useHub();
  const [base, setBase] = useState(item);
  const d = base?.data;
  return (
    <form
      key={base?.revision ?? "new"}
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        void run(
          async () => {
            const saved = await mutate({
              action: item ? "update" : "create",
              kind: "item",
              id: base?.id,
              revision: base?.revision,
              data: {
                listId,
                name: f.get("name"),
                quantity: Number(f.get("quantity")),
                unit: f.get("unit"),
                category: f.get("category"),
                store: f.get("store"),
                price: f.get("price") === "" ? null : Number(f.get("price")),
                checked: d?.checked || false,
              },
            });
            if (!item) form.reset();
            else setBase(saved as HubRecord<"item">);
            onSaved?.();
          },
          item ? "Item saved." : undefined,
        );
      }}
    >
      <Field label="Item">
        <Input name="name" required maxLength={200} defaultValue={d?.name} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quantity">
          <Input
            name="quantity"
            type="number"
            min="0.01"
            step="0.01"
            max="100000"
            required
            defaultValue={d?.quantity ?? 1}
          />
        </Field>
        <Field label="Unit">
          <Input
            name="unit"
            placeholder="bags, kg, bottles"
            maxLength={40}
            defaultValue={d?.unit}
          />
        </Field>
        <Field label="Category">
          <Input
            name="category"
            placeholder="Produce"
            maxLength={80}
            defaultValue={d?.category}
          />
        </Field>
        <Field label="Preferred store">
          <Input name="store" maxLength={100} defaultValue={d?.store} />
        </Field>
        <Field label="Estimated price per unit ($)">
          <Input
            name="price"
            type="number"
            min="0"
            step="0.01"
            max="100000"
            defaultValue={d?.price ?? ""}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Submit>{item ? "Save item" : "Add item"}</Submit>
        {item && base?.revision !== item.revision && (
          <Button variant="secondary" onClick={() => setBase(item)}>
            Load current item
          </Button>
        )}
      </div>
    </form>
  );
}
