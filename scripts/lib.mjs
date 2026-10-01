// Pure logic for Face Forge: prompt building, actor description, token geometry.
// No Foundry globals, so the tests can run in plain Node.

export const MODEL = "fal-ai/gpt-image-1.5/edit";
export const CANDIDATES = 3;
export const MAX_REFS = 8;

// The art direction every portrait gets. Editable in settings; clear it to restore.
export const DEFAULT_STYLE =
  "Match the reference artist's hand exactly: a stylised storybook illustration, NOT realistic. " +
  "Bold, confident black ink contour lines of varying weight; simplified shapes; thin, slightly desaturated watercolour washes " +
  "with only a little shading; visible paper grain; a muted, faded palette of greys, olives, ochres and browns, like the references. " +
  "The face is a caricature with character, never pretty or glamorous: elongated or exaggerated proportions, a strong nose, heavy brows. " +
  "Head and shoulders, three-quarter view. Behind the head a pale cream and light ochre watercolour splash with rough dry-brush edges; " +
  "the bust fades into pale mist and breaks off in a ragged brush edge at the bottom.";

// What the image model needs to know about Dragonbane kin it has never heard of.
export const KIN_HINTS = {
  human: { noun: "human" },
  halfling: { noun: "halfling", hint: "Halflings are small, round-faced folk with slightly pointed ears." },
  dwarf: { noun: "dwarf", hint: "Dwarves are short, broad and stocky." },
  elf: { noun: "elf", hint: "Elves are tall and slender, with long pointed ears and ageless, angular features." },
  mallard: { noun: "mallard", hint: "Mallards are anthropomorphic duck-people: a duck's head, feathers and a broad bill." },
  wolfkin: { noun: "wolfkin", hint: "Wolfkin are wolf-headed humanoids covered in fur." }
};

const article = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");

const AGES = { young: "young", adult: "", old: "elderly" };

/*
 * Ability scores as looks. Dragonbane scores run 3–18; 9–11 is unremarkable and
 * adds nothing, so only what stands out reaches the prompt. Bands:
 * 3–5 very low, 6–8 low, 12–14 high, 15–18 very high.
 */
export const ATTRIBUTE_LOOKS = {
  str: ["a frail, bony frame", "a slight, narrow-shouldered build", "broad shoulders and strong arms", "a hulking, heavily muscled build and a thick neck"],
  con: ["a gaunt, sickly look with hollow cheeks", "a pale, slightly underfed look", "a hale, ruddy, healthy look", "a weathered, iron-hardy look"],
  agl: ["a stiff, awkward bearing", "a heavy, unhurried bearing", "a lean, wiry, alert bearing", "a poised, cat-like bearing"],
  int: ["a vacant, slow expression", "a simple, guileless face", "keen, thoughtful eyes", "piercing, calculating eyes"],
  wil: ["an anxious, easily cowed look", "a hesitant, uncertain gaze", "a steady, determined gaze", "an iron, unyielding stare"],
  cha: ["homely, unfortunate features", "plain, unremarkable features", "pleasant, likeable looks", "striking, magnetic looks"]
};

export function attributeBand(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || (n >= 9 && n <= 11)) return null;
  if (n <= 5) return 0;
  if (n <= 8) return 1;
  if (n <= 14) return 2;
  return 3;
}

export function attributeLooks(attrs = {}) {
  return Object.entries(ATTRIBUTE_LOOKS)
    .map(([k, looks]) => { const b = attributeBand(attrs?.[k]); return b === null ? null : looks[b]; })
    .filter(Boolean);
}

