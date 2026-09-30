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
  human: "a human",
  halfling: "a halfling: small, round-faced folk with slightly pointed ears",
  dwarf: "a dwarf: short, broad and heavily bearded",
  elf: "an elf: tall and slender with long pointed ears and ageless, angular features",
  mallard: "a mallard: an anthropomorphic duck-person with a duck's head, feathers and a broad bill",
  wolfkin: "a wolfkin: a wolf-headed humanoid covered in fur"
};

const article = (w) => (/^[aeiou]/i.test(w) ? "an" : "a");

const AGES = { young: "young", adult: "", old: "elderly" };

export function stripHTML(s) {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function slugify(s) {
  return String(s ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "face";
}

function kinPhrase(kin) {
  const k = String(kin ?? "").trim();
  if (!k) return "";
  const hint = Object.entries(KIN_HINTS).find(([key]) => k.toLowerCase().includes(key));
  return hint ? hint[1] : k.toLowerCase();
}

/**
 * A starting description from a plain actor summary:
 * { type, kin, profession, age, appearance, description }.
 * Characters read kin/profession/age/appearance; NPCs and monsters their description.
 */
export function describeActor(a = {}) {
  const parts = [];
  const age = AGES[String(a.age ?? "").toLowerCase()] ?? String(a.age ?? "").toLowerCase();
  const kin = kinPhrase(a.kin);
  const who = [age, kin.replace(/^(a|an) /, "")].filter(Boolean).join(" ");
  if (who) parts.push(`${article(who)} ${who}`);
  const job = String(a.profession ?? "").trim().toLowerCase();
  if (job) parts.push(`${parts.length ? "who works as " : ""}${article(job)} ${job}`);
  const looks = stripHTML(a.appearance || (a.type === "character" ? "" : a.description));
  let text = parts.join(" ");
  if (looks) text += (text ? ". " : "") + looks.slice(0, 400);
  return text.trim();
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
export function tokenLayout(S, scale = 0.86) {
  const size = Math.round(S * scale);
  return {
    portrait: { x: Math.round((S - size) / 2), y: Math.round(S * 0.07), size },
    glow: { x: S / 2, y: S * 0.42, r: S * 0.42, color: [226, 205, 150] },
    fade: { inner: S * 0.36, outer: S * 0.5 }
  };
}
