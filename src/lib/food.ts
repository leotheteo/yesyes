import type { Preference, Restaurant, VoteSession } from "./models";
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) *
      Math.cos(b.lat * r) *
      Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function candidates(
  session: VoteSession,
  restaurants: { id: string; data: Restaurant }[],
  preferences: Preference[],
  now = new Date(),
) {
  return restaurants.map((restaurant) => {
    const reasons: string[] = [];
    const r = restaurant.data;
    const prefs = preferences.filter(
      (p) =>
        p.restaurantId === restaurant.id &&
        session.participants.includes(p.userId),
    );
    if (prefs.some((p) => p.value === "exclude"))
      reasons.push("A participant excludes this restaurant");
    if (Object.values(session.vetoes).includes(restaurant.id))
      reasons.push("Vetoed in this vote");
    if (session.budget !== null && r.price === null)
      reasons.push("Price is missing");
    else if (session.budget !== null && r.price! > session.budget)
      reasons.push("Over budget");
    if (session.maxDistance !== null) {
      if (!r.coordinates || !session.home)
        reasons.push("Coordinates are missing");
      else if (distanceKm(session.home, r.coordinates) > session.maxDistance)
        reasons.push("Outside distance limit");
    }
    if (session.draws.includes(restaurant.id)) reasons.push("Already drawn");
    const votes = session.participants.map(
      (id) => session.votes[id]?.[restaurant.id],
    );
    let weight = Math.max(
      1,
      3 +
        2 * votes.filter((v) => v === "yes").length -
        votes.filter((v) => v === "no").length +
        prefs.filter((p) => p.value === "like").length,
    );
    if (
      r.visits.some(
        (v) =>
          now.getTime() - new Date(v).getTime() < 14 * 86400000 &&
          new Date(v) <= now,
      )
    )
      weight /= 2;
    return { id: restaurant.id, name: r.name, reasons, weight };
  });
}
export function weightedPick<T extends { weight: number }>(
  items: T[],
  random: number,
): T | undefined {
  if (!items.length) return undefined;
  let point = random * items.reduce((sum, item) => sum + item.weight, 0);
  return items.find((item) => (point -= item.weight) < 0) ?? items.at(-1);
}
