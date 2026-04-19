import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(__dirname, "..");
const script = join(root, "codesetup");
const dest = mkdtempSync(join(tmpdir(), "codesetup-test-"));
const parent = mkdtempSync(join(tmpdir(), "codesetup-parent-"));
const nested = join(parent, "nested");

try {
  execFileSync(script, {
    cwd: dest,
    stdio: "pipe",
  });

  const pkgPath = join(dest, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    bin?: Record<string, string>;
  };

  assert.equal(pkg.bin, undefined);
  assert.throws(() => readFileSync(join(dest, "codesetup"), "utf8"));

  execFileSync(script, [nested], {
    cwd: root,
    stdio: "pipe",
  });

  const nestedPkg = JSON.parse(readFileSync(join(nested, "package.json"), "utf8")) as {
    bin?: Record<string, string>;
  };

  assert.equal(nestedPkg.bin, undefined);
  assert.throws(() => readFileSync(join(nested, "codesetup"), "utf8"));
} finally {
  rmSync(dest, { recursive: true, force: true });
  rmSync(parent, { recursive: true, force: true });
}
