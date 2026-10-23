import test from "node:test";
import assert from "node:assert/strict";
import { findPokemon, searchPokemon, loadPokedex, getSpriteUrl, downloadSprite } from "../src/lookup.mjs";
import { calculateWeaknesses, calculateStabCoverage, TYPES } from "../src/type-chart.mjs";

test("Pokédex Data Integrity", async (t) => {
  await t.test("contains one default entry for each of the 1025 Gen 1~9 species", () => {
    const species = loadPokedex().filter((p) => !p.form_of);
    assert.equal(species.length, 1025);
    assert.deepEqual(
      species.map((p) => p.id),
      Array.from({ length: 1025 }, (_, i) => i + 1)
    );
  });

  await t.test("ties every alternate form to its species and its PokéAPI id", () => {
    const list = loadPokedex();
    const forms = list.filter((p) => p.form_of);
    assert.ok(forms.length > 0);
    for (const f of forms) {
      const base = list.find((p) => p.slug === f.form_of && !p.form_of);
      assert.ok(base, `${f.slug} points at unknown species ${f.form_of}`);
      assert.equal(f.id, base.id, f.slug);
      assert.ok(Number.isInteger(f.pokeapi_id) && f.pokeapi_id > 10000, f.slug);
      assert.notDeepEqual([f.types, f.stats], [base.types, base.stats], `${f.slug} duplicates ${base.slug}`);
    }
  });

  await t.test("every entry has valid schema and accurate BST calculation", () => {
    const list = loadPokedex();
    for (const p of list) {
      assert.ok(p.id >= 1 && p.id <= 1025, `Invalid ID: ${p.id}`);
      assert.ok(p.slug && typeof p.slug === "string");
      assert.ok(p.en && typeof p.en === "string");
      assert.ok(p.zh_tw && typeof p.zh_tw === "string");
      assert.ok(p.zh_cn && typeof p.zh_cn === "string");
      assert.ok(p.ja && typeof p.ja === "string");
      assert.ok(Array.isArray(p.types) && p.types.length >= 1 && p.types.length <= 2);

      const s = p.stats;
      assert.ok(s, `Missing stats on #${p.id}`);
      const sum = s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
      assert.equal(sum, s.bst, `BST mismatch on #${p.id} ${p.en}`);
    }
  });
});

test("Multilingual Lookup Engine (findPokemon)", async (t) => {
  await t.test("finds by numeric ID and padded string ID", () => {
    const p1 = findPokemon(25);
    assert.equal(p1.slug, "pikachu");
    const p2 = findPokemon("#025");
    assert.equal(p2.slug, "pikachu");
    const p3 = findPokemon("1025");
    assert.equal(p3.slug, "pecharunt");
  });

  await t.test("finds by English name (case insensitive)", () => {
    const p = findPokemon("Charizard");
    assert.equal(p.id, 6);
  });

  await t.test("finds by Traditional Chinese name", () => {
    const p = findPokemon("噴火龍");
    assert.equal(p.id, 6);
  });

  await t.test("finds by Simplified Chinese name", () => {
    const p = findPokemon("喷火龙");
    assert.equal(p.id, 6);
  });

  await t.test("finds by Japanese name", () => {
    const p = findPokemon("リザードン");
    assert.equal(p.id, 6);
  });

  await t.test("returns null for unknown queries", () => {
    assert.equal(findPokemon("not-a-pokemon"), null);
    assert.equal(findPokemon(""), null);
    assert.equal(findPokemon(null), null);
    assert.equal(findPokemon("a".repeat(101)), null);
  });
});