/** The dropdowns on the form. "" always means "let the painter decide". */
export const LOOK_OPTIONS = {
  gender: { label: "Gender", options: ["", "man", "woman"] },
  age: { label: "Age", options: ["", "young", "adult", "old"] },
  hairColour: { label: "Hair / fur colour", options: ["", "black", "dark brown", "brown", "auburn", "copper-red", "ginger", "blond", "straw-blond", "grey", "white", "silver"] },
  hairStyle: { label: "Hair", options: ["", "cropped short", "shaggy", "long and loose", "braided", "tied back", "a topknot", "a shaved head", "bald"] },
  facialHair: { label: "Facial hair", options: ["", "clean-shaven", "stubble", "a short beard", "a long beard", "a braided beard", "a moustache", "mutton-chop whiskers"] },
  expression: { label: "Expression", options: ["", "stern", "grinning", "wary", "weary", "smug", "fierce", "cheerful", "brooding", "kindly"] }
};

export function stripHTML(s) {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function slugify(s) {
  return String(s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "face";
}

function kinInfo(kin) {
  const k = String(kin ?? "").trim();
  if (!k) return { noun: "" };
  const hit = Object.entries(KIN_HINTS).find(([key]) => k.toLowerCase().includes(key));
  return hit ? hit[1] : { noun: k.toLowerCase() };
}

function hairPhrase(colour, style) {
  if (style === "bald") return "bald";
  if (style === "a shaved head") return colour ? `a shaved head with ${colour} stubble` : "a shaved head";
  if (style === "a topknot") return `${colour ? `${colour} hair` : "hair"} in a topknot`;
  if (!colour && !style) return "";
  return `${style ? `${style} ` : ""}${colour ? `${colour} ` : ""}hair`.replace(/^cropped short (.*)hair$/, "short-cropped $1hair");
}

const capital = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const listJoin = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** The sheet's starting look for the dropdowns. */
export function lookDefaults(a = {}) {
  const age = String(a.age ?? "").toLowerCase();
  return { gender: "", age: LOOK_OPTIONS.age.options.includes(age) ? age : "", hairColour: "", hairStyle: "", facialHair: "", expression: "", features: "" };
}

/**
 * The description sent to the painter, from a plain actor summary
 * { type, kin, profession, age, attributes, armor, helmet, weapons, appearance, description }
 * and the form's look { gender, age, hairColour, hairStyle, facialHair, expression, features }.
 * Characters are built from their sheet; NPCs and monsters start from their description.
 */
export function describeActor(a = {}, look = {}) {
  const sentences = [];
  const kin = kinInfo(a.kin);
  const ageKey = String(look.age || a.age || "").toLowerCase();
  const age = AGES[ageKey] ?? ageKey;
  const who = [age, kin.noun, look.gender].filter(Boolean).join(" ");
  const job = String(a.profession ?? "").trim().toLowerCase();
  let subject = who ? `${article(who)} ${who}` : (look.gender ? `a ${look.gender}` : "");
  if (job) subject += `${subject ? " who works as " : ""}${article(job)} ${job}`;

  const withs = [hairPhrase(look.hairColour, look.hairStyle), look.facialHair].filter(Boolean);
  const hair = withs[0] === "bald" ? ["bald", ...withs.slice(1).map((w) => `with ${w}`)].join(" ")
    : withs.length ? `with ${listJoin(withs)}` : "";
  if (subject || hair) sentences.push([subject, hair].filter(Boolean).join(", "));
  if (kin.hint) sentences.push(kin.hint);

  const traits = attributeLooks(a.attributes);
  if (traits.length) sentences.push(capital(traits.join("; ")));

  const gear = [];
  if (a.armor) gear.push(`wearing ${String(a.armor).toLowerCase()}`);
  if (a.helmet) gear.push(`${gear.length ? "and " : "wearing "}${article(a.helmet)} ${String(a.helmet).toLowerCase()}`);
  const weapons = (a.weapons ?? []).filter(Boolean).slice(0, 2).map((w) => String(w).toLowerCase());
  if (weapons.length) gear.push(`carrying ${listJoin(weapons.map((w) => `${article(w)} ${w}`))}`);
  if (gear.length) sentences.push(`${gear.join(" ").replace(/^w/, "W").replace(/^c/, "C").replace(/ carrying/, ", carrying")}`);

  if (look.expression) sentences.push(`Expression: ${look.expression}`);
  const extra = String(look.features ?? "").trim();
  if (extra) sentences.push(capital(extra));
  const notes = stripHTML(a.appearance || (a.type === "character" ? "" : a.description));
  if (notes) sentences.push(notes.slice(0, 400));

  return sentences.map((x) => x.trim().replace(/[.\s]+$/, "")).filter(Boolean).join(". ");
}

/** The full prompt sent with the style references. */
export function buildPrompt({ description, style }) {
  return [
    "Use the reference images ONLY as a style guide. Do not copy their faces, hair, clothes or characters.",
    `Paint a NEW character: ${String(description ?? "").trim() || "a weathered traveller"}.`,
    (style ?? "").trim() || DEFAULT_STYLE,
    "Everything outside the splash is transparent. One character only, no text, no frame, no border."
  ].join(" ");
}

/** Request body for the fal.ai edit endpoint. */
export function imageRequest({ prompt, refs, quality = "medium" }) {
  return {
    prompt,
    image_urls: refs,
    background: "transparent",
    image_size: "1024x1024",
    quality,
    input_fidelity: "high",
    num_images: CANDIDATES,
    output_format: "png",
    sync_mode: true
  };
}

/**
 * Rough cost of one set of candidates, in dollars: fal's per-image output price
 * plus the style references billed as input (high fidelity, about 3k tokens each at $0.008/1k).
 * All candidates come from one request, so the references are paid for once.
 */
export function estimateCost(quality, refCount = MAX_REFS) {
  const perImage = { low: 0.009, medium: 0.034, high: 0.133 }[quality] ?? 0.034;
  return perImage * CANDIDATES + refCount * 0.024;
}

/** Pick at most `max` references; if there are more, a random selection each time. */
export function pickRefs(paths, max = MAX_REFS, rand = Math.random) {
  const list = [...new Set(paths)];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, max).sort();
}

export const IMAGE_EXT = /\.(webp|png|jpe?g)$/i;
export const RING_NAME = /^ring\.(webp|png)$/i;
export const CONFIG_NAME = "face-forge.json";

/** The gist id from a gist page link, an API link, or a bare id. */
export function gistId(link) {
  const m = String(link ?? "").trim().match(/(?:gist\.github\.com\/(?:[^/]+\/)?|api\.github\.com\/gists\/|^)([0-9a-f]{20,40})(?:[/?#.]|$)/i);
  return m ? m[1] : null;
}

/** Sort a gist's files: style references, the ring (ring.png/webp), the config file. */
export function parseGistFiles(files) {
  const out = { refs: [], ring: null, configUrl: null, config: {} };
  for (const f of files ?? []) {
    const name = f?.filename ?? "";
    if (name.toLowerCase() === CONFIG_NAME) out.configUrl = f.raw_url;
    else if (RING_NAME.test(name)) out.ring = f.raw_url;
    else if (IMAGE_EXT.test(name)) out.refs.push(f.raw_url);
  }
  return out;
}

/**
 * Where things go on the round ring token (size S): a warm glow behind the head,
 * the portrait scaled down so the ring doesn't cut the head, and a white fade to the edge.
 */
export function tokenLayout(S, scale = 0.86, ringed = false) {
  const size = Math.round(S * scale);
  // With a ring on top, the painted circle stops under the ring's solid band
  // (44–46% of the width on the Dragonbane chain), so nothing shows past it.
  const clip = S * (ringed ? 0.45 : 0.5);
  return {
    clip,
    portrait: { x: Math.round((S - size) / 2), y: Math.round(S * 0.07), size },
    glow: { x: S / 2, y: S * 0.42, r: S * 0.42, color: [226, 205, 150] },
    fade: { inner: clip * 0.72, outer: clip }
  };
}
