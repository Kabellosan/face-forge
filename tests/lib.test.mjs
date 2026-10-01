import * as L from "../scripts/lib.mjs";

const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const has = (s, part, what) => { if (!String(s).includes(part)) throw new Error(`${what}: "${s}" lacks "${part}"`); };

// Characters: age + kin + profession, kin hint, appearance.
eq(L.describeActor({ type: "character", kin: "Dwarf", profession: "Artisan", age: "old", appearance: "<p>Soot on her cheeks</p>" }),
  "an elderly dwarf who works as an artisan. Dwarves are short, broad and stocky. Soot on her cheeks", "old dwarf");
eq(L.describeActor({ type: "character", profession: "Knight" }), "a knight", "profession only");
has(L.describeActor({ type: "character", kin: "Mallard", age: "adult" }), "duck-people", "mallard hint");
eq(L.describeActor({ type: "character", kin: "Human", age: "young" }), "a young human", "young human");
eq(L.describeActor({ type: "character" }), "", "empty character");
eq(L.describeActor({ type: "character", kin: "Goblin" }), "a goblin", "unknown kin");
eq(L.describeActor({ type: "npc", description: "<p>A ferrywoman&nbsp;with one eye</p>" }), "A ferrywoman with one eye", "npc description");
eq(L.describeActor({ type: "character", appearance: "tall", description: "ignored" }), "tall", "appearance first");

// Ability scores: 9–11 add nothing; the rest become looks.
eq([3, 5, 6, 8, 9, 11, 12, 14, 15, 18, undefined].map(L.attributeBand), [0, 0, 1, 1, null, null, 2, 2, 3, 3, null], "bands");
const teg = { type: "character", kin: "Human", profession: "Hunter", age: "adult",
  attributes: { str: 7, con: 11, agl: 14, int: 9, wil: 14, cha: 12 }, armor: "Leather Armor", weapons: ["Longbow", "Knife"] };
eq(L.describeActor(teg, L.lookDefaults(teg)),
  "a human who works as a hunter. A slight, narrow-shouldered build; a lean, wiry, alert bearing; a steady, determined gaze; pleasant, likeable looks. Wearing leather armor, carrying a longbow and a knife", "Teg from the sheet");
// The form's choices: gender, hair, beard, expression, features; age overrides the sheet.
const tegLook = { gender: "man", age: "young", hairColour: "copper-red", hairStyle: "shaggy", facialHair: "stubble", expression: "wary", features: "a scar across the nose" };
eq(L.describeActor(teg, tegLook),
  "a young human man who works as a hunter, with shaggy copper-red hair and stubble. A slight, narrow-shouldered build; a lean, wiry, alert bearing; a steady, determined gaze; pleasant, likeable looks. Wearing leather armor, carrying a longbow and a knife. Expression: wary. A scar across the nose", "Teg with choices");
has(L.describeActor({ kin: "Dwarf" }, { gender: "woman", hairStyle: "bald", facialHair: "a braided beard" }), "dwarf woman, bald with a braided beard", "bald + beard");
has(L.describeActor({}, { hairColour: "grey", hairStyle: "a shaved head" }), "a shaved head with grey stubble", "shaved head");
has(L.describeActor({}, { hairStyle: "cropped short", hairColour: "black" }), "short-cropped black hair", "cropped");
has(L.describeActor({ helmet: "Open Helmet" }), "Wearing an open helmet", "helmet alone");
has(L.describeActor({ armor: "Chainmail", helmet: "Great Helm" }), "Wearing chainmail and a great helm", "armour + helmet");
eq(L.lookDefaults({ age: "old" }).age, "old", "age from sheet");
eq(L.lookDefaults({ age: "ancient" }).age, "", "unknown age ignored");
for (const [k, d] of Object.entries(L.LOOK_OPTIONS)) if (d.options[0] !== "") throw new Error(`${k}: first option must be Any`);

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

eq([L.tokenLayout(512).clip, L.tokenLayout(512, 0.86, true).clip], [256, 230.4], "clip under the ring");
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
