import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const preload = "./tests/lectures-viewer-dist.mjs";

test("next.config.ts does not move the build directory", () => {
  const source = readFileSync("next.config.ts", "utf8");
  assert.equal(source.includes("LECTURE_VIEWER_DIST"), false);
  assert.equal(source.includes("distDir"), false);
});

test("lecture viewer preload keeps the default build directory without the env", () => {
  const result = loadDist(undefined);
  assert.equal(result.distDir.replaceAll("\\", "/"), ".next/dev");
});

test("lecture viewer preload moves only the test build directory", () => {
  const result = loadDist("tmp/lectures-viewer-next");
  assert.equal(
    result.distDir.replaceAll("\\", "/"),
    "tmp/lectures-viewer-next/dev",
  );
  assert.equal(
    result.distDirRoot.replaceAll("\\", "/"),
    "tmp/lectures-viewer-next",
  );
});

function loadDist(distDir) {
  const env = { ...process.env };
  delete env.LECTURE_VIEWER_DIST;
  if (distDir) env.LECTURE_VIEWER_DIST = distDir;
  const nodeOptions = [env.NODE_OPTIONS, `--import=${preload}`]
    .filter(Boolean)
    .join(" ");
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { PHASE_DEVELOPMENT_SERVER } = require("next/dist/shared/lib/constants.js");
const loadConfig = require("next/dist/server/config.js").default;
const config = await loadConfig(PHASE_DEVELOPMENT_SERVER, process.cwd());
console.log(JSON.stringify({ distDir: config.distDir, distDirRoot: config.distDirRoot }));`,
    ],
    {
      cwd: process.cwd(),
      env: { ...env, NODE_OPTIONS: nodeOptions },
      encoding: "utf8",
    },
  );
  assert.equal(child.status, 0, `${child.stdout || ""}\n${child.stderr || ""}`);
  const line = child.stdout
    .trim()
    .split(/\r?\n/)
    .find((item) => item.startsWith("{"));
  assert.ok(line, child.stdout);
  return JSON.parse(line);
}
