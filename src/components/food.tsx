"use client";
import { useEffect, useState } from "react";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { DiceFive, ForkKnife, Heart, Prohibit } from "@phosphor-icons/react";
import type { HubRecord } from "@/lib/models";
import { candidates } from "@/lib/food";
import { TIME_ZONE } from "@/lib/calendar";
import { api, money, records, useHub } from "./context";
import {
  DeleteRecord,
  Empty,
  Field,
  PageTitle,
  Submit,
  ToggleForm,
} from "./common";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function Food() {
  const { snapshot } = useHub();
  const [tab, setTab] = useState("votes");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("restaurant"))
      setTab("restaurants");
  }, []);
  useEffect(() => {
    if (window.location.hash)
      requestAnimationFrame(() =>
        document
          .getElementById(window.location.hash.slice(1))
          ?.scrollIntoView({ block: "center" }),
      );
  }, [tab]);
  const polls = records(snapshot, "voteSession");
  return (
    <>
      <PageTitle title="Food" />
      <div className="mb-8 flex gap-2" role="group" aria-label="Food view">
        <Button
          variant={tab === "votes" ? "secondary" : "ghost"}
          aria-pressed={tab === "votes"}
          onClick={() => setTab("votes")}
        >
          Votes
        </Button>
        <Button
          variant={tab === "restaurants" ? "secondary" : "ghost"}
          aria-pressed={tab === "restaurants"}
          onClick={() => setTab("restaurants")}
        >
          Restaurants{" "}
          <span className="tag">{records(snapshot, "restaurant").length}</span>
        </Button>
      </div>
      {tab === "votes" ? (
        <>
          <ToggleForm label="Start vote">
            {(close) => <VoteForm close={close} />}
          </ToggleForm>
          {!polls.length ? (
            <section className="panel">
              <ForkKnife size={32} className="text-primary" />
              <Empty>No food votes. Add restaurants, then start a vote.</Empty>
            </section>
          ) : (
            <div className="grid items-start gap-6">
              {[...polls].reverse().map((p) => (
                <VotePanel key={p.id} poll={p} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <ToggleForm label="Add restaurant">
            {(close) => <RestaurantForm close={close} />}
          </ToggleForm>
          <div className="grid items-start gap-6 md:grid-cols-2">
            {records(snapshot, "restaurant").map((r) => (
              <RestaurantPanel key={r.id} restaurant={r} />
            ))}
            {records(snapshot, "restaurant").length === 0 && (
              <Empty>No restaurants added.</Empty>
            )}
          </div>
        </>
      )}
    </>
  );
}
function RestaurantPanel({
  restaurant: r,
}: {
  restaurant: HubRecord<"restaurant">;
}) {
  const { snapshot, run, mutate, pending } = useHub();
  const [google, setGoogle] = useState<{
    displayName?: { text: string };
    formattedAddress?: string;
    googleMapsUri?: string;
  } | null>(null);
  const pref =
    records(snapshot, "preference").find(
      (p) => p.data.restaurantId === r.id && p.data.userId === snapshot.user.id,
    )?.data.value ?? "neutral";
  return (
    <article id={r.id} className="panel">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold">{r.data.name}</h2>
          <p className="subtle mt-2 break-words">
            {r.data.cuisine || "Cuisine not set"}
            {r.data.price !== null
              ? ` · ${money(r.data.price)} per person`
              : " · Price not set"}
          </p>
        </div>
      </div>
      {r.data.address && (
        <p className="subtle mb-4 break-words">{r.data.address}</p>
      )}
      <div
        className="mb-4 flex flex-wrap gap-2"
        role="group"
        aria-label={`Preference for ${r.data.name}`}
      >
        {(["like", "neutral", "exclude"] as const).map((value) => (
          <Button
            size="sm"
            key={value}
            variant={pref === value ? "secondary" : "ghost"}
            aria-pressed={pref === value}
            disabled={pending}
            onClick={() =>
              void run(() =>
                mutate({
                  action: "preference",
                  kind: "preference",
                  data: { userId: snapshot.user.id, restaurantId: r.id, value },
                }),
              )
            }
          >
            {value === "like" && <Heart weight="fill" />}
            {value === "exclude" && <Prohibit />}
            {value === "like"
              ? "Like"
              : value === "exclude"
                ? "Exclude"
                : "Neutral"}
          </Button>
        ))}
      </div>
      <p className="subtle">
        {r.data.visits.length
          ? `Last visit ${formatInTimeZone(new Date(r.data.visits.at(-1)!), TIME_ZONE, "MMM d, yyyy")}`
          : "No visits recorded"}
      </p>
      {r.data.placeId && (
        <div className="mt-4">
          {!google ? (
            <Button
              variant="link"
              size="sm"
              disabled={pending}
              onClick={() =>
                void run(async () =>
                  setGoogle(
                    await api(
                      `/api/places?id=${encodeURIComponent(r.data.placeId!)}`,
                    ),
                  ),
                )
              }
            >
              View Google details
            </Button>
          ) : (
            <GooglePlace value={google} />
          )}
        </div>
      )}
      <details className="mt-4">
        <summary className="subtle">Edit restaurant</summary>
        <div className="mt-4">
          <RestaurantForm restaurant={r} />
          <div className="mt-4">
            <DeleteRecord record={r} />
          </div>
        </div>
      </details>
    </article>
  );
}
type GoogleResult = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  googleMapsUri?: string;
};
function GooglePlace({ value }: { value: Omit<GoogleResult, "id"> }) {
  return (
    <div className="rounded-md bg-secondary p-4">
      <p className="break-words text-sm">{value.displayName?.text}</p>
      <p className="subtle mt-1 break-words">{value.formattedAddress}</p>
      {value.googleMapsUri && (
        <a
          href={value.googleMapsUri}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm text-primary underline"
        >
          View on Google Maps
        </a>
      )}
      <p
        translate="no"
        className="mt-3 whitespace-nowrap text-sm font-normal text-foreground"
      >
        Google Maps
      </p>
    </div>
  );
}
function RestaurantForm({
  restaurant,
  close,
}: {
  restaurant?: HubRecord<"restaurant">;
  close?: () => void;
}) {
  const { snapshot, run, mutate, pending } = useHub();
  const [base, setBase] = useState(restaurant);
  const [places, setPlaces] = useState<GoogleResult[]>([]),
    [placeId, setPlaceId] = useState(restaurant?.data.placeId || "");
  const [query, setQuery] = useState("");
  const d = base?.data;
  return (
    <div>
      {snapshot.integrations.includes("google") && (
        <div className="mb-6 grid gap-3">
          <Field label="Search Google Places">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Restaurant and city"
            />
          </Field>
          <div>
            <Button
              variant="secondary"
              disabled={pending || query.trim().length < 2}
              onClick={() =>
                void run(async () =>
                  setPlaces(
                    await api(`/api/places?q=${encodeURIComponent(query)}`),
                  ),
                )
              }
            >
              Search places
            </Button>
          </div>
          {places.map((p) => (
            <div key={p.id}>
              <GooglePlace value={p} />
              <Button
                className="mt-2"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPlaceId(p.id);
                  setPlaces([]);
                }}
              >
                Link this place
              </Button>
            </div>
          ))}
          {placeId && (
            <p className="subtle">
              Google place linked. Enter your own restaurant name and details
              below.
            </p>
          )}
        </div>
      )}
      <form
        key={base?.revision ?? "new"}
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const lat = String(f.get("lat")),
            lng = String(f.get("lng"));
          void run(
            async () => {
              if (!!lat !== !!lng)
                throw new Error(
                  "Enter both latitude and longitude, or leave both blank.",
                );
              const saved = await mutate({
                action: restaurant ? "update" : "create",
                kind: "restaurant",
                id: base?.id,
                revision: base?.revision,
                data: {
                  name: f.get("name"),
                  cuisine: f.get("cuisine"),
                  price: f.get("price") === "" ? null : Number(f.get("price")),
                  address: f.get("address"),
                  coordinates:
                    lat && lng ? { lat: Number(lat), lng: Number(lng) } : null,
                  ...(placeId ? { placeId } : {}),
                  visits: d?.visits || [],
                },
              });
              if (restaurant) setBase(saved as HubRecord<"restaurant">);
              close?.();
            },
            restaurant ? "Restaurant saved." : undefined,
          );
        }}
      >
        <Field label="Restaurant name">
          <Input name="name" required maxLength={200} defaultValue={d?.name} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cuisine tags">
            <Input
              name="cuisine"
              placeholder="Thai, vegetarian"
              maxLength={200}
              defaultValue={d?.cuisine}
            />
          </Field>
          <Field label="Approximate price per person ($)">
            <Input
              name="price"
              type="number"
              step="0.01"
              min="0"
              max="100000"
              defaultValue={d?.price ?? ""}
            />
          </Field>
        </div>
        <Field label="Address">
          <Input name="address" maxLength={500} defaultValue={d?.address} />
        </Field>
        <details>
          <summary className="subtle">
            Coordinates for distance filtering
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Latitude">
              <Input
                type="number"
                step="any"
                min="-90"
                max="90"
                name="lat"
                defaultValue={d?.coordinates?.lat ?? ""}
              />
            </Field>
            <Field label="Longitude">
              <Input
                type="number"
                step="any"
                min="-180"
                max="180"
                name="lng"
                defaultValue={d?.coordinates?.lng ?? ""}
              />
            </Field>
          </div>
        </details>
        <div className="flex flex-wrap gap-3">
          <Submit>{restaurant ? "Save restaurant" : "Add restaurant"}</Submit>
          {restaurant && base?.revision !== restaurant.revision && (
            <Button
              variant="secondary"
              onClick={() => {
                setBase(restaurant);
                setPlaceId(restaurant.data.placeId || "");
              }}
            >
              Load current restaurant
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
function VoteForm({ close }: { close: () => void }) {
  const { snapshot, run, mutate } = useHub();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        void run(async () => {
          const lat = String(f.get("lat")),
            lng = String(f.get("lng"));
          if (!!lat !== !!lng)
            throw new Error(
              "Enter both home coordinates, or leave both blank.",
            );
          await mutate({
            action: "create",
            kind: "voteSession",
            data: {
              title: f.get("title"),
              participants: f.getAll("participants"),
              budget: f.get("budget") === "" ? null : Number(f.get("budget")),
              maxDistance:
                f.get("distance") === "" ? null : Number(f.get("distance")),
              home: lat && lng ? { lat: Number(lat), lng: Number(lng) } : null,
              closesAt: fromZonedTime(
                String(f.get("closesAt")),
                TIME_ZONE,
              ).toISOString(),
            },
          });
          close();
        });
      }}
    >
      <Field label="Vote name">
        <Input
          name="title"
          required
          maxLength={200}
          placeholder="Saturday dinner"
        />
      </Field>
      <fieldset className="grid gap-3">
        <legend className="subtle mb-3">Participants</legend>
        {snapshot.people.map((p) => (
          <label className="flex items-center gap-3" key={p.id}>
            <input
              type="checkbox"
              name="participants"
              value={p.id}
              defaultChecked
            />
            {p.name}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Budget per person ($, optional)">
          <Input name="budget" type="number" min="0.01" step="0.01" />
        </Field>
        <Field label="Voting closes (Pacific)">
          <Input
            name="closesAt"
            type="datetime-local"
            required
            defaultValue={formatInTimeZone(
              new Date(Date.now() + 3600000),
              TIME_ZONE,
              "yyyy-MM-dd'T'HH:mm",
            )}
          />
        </Field>
      </div>
      <details>
        <summary className="subtle">Distance limit</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Maximum distance (km)">
            <Input
              name="distance"
              type="number"
              step="0.1"
              min="0.1"
              max="10000"
            />
          </Field>
          <Field label="Home latitude">
            <Input name="lat" type="number" step="any" min="-90" max="90" />
          </Field>
          <Field label="Home longitude">
            <Input name="lng" type="number" step="any" min="-180" max="180" />
          </Field>
        </div>
        <p className="subtle mt-3">Approximate straight-line distance.</p>
      </details>
      <div>
        <Submit>Start vote</Submit>
      </div>
    </form>
  );
}
function VotePanel({ poll }: { poll: HubRecord<"voteSession"> }) {
  const { snapshot, pending, run, mutate } = useHub();
  const s = poll.data;
  const restaurants = records(snapshot, "restaurant");
  const options = candidates(
    s,
    restaurants,
    records(snapshot, "preference").map((p) => p.data),
  );
  const participating = s.participants.includes(snapshot.user.id),
    canChoose = participating || poll.createdBy === snapshot.user.id;
  const open = new Date(s.closesAt) > new Date() && !s.finalized;
  const action = (name: string, data = {}) =>
    run(() =>
      mutate({
        action: name,
        kind: "voteSession",
        id: poll.id,
        revision: poll.revision,
        data,
      }),
    );
  const selected = restaurants.find((r) => r.id === s.selectedId);
  return (
    <section id={poll.id} className="panel">
      <div className="mb-6 flex flex-wrap justify-between gap-4">
        <div>
          <h2 className="break-words text-2xl font-semibold">{s.title}</h2>
          <p className="subtle mt-2">
            {s.finalized ? "Finalized" : open ? "Open" : "Voting closed"} ·{" "}
            {formatInTimeZone(
              new Date(s.closesAt),
              TIME_ZONE,
              "MMM d, h:mm a zzz",
            )}
          </p>
          <p className="subtle mt-1">
            {s.participants
              .map(
                (id) =>
                  snapshot.people.find((p) => p.id === id)?.name ||
                  "Former member",
              )
              .join(", ")}
          </p>
        </div>
        {s.budget !== null && (
          <span className="tag self-start">
            Up to {money(s.budget)} per person
          </span>
        )}
      </div>
      {selected && (
        <div className="mb-6 rounded-lg bg-secondary p-6">
          <p className="meta-label">
            {s.finalized ? "Selected restaurant" : "Current draw"}
          </p>
          <p className="mt-2 break-words text-2xl font-semibold text-primary">
            {selected.data.name}
          </p>
          {s.finalized && canChoose && (
            <Button
              className="mt-4"
              disabled={pending || s.visited}
              variant="outline"
              onClick={() => void action("visit")}
            >
              {s.visited ? "Visit recorded" : "Confirm visit"}
            </Button>
          )}
        </div>
      )}
      {!s.finalized && (
        <>
          {!restaurants.length && (
            <Empty>Add restaurants before drawing a choice.</Empty>
          )}
          {restaurants.map((r) => {
            const option = options.find((o) => o.id === r.id)!;
            const exclusion = option.reasons.filter(
              (reason) => reason !== "Already drawn",
            );
            const vote = s.votes[snapshot.user.id]?.[r.id];
            return (
              <div className="row flex-wrap" key={r.id}>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-medium">{r.data.name}</h3>
                  <p className="subtle mt-1">
                    {
                      Object.values(s.votes).filter((v) => v[r.id] === "yes")
                        .length
                    }{" "}
                    yes ·{" "}
                    {
                      Object.values(s.votes).filter((v) => v[r.id] === "no")
                        .length
                    }{" "}
                    no
                  </p>
                  {exclusion.length > 0 && (
                    <p className="subtle mt-1">
                      Excluded: {exclusion.join("; ")}
                    </p>
                  )}
                </div>
                {participating && open && (
                  <div className="flex flex-wrap gap-2">
                    {(["yes", "neutral", "no"] as const).map((v) => (
                      <Button
                        key={v}
                        size="sm"
                        disabled={pending}
                        variant={vote === v ? "secondary" : "ghost"}
                        aria-pressed={vote === v}
                        onClick={() =>
                          void action("vote", { restaurantId: r.id, vote: v })
                        }
                      >
                        {v === "yes" ? "Yes" : v === "no" ? "No" : "Neutral"}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending || !!s.vetoes[snapshot.user.id]}
                      onClick={() =>
                        void action("veto", { restaurantId: r.id })
                      }
                    >
                      Veto
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {canChoose && (
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                disabled={pending || !options.some((o) => !o.reasons.length)}
                onClick={() => void action("draw")}
              >
                <DiceFive />
                {s.draws.length ? "Reroll" : "Draw restaurant"}
              </Button>
              {selected && (
                <Button
                  variant="secondary"
                  disabled={pending}
                  onClick={() => void action("finalize")}
                >
                  Finalize choice
                </Button>
              )}
            </div>
          )}
          {!options.some((o) => !o.reasons.length) &&
            restaurants.length > 0 && (
              <p className="subtle mt-4">
                No eligible restaurants remain. Change preferences or start
                another vote.
              </p>
            )}
        </>
      )}
    </section>
  );
}
