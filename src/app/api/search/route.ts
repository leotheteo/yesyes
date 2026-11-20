import { z } from "zod";
import { failure, json, member, rate } from "@/lib/http";
import { searchHousehold } from "@/lib/search";
export async function GET(request: Request) {
  try {
    const user = await member();
    await rate(`search:${user.id}`, 120);
    const q = z
      .string()
      .trim()
      .min(2)
      .max(200)
      .parse(new URL(request.url).searchParams.get("q"));
    return json({ hits: await searchHousehold(q) });
  } catch (e) {
    return failure(e);
  }
}
