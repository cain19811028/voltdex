// SPDX-License-Identifier: MIT
// Copyright (c) 2026 cain19811028

import fs from "node:fs";
import readline from "node:readline";
import { searchPokemon, spriteUrlFor, downloadSprite } from "./lookup.mjs";
import { calculateWeaknesses, calculateStabCoverage, TYPES } from "./type-chart.mjs";

// Unknown or extra types used to be skipped silently, which returned a confident wrong matchup.
function parseTypes(raw) {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,/\s]+/) : [];
  if (list.some((t) => typeof t !== "string")) {
    return { error: "Invalid 'types' parameter. Every type must be a string, e.g. ['fire', 'flying']" };
  }
  const types = [...new Set(list.map((t) => t.toLowerCase().trim()).filter(Boolean))];
  if (types.length === 0) {
    return { error: "Missing or invalid 'types' parameter. Expected array of types, e.g. ['fire', 'flying']" };
  }
  const unknown = types.filter((t) => !TYPES.includes(t));
  if (unknown.length > 0) {
    return { error: `Unknown type(s): ${unknown.join(", ")}. Valid types: ${TYPES.join(", ")}` };
  }
  if (types.length > 2) {
    return { error: `A Pokémon has at most two types, got ${types.length}: ${types.join(", ")}` };
  }
  return { types };
}

// Handshake-based revisions this server implements, newest first. The stateless 2026-07-28
// revision is not one of them: its clients probe with server/discover, get "method not
// found", and fall back to initialize.
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const PKG = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// A miss is a tool error the agent can act on; an ambiguous query lists candidates to retry with.
function notFoundResult(query, { candidates, total }) {
  if (candidates.length === 0) {
    return { isError: true, content: [{ type: "text", text: `Pokémon not found for query: "${query}"` }] };
  }
  const body = {
    error: "ambiguous",
    query,
    total,
    candidates: candidates.map(({ id, slug, en, zh_tw }) => ({ id, slug, en, zh_tw })),
    hint: "Retry with one candidate's slug.",
  };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(body) }] };
}

const TOOLS = [
  {
    name: "lookup_pokemon",
    title: "Look up Pokémon",
    description: "Look up Pokémon info by name (EN/ZH/JA) or National Dex ID. Returns multi-lingual names, types, base stats (BST), battle weaknesses, and sprite URL. A partial name that fits several Pokémon returns an error listing candidates instead of a guess.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Pokémon name in English, Traditional Chinese (繁中), Simplified Chinese (簡中), Japanese (日文), or National Dex ID (e.g. '噴火龍', 'charizard', '25'). Alternate forms with their own types or stats are separate entries (e.g. 'wash rotom', 'alolan ninetales', 'mega charizard x'); a species' entry lists their slugs in 'forms'.",
        },
        sprite: {
          type: "string",
          enum: ["official", "showdown", "gen3", "default"],
          description: "Sprite set: 'official' (475x475 PNG artwork, default), 'showdown' (animated battle GIF), 'gen3' (GBA Emerald pixel), 'default' (classic front)",
        },
        shiny: {
          type: "boolean",
          description: "Whether to return shiny (色違) version sprite URL. The 'official' shiny set is fan-made, not official artwork.",
        },
      },
      required: ["query"],
    },
    annotations: { title: "Look up Pokémon", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "calculate_weakness",
    title: "Calculate type matchups",
    description: "Calculate battle type matchups and defensive weaknesses/resistances for given Pokémon types.",
    inputSchema: {
      type: "object",
      properties: {
        types: {
          type: "array",
          items: { type: "string", enum: TYPES },
          minItems: 1,
          maxItems: 2,
          description: "One or two English type names (e.g. ['fire', 'flying'])",
        },
      },
      required: ["types"],
    },
    annotations: { title: "Calculate type matchups", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "download_sprite",
    title: "Download Pokémon sprite",
    description: "Download Pokémon artwork or a sprite from PokeAPI/sprites to a local file path, instead of having an image model draw one.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Pokémon name or ID",
        },
        out: {
          type: "string",
          description:
            "Output file path (e.g. 'charizard.png'). Relative paths resolve against VOLTDEX_OUTPUT_DIR, or the server's working directory when unset; the file must stay inside that directory.",
        },
        sprite: {
          type: "string",
          enum: ["official", "showdown", "gen3", "default"],
          description: "Sprite set style. Defaults to 'official'.",
        },
        shiny: {
          type: "boolean",
          description: "Whether to download the shiny version. The 'official' shiny set is fan-made, not official artwork.",
        },
        overwrite: {
          type: "boolean",
          description: "Replace the file if it already exists. Defaults to false.",
        },
      },
      required: ["query", "out"],
    },
    // Destructive because `overwrite: true` replaces an existing file; clients should confirm.
    annotations: {
      title: "Download Pokémon sprite",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

function textResult(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }] };
}

