import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { downloadSprite } from "../src/lookup.mjs";
import { fakeSpriteFetch, FAKE_SPRITE_BYTES } from "./fixtures/fake-sprite.mjs";
import { ROOT, MOCK_FETCH, callMcpTool } from "./fixtures/mcp.mjs";

const SPRITE_URL = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png";

// An output root plus a sibling directory outside it. The process also moves into the root,
// so the default root (cwd) and an explicit one point at the same place.
function sandbox(t, fetchImpl = fakeSpriteFetch) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "voltdex-dl-")));
  const root = path.join(dir, "root");
  const outside = path.join(dir, "outside");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  const prevCwd = process.cwd();
  process.chdir(root);
  t.mock.method(globalThis, "fetch", fetchImpl);
  t.after(() => {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { root, outside };
}

function envWithout(name) {
  const env = { ...process.env };
  delete env[name];
  return env;
}

test("Sprite download boundary (downloadSprite)", async (t) => {
  await t.test("writes the sprite inside the output root", async (t) => {
    const { root } = sandbox(t);

    const saved = await downloadSprite(SPRITE_URL, "sprites/pikachu.png", { root });

    assert.equal(saved, path.join(root, "sprites", "pikachu.png"));
    assert.equal(fs.statSync(saved).size, FAKE_SPRITE_BYTES);
  });

  await t.test("rejects a symlinked directory that leads outside the root", async (t) => {
    const { root, outside } = sandbox(t);
    const linkType = process.platform === "win32" ? "junction" : "dir";
    try {
      fs.symlinkSync(outside, path.join(root, "link"), linkType);
    } catch (err) {
      if (err.code === "EPERM") {
        t.skip("Creating directory symlinks requires developer mode or admin privileges on Windows");
        return;
      }
      throw err;
    }

    await assert.rejects(downloadSprite(SPRITE_URL, "link/escaped.png", { root }), /symlink/);
    await assert.rejects(downloadSprite(SPRITE_URL, "link/new/escaped.png", { root }), /symlink/);
    assert.deepEqual(fs.readdirSync(outside), []);
  });

  await t.test("does not overwrite an existing file unless asked", async (t) => {
    const { root } = sandbox(t);
    const existing = path.join(root, "keep.png");
    fs.writeFileSync(existing, "precious");

    await assert.rejects(downloadSprite(SPRITE_URL, "keep.png", { root }), /already exists/);
    assert.equal(fs.readFileSync(existing, "utf8"), "precious");

    await downloadSprite(SPRITE_URL, "keep.png", { root, overwrite: true });
    assert.equal(fs.statSync(existing).size, FAKE_SPRITE_BYTES);
  });

  await t.test("never writes through a symlinked file, even with overwrite", async (t) => {
    const { root, outside } = sandbox(t);
    const victim = path.join(outside, "victim.png");
    fs.writeFileSync(victim, "victim");
    try {
      fs.symlinkSync(victim, path.join(root, "target.png"));
    } catch (err) {
      if (err.code === "EPERM") {
        t.skip("Creating file symlinks requires developer mode or admin privileges on Windows");
        return;
      }
      throw err;
    }

    await assert.rejects(downloadSprite(SPRITE_URL, "target.png", { root, overwrite: true }), /symlink/);
    assert.equal(fs.readFileSync(victim, "utf8"), "victim");
  });

  await t.test("refuses the filesystem root as the output root", async (t) => {
    const { root, outside } = sandbox(t);
    const fsRoot = path.parse(root).root;
    process.chdir(fsRoot);

    await assert.rejects(
      downloadSprite(SPRITE_URL, path.join(outside, "anywhere.png"), { root: fsRoot }),
      /filesystem root/
    );
    assert.deepEqual(fs.readdirSync(outside), []);
  });
});

// Behaves like fetch: redirects are followed transparently unless the caller opts out, so a
// caller that does not opt out ends up with whatever the redirect target served.
async function redirectingFetch(url, options = {}) {
  if (options.redirect === "manual") {
    return new Response(null, { status: 302, headers: { location: "https://attacker.example/x.png" } });
  }
  if (options.redirect === "error") throw new TypeError("fetch failed: unexpected redirect");
  return fakeSpriteFetch();
}

function oversizedBody(bytes, chunk = 1024 * 1024) {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      controller.enqueue(new Uint8Array(chunk));
      sent += chunk;
    },
  });
}

