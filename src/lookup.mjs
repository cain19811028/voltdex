// SPDX-License-Identifier: MIT
// Copyright (c) 2026 cain19811028

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateWeaknesses, calculateStabCoverage } from "./type-chart.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../data/pokedex.json");

let pokedex = null;
let formsBySpecies = null;

/**
 * Every entry: one default entry per species, then the alternate forms whose types or base
 * stats differ. A form carries `form_of` (its species' slug) and `pokeapi_id` (for sprites).
 * @returns {object[]}
 */
export function loadPokedex() {
  if (!pokedex) {
    const raw = fs.readFileSync(DB_PATH, "utf-8");
    pokedex = JSON.parse(raw);
    formsBySpecies = new Map();
    for (const p of pokedex.filter((p) => p.form_of)) {
      if (!formsBySpecies.has(p.form_of)) formsBySpecies.set(p.form_of, []);
      formsBySpecies.get(p.form_of).push(p.slug);
    }
  }
  return pokedex;
}

const MAX_CANDIDATES = 10;

// Folds case, full-width forms, Latin accents, gender signs and punctuation, so "Farfetch'd",
// "Farfetch’d" and "farfetchd" compare equal. Only the Latin combining-mark block is stripped,
// which keeps kana voiced marks (ド vs ト) significant.
function normalizeName(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/♀/g, "f")
    .replace(/♂/g, "m")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

let searchIndex = null;

function loadSearchIndex() {
  if (!searchIndex) {
    searchIndex = loadPokedex().map((p) => ({
      pokemon: p,
      names: [...new Set([p.slug, p.en, p.zh_tw, p.zh_cn, p.ja].map(normalizeName).filter(Boolean))],
    }));
  }
  return searchIndex;
}

/**
 * Search Pokémon by National Dex ID, English name, Traditional/Simplified Chinese, or Japanese name.
 * An exact name always wins. A partial name resolves only when it fits a single Pokémon; when it
 * fits several, they come back as candidates instead of a confident guess.
 * @param {string|number} rawQuery
 * @returns {{ match: object|null, candidates: object[], total: number }} `candidates` holds at most
 *   MAX_CANDIDATES entries; `total` counts every Pokémon the query fits.
 */
export function searchPokemon(rawQuery) {
  const none = { match: null, candidates: [], total: 0 };
  if (rawQuery === undefined || rawQuery === null) return none;
  const qStr = String(rawQuery).trim();
  if (!qStr || qStr.length > 100) return none;

  // 1. National Dex ID (#025, 25) names a species, so it returns the default form.
  const idMatch = /^#?(\d+)$/.exec(qStr);
  if (idMatch) {
    const id = parseInt(idMatch[1], 10);
    const found = loadPokedex().find((p) => p.id === id && !p.form_of);
    if (found) return { match: enrichPokemon(found), candidates: [], total: 1 };
  }

  const q = normalizeName(qStr);
  if (!q) return none;
  const index = loadSearchIndex();

  // 2. Exact name, otherwise 3. partial name
  const exact = index.filter((e) => e.names.includes(q));
  const hits = exact.length > 0 ? exact : index.filter((e) => e.names.some((n) => n.includes(q)));
  if (hits.length === 1) {
    return { match: enrichPokemon(hits[0].pokemon), candidates: [], total: 1 };
  }
  // "roto" fits Rotom and its five forms: one species, so its default form is the answer.
  // Forms without their default entry ("mega charizard": X and Y) stay ambiguous.
  const defaults = hits.filter((e) => !e.pokemon.form_of);
  if (defaults.length === 1 && hits.every((e) => e.pokemon.id === defaults[0].pokemon.id)) {
    return { match: enrichPokemon(defaults[0].pokemon), candidates: [], total: 1 };
  }
  return { match: null, candidates: hits.slice(0, MAX_CANDIDATES).map((e) => e.pokemon), total: hits.length };
}

