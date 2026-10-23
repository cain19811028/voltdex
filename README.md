<p align="center">
  <img src="assets/hero.svg" width="100%" alt="voltdex - an unofficial Pokémon data field guide for AI agents">
</p>

<p align="center">
  <a href="https://github.com/cain19811028/voltdex"><img src="https://img.shields.io/badge/Pok%C3%A9mon-1025%20species%20%2B%20220%20forms-FF5A1F?style=flat-square" alt="1025 Pokémon species and 220 forms"></a>
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-Ready%20(Stdio)-00F0FF?style=flat-square&logo=anthropic&logoColor=black" alt="MCP Server"></a>
  <a href="https://claude.ai/"><img src="https://img.shields.io/badge/Claude%20Code-Skill%20Supported-D97757?style=flat-square&logo=claude&logoColor=white" alt="Claude Code Skill"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D%2022-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js"></a>
  <a href="#-voltdex---benchmark-token-diet"><img src="https://img.shields.io/badge/Payload-564%20B%20vs%20450%20KB-10B981?style=flat-square" alt="Payload: 564 bytes vs 450 KB"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <b>English</b> | <a href="README.zh-TW.md">繁體中文</a>
</p>

---

### `$ voltdex --whoami`

> ⚡ **"A charged-up field guide for your AI agent."**

**`voltdex`** is an unofficial, **lightweight Dual-Mode Pokémon data tool (MCP Server + Agent Skill)** built specifically for AI Coding Agents (**Claude Code, Cursor, Gemini CLI, etc.**).  
Its mascot, Spark, is a little bolt of energy that lives in a field guide and powers every lookup.

It answers in one small response what an agent would otherwise piece together from several [PokéAPI](https://pokeapi.co/) calls: **names in four languages, types, base stats and type matchups**, instead of ~450 KB of raw JSON. It also takes names PokéAPI's `/pokemon` endpoint does not: that endpoint only accepts English slugs or IDs, so `/pokemon/噴火龍` is a 404.

---

### `$ voltdex --features`

- 🌐 **Offline Multilingual Lookup (EN / Traditional ZH / Simplified ZH / JA / National Dex number)**
  - Bundled offline index of all **1025 species** across Gen 1–9, plus the **220 alternate forms** whose types or base stats differ (Wash Rotom, Alolan Ninetales, Mega Charizard X, …).
  - Queries like `charizard`, `噴火龍`, `喷火龙`, `リザードン`, `6` or `wash rotom` resolve locally with **no network request**: under 1 ms per lookup once the index is loaded (~7 ms).
  - A partial name that fits several Pokémon (`char`, `火`) returns the candidates instead of a guess.
- ⚡ **Small Responses Instead of Raw API Payloads**
  - PokéAPI's `GET /pokemon/charizard` returns ~370 KB of JSON (every game's move list, game indices and more); localized names take another ~35 KB from `/pokemon-species`.
  - `voltdex` answers with **139 bytes** (`--brief`) or **564 bytes** (MCP JSON) for the same Pokémon, and token use shrinks with it.
- 🛡️ **Battle Stats & Type Matchups**
  - Base stats (HP / Atk / Def / SpA / SpD / Spe) and Base Stat Total (BST).
  - Defensive type matchups computed automatically (4x, 2x, 0.5x, 0.25x, 0x). They follow from types alone; abilities such as Levitate are not taken into account.
