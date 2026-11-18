import {
  landingContentSummary,
  seedLandingContent,
} from "./seeds/landing-content.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || (args.length === 1 && args[0] === "--dry-run")) {
    console.log(
      JSON.stringify(
        { mode: "preview", tables: landingContentSummary() },
        null,
        2,
      ),
    );
    return;
  }
  if (args.length !== 1 || args[0] !== "--apply") {
    throw new Error(
      "Use --dry-run or --apply for the approved landing content.",
    );
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (
    !databaseUrl?.startsWith("file:") ||
    databaseUrl.length <= "file:".length
  ) {
    throw new Error("An explicit SQLite DATABASE_URL is required.");
  }

  const { PrismaClient } = await import("@prisma/client");
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  try {
    const counts = await seedLandingContent(client);
    console.log(JSON.stringify({ mode: "applied", ...counts }, null, 2));
  } finally {
    await client.$disconnect();
  }
}

main().catch(() => {
  console.error(
    "Approved landing content seed failed. No partial batch was committed. Check arguments, DATABASE_URL, and database access.",
  );
  process.exitCode = 1;
});