test("Partial and ambiguous queries (searchPokemon)", async (t) => {
  await t.test("returns candidates instead of guessing when a partial query matches several Pokémon", () => {
    for (const query of ["a", "火", "char"]) {
      const { match, candidates, total } = searchPokemon(query);
      assert.equal(match, null, `"${query}" must not resolve to a single Pokémon`);
      assert.ok(candidates.length > 1, `"${query}" should list candidates`);
      assert.ok(total >= candidates.length);
      assert.equal(findPokemon(query), null);
    }
    const slugs = searchPokemon("char").candidates.map((p) => p.slug);
    assert.ok(["charmander", "charmeleon", "charizard"].every((s) => slugs.includes(s)), slugs.join(","));
  });

  await t.test("caps the candidate list but reports the full count", () => {
    const { candidates, total } = searchPokemon("a");
    assert.ok(candidates.length <= 10);
    assert.ok(total > candidates.length);
  });

  await t.test("still resolves a partial query that matches exactly one Pokémon", () => {
    assert.equal(findPokemon("pikach").slug, "pikachu");
    assert.equal(findPokemon("ピカチュ").slug, "pikachu");
  });

  await t.test("resolves every name of every entry back to that entry", () => {
    for (const p of loadPokedex()) {
      for (const field of ["slug", "en", "zh_tw", "zh_cn", "ja"]) {
        assert.equal(findPokemon(p[field])?.slug, p.slug, `${field} "${p[field]}"`);
      }
    }
  });

  await t.test("prefers an exact name over longer names that contain it", () => {
    assert.equal(findPokemon("mew").slug, "mew");
    assert.equal(findPokemon("porygon").slug, "porygon");
  });

  await t.test("ignores punctuation, accents, width and gender-sign spelling differences", () => {
    for (const query of ["farfetch'd", "Farfetch’d", "farfetchd", "FARFETCH D"]) {
      assert.equal(findPokemon(query)?.id, 83, query);
    }
    assert.equal(findPokemon("Mr. Mime").id, 122);
    assert.equal(findPokemon("type: null").id, 772);
    assert.equal(findPokemon("Flabebe").id, 669);
    assert.equal(findPokemon("Ｐｉｋａｃｈｕ").id, 25);
    assert.equal(findPokemon("nidoran♀").id, 29);
    assert.equal(findPokemon("nidoran♂").id, 32);
  });

  await t.test("keeps Japanese voiced marks significant", () => {
    // ド and ト must not be folded together: リザードン is Charizard, not a typo-tolerant guess.
    assert.equal(findPokemon("リザードン").id, 6);
    assert.equal(findPokemon("リサートン"), null);
  });
});

test("Alternate forms", async (t) => {
  await t.test("finds a form by any of its names", () => {
    for (const query of ["wash rotom", "Rotom Wash", "rotom-wash", "清洗洛托姆", "ウォッシュロトム"]) {
      const p = findPokemon(query);
      assert.equal(p?.slug, "rotom-wash", query);
      assert.deepEqual(p.types, ["electric", "water"]);
    }
    assert.deepEqual(findPokemon("Alolan Ninetales").types, ["ice", "fairy"]);
  });

  await t.test("computes a form's matchups from its own types", () => {
    assert.deepEqual(findPokemon("rotom").weaknesses["0x"], ["normal", "fighting"]);
    assert.equal(findPokemon("wash rotom").weaknesses["0x"], undefined);
  });

  await t.test("returns the default form for a National Dex ID", () => {
    assert.equal(findPokemon(479).slug, "rotom");
    assert.equal(findPokemon("#006").slug, "charizard");
  });

  await t.test("resolves a partial name that only fits one species to its default form", () => {
    assert.equal(findPokemon("roto").slug, "rotom");
    assert.equal(findPokemon("charizar").slug, "charizard");
  });

  await t.test("keeps forms of one species ambiguous among themselves", () => {
    const { match, candidates } = searchPokemon("mega charizard");
    assert.equal(match, null);
    assert.deepEqual(candidates.map((p) => p.slug).sort(), ["charizard-mega-x", "charizard-mega-y"]);
  });

  await t.test("lists the forms on the default entry", () => {
    assert.deepEqual(findPokemon("rotom").forms, ["rotom-heat", "rotom-wash", "rotom-frost", "rotom-fan", "rotom-mow"]);
    assert.equal(findPokemon("bulbasaur").forms, undefined);
  });
});

