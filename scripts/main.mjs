import * as L from "./lib.mjs";

const MOD = "face-forge";
const SOCKET = `module.${MOD}`;
const log = (...a) => console.log("Face Forge |", ...a);
const ApplicationV2 = foundry.applications.api.ApplicationV2;

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

Hooks.once("init", () => {
  game.settings.register(MOD, "falKey", {
    name: "fal.ai API key",
    hint: "Leave empty to use Terrain Forge's key. Only the GM's browser calls fal.ai: players' requests are relayed to a logged-in GM. Players could still read a key saved here from the browser console.",
    scope: "world", config: true, restricted: true, type: String, default: ""
  });
  game.settings.register(MOD, "endpoint", {
    name: "Image endpoint",
    hint: "Leave as https://fal.run. Point it at your own proxy if you'd rather the key never sits in a browser.",
    scope: "world", config: true, restricted: true, type: String, default: "https://fal.run"
  });
  game.settings.register(MOD, "privateStyle", {
    name: "Private style link",
    hint: "A secret GitHub gist (paste the gist page link) holding your style reference portraits, and optionally a ring image and face-forge.json. Keeps campaign art out of the public module. Players could read this link from the browser console.",
    scope: "world", config: true, restricted: true, type: String, default: ""
  });
  game.settings.register(MOD, "styleFolder", {
    name: "Style reference folder",
    hint: "Or a folder in your world with portraits in the look you want (transparent busts work best). Used with the private link too. Up to 8 references go with every request; with more, 8 are picked at random.",
    scope: "world", config: true, restricted: true, type: String, default: "", filePicker: "folder"
  });
  game.settings.register(MOD, "style", {
    name: "Art direction",
    hint: "Added to every prompt. Leave empty to use the one from your private style link, or the built-in one.",
    scope: "world", config: true, restricted: true, type: String, default: ""
  });
  game.settings.register(MOD, "quality", {
    name: "Image quality",
    hint: "Medium is the sweet spot. High costs roughly three times as much.",
    scope: "world", config: true, restricted: true, type: String,
    choices: { low: "Low (cheapest, rough)", medium: "Medium", high: "High" }, default: "medium"
  });
  game.settings.register(MOD, "ringOverlay", {
    name: "Token ring image",
    hint: "Optional: a round frame with a transparent middle, drawn on top of every generated token. Overrides a ring from the private style link.",
    scope: "world", config: true, restricted: true, type: String, default: "", filePicker: "image"
  });
  game.settings.register(MOD, "dynamicRing", {
    name: "Turn on Foundry's dynamic token ring",
    hint: "Uses the ring your system or modules provide. Leave off if you use a token ring image above.",
    scope: "world", config: true, restricted: true, type: Boolean, default: false
  });
  game.settings.register(MOD, "tokenScale", {
    name: "Portrait size inside the token",
    hint: "How much of the round token the portrait fills. Lower it if the ring cuts off heads.",
    scope: "world", config: true, restricted: true, type: Number, range: { min: 0.6, max: 1, step: 0.02 }, default: 0.86
  });
  game.settings.register(MOD, "playersCanForge", {
    name: "Players can forge their own portraits",
    hint: "Players' requests run through a logged-in GM's browser, using the GM's key.",
    scope: "world", config: true, restricted: true, type: Boolean, default: true
  });
});

Hooks.once("ready", () => {
  game.modules.get(MOD).api = { open: (actor) => FaceForgeApp.open(actor), forge: requestForge };
  game.socket?.on(SOCKET, onSocket);
  log("ready — open with game.modules.get('face-forge').api.open(actor)");
});

/* ------------------------------------------------------------------ */
/*  Entry points                                                       */
/* ------------------------------------------------------------------ */

function canForge(actor) {
  if (game.user.isGM) return true;
  return game.settings.get(MOD, "playersCanForge") && (!actor || actor.isOwner);
}

// Actor sheet header: ApplicationV2 sheets (v13+) and the older Application sheets.
Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  if (!canForge(app.document)) return;
  controls.push({ icon: "fa-solid fa-masks-theater", label: "Face Forge", action: "faceForge", onClick: () => FaceForgeApp.open(app.document) });
});
Hooks.on("getActorSheetHeaderButtons", (app, buttons) => {
  if (!canForge(app.actor)) return;
  buttons.unshift({ label: "Face Forge", class: "face-forge-open", icon: "fa-solid fa-masks-theater", onclick: () => FaceForgeApp.open(app.actor) });
});

