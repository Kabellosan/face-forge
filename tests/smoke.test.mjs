// Minimal Foundry + browser mock: enough to open the dialog, forge as GM,
// relay a player's request over the socket, and apply the chosen face.
const hooks = {};
globalThis.Hooks = { once: (n, f) => (hooks[n] ??= []).push(f), on: (n, f) => (hooks[n] ??= []).push(f) };
const settings = {};
const errors = [];
globalThis.ui = { notifications: { info: () => {}, warn: (m) => errors.push(m), error: (m) => errors.push(m) } };
class ApplicationV2 {
  #s = 0;
  constructor(o = {}) { this.options = { ...this.constructor.DEFAULT_OPTIONS, ...o }; }
  get state() { return this.#s; }
  get rendered() { return this.#s === 2; }
  async render() { const html = await this._renderHTML(); this._replaceHTML(html, { set innerHTML(v) { this.v = v; }, querySelectorAll: () => [] }); this.#s = 2; this.lastHTML = html; return this; }
  async close() { this.#s = 0; }
}
const expandObject = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const parts = k.split("."); let t = out;
    parts.slice(0, -1).forEach((p) => (t = t[p] ??= {}));
    t[parts.at(-1)] = v;
  }
  return out;
};
let rid = 0;
globalThis.foundry = { applications: { api: { ApplicationV2 } }, utils: { randomID: () => `req${++rid}`, expandObject } };

// Browser bits used for image work.
const ctx = new Proxy({}, { get: (t, k) => (k === "createRadialGradient" ? () => ({ addColorStop() {} }) : () => {}) });
globalThis.document = { createElement: () => ({ getContext: () => ctx, toBlob: (cb, type) => cb(new Blob(["img"], { type })) }) };
globalThis.createImageBitmap = async () => ({ width: 1024, height: 1024, close() {} });
globalThis.FileReader = class { readAsDataURL(b) { this.result = "data:image/webp;base64,AAAA"; setTimeout(() => this.onload()); } };
globalThis.File = class extends Blob { constructor(parts, name, o) { super(parts, o); this.name = name; } };

// Files: a style folder with four references; uploads are recorded.
const uploads = [];
const dirs = [];
const FilePicker = {
  browse: async (src, folder) => ({ files: ["a.webp", "b.png", "c.jpg", "notes.txt"].map((f) => `${folder}/${f}`) }),
  createDirectory: async (src, p) => { dirs.push(p); },
  upload: async (src, dir, file) => { uploads.push(`${dir}/${file.name}`); return { path: `${dir}/${file.name}` }; }
};
globalThis.foundry.applications.apps = { FilePicker: { implementation: FilePicker } };

// fal.ai: returns three images; records the request.
let falBody = null;
globalThis.fetch = async (url, opts) => {
  if (String(url).startsWith("https://fal.run/")) {
    falBody = JSON.parse(opts.body);
    if (opts.headers.Authorization !== "Key tf-key") return { ok: false, status: 401, text: async () => "no" };
    return { ok: true, json: async () => ({ images: [1, 2, 3].map((i) => ({ url: `data:image/png;base64,${i}` })) }) };
  }
  if (url === "https://api.github.com/gists/0123456789abcdef0123") {
    gistCalls++;
    return { ok: true, json: async () => ({ files: {
      "a.webp": { filename: "a.webp", raw_url: "https://gist.githubusercontent.com/x/raw/a.webp" },
      "b.png": { filename: "b.png", raw_url: "https://gist.githubusercontent.com/x/raw/b.png" },
      "ring.png": { filename: "ring.png", raw_url: "https://gist.githubusercontent.com/x/raw/ring.png" },
      "face-forge.json": { filename: "face-forge.json", raw_url: "https://gist.githubusercontent.com/x/raw/face-forge.json" }
    } }) };
  }
  if (url.endsWith("face-forge.json")) return { ok: true, json: async () => ({ style: "GIST STYLE" }) };
  fetchedFiles.push(url);
  return { ok: true, blob: async () => new Blob(["x"], { type: "text/plain" }) };
};
let gistCalls = 0;
const fetchedFiles = [];

// Socket: a shared bus between "clients"; emit never echoes to the sender (like Foundry).
const clients = [];
const makeSocket = (who) => ({ handlers: [], on(n, f) { this.handlers.push(f); }, emit(n, msg) { clients.filter((c) => c !== who).forEach((c) => c.socket.handlers.forEach((f) => c.run(() => f(msg)))); } });

// Actors and a scene with a linked token.
const updates = [];
const actor = {
  id: "a1", name: "Vigdis", type: "character", isOwner: true,
  system: { age: "young", appearance: "a scar through one eyebrow",
    attributes: { str: { base: 7, value: 7 }, con: { value: 11 }, agl: { value: 14 }, int: { value: 9 }, wil: { value: 14 }, cha: { value: 12 } } },
  items: [{ type: "kin", name: "Human" }, { type: "profession", name: "Hunter" },
    { type: "armor", name: "Leather Armor", system: { worn: true } }, { type: "armor", name: "Plate Armor", system: { worn: false } },
    { type: "weapon", name: "Longbow", system: { worn: true } }, { type: "weapon", name: "Broadsword", system: {} }],
  flags: {},
  getFlag(m, k) { return this.flags[m]?.[k]; },
  async setFlag(m, k, v) { (this.flags[m] ??= {})[k] = structuredClone(v); },
  prototypeToken: {}, update: async (u) => { updates.push(u); }
};
const tokenUpdates = [];
const scene = { tokens: [{ id: "t1", actorId: "a1", actorLink: true, isOwner: true }, { id: "t2", actorId: "zz", actorLink: true, isOwner: true }],
  updateEmbeddedDocuments: async (type, u) => { tokenUpdates.push(...u); } };
const created = [];
globalThis.Actor = { create: async (d) => { created.push(d); return { name: d.name, sheet: null }; } };
globalThis.CONFIG = { Actor: { dataModels: { character: {}, npc: {} } } };

const gmUser = { id: "gm", isGM: true, name: "GM" };
const playerUser = { id: "p1", isGM: false, name: "Player" };
const baseGame = {
  settings: { register: (m, k, o) => (settings[k] = o.default), get: (m, k) => (m === "terrain-forge" ? "tf-key" : settings[k]) },
  modules: new Map([["face-forge", {}]]),
  users: { activeGM: gmUser, get: (id) => [gmUser, playerUser].find((u) => u.id === id) },
  actors: { get: (id) => (id === "a1" ? actor : null) },
  scenes: [scene],
  world: { id: "vale" },
  system: { id: "dragonbane" }
};
// Each client is the same module under a different game.user; run() swaps globals in.
const makeClient = (user) => {
  const c = { user, socket: null, game: { ...baseGame, user } };
  c.socket = makeSocket(c); c.game.socket = c.socket;
  c.run = (f) => { globalThis.game = c.game; return f(); };
  clients.push(c);
  return c;
};
const gm = makeClient(gmUser);
const player = makeClient(playerUser);

gm.run(() => {});
await import("../scripts/main.mjs");
for (const c of clients) c.run(() => { hooks.init.forEach((f) => f()); hooks.ready.forEach((f) => f()); });
const api = baseGame.modules.get("face-forge").api;

// Without a style folder or link: a clear error, no fal call.
settings.styleFolder = ""; settings.privateStyle = "";
gm.run(() => {});
await api.forge({ description: "x", name: "x" }).then(() => { throw new Error("forged without refs"); }, (e) => { if (!/No style references/.test(e.message)) throw e; });
if (falBody) throw new Error("fal called without refs");
settings.styleFolder = "worlds/vale/style";

// GM opens the dialog for the actor: description comes from the sheet.
gm.run(() => {});
const app = await api.open(actor);
for (const part of ["young human", "hunter", "scar", "slight, narrow-shouldered", "leather armor", "a longbow"])
  if (!app.ff.description.includes(part)) throw new Error(`description lacks "${part}": ${app.ff.description}`);
if (/plate|broadsword/i.test(app.ff.description)) throw new Error("unworn gear in description");
if (!app.lastHTML.includes('data-look="hairColour"') || !app.lastHTML.includes("copper-red")) throw new Error("look dropdowns missing");
if (!app.lastHTML.includes("Forge")) throw new Error("dialog did not render");

// Forge as GM: Terrain Forge's key, three refs (txt skipped), three candidates, six uploads.
const Forge = app.constructor;
app.ff.look.hairColour = "copper-red";
await Forge.onForge.call(app);
if (actor.getFlag("face-forge", "look")?.hairColour !== "copper-red") throw new Error("look not remembered on the actor");
if (errors.length) throw new Error("errors: " + errors.join(" | "));
if (falBody.image_urls.length !== 3 || falBody.num_images !== 3 || falBody.background !== "transparent") throw new Error("bad fal request");
if (app.ff.candidates.length !== 3 || uploads.length !== 6) throw new Error(`candidates ${app.ff.candidates.length}, uploads ${uploads.length}`);
if (!uploads.every((u) => u.startsWith("worlds/vale/face-forge/vigdis-"))) throw new Error("upload paths: " + uploads);
if (!app.lastHTML.includes("ff-card")) throw new Error("cards not shown");

// Pick the second, apply: portrait, prototype token, and the linked token on the scene.
Forge.onPick.call(app, null, { dataset: { index: "1" } });
await Forge.onUse.call(app);
const u = updates.at(-1);
if (u.img !== app.ff.candidates[1].portrait || u["prototypeToken.texture.src"] !== app.ff.candidates[1].token) throw new Error("actor update wrong: " + JSON.stringify(u));
if ("prototypeToken.ring.enabled" in u) throw new Error("ring turned on while the setting is off");
if (tokenUpdates.length !== 1 || tokenUpdates[0]._id !== "t1") throw new Error("linked token not updated");

// Dynamic ring on: the ring and its subject are set too. Reopening remembers the look.
settings.dynamicRing = true;
const app2 = await api.open(actor);
if (app2.ff.look.hairColour !== "copper-red" || !app2.ff.description.includes("copper-red hair")) throw new Error("look not restored: " + app2.ff.description);
app2.ff.description = "hand-written"; app2.ff.descEdited = true;
Forge.onRebuild.call(app2);
if (app2.ff.descEdited || !app2.ff.description.includes("hunter")) throw new Error("rebuild did not restore the built description");
await Forge.onForge.call(app2);
Forge.onPick.call(app2, null, { dataset: { index: "0" } });
await Forge.onUse.call(app2);
if (updates.at(-1)["prototypeToken.ring.enabled"] !== true || !updates.at(-1)["prototypeToken.ring.subject.texture"]) throw new Error("ring not set");

// New NPC from the sidebar.
const npcApp = await api.open();
npcApp.ff.name = "Old Maud"; npcApp.ff.description = "a one-eyed ferrywoman";
await Forge.onForge.call(npcApp);
Forge.onPick.call(npcApp, null, { dataset: { index: "2" } });
await Forge.onUse.call(npcApp);
if (created.at(-1)?.type !== "npc" || created.at(-1).name !== "Old Maud" || !created.at(-1).prototypeToken?.texture?.src) throw new Error("npc not created: " + JSON.stringify(created.at(-1)));

// Player: request goes over the socket, the GM's browser forges, the player gets paths back.
falBody = null; uploads.length = 0;
const got = await player.run(() => api.forge({ description: "a mallard thief", name: "Quack" }));
if (!falBody || got.length !== 3 || uploads.length !== 6) throw new Error("relay failed");
// GM turns player forging off: the player hears why.
settings.playersCanForge = false;
await player.run(() => api.forge({ description: "x", name: "x" })).then(() => { throw new Error("forged while off"); }, (e) => { if (!/turned off/.test(e.message)) throw e; });
settings.playersCanForge = true;
// No GM online: fails fast, no socket traffic.
baseGame.users.activeGM = null; player.game.users = { ...baseGame.users, activeGM: null };
await player.run(() => api.forge({ description: "x", name: "x" })).then(() => { throw new Error("forged with no GM"); }, (e) => { if (!/GM has to be logged in/.test(e.message)) throw e; });

// Private style gist: its refs join the folder's, its style reaches the prompt,
// ring.png is drawn on the token (not sent as a reference), and the listing is cached.
settings.privateStyle = "https://gist.github.com/Someone/0123456789abcdef0123";
gm.run(() => {}); fetchedFiles.length = 0;
const gistApp = await api.open(actor);
await Forge.onForge.call(gistApp);
if (falBody.image_urls.length !== 5) throw new Error("gist + folder refs: " + falBody.image_urls.length);
if (!falBody.prompt.includes("GIST STYLE")) throw new Error("gist style not in prompt");
if (!fetchedFiles.filter((f) => f.endsWith("ring.png")).length) throw new Error("ring not drawn");
if (fetchedFiles.filter((f) => f.endsWith("ring.png")).length !== 3) throw new Error("ring should be drawn once per token");
settings.style = "GM STYLE";
await Forge.onForge.call(gistApp);
if (!falBody.prompt.includes("GM STYLE") || falBody.prompt.includes("GIST STYLE")) throw new Error("GM style should win");
if (gistCalls !== 1) throw new Error("gist not cached: " + gistCalls);
settings.style = ""; settings.privateStyle = "";

// A bad key surfaces as an error in the dialog, not a crash.
gm.game.settings = { ...baseGame.settings, get: (m, k) => (m === "terrain-forge" ? "wrong" : settings[k]) };
const bad = await gm.run(() => api.open(actor));
errors.length = 0;
await Forge.onForge.call(bad);
if (!errors.some((e) => e.includes("rejected the key")) || bad.ff.busy) throw new Error("bad key not reported: " + errors.join(" | "));

console.log("smoke test passes: describe from sheet (abilities, worn gear, look dropdowns, remembered look, rebuild), GM forge, refs filter, pick + apply, linked tokens, dynamic ring, new NPC, player relay, forging off, no GM, bad key");
