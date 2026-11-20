import { body, failure, json, member, origin, rate } from "@/lib/http";
import { mutate } from "@/lib/store";
export async function POST(request: Request) {
  try {
    origin(request);
    const user = await member();
    await rate(`write:${user.id}`);
    return json(await mutate(await body(request), user.id));
  } catch (e) {
    return failure(e);
  }
}