/**
 * Find a single Pokémon; null when the query matches none or is ambiguous (see searchPokemon).
 * @param {string|number} rawQuery
 * @returns {object|null}
 */
export function findPokemon(rawQuery) {
  return searchPokemon(rawQuery).match;
}

/**
 * Enrich Pokémon object with weaknesses, STAB offensive advantages, and the slugs of its
 * alternate forms when it is a species' default entry that has any.
 */
function enrichPokemon(p) {
  const forms = formsBySpecies.get(p.slug);
  return {
    ...p,
    ...(forms && !p.form_of ? { forms } : {}),
    weaknesses: calculateWeaknesses(p.types || []),
    stab_coverage: calculateStabCoverage(p.types || []),
  };
}

/**
 * Sprite URL for a looked-up entry. PokeAPI/sprites files alternate forms under their PokéAPI
 * id (10009 for Wash Rotom), not under the National Dex number they share with the species.
 * @param {object} pokemon - an entry from searchPokemon / findPokemon
 * @param {string} spriteSet
 * @param {boolean} shiny
 */
export function spriteUrlFor(pokemon, spriteSet, shiny) {
  return getSpriteUrl(pokemon.pokeapi_id ?? pokemon.id, spriteSet, shiny);
}

/**
 * Get Sprite URL based on set and shiny flag.
 * @param {number} id
 * @param {string} spriteSet - "official", "showdown", "gen3", "default"
 * @param {boolean} shiny
 */
export function getSpriteUrl(id, spriteSet = "official", shiny = false) {
  const isShiny = Boolean(shiny);
  const set = (typeof spriteSet === "string" ? spriteSet : "official").toLowerCase();

  switch (set) {
    case "official":
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${isShiny ? "shiny/" : ""}${id}.png`;
    case "showdown":
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown/${isShiny ? "shiny/" : ""}${id}.gif`;
    case "gen3":
      // Emerald sprites only exist for Gen 1~3 (#1 to #386)
      if (id <= 386) {
        return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-iii/emerald/${isShiny ? "shiny/" : ""}${id}.png`;
      }
      // Automatic fallback to official artwork for Gen 4+ Pokémon
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${isShiny ? "shiny/" : ""}${id}.png`;
    case "default":
    default:
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${isShiny ? "shiny/" : ""}${id}.png`;
  }
}

const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".gif", ".jpg", ".jpeg", ".webp"]);
const ALLOWED_ORIGIN_PREFIX = "https://raw.githubusercontent.com/PokeAPI/";
// The largest PokeAPI sprites are a few hundred KB; anything near this is not a sprite.
const MAX_SPRITE_BYTES = 10 * 1024 * 1024;

function isInside(dir, target) {
  const rel = path.relative(dir, target);
  return !path.isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${path.sep}`);
}

function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return null;
    throw err;
  }
}

/**
 * Resolve where a sprite may be written. Rejects any path that would land outside `root`
 * once symlinks are followed, and any existing file unless `overwrite` is set.
 */
function resolveOutputPath(outPath, root, overwrite) {
  const rootDir = path.resolve(root);
  if (!fs.existsSync(rootDir)) {
    throw new Error(`Output directory does not exist: ${rootDir}`);
  }
  const realRoot = fs.realpathSync(rootDir);
  // MCP clients may launch the server with "/" as its working directory; a boundary there allows everything.
  if (path.parse(realRoot).root === realRoot) {
    throw new Error(
      "Security error: Refusing to use the filesystem root as the output directory. " +
        "Run from a project directory or set VOLTDEX_OUTPUT_DIR."
    );
  }

  const fullPath = path.resolve(rootDir, outPath);
  if (!isInside(rootDir, fullPath)) {
    throw new Error(`Security error: Output path must be within the output directory (${rootDir})`);
  }

  // path.resolve does not follow symlinks, so check where the deepest existing ancestor really
  // lives before any directory gets created through it.
  let ancestor = path.dirname(fullPath);
  while (!lstatOrNull(ancestor)) ancestor = path.dirname(ancestor);
  if (!isInside(realRoot, fs.realpathSync(ancestor))) {
    throw new Error(`Security error: Output path leaves the output directory through a symlink (${rootDir})`);
  }

  const target = lstatOrNull(fullPath);
  if (target?.isSymbolicLink()) {
    throw new Error(`Security error: Refusing to write through a symlink: ${fullPath}`);
  }
  if (target?.isDirectory()) {
    throw new Error(`Target path is an existing directory: ${fullPath}`);
  }
  if (target && !overwrite) {
    throw new Error(`File already exists: ${fullPath}. Use --force (CLI) or overwrite: true (MCP) to replace it.`);
  }
  return fullPath;
}