function toolError(text) {
  return { isError: true, ...textResult(text) };
}

async function runTool(name, args) {
  if (name === "lookup_pokemon") {
    const search = searchPokemon(args.query);
    const pokemon = search.match;
    if (!pokemon) return notFoundResult(args.query, search);
    const spriteUrl = spriteUrlFor(pokemon, args.sprite || "official", args.shiny || false);
    return textResult({ ...pokemon, sprite: spriteUrl });
  }

  if (name === "calculate_weakness") {
    const { types, error } = parseTypes(args.types);
    if (error) return toolError(error);
    return textResult({ types, weaknesses: calculateWeaknesses(types), stab_coverage: calculateStabCoverage(types) });
  }

  if (name === "download_sprite") {
    if (typeof args.query !== "string" || !args.query.trim()) return toolError("Missing or invalid 'query' parameter");
    if (typeof args.out !== "string" || !args.out.trim()) return toolError("Missing or invalid 'out' parameter");

    const search = searchPokemon(args.query);
    const pokemon = search.match;
    if (!pokemon) return notFoundResult(args.query, search);
    const spriteUrl = spriteUrlFor(pokemon, args.sprite || "official", args.shiny || false);
    const savedPath = await downloadSprite(spriteUrl, args.out, {
      root: process.env.VOLTDEX_OUTPUT_DIR || process.cwd(),
      overwrite: args.overwrite === true,
    });
    return textResult({ id: pokemon.id, name: pokemon.slug, sprite: spriteUrl, saved_to: savedPath });
  }

  throw new RpcError(-32602, `Unknown tool: ${name}`);
}

async function callTool(name, args) {
  try {
    return await runTool(name, args);
  } catch (err) {
    if (err instanceof RpcError) throw err;
    // A failure while running a known tool is reported to the model, not as a protocol error.
    return toolError(`Error executing ${name}: ${err.message}`);
  }
}

const rpcResult = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

/**
 * Handle one JSON-RPC message. Returns the response, or null when none is due
 * (notifications, and stray responses: this server never sends requests).
 */
async function handleMessage(msg) {
  const isObject = msg !== null && typeof msg === "object" && !Array.isArray(msg);
  if (isObject && typeof msg.method !== "string" && ("result" in msg || "error" in msg)) return null;
  if (!isObject || typeof msg.method !== "string") {
    return rpcError(isObject && "id" in msg ? msg.id : null, -32600, "Invalid Request");
  }
  if (!("id" in msg)) return null;

  const { id, method, params } = msg;
  try {
    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        return rpcResult(id, {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : SUPPORTED_PROTOCOL_VERSIONS[0],
          capabilities: { tools: {} },
          serverInfo: { name: "voltdex", version: PKG.version },
        });
      }
      case "ping":
        return rpcResult(id, {});
      case "tools/list":
        return rpcResult(id, { tools: TOOLS });
      case "tools/call":
        return rpcResult(id, await callTool(params?.name, params?.arguments || {}));
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    return rpcError(id, err instanceof RpcError ? err.code : -32603, err.message);
  }
}

export function startMcpServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const send = (payload) => process.stdout.write(JSON.stringify(payload) + "\n");

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      send(rpcError(null, -32700, "Parse error"));
      return;
    }

    // Batches belong to the 2025-03-26 revision only; answering one costs nothing elsewhere.
    if (Array.isArray(msg)) {
      if (msg.length === 0) {
        send(rpcError(null, -32600, "Invalid Request"));
        return;
      }
      if (msg.length > 50) {
        send(rpcError(null, -32600, "Batch size exceeds limit of 50"));
        return;
      }
      const responses = (await Promise.all(msg.map(handleMessage))).filter(Boolean);
      if (responses.length > 0) send(responses);
      return;
    }

    const response = await handleMessage(msg);
    if (response) send(response);
  });

  // Keep alive
  process.on("SIGINT", () => process.exit(0));
}
