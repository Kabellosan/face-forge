import * as L from "../scripts/lib.mjs";

const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const has = (s, part, what) => { if (!String(s).includes(part)) throw new Error(`${what}: "${s}" lacks "${part}"`); };

// Characters: age + kin hint + profession + appearance.
eq(L.describeActor({ type: "character", kin: "Dwarf", profession: "Artisan", age: "old", appearance: "<p>Soot on her cheeks</p>" }),
  "an elderly dwarf: short, broad and heavily bearded who works as an artisan. Soot on her cheeks", "old dwarf");
eq(L.describeActor({ type: "character", profession: "Knight" }), "a knight", "profession only");
has(L.describeActor({ type: "character", kin: "Mallard", age: "adult" }), "duck-person", "mallard hint");
eq(L.describeActor({ type: "character", kin: "Human", age: "young" }), "a young human", "young human");
eq(L.describeActor({ type: "character" }), "", "empty character");
// Unknown kin passes through; NPCs use their description.
eq(L.describeActor({ type: "character", kin: "Goblin" }), "a goblin", "unknown kin");
eq(L.describeActor({ type: "npc", description: "<p>A ferrywoman&nbsp;with one eye</p>" }), "A ferrywoman with one eye", "npc description");
// Appearance on a character wins over description.
eq(L.describeActor({ type: "character", appearance: "tall", description: "ignored" }), "tall", "appearance first");

// Prompt: style guard, description, default style, transparency.
const p = L.buildPrompt({ description: "a wolfkin bard", style: "" });
has(p, "ONLY as a style guide", "style guard");
has(p, "a NEW character: a wolfkin bard.", "description");
has(p, "storybook illustration", "default style");
has(p, "transparent", "transparent");
has(L.buildPrompt({ description: "", style: "oil paint" }), "oil paint", "custom style");

// Request: one call, three candidates, transparent.
const r = L.imageRequest({ prompt: "x", refs: ["a", "b"], quality: "low" });
eq([r.num_images, r.background, r.quality, r.image_urls.length], [3, "transparent", "low", 2], "request body");

// Cost: output ×3 plus references once.
eq(L.estimateCost("medium", 0).toFixed(3), "0.102", "medium output only");
eq(L.estimateCost("medium", 8).toFixed(3), "0.294", "medium with 8 refs");

// References: capped, de-duplicated, deterministic with a fixed rand.
const refs = Array.from({ length: 20 }, (_, i) => `r${i}.webp`);
eq(L.pickRefs(refs, 8, () => 0).length, 8, "cap");
eq(L.pickRefs(["a", "a", "b"]).length, 2, "dedupe");
eq(L.IMAGE_EXT.test("x.WEBP") && !L.IMAGE_EXT.test("x.txt"), true, "image ext");

// Token layout stays inside the circle.
const lay = L.tokenLayout(512, 0.86);
eq(lay.portrait.x * 2 + lay.portrait.size, 512, "portrait centred");
if (lay.portrait.y + lay.portrait.size > 512) throw new Error("portrait spills below the token");

eq(L.slugify("Øyvind the Bold!"), "yvind-the-bold", "slug");
eq(L.slugify(""), "face", "empty slug");

// Gist links: page link, with or without user, API link, bare id; anything else is null.
const G = "aeee2777f3917151ed9d4580c4fdc578";
for (const link of [`https://gist.github.com/Kabellosan/${G}`, `https://gist.github.com/${G}`, `https://api.github.com/gists/${G}`, G, ` ${G}#file-x `])
  eq(L.gistId(link), G, `gist id from ${link}`);
eq(L.gistId("https://example.com/tables.json"), null, "not a gist");
const parsed = L.parseGistFiles([
  { filename: "vagnhild.webp", raw_url: "u1" }, { filename: "Ring.png", raw_url: "u2" },
  { filename: "face-forge.json", raw_url: "u3" }, { filename: "README.md", raw_url: "u4" }, { filename: "jory.png", raw_url: "u5" }
]);
eq([parsed.refs, parsed.ring, parsed.configUrl], [["u1", "u5"], "u2", "u3"], "gist files sorted");

console.log("lib tests pass");