test("Sprite download transport limits (downloadSprite)", async (t) => {
  await t.test("refuses to follow a redirect away from the trusted origin", async (t) => {
    const { root } = sandbox(t, redirectingFetch);

    await assert.rejects(downloadSprite(SPRITE_URL, "pikachu.png", { root }), /redirect/i);
    assert.deepEqual(fs.readdirSync(root), []);
  });

  await t.test("stops reading a body that grows past the size limit", async (t) => {
    const { root } = sandbox(t, async () => new Response(oversizedBody(11 * 1024 * 1024), { status: 200 }));

    await assert.rejects(downloadSprite(SPRITE_URL, "huge.png", { root }), /too large/);
    assert.deepEqual(fs.readdirSync(root), []);
  });

  await t.test("rejects a declared size over the limit before reading the body", async (t) => {
    let pulled = false;
    // highWaterMark 0: the stream only pulls when someone actually reads it.
    const body = new ReadableStream({ pull: (c) => { pulled = true; c.close(); } }, { highWaterMark: 0 });
    const { root } = sandbox(t, async () =>
      new Response(body, { status: 200, headers: { "content-type": "image/png", "content-length": String(50 * 1024 * 1024) } })
    );

    await assert.rejects(downloadSprite(SPRITE_URL, "huge.png", { root }), /too large/);
    assert.equal(pulled, false);
    assert.deepEqual(fs.readdirSync(root), []);
  });
});

test("CLI --out overwrite protection", async (t) => {
  const runCli = (cwd, ...args) =>
    spawnSync(process.execPath, ["--import", MOCK_FETCH, path.join(ROOT, "index.mjs"), ...args], {
      cwd,
      encoding: "utf8",
    });

  await t.test("keeps an existing file unless --force is given", (t) => {
    const { root } = sandbox(t);
    const existing = path.join(root, "pikachu.png");
    fs.writeFileSync(existing, "precious");

    const kept = runCli(root, "25", "--out", "pikachu.png");
    assert.match(kept.stderr, /already exists/);
    assert.equal(fs.readFileSync(existing, "utf8"), "precious");

    runCli(root, "25", "--out", "pikachu.png", "--force");
    assert.equal(fs.statSync(existing).size, FAKE_SPRITE_BYTES);
  });
});

test("MCP download_sprite output directory", async (t) => {
  await t.test("resolves relative paths against VOLTDEX_OUTPUT_DIR", (t) => {
    const { root, outside } = sandbox(t);

    const result = callMcpTool(
      "download_sprite",
      { query: "pikachu", out: "pikachu.png" },
      { cwd: outside, env: { ...process.env, VOLTDEX_OUTPUT_DIR: root } }
    );

    assert.ok(!result.isError, result.content?.[0]?.text);
    assert.equal(JSON.parse(result.content[0].text).saved_to, path.join(root, "pikachu.png"));
    assert.deepEqual(fs.readdirSync(outside), []);
  });

  await t.test("refuses to write when launched from the filesystem root", (t) => {
    const { root, outside } = sandbox(t);

    const result = callMcpTool(
      "download_sprite",
      { query: "pikachu", out: path.join(outside, "pikachu.png") },
      { cwd: path.parse(root).root, env: envWithout("VOLTDEX_OUTPUT_DIR") }
    );

    assert.equal(result.isError, true);
    assert.deepEqual(fs.readdirSync(outside), []);
  });
});