test("Type Chart & Battle Matchups Engine", async (t) => {
  await t.test("computes defensive weaknesses and immunities correctly", () => {
    // Charizard (Fire / Flying): 4x rock, 2x water & electric, 0x ground
    const charizardWeak = calculateWeaknesses(["fire", "flying"]);
    assert.deepEqual(charizardWeak["4x"], ["rock"]);
    assert.ok(charizardWeak["2x"].includes("water"));
    assert.ok(charizardWeak["2x"].includes("electric"));
    assert.deepEqual(charizardWeak["0x"], ["ground"]);

    // Swampert (Water / Ground): 4x grass, 0x electric
    const swampertWeak = calculateWeaknesses(["water", "ground"]);
    assert.deepEqual(swampertWeak["4x"], ["grass"]);
    assert.deepEqual(swampertWeak["0x"], ["electric"]);

    // Steel / Fairy: Immune to poison and dragon
    const steelFairy = calculateWeaknesses(["steel", "fairy"]);
    assert.ok(steelFairy["0x"].includes("poison"));
    assert.ok(steelFairy["0x"].includes("dragon"));
  });

  await t.test("computes STAB offensive super-effective coverage", () => {
    // Fire / Flying hits Grass, Ice, Bug, Steel, Fighting super-effectively
    const coverage = calculateStabCoverage(["fire", "flying"]);
    assert.ok(coverage.includes("grass"));
    assert.ok(coverage.includes("ice"));
    assert.ok(coverage.includes("bug"));
    assert.ok(coverage.includes("steel"));
    assert.ok(coverage.includes("fighting"));
  });

  await t.test("handles malformed or string type inputs safely", () => {
    const fromStr = calculateWeaknesses("fire,flying");
    assert.deepEqual(fromStr["4x"], ["rock"]);
    assert.deepEqual(calculateWeaknesses(null), {});
    assert.deepEqual(calculateWeaknesses(123), {});
  });
});

test("Sprite URL Generation & Fallbacks (getSpriteUrl)", async (t) => {
  await t.test("generates standard and shiny official artwork URLs", () => {
    const normal = getSpriteUrl(6, "official", false);
    assert.ok(normal.endsWith("/official-artwork/6.png"));
    const shiny = getSpriteUrl(6, "official", true);
    assert.ok(shiny.endsWith("/official-artwork/shiny/6.png"));
  });

  await t.test("generates Gen 3 Emerald sprite with shiny support", () => {
    const g3Shiny = getSpriteUrl(6, "gen3", true);
    assert.ok(g3Shiny.includes("/emerald/shiny/6.png"));
  });

  await t.test("falls back to official artwork for Gen 3 requests above #386", () => {
    const g3Gen4 = getSpriteUrl(445, "gen3", false);
    assert.ok(g3Gen4.includes("/official-artwork/445.png"));
  });
});

test("Security Boundary Checks (downloadSprite)", async (t) => {
  const safeUrl = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png";

  await t.test("blocks disallowed non-image extensions", async () => {
    await assert.rejects(
      async () => downloadSprite(safeUrl, "test.sh"),
      /Disallowed file extension/
    );
    await assert.rejects(
      async () => downloadSprite(safeUrl, "test.svg"),
      /Disallowed file extension/
    );
  });

  await t.test("blocks path traversal outside working directory", async () => {
    await assert.rejects(
      async () => downloadSprite(safeUrl, "../../evil.png"),
      /Security error: Output path must be within/
    );
  });

  await t.test("blocks untrusted origins", async () => {
    await assert.rejects(
      async () => downloadSprite("https://attacker.example.com/sprite.png", "test.png"),
      /Untrusted sprite URL source/
    );
  });
});