// Actors sidebar: a button for new NPCs, GM only.
Hooks.on("renderActorDirectory", (app, html) => {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector(".ff-open")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ff-open";
  btn.innerHTML = `<i class="fa-solid fa-masks-theater"></i> Face Forge`;
  btn.addEventListener("click", () => FaceForgeApp.open());
  (root.querySelector(".header-actions") ?? root.querySelector(".directory-header") ?? root).append(btn);
});

// Right-click an actor → Face Forge.
function actorFromLi(li) {
  const el = li instanceof HTMLElement ? li : li?.[0];
  const id = el?.dataset?.entryId ?? el?.dataset?.documentId;
  return id ? game.actors.get(id) : null;
}
const contextOption = {
  name: "Face Forge", label: "Face Forge",
  icon: '<i class="fa-solid fa-masks-theater"></i>',
  condition: (li) => { const a = actorFromLi(li); return !!a && canForge(a); },
  callback: (li) => { const a = actorFromLi(li); if (a) FaceForgeApp.open(a); }
};
Hooks.on("getActorContextOptions", (app, options) => options.push(contextOption));          // v13+
Hooks.on("getActorDirectoryEntryContext", (html, options) => options.push(contextOption)); // v12

function isActiveGM() {
  const active = game.users?.activeGM;
  return active ? active.id === game.user.id : !!game.user?.isGM;
}

function reportError(what, err) {
  console.error("Face Forge |", what, err);
  ui.notifications?.error(`Face Forge: ${what}. ${err?.message ?? err}`);
}

/* ------------------------------------------------------------------ */
/*  Describing an actor                                                */
/* ------------------------------------------------------------------ */

function actorSummary(actor) {
  if (!actor) return {};
  const s = actor.system ?? {};
  const item = (type) => actor.items?.find?.((i) => i.type === type)?.name;
  return {
    type: actor.type,
    kin: item("kin") || s.kin,
    profession: item("profession") || s.profession,
    age: s.age,
    appearance: s.appearance,
    description: s.description || s.traits
  };
}

/* ------------------------------------------------------------------ */
/*  Generation (runs in a GM's browser)                                */
/* ------------------------------------------------------------------ */

function filePicker() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

function falKey() {
  const own = game.settings.get(MOD, "falKey").trim();
  if (own) return own;
  try { return (game.settings.get("terrain-forge", "falKey") ?? "").trim(); } catch { return ""; }
}

async function ensureDir(path) {
  const parts = path.split("/");
  for (let i = 1; i <= parts.length; i++) {
    try { await filePicker().createDirectory("data", parts.slice(0, i).join("/")); } catch { /* already exists */ }
  }
}

