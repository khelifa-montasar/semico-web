import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";

function reserved(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/healthz" ||
    pathname.startsWith("/healthz/") ||
    pathname === "/readyz" ||
    pathname.startsWith("/readyz/")
  );
}

export function serveClient(app: Express, directory: string): void {
  const index = path.join(directory, "index.html");
  if (!existsSync(index))
    throw new Error(
      "Client build is missing. Run npm run build before starting production.",
    );
  const assets = express.static(directory, {
    index: false,
    dotfiles: "ignore",
    setHeaders(response, filename) {
      response.setHeader(
        "Cache-Control",
        filename.includes(`${path.sep}assets${path.sep}`)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
    },
  });
  app.use((req, res, next) =>
    reserved(req.path) ? next() : assets(req, res, next),
  );
  app.get("/{*clientPath}", (req, res, next) => {
    if (
      reserved(req.path) ||
      req.path === "/assets" ||
      req.path.startsWith("/assets/") ||
      path.extname(req.path) ||
      !req.accepts("html")
    )
      return next();
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(index);
  });
}
