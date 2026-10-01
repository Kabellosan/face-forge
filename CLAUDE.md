# Face Forge — context for Claude

Foundry VTT module for Captain's Dragonbane campaign. Describe a character (prefilled from the sheet) → one fal.ai request returns 3 transparent portraits in the campaign's style → player picks one → it becomes the actor portrait and a round token. Sister module to Terrain Forge (`~/terrain-forge`), same release flow.

## Design decisions (and why)

- **Style comes from reference images, not words.** GPT Image 1.5 `/edit` with 8 style references + `input_fidelity: high`. Bake-off 2026-09-30 (`private/bakeoff/`): Nano Banana 2 painted generic modern watercolour on white; GPT nailed the ink lines, caricature and transparent splash. The prompt tells it "style only, don't copy faces".
- **References are never in this repo.** The public module ships no art. Captain's purchased Dragonbane module art lives in `private/actors/` (gitignored). In Foundry the references come from a **secret gist** (*Private style link*, same pattern as Terrain Forge's private tables) and/or a world folder. Gist layout: images = references, `ring.png|webp` = token ring overlay, `face-forge.json` = `{ style }` (used when the *Art direction* setting is empty). Gist raw URLs serve `text/plain` with CORS `*`, so the module re-types blobs by extension (`typed()`) and draws the ring from a blob, never an `<img>` src. Listing cached 10 min (60 unauthenticated API calls/hour).
- **One generation → portrait + token.** Portrait is transparent (matches the module's busts); the token is built in the browser: warm glow, portrait at ~86%, white fade to the edge, optional ring overlay.
- **All three candidates in one request** (`num_images: 3`): reference images are billed as input, so one request pays for them once.
- **Players never call fal.ai.** Their request goes over the module socket to the active GM's browser, which generates and uploads everything, so players need no upload permission. Honest caveat: the key is a world setting and Foundry sends world settings to every client, so it is still readable from a player's console. Same as Terrain Forge. The real fix is a proxy (the *Image endpoint* setting).
- **Falls back to Terrain Forge's fal key**, so Captain only enters it once.

## Layout

- `scripts/lib.mjs` – pure logic (describe actor, prompt, request, cost, token layout). No Foundry globals.
- `scripts/main.mjs` – Foundry glue: settings, sheet/sidebar entry points, fal call, canvas token compositing, socket relay, dialog.
- `tests/` – `cd tests && node lib.test.mjs && node smoke.test.mjs`. The smoke test simulates a GM and a player client sharing a socket.

## Dragonbane data

The description is built in `L.describeActor(summary, look)`: kin/profession/age, kin hint sentence, look dropdowns (`LOOK_OPTIONS`, saved as actor flag `face-forge.look`), ability-score looks (`ATTRIBUTE_LOOKS`; 9–11 adds nothing, bands 3–5/6–8/12–14/15–18; Captain's idea 2026-10-01), worn armour/helmet and weapons at hand (`system.worn`/`mainHand`/`offHand`, unverified on live data). Attributes: `system.attributes.<str|con|agl|int|wil|cha>.value`.

Character: `system.kin`/`system.profession` strings, but the real ones are embedded Items of type `kin`/`profession` (read those first); `system.age` = young/adult/old; `system.appearance`. NPC/monster: `system.description` (HTML), NPC also `system.traits`.

## Open threads (as of v0.1.2)

- **Ring**: the Dragonbane chain ring is `ring.png` in the style gist (`~/face-forge-style`, gist 864152061cfcf5d9f0acacf4626f9e3c, pushes over SSH like the Terrain Forge gist). Its solid band sits at 44–46% of the width, so with a ring the painted circle is clipped at 45% (`tokenLayout(..., ringed)`).
- Style tuning: round 2 (strong caricature, saturated) vs round 3 (paler, drifts realistic); the default style text blends them. Tune live via the *Art direction* setting.
- Canvas compositing and the socket relay are only mock-tested; not yet run on real Foundry v14 / Sqyre.
- Ideas: per-player forge budget; GM approval before a player's pick applies; cleanup of unchosen candidates.
