import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT, mcpExchange } from "./fixtures/mcp.mjs";

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

function initialize(protocolVersion) {
  const [res] = mcpExchange([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion, capabilities: {}, clientInfo: { name: "test", version: "0" } } },
  ]);
  return res.result;
}

test("MCP version negotiation", async (t) => {
  await t.test("echoes every handshake-based protocol version it supports", () => {
    for (const version of ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]) {
      assert.equal(initialize(version).protocolVersion, version);
    }
  });

  await t.test("answers an unsupported version with its latest supported one", () => {
    assert.equal(initialize("1999-01-01").protocolVersion, "2025-11-25");
    assert.equal(initialize(undefined).protocolVersion, "2025-11-25");
  });

  await t.test("reports the package version as its server version", () => {
    assert.equal(initialize("2025-06-18").serverInfo.version, pkg.version);
  });

  await t.test("rejects server/discover so stateless-era clients fall back to initialize", () => {
    const [res] = mcpExchange([{ jsonrpc: "2.0", id: 1, method: "server/discover", params: {} }]);
    assert.equal(res.error.code, -32601);
  });
});

test("MCP JSON-RPC error handling", async (t) => {
  await t.test("answers malformed JSON with a parse error", () => {
    const [res] = mcpExchange(["{not json"]);
    assert.equal(res.id, null);
    assert.equal(res.error.code, -32700);
  });

  await t.test("answers a message without a method with an invalid-request error", () => {
    const [res] = mcpExchange([{ jsonrpc: "2.0", id: 7 }]);
    assert.equal(res.id, 7);
    assert.equal(res.error.code, -32600);
  });

  await t.test("answers each request in a batch and skips its notifications", () => {
    const [res] = mcpExchange([
      [
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ],
    ]);
    assert.ok(Array.isArray(res));
    assert.deepEqual(res.map((r) => r.id).sort(), [1, 2]);
  });

  await t.test("rejects batches exceeding maximum batch limit", () => {
    const hugeBatch = Array.from({ length: 51 }, (_, i) => ({ jsonrpc: "2.0", id: i + 1, method: "ping" }));
    const [res] = mcpExchange([hugeBatch]);
    assert.equal(res.error.code, -32600);
    assert.match(res.error.message, /Batch size exceeds limit/);
  });

  await t.test("reports an unknown tool as invalid params", () => {
    const [res] = mcpExchange([{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "nope", arguments: {} } }]);
    assert.equal(res.error.code, -32602);
  });

  await t.test("does not answer notifications", () => {
    assert.deepEqual(mcpExchange([{ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 1 } }]), []);
  });
});

test("MCP tool annotations", async (t) => {
  const [res] = mcpExchange([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
  const tool = (name) => res.result.tools.find((x) => x.name === name);

  await t.test("marks the lookups as read-only and offline", () => {
    for (const name of ["lookup_pokemon", "calculate_weakness"]) {
      assert.equal(tool(name).annotations.readOnlyHint, true, name);
      assert.equal(tool(name).annotations.openWorldHint, false, name);
    }
  });

  await t.test("marks download_sprite as a file-writing network call", () => {
    const { annotations } = tool("download_sprite");
    assert.equal(annotations.readOnlyHint, false);
    assert.equal(annotations.destructiveHint, true);
    assert.equal(annotations.openWorldHint, true);
  });

  await t.test("gives every tool a human-readable title", () => {
    for (const t of res.result.tools) assert.ok(t.title && t.annotations.title === t.title, t.name);
  });
});
