import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { assetPathsFromHtml, missingManifestAssets, nextProcessesForDirectory } from "./next-lifecycle-lib.mjs";

const mode = process.argv[2];
const uiDirectory = resolve(import.meta.dirname, "..");
const devDirectory = resolve(uiDirectory, ".next");
const buildOutputName = process.env.VERCEL ? ".next" : ".next-build";
const buildDirectory = resolve(uiDirectory, buildOutputName);
const nextBinary = resolve(uiDirectory, "node_modules/next/dist/bin/next");
const nextEnvironmentTypes = resolve(uiDirectory, "next-env.d.ts");

function activeProcesses() {
  return nextProcessesForDirectory(uiDirectory).filter(({ pid }) => pid !== process.pid);
}

function requireNoNextProcesses() {
  const active = activeProcesses();
  if (!active.length) return;
  const summary = active.map(({ pid, command }) => `${pid}: ${command}`).join("\n");
  throw new Error(`TraceKit Next.js is already running. Stop it before '${mode}'.\n${summary}`);
}

function runNext(args, env) {
  return spawn(process.execPath, [nextBinary, ...args], { cwd: uiDirectory, env, stdio: "inherit" });
}

function exitWithChild(child) {
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
}

async function verifyDevAssets() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const page = await fetch("http://127.0.0.1:3000/auth/signed-out", { redirect: "manual" });
      if (page.status !== 200) throw new Error(`review page returned ${page.status}`);
      const assets = assetPathsFromHtml(await page.text());
      const css = assets.find((asset) => asset.includes("/css/") && asset.endsWith(".css") || asset.includes(".css?"));
      const javascript = assets.find((asset) => asset.includes("/chunks/") && (asset.endsWith(".js") || asset.includes(".js?")));
      if (!css || !javascript) throw new Error("review page did not reference both CSS and JavaScript assets");
      for (const asset of [css, javascript]) {
        const response = await fetch(new URL(asset, "http://127.0.0.1:3000"), { redirect: "manual" });
        if (response.status !== 200) throw new Error(`${asset} returned ${response.status}`);
      }
      const missing = missingManifestAssets(devDirectory);
      if (missing.length) throw new Error(`development manifests reference missing assets:\n${missing.join("\n")}`);
      console.log(`TraceKit review server ready: CSS and JavaScript assets return 200 (${assets.length} assets referenced).`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
  }
  throw lastError || new Error("development server did not become ready");
}

if (mode === "dev") {
  requireNoNextProcesses();
  rmSync(devDirectory, { recursive: true, force: true });
  rmSync(buildDirectory, { recursive: true, force: true });
  const child = runNext(["dev", "--port", "3000"], { ...process.env, NEXT_DIST_DIR: ".next" });
  exitWithChild(child);
  verifyDevAssets().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    child.kill("SIGTERM");
    process.exitCode = 1;
  });
} else if (mode === "build") {
  requireNoNextProcesses();
  rmSync(buildDirectory, { recursive: true, force: true });
  const originalEnvironmentTypes = readFileSync(nextEnvironmentTypes, "utf8");
  const child = runNext(["build"], { ...process.env, NEXT_DIST_DIR: buildOutputName });
  child.on("exit", (code) => {
    writeFileSync(nextEnvironmentTypes, originalEnvironmentTypes);
    if (code) { process.exitCode = code; return; }
    const missing = missingManifestAssets(buildDirectory);
    if (missing.length) {
      console.error(`Production manifests reference missing assets:\n${missing.join("\n")}`);
      process.exitCode = 1;
    }
  });
} else if (mode === "start") {
  requireNoNextProcesses();
  const missing = missingManifestAssets(buildDirectory);
  if (missing.length) throw new Error(`Production build is incomplete:\n${missing.join("\n")}`);
  exitWithChild(runNext(["start", "--port", "3000"], { ...process.env, NEXT_DIST_DIR: buildOutputName }));
} else if (mode === "check") {
  const active = activeProcesses();
  if (active.length !== 1) throw new Error(`Expected exactly one TraceKit Next.js process; found ${active.length}.`);
  await verifyDevAssets();
} else {
  throw new Error("Usage: next-lifecycle.mjs <dev|build|start|check>");
}
