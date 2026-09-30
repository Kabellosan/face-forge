# Face Forge — context for Claude

Foundry VTT module for Captain's Dragonbane campaign. Describe a character (prefilled from the sheet) → one fal.ai request returns 3 transparent portraits in the campaign's style → player picks one → it becomes the actor portrait and a round token. Sister module to Terrain Forge (`~/terrain-forge`), same release flow.

## Design decisions (and why)

- **Style comes from reference images, not words.** GPT Image 1.5 `/edit` with 8 style references + `input_fidelity: high`. Bake-off 2026-09-30 (`private/bakeoff/`): Nano Banana 2 painted generic modern watercolour on white; GPT nailed the ink lines, caricature and transparent splash. The prompt tells it "style only, don't copy faces".
- **References are never in this repo.** The public module ships no art. Captain's purchased Dragonbane module art lives in `private/actors/` (gitignored) for testing only; in Foundry the GM points the *Style reference folder* at their own copies.
- **One generation → portrait + token.** Portrait is transparent (matches the module's busts); the token is built in the browser: warm glow, portrait at ~86%, white fade to the edge, optional ring overlay.
- **All three candidates in one request** (`num_images: 3`): reference images are billed as input, so one request pays for them once.
- **Players never call fal.ai.** Their request goes over the module socket to the active GM's browser, which generates and uploads everything, so players need no upload permission. Honest caveat: the key is a world setting and Foundry sends world settings to every client, so it is still readable from a player's console. Same as Terrain Forge. The real fix is a proxy (the *Image endpoint* setting).
- **Falls back to Terrain Forge's fal key**, so Captain only enters it once.

## Layout

- `scripts/lib.mjs` – pure logic (describe actor, prompt, request, cost, token layout). No Foundry globals.
- `scripts/main.mjs` – Foundry glue: settings, sheet/sidebar entry points, fal call, canvas token compositing, socket relay, dialog.
- `tests/` – `cd tests && node lib.test.mjs && node smoke.test.mjs`. The smoke test simulates a GM and a player client sharing a socket.

## Dragonbane data

Character: `system.kin`/`system.profession` strings, but the real ones are embedded Items of type `kin`/`profession` (read those first); `system.age` = young/adult/old; `system.appearance`. NPC/monster: `system.description` (HTML), NPC also `system.traits`.

## Open threads (as of v0.1.0)

- **The green chain ring**: unclear whether the Dragonbane module bakes it into token files or provides it as a Foundry dynamic ring. Both are supported (ring overlay image setting / dynamic ring toggle). Need one of the module's *token* files (not the portraits) to cut a ring overlay from.
- Style tuning: round 2 (strong caricature, saturated) vs round 3 (paler, drifts realistic); the default style text blends them. Tune live via the *Art direction* setting.
- Canvas compositing and the socket relay are only mock-tested; not yet run on real Foundry v14 / Sqyre.
- Ideas: per-player forge budget; GM approval before a player's pick applies; cleanup of unchosen candidates.