function blobToDataURI(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** A blob typed by its file name: gists serve everything as text/plain. */
function typed(blob, name) {
  const ext = String(name).split(/[?#]/)[0].split(".").pop().toLowerCase();
  const type = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" }[ext];
  return type ? new Blob([blob], { type }) : blob;
}

async function fetchBlob(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`could not load ${url} (${r.status})`);
  return typed(await r.blob(), url);
}

/**
 * The private style gist: { refs: [raw urls], ring: raw url|null, config: {} }.
 * Cached for 10 minutes; GitHub allows 60 unauthenticated API calls an hour.
 */
let gistCache = null;
async function privateStyle() {
  const link = game.settings.get(MOD, "privateStyle").trim();
  if (!link) return { refs: [], ring: null, config: {} };
  if (gistCache?.link === link && Date.now() - gistCache.at < 10 * 60 * 1000) return gistCache.value;
  const id = L.gistId(link);
  if (!id) throw new Error("The private style link isn't a gist link.");
  const res = await fetch(`https://api.github.com/gists/${id}`, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`could not read the private style gist (${res.status})`);
  const value = L.parseGistFiles(Object.values((await res.json())?.files ?? {}));
  if (value.configUrl) {
    try { value.config = await (await fetch(value.configUrl)).json(); }
    catch (err) { reportError("face-forge.json in the private style gist is not valid JSON", err); }
  }
  gistCache = { link, at: Date.now(), value };
  return value;
}

/** The style references as data URIs, so fal.ai never needs to reach this server. */
async function loadRefs() {
  const urls = [...(await privateStyle()).refs];
  const folder = game.settings.get(MOD, "styleFolder").trim();
  if (folder) {
    const res = await filePicker().browse("data", folder);
    urls.push(...(res?.files ?? []).filter((f) => L.IMAGE_EXT.test(f)));
  }
  if (!urls.length) throw new Error("No style references. Set a private style link or a style reference folder in Configure Settings → Face Forge.");
  return Promise.all(L.pickRefs(urls).map(async (u) => blobToDataURI(await fetchBlob(u))));
}

async function artDirection() {
  return game.settings.get(MOD, "style").trim() || (await privateStyle()).config?.style || L.DEFAULT_STYLE;
}

async function ringImage() {
  const own = game.settings.get(MOD, "ringOverlay").trim();
  return own || (await privateStyle()).ring;
}

async function callFal(prompt) {
  const key = falKey();
  if (!key) throw new Error("No fal.ai API key. Add one in Configure Settings → Face Forge (or Terrain Forge).");
  const endpoint = game.settings.get(MOD, "endpoint").replace(/\/+$/, "");
  const body = L.imageRequest({ prompt, refs: await loadRefs(), quality: game.settings.get(MOD, "quality") });
  const res = await fetch(`${endpoint}/${L.MODEL}`, {
    method: "POST",
    headers: { "Authorization": `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    if (res.status === 401 || res.status === 403) throw new Error(`fal.ai rejected the key (${res.status}).`);
    throw new Error(`fal.ai error ${res.status}: ${text}`);
  }
  const images = (await res.json())?.images ?? [];
  if (!images.length) throw new Error("fal.ai returned no images. Try rewording the description.");
  return Promise.all(images.map(async (img) => (await fetch(img.url)).blob()));
}

function canvasBlob(canvas, type = "image/webp", q = 0.9) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not encode the image"))), type, q));
}

/** Re-encode the transparent portrait as a smaller webp. */
async function portraitWebp(blob, size = 768) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  c.getContext("2d").drawImage(bmp, 0, 0, size, size);
  bmp.close?.();
  return canvasBlob(c);
}

/** The round token: warm glow, portrait, white fade to the edge, optional ring on top. */
async function tokenWebp(blob, S = 512) {
  const lay = L.tokenLayout(S, game.settings.get(MOD, "tokenScale"));
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  ctx.save();
  ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, S, S);
  const [r, g, b] = lay.glow.color;
  const glow = ctx.createRadialGradient(lay.glow.x, lay.glow.y, 0, lay.glow.x, lay.glow.y, lay.glow.r);
  glow.addColorStop(0, `rgba(${r},${g},${b},1)`); glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = glow; ctx.fillRect(0, 0, S, S);
  const bmp = await createImageBitmap(blob);
  ctx.drawImage(bmp, lay.portrait.x, lay.portrait.y, lay.portrait.size, lay.portrait.size);
  bmp.close?.();
  const fade = ctx.createRadialGradient(S / 2, S / 2, lay.fade.inner, S / 2, S / 2, lay.fade.outer);
  fade.addColorStop(0, "rgba(255,255,255,0)"); fade.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = fade; ctx.fillRect(0, 0, S, S);
  ctx.restore();
  const ring = await ringImage();
  if (ring) {
    const rb = await createImageBitmap(await fetchBlob(ring));
    ctx.drawImage(rb, 0, 0, S, S);
    rb.close?.();
  }
  return canvasBlob(c);
}

async function upload(dir, name, blob) {
  const file = new File([blob], name, { type: blob.type || "image/webp" });
  const up = await filePicker().upload("data", dir, file, {}, { notify: false });
  return up?.path ?? `${dir}/${name}`;
}

/** Generate, build tokens, upload: [{ portrait, token }]. GM only. */
async function forgeHere({ description, name }) {
  const prompt = L.buildPrompt({ description, style: await artDirection() });
  const blobs = await callFal(prompt);
  const dir = `worlds/${game.world.id}/face-forge`;
  await ensureDir(dir);
  const stem = `${L.slugify(name)}-${Date.now()}`;
  return Promise.all(blobs.map(async (b, i) => ({
    portrait: await upload(dir, `${stem}-${i + 1}.webp`, await portraitWebp(b)),
    token: await upload(dir, `${stem}-${i + 1}-token.webp`, await tokenWebp(b))
  })));
}

/* ------------------------------------------------------------------ */
/*  Player → GM relay                                                  */
/* ------------------------------------------------------------------ */

const pending = new Map();   // requestId → { resolve, reject, timer }  (player side)
const busyUsers = new Set(); // one request per player at a time          (GM side)

function requestForge({ description, name }) {
  if (game.user.isGM) return forgeHere({ description, name });
  if (!game.users.activeGM) return Promise.reject(new Error("A GM has to be logged in to forge portraits."));
  const id = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("The GM's browser didn't answer in time.")); }, 6 * 60 * 1000);
    pending.set(id, { resolve, reject, timer });
    game.socket.emit(SOCKET, { type: "forge", id, from: game.user.id, description, name });
  });
}

async function onSocket(msg) {
  if (msg?.type === "forge" && isActiveGM()) {
    const reply = (extra) => game.socket.emit(SOCKET, { id: msg.id, to: msg.from, ...extra });
    if (!game.settings.get(MOD, "playersCanForge")) return reply({ type: "error", message: "The GM has turned off player forging." });
    if (busyUsers.has(msg.from)) return reply({ type: "error", message: "You already have a portrait forging. Wait for it to finish." });
    busyUsers.add(msg.from);
    log(`forging for ${game.users.get(msg.from)?.name}: ${msg.description}`);
    try { reply({ type: "result", candidates: await forgeHere(msg) }); }
    catch (err) { console.error("Face Forge |", err); reply({ type: "error", message: err?.message ?? String(err) }); }
    finally { busyUsers.delete(msg.from); }
    return;
  }
  if (msg?.to !== game.user.id) return;
  const p = pending.get(msg.id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(msg.id);
  if (msg.type === "result") p.resolve(msg.candidates);
  else p.reject(new Error(msg.message));
}

/* ------------------------------------------------------------------ */
/*  Applying the choice                                                */
/* ------------------------------------------------------------------ */

function tokenData(token) {
  const data = { "texture.src": token };
  if (game.settings.get(MOD, "dynamicRing")) Object.assign(data, { "ring.enabled": true, "ring.subject.texture": token });
  return data;
}

async function applyToActor(actor, { portrait, token }) {
  const proto = Object.fromEntries(Object.entries(tokenData(token)).map(([k, v]) => [`prototypeToken.${k}`, v]));
  await actor.update({ img: portrait, ...proto });
  // Linked tokens already on scenes show the new face too.
  for (const scene of game.scenes ?? []) {
    const updates = scene.tokens.filter((t) => t.actorId === actor.id && t.actorLink && t.isOwner)
      .map((t) => ({ _id: t.id, ...tokenData(token) }));
    if (updates.length) await scene.updateEmbeddedDocuments("Token", updates).catch((e) => log("token update skipped", e));
  }
}

async function createNPC(name, { portrait, token }) {
  const type = game.system?.id === "dragonbane" ? "npc" : Object.keys(CONFIG.Actor?.dataModels ?? {})[0] ?? "npc";
  const proto = Object.fromEntries(Object.entries(tokenData(token)).map(([k, v]) => [`prototypeToken.${k}`, v]));
  return Actor.create(foundry.utils.expandObject({ name: name || "Nameless", type, img: portrait, ...proto }));
}

/* ------------------------------------------------------------------ */
/*  Dialog                                                             */
/* ------------------------------------------------------------------ */

class FaceForgeApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "face-forge",
    tag: "div",
    classes: ["face-forge"],
    window: { title: "Face Forge", icon: "fa-solid fa-masks-theater", resizable: true },
    position: { width: 640, height: "auto" },
    actions: {
      forge: FaceForgeApp.onForge,
      pick: FaceForgeApp.onPick,
      use: FaceForgeApp.onUse,
      reset: FaceForgeApp.onReset
    }
  };

  static instance = null;

  static async open(actor = null) {
    if (!canForge(actor)) return ui.notifications.warn("Face Forge: you can only forge portraits for your own characters.");
    let app = FaceForgeApp.instance;
    if (!app || (app.ff.actorId ?? null) !== (actor?.id ?? null)) {
      await app?.close();
      app = FaceForgeApp.instance = new FaceForgeApp(actor);
    }
    return app.render({ force: true });
  }

  constructor(actor) {
    super();
    this.ff = {
      actorId: actor?.id ?? null,
      name: actor?.name ?? "",
      description: L.describeActor(actorSummary(actor)),
      candidates: [],
      chosen: null,
      busy: false,
      status: ""
    };
  }

  get actor() { return this.ff.actorId ? game.actors.get(this.ff.actorId) : null; }

  async _renderHTML() {
    const s = this.ff;
    const cost = L.estimateCost(game.settings.get(MOD, "quality"));
    const who = this.actor
      ? `<p class="ff-hint">For <strong>${L.escapeHTML(s.name)}</strong>. Describe how they look; the more specific, the better.</p>`
      : `<label>Name of the new NPC<input type="text" name="name" value="${L.escapeHTML(s.name)}" placeholder="Old Maud the ferrywoman"></label>`;
    const cards = s.candidates.map((c, i) => `
      <a class="ff-card ${s.chosen === i ? "is-chosen" : ""}" data-action="pick" data-index="${i}" title="Choose this one">
        <img src="${c.portrait}" alt="Candidate ${i + 1}">
        <img class="ff-token" src="${c.token}" alt="Token ${i + 1}">
      </a>`).join("");
    const slots = s.busy
      ? `<div class="ff-cards">${Array.from({ length: L.CANDIDATES }, () => `<div class="ff-card ff-wait"><i class="fa-solid fa-paintbrush fa-beat-fade"></i></div>`).join("")}</div>`
      : s.candidates.length ? `<div class="ff-cards">${cards}</div>` : "";
    const useLabel = this.actor ? "Use this face" : "Create NPC";
    return `
      ${who}
      <label>Appearance<textarea name="description" rows="3" placeholder="a young dwarf blacksmith with a braided copper beard and soot on her cheeks">${L.escapeHTML(s.description)}</textarea></label>
      ${slots}
      <footer class="ff-footer">
        <span class="ff-status">${L.escapeHTML(s.status) || (s.candidates.length ? "Pick one, or forge again." : `Makes ${L.CANDIDATES} options, about $${cost.toFixed(2)}.`)}</span>
        ${s.candidates.length && !s.busy ? `<a class="ff-link" data-action="reset"><i class="fa-solid fa-eraser"></i> Clear</a>` : ""}
        <button type="button" data-action="forge" ${s.busy ? "disabled" : ""}><i class="fa-solid fa-wand-magic-sparkles"></i> ${s.candidates.length ? "Forge again" : "Forge"}</button>
        ${s.chosen !== null && !s.busy ? `<button type="button" data-action="use"><i class="fa-solid fa-check"></i> ${useLabel}</button>` : ""}
      </footer>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    content.querySelectorAll("textarea, input").forEach((el) =>
      el.addEventListener("input", () => { this.ff[el.name] = el.value; }));
  }

  static async onForge() {
    const s = this.ff;
    if (!s.description.trim()) return ui.notifications.warn("Face Forge: describe the character first.");
    s.busy = true; s.chosen = null; s.status = game.user.isGM ? "Painting… (30–90 seconds)" : "Asking the GM's browser to paint… (30–90 seconds)";
    await this.render();
    try {
      s.candidates = await requestForge({ description: s.description, name: s.name || this.actor?.name || "npc" });
      s.status = "";
    } catch (err) {
      reportError("could not forge portraits", err);
      s.status = "Failed. See the error above.";
    } finally {
      s.busy = false;
      if (this.rendered) await this.render();
    }
  }

  static onPick(event, target) {
    this.ff.chosen = Number(target.dataset.index);
    this.render();
  }

  static onReset() {
    Object.assign(this.ff, { candidates: [], chosen: null, status: "" });
    this.render();
  }

  static async onUse() {
    const s = this.ff;
    const choice = s.candidates[s.chosen];
    if (!choice) return;
    try {
      if (this.actor) {
        await applyToActor(this.actor, choice);
        ui.notifications.info(`Face Forge: ${this.actor.name} has a new face.`);
      } else {
        const actor = await createNPC(s.name, choice);
        ui.notifications.info(`Face Forge: created ${actor.name}.`);
        actor.sheet?.render(true);
      }
      await this.close();
      FaceForgeApp.instance = null;
    } catch (err) {
      reportError("could not apply the portrait", err);
    }
  }
}