- 🎨 **Real Sprites Instead of Image-Model Guesses**
  - Downloads **official artwork (475×475 PNG)**, **Showdown animated GIFs**, **Gen 3 Emerald pixel sprites** and **shiny variants** from [PokeAPI/sprites](https://github.com/PokeAPI/sprites). Some sets are fan-made, including the shiny official artwork; see [`--sprites`](#-voltdex---sprites-visual-assets-matrix).
- 🔌 **Dual-Mode Integration (MCP Server + Agent Skill)**
  - Use it natively as an **MCP Server (stdio)** or plug it in as an **Agent Skill (`SKILL.md`)**.

---

### `$ voltdex --benchmark (Token Diet)`

When an AI agent needs a Pokémon's names, types, stats and type matchups (Charizard, measured on 2026-10-11):

| | PokéAPI REST API (`pokeapi.co`) | `voltdex` |
| :--- | :--- | :--- |
| **Requests** | 4: `/pokemon`, `/pokemon-species`, and `/type` for each of its two types | **None** (offline index) |
| **Payload** | 371,588 + 34,727 + 21,109 + 22,915 bytes ≈ **450 KB** | **139 B** (`--brief`) · **564 B** (MCP) · 1,023 B (CLI JSON, indented) |
| **Lookup by name** | English slug or ID only; `/pokemon/噴火龍` is a 404 | EN / ZH-TW / ZH-CN / JA name, or National Dex number |
| **Time** | A network round trip per request (0.3–0.6 s each from our test machine) | Under 1 ms per lookup in the MCP server; ~0.1 s per CLI call, mostly Node.js startup |
| **Type matchups** | Combine each `/type`'s damage relations yourself | Computed: 4x / 2x / 0.5x / 0.25x / 0x |

PokéAPI's payloads grow as data is added, and times depend on your network and machine.

---

### `$ voltdex query charizard --demo`

#### 1. Structured JSON (MCP `lookup_pokemon`, line breaks added)
```json
{
  "id": 6, "slug": "charizard", "en": "Charizard", "zh_tw": "噴火龍", "zh_cn": "喷火龙", "ja": "リザードン",
  "types": ["fire", "flying"],
  "stats": { "hp": 78, "atk": 84, "def": 78, "spa": 109, "spd": 85, "spe": 100, "bst": 534 },
  "forms": ["charizard-mega-x", "charizard-mega-y"],
  "weaknesses": { "4x": ["rock"], "2x": ["water", "electric"], "0.5x": ["fire", "fighting", "steel", "fairy"], "0.25x": ["grass", "bug"], "0x": ["ground"] },
  "stab_coverage": ["grass", "ice", "bug", "steel", "fighting"],
  "sprite": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png"
}
```
The CLI's default output (`--json`) has the same fields, indented, plus `types_zh`, `stab_coverage_zh`, `sprite_style` and `is_shiny`.

#### 2. Ultra-Compact Mode (`--brief`, Maximum Token Efficiency)
```bash
$ node index.mjs charizard --brief
#006 Charizard | fire/flying | BST:534 (HP:78 Atk:84 Def:78 SpA:109 SpD:85 Spe:100) | Weak: 4x:rock 2x:water,electric | Immune: ground(0x)
```

---

### `$ voltdex --install`

`voltdex` supports seamless plug-and-play as an Agent Skill or a standard MCP Server:

#### Option A: As an Agent Skill (Claude Code / Cursor / Project Skills)
Clone the repository:
```bash
git clone https://github.com/cain19811028/voltdex.git
```
Then copy (or symlink) into your desired skills folder:
```bash
# 1. Install globally for Claude Code:
cp -r voltdex ~/.claude/skills/voltdex

# 2. Install globally for Cursor:
cp -r voltdex ~/.cursor/skills/voltdex

# 3. Install for Google Antigravity / Gemini CLI:
cp -r voltdex ~/.gemini/antigravity-ide/skills/voltdex

# 4. Or place inside your project / agent workspace skills directory:
cp -r voltdex ./.agents/skills/voltdex
```
AI Agents will automatically discover and utilize the tool via [`SKILL.md`](SKILL.md).

#### Option B: As an MCP Server (Model Context Protocol)
Add `voltdex` to your Claude Desktop, Claude Code, or project `.mcp.json` (e.g. `~/.claude.json`):

```json
{
  "mcpServers": {
    "voltdex": {
      "command": "node",
      "args": ["/path/to/voltdex/index.mjs", "--mcp"],
      "env": { "VOLTDEX_OUTPUT_DIR": "/path/to/your/sprites" }
    }
  }
}
```
> 💡 *Windows users: specify your path, e.g. `"C:/tools/voltdex/index.mjs"`.*

> 🔒 *`download_sprite` only writes inside `VOLTDEX_OUTPUT_DIR` (or the server's working directory when unset), never follows a symlink out of it, and keeps existing files unless called with `overwrite: true`. It refuses to write when that directory is the filesystem root, which some MCP clients use as the working directory.*

---

### `$ voltdex --sprites (Visual Assets Matrix)`

| Option | Description | Best For |
| :--- | :--- | :--- |
| `--sprite official` | **Official artwork, transparent PNG (475×475)** *(Default)* | Modern UI cards, presentations |
| `--sprite showdown` | **Pokémon Showdown animated battle GIF** (made by the Smogon community) | Dynamic battle animations |
| `--sprite gen3` | **GBA Gen 3 Emerald pixel sprite** (Gen 1–3 only; others fall back to `official`) | Retro pixel art applications |
| `--sprite default` | **96×96 front pixel sprite** (Gen 9 ones are fan-made) | Lightweight icon indicators |
| `--shiny` | **Flag: shiny colors.** With `official`, these are fan-made recolors, not official artwork | Black Charizard, Gold Magikarp |
| `--force` | **Flag: Overwrite the `--out` file if it already exists** | Re-downloading a sprite |

```bash
# Download shiny Charizard (a fan-made recolor of the official artwork)
node index.mjs charizard --sprite official --shiny --out charizard_shiny.png
```

---

### `$ voltdex --license & disclaimer`

- **License**: The source code and original artwork are licensed under the [MIT License](LICENSE) © 2026 [cain19811028](https://github.com/cain19811028). It does not cover the third-party data and images described below.
- **Name & Mascot**: The voltdex name and the Spark mascot identify this project. The MIT License does not cover their use as a brand; forks are welcome under their own name.
- **Trademarks**: Pokémon and Pokémon character names are trademarks of **Nintendo, Creatures Inc., GAME FREAK Inc., and The Pokémon Company**.
- **Unofficial**: voltdex is an independent, non-commercial fan project. It is **not** affiliated with, sponsored by, or endorsed by any of them.
- **Data & Images**: `data/pokedex.json` holds factual reference data derived from [PokéAPI](https://pokeapi.co/) (BSD 3-Clause). This repository contains **no Pokémon artwork**; sprites are downloaded on request from [PokeAPI/sprites](https://github.com/PokeAPI/sprites), are not licensed to you by this project, and remain the property of their owners. You are responsible for how you use them.
- **Details**: See [NOTICE.md](NOTICE.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **Rights Holders**: If you have a concern about any material referenced here, please [open an issue](https://github.com/cain19811028/voltdex/issues); it will be handled promptly, including removal where appropriate.
