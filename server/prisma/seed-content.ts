import { publicContentSummary, seedPublicContent } from "./seeds/content.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) {
    console.log(
      JSON.stringify(
        { mode: "preview", tables: publicContentSummary() },
        null,
        2,
      ),
    );
    return;
  }
  if (args.length !== 1 || args[0] !== "--apply") {
    throw new Error("Use --dry-run to review content or --apply to insert it.");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl?.startsWith("file:") ||
    databaseUrl.length <= "file:".length
  ) {
    throw new Error(
      "Set an explicit SQLite DATABASE_URL before applying public content.",
    );
  }

  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  try {
    const counts = await seedPublicContent(client);
    console.log(JSON.stringify({ mode: "applied", ...counts }, null, 2));
  } finally {
    await client.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Public content seed failed. No partial content batch was committed. Check arguments, DATABASE_URL, and database access.",
  );
  process.exitCode = 1;
});
