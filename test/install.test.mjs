import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKILL_FILES = ["install.sh", "install.ps1", "SKILL.md", "index.mjs", "package.json"];

// Every case runs against a throwaway clone and HOME, so the real repo and home are never touched.
function sandbox(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "voltdex-install-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const home = path.join(dir, "home");
  const skillDir = path.join(home, ".claude", "skills", "voltdex");
  fs.mkdirSync(path.dirname(skillDir), { recursive: true });
  return { dir, home, skillDir };
}

function makeClone(clone) {
  fs.mkdirSync(clone, { recursive: true });
  for (const f of SKILL_FILES) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(clone, f));
  }
  fs.writeFileSync(path.join(clone, "NOTES.md"), "uncommitted local work");
}

function installSh(clone, home) {
  return spawnSync("bash", [path.join(clone, "install.sh"), home], {
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
}

function installPs1(clone, home) {
  return spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      path.join(clone, "install.ps1"),
      "-TargetHome",
      home,
    ],
    {
      encoding: "utf8",
    }
  );
}

test("install.sh", { skip: process.platform === "win32" && "needs bash" }, async (t) => {
  await t.test("copies whitelisted skill files into a fresh home", (t) => {
    const { dir, home, skillDir } = sandbox(t);
    const clone = path.join(dir, "clone");
    makeClone(clone);

    const res = installSh(clone, home);

    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(skillDir, "SKILL.md")));
    assert.ok(fs.existsSync(path.join(home, ".gemini", "antigravity-ide", "skills", "voltdex", "SKILL.md")));
    assert.ok(!fs.existsSync(path.join(skillDir, "NOTES.md")), "unwhitelisted file must not be copied");
  });

  await t.test("installs directly to a custom target directory with --target", (t) => {
    const { dir } = sandbox(t);
    const clone = path.join(dir, "clone");
    makeClone(clone);
    const customTarget = path.join(dir, "custom", "skills", "voltdex");

    const res = spawnSync("bash", [path.join(clone, "install.sh"), "--target", customTarget], {
      encoding: "utf8",
    });

    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(customTarget, "SKILL.md")));
    assert.ok(!fs.existsSync(path.join(customTarget, "NOTES.md")), "unwhitelisted file must not be copied");
  });

  await t.test("replaces a previous install", (t) => {
    const { dir, home, skillDir } = sandbox(t);
    const clone = path.join(dir, "clone");
    makeClone(clone);
    assert.equal(installSh(clone, home).status, 0);
    fs.writeFileSync(path.join(skillDir, "stale.txt"), "left over from an old version");

    const res = installSh(clone, home);

    assert.equal(res.status, 0, res.stderr);
    assert.ok(!fs.existsSync(path.join(skillDir, "stale.txt")));
  });

  await t.test("leaves a symlinked skill dir and the clone it points to intact", (t) => {
    const { dir, home, skillDir } = sandbox(t);
    const clone = path.join(dir, "clone");
    makeClone(clone);
    fs.symlinkSync(clone, skillDir);

    installSh(clone, home);

    assert.ok(fs.lstatSync(skillDir).isSymbolicLink());
    for (const f of [...SKILL_FILES, "NOTES.md"]) {
      assert.ok(fs.existsSync(path.join(clone, f)), `${f} was deleted from the clone`);
    }
  });

  await t.test("does not wipe a clone that already lives in the skill dir", (t) => {
    const { home, skillDir } = sandbox(t);
    makeClone(skillDir);

    installSh(skillDir, home);

    for (const f of [...SKILL_FILES, "NOTES.md"]) {
      assert.ok(fs.existsSync(path.join(skillDir, f)), `${f} was deleted from the clone`);
    }
  });

  await t.test("refuses to clear a directory that is not a voltdex install", (t) => {
    const { dir, home, skillDir } = sandbox(t);
    const clone = path.join(dir, "clone");
    makeClone(clone);
    fs.mkdirSync(skillDir);
    fs.writeFileSync(path.join(skillDir, "someone-else.txt"), "not ours");

    const res = installSh(clone, home);

    assert.notEqual(res.status, 0);
    assert.ok(fs.existsSync(path.join(skillDir, "someone-else.txt")));
  });
});

test("install.ps1", { skip: process.platform !== "win32" && "needs Windows PowerShell" }, async (t) => {
  await t.test("copies whitelisted skill files into a fresh home", (t) => {
    const { dir, home, skillDir } = sandbox(t);
    const clone = path.join(dir, "clone");
    makeClone(clone);

    const res = installPs1(clone, home);

    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(skillDir, "SKILL.md")));
    assert.ok(fs.existsSync(path.join(home, ".gemini", "antigravity-ide", "skills", "voltdex", "SKILL.md")));
    assert.ok(!fs.existsSync(path.join(skillDir, "NOTES.md")), "unwhitelisted file must not be copied");
  });

  await t.test("installs directly to a custom TargetDir", (t) => {
    const { dir } = sandbox(t);
    const clone = path.join(dir, "clone");
    makeClone(clone);
    const customTarget = path.join(dir, "custom", "skills", "voltdex");

    const res = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(clone, "install.ps1"), "-TargetDir", customTarget],
      { encoding: "utf8" }
    );

    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(customTarget, "SKILL.md")));
    assert.ok(!fs.existsSync(path.join(customTarget, "NOTES.md")), "unwhitelisted file must not be copied");
  });

  await t.test("replaces a previous install", (t) => {
    const { dir, home, skillDir } = sandbox(t);
    const clone = path.join(dir, "clone");
    makeClone(clone);
    assert.equal(installPs1(clone, home).status, 0);
    fs.writeFileSync(path.join(skillDir, "stale.txt"), "left over from an old version");

    const res = installPs1(clone, home);

    assert.equal(res.status, 0, res.stderr);
    assert.ok(!fs.existsSync(path.join(skillDir, "stale.txt")));
  });

  await t.test("leaves a junction/symlinked skill dir intact", (t) => {
    const { dir, home, skillDir } = sandbox(t);
    const clone = path.join(dir, "clone");
    makeClone(clone);
    const linkType = process.platform === "win32" ? "junction" : "dir";
    fs.symlinkSync(clone, skillDir, linkType);

    installPs1(clone, home);

    assert.ok(fs.lstatSync(skillDir).isSymbolicLink());
    for (const f of [...SKILL_FILES, "NOTES.md"]) {
      assert.ok(fs.existsSync(path.join(clone, f)), `${f} was deleted from the clone`);
    }
  });

  await t.test("refuses to clear a directory that is not a voltdex install", (t) => {
    const { dir, home, skillDir } = sandbox(t);
    const clone = path.join(dir, "clone");
    makeClone(clone);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "someone-else.txt"), "not ours");

    const res = installPs1(clone, home);

    assert.notEqual(res.status, 0);
    assert.ok(fs.existsSync(path.join(skillDir, "someone-else.txt")));
  });
});
