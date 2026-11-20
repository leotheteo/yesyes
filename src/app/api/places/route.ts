import { z } from "zod";
import { failure, json, member, rate } from "@/lib/http";
import { connection, upstream } from "@/lib/integrations";
type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  googleMapsUri?: string;
};
export async function GET(request: Request) {
  try {
    const user = await member();
    await rate(`places:${user.id}`, 20);
    const url = new URL(request.url);
    const c = await connection("google");
    const headers = {
      "X-Goog-Api-Key": c.key,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,googleMapsUri",
    };
    if (url.searchParams.has("id")) {
      const id = z
        .string()
        .regex(/^[\w-]{1,300}$/)
        .parse(url.searchParams.get("id"));
      return json(
        await upstream<Place>(`https://places.googleapis.com/v1/places/${id}`, {
          headers,
        }),
      );
    }
    const q = z
      .string()
      .trim()
      .min(2)
      .max(200)
      .parse(url.searchParams.get("q"));
    const result = await upstream<{ places?: Place[] }>(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.googleMapsUri",
        },
        body: JSON.stringify({
          textQuery: q,
          includedType: "restaurant",
          pageSize: 10,
        }),
      },
    );
    return json(result.places || []);
  } catch (e) {
    return failure(e);
  }
}
