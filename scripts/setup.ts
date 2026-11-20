import "dotenv/config";
import { db } from "../src/lib/db";
import { newToken, tokenHash } from "../src/lib/crypto";
const token = newToken();
async function main() {
  await db.$transaction(async (tx) => {
    const house = await tx.household.upsert({
      where: { id: "family" },
      create: {},
      update: {},
    });
    if (house.ownerId) throw new Error("Setup is already complete.");
    await tx.accessLink.deleteMany({ where: { kind: "setup", usedAt: null } });
    await tx.accessLink.create({
      data: {
        kind: "setup",
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  });
  console.log(
    `Setup link (expires in one hour):\n${process.env.BETTER_AUTH_URL || "http://localhost:3000"}/join?token=${token}`,
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
