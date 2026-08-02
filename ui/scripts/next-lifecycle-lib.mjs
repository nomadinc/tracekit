import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

export function assetPathsFromHtml(html) {
  return Array.from(html.matchAll(/(?:href|src)=["']([^"']*\/_next\/static\/[^"']+)["']/g), (match) => match[1]);
}

function strings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

export function missingManifestAssets(distDirectory) {
  if (!existsSync(distDirectory)) return [`${distDirectory} does not exist`];
  const manifests = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith("manifest.json")) manifests.push(path);
    }
  };
  visit(distDirectory);
  const referenced = new Set();
  for (const manifest of manifests) {
    let parsed;
    try { parsed = JSON.parse(readFileSync(manifest, "utf8")); } catch { continue; }
    for (const value of strings(parsed)) {
      const normalized = value.replace(/^\/_next\//, "").split("?")[0];
      if (normalized.startsWith("static/") && /\.(?:css|js)$/.test(normalized)) referenced.add(normalized);
    }
  }
  return Array.from(referenced).filter((asset) => !existsSync(resolve(distDirectory, asset)));
}

export function nextProcessesForDirectory(directory) {
  let listeners = "";
  try { listeners = execFileSync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-a", "-c", "node", "-Fpcn"], { encoding: "utf8" }); } catch { return []; }
  const candidates = [];
  let candidate = null;
  for (const line of listeners.split("\n")) {
    if (line.startsWith("p")) {
      if (candidate) candidates.push(candidate);
      candidate = { pid: Number(line.slice(1)), command: "node" };
    } else if (candidate && line.startsWith("n")) {
      candidate.command = `node ${line.slice(1)}`;
    }
  }
  if (candidate) candidates.push(candidate);
  return candidates.filter(({ pid }) => {
    try {
      const cwd = execFileSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" })
        .split("\n").find((line) => line.startsWith("n"))?.slice(1);
      return cwd === directory;
    } catch { return false; }
  });
}