// Only the first URL passes the origin check, so a redirect is refused instead of followed.
async function fetchSprite(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "voltdex" },
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`Refusing to follow a redirect (HTTP ${res.status}) from ${url}`);
  }
  return res;
}

// Streams the body so an oversized response is cut off instead of buffered whole.
async function readCappedBody(res, limit) {
  const declared = Number(res.headers.get("content-length"));
  if (declared > limit) {
    throw new Error(`Sprite is too large: ${declared} bytes (limit ${limit})`);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body ?? []) {
    size += chunk.byteLength;
    if (size > limit) throw new Error(`Sprite is too large: over ${limit} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Download sprite to target file path.
 * Enforces image extension restriction, URL origin validation (no redirects), a size limit,
 * an output directory boundary that symlinks cannot escape, no silent overwrites, and
 * automatic fallback to official artwork when target style returns 404.
 * @param {string} url
 * @param {string} outPath - relative paths resolve against `options.root`
 * @param {object} [options]
 * @param {string} [options.root=process.cwd()] - directory the file must stay inside
 * @param {boolean} [options.overwrite=false] - replace an existing file
 * @returns {Promise<string>} absolute path of written file
 */
export async function downloadSprite(url, outPath, options = {}) {
  if (typeof url !== "string" || !url.startsWith(ALLOWED_ORIGIN_PREFIX)) {
    throw new Error(`Untrusted sprite URL source: ${url}`);
  }

  if (typeof outPath !== "string" || !outPath.trim()) {
    throw new Error("Invalid output file path specified");
  }

  const ext = path.extname(outPath).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error(
      `Disallowed file extension "${ext}". Only image formats are permitted: ${[...ALLOWED_IMAGE_EXTENSIONS].join(", ")}`
    );
  }

  const overwrite = options.overwrite === true;
  const fullPath = resolveOutputPath(outPath, options.root ?? process.cwd(), overwrite);

  let res = await fetchSprite(url);

  // If a showdown GIF or custom sprite returns 404, fallback to official artwork
  if (!res.ok && res.status === 404 && !url.includes("official-artwork")) {
    const numMatch = url.match(/\/(\d+)\.(gif|png)$/);
    if (numMatch) {
      const pokeId = numMatch[1];
      const isShinyUrl = url.includes("/shiny/");
      const fallbackUrl = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${isShinyUrl ? "shiny/" : ""}${pokeId}.png`;
      console.warn(`⚠️ Sprite not available at requested style (${url}), falling back to official artwork...`);
      res = await fetchSprite(fallbackUrl);
    }
  }

  if (!res.ok) {
    throw new Error(`Failed to download sprite: HTTP ${res.status} from ${url}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
    throw new Error(`Unexpected content-type received from source: ${contentType}`);
  }

  const buffer = await readCappedBody(res, MAX_SPRITE_BYTES);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  // "wx" keeps the no-overwrite promise even if the file appeared while downloading.
  fs.writeFileSync(fullPath, buffer, { flag: overwrite ? "w" : "wx" });
  return fullPath;
}
