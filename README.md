# Face Forge

Describe a character → get three AI-painted portraits in your campaign's art style → pick one, and it becomes the character's portrait **and** a round token. Players forge their own at character creation; the GM forges NPCs from the Actors sidebar.

Works on Foundry v13 and v14. Built for Dragonbane (reads kin, profession, age and appearance from the sheet), works with any system.

## Install

1. In Foundry (or Sqyre's Module Manager) choose **Install by manifest URL** and paste:
   `https://github.com/Kabellosan/face-forge/releases/latest/download/module.json`
2. Restart Foundry and enable **Face Forge** in *Manage Modules*.
3. *Configure Settings → Face Forge*:
   - **fal.ai API key**: leave empty if Terrain Forge already has one; Face Forge uses it.
   - **Private style link** or **Style reference folder**: see below. One of them is required.

## Style references: the look of your campaign

Face Forge doesn't describe a style in words; it *shows* the image model examples. Give it 6–8 portraits in the look you want:

- Pick **single-character busts** with transparent backgrounds. Group shots and full-body art pull the results away from token-friendly portraits.
- Pick **variety**: young and old, human and non-human, different expressions. Too many similar faces and the model starts copying faces instead of the style.
- With more than 8, 8 are picked at random each time.

Two places to keep them; use either or both:

- **Private style link** (easiest if your references are art you bought): a **secret GitHub gist**. Paste its page link into the setting. Every image in the gist is a style reference, except:
  - `ring.png` / `ring.webp`: a round frame with a transparent middle, drawn on every token.
  - `face-forge.json`: optional settings, e.g. `{ "style": "…art direction text…" }`. Used when the *Art direction* setting is empty.

  Update the gist and the next forge (within 10 minutes) uses it; no module update needed. A secret gist is unlisted, not locked: anyone with the link can see it, and players could find the link in the browser console. Fine for a home game.
- **Style reference folder**: upload portraits into a folder in your world with Foundry's file browser and point the setting at it.

Nothing ships with the module itself.

## Use

- **Players**: open your character sheet → **Face Forge** in the header. The appearance box is filled in from your sheet; add detail ("a braided copper beard, soot on her cheeks"). **Forge**, wait 30–90 seconds, click the one you like, **Use this face**.
- **GM, existing actor**: same button on any sheet, or right-click the actor in the sidebar → **Face Forge**.
- **GM, new NPC**: Actors sidebar → **Face Forge** button. Name them, describe them, pick one → **Create NPC**.
- Macro: `game.modules.get("face-forge").api.open(actor)`.

Choosing a face sets the actor's portrait, its prototype token, and every linked token already placed on a scene.

## Players and the API key

A player's request is sent to a logged-in GM's browser, which calls fal.ai with the GM's key and uploads the images. So:

- **A GM has to be logged in** for players to forge. Session zero is the natural time.
- Players never need file-upload permission.
- One request per player at a time. Turn player forging off entirely in the settings.
- The key itself is a world setting, which Foundry sends to every client. A player who opens the browser console could read it. Fine for a table of friends; for anything else, put a proxy in front (the *Image endpoint* setting).

## Token ring

The token is the portrait on a round, warm-glow background that fades to white at the edge, the way ring tokens usually look. Two ways to frame it:

- **Token ring image** (or `ring.png` in your private style gist): a round frame with a transparent middle, drawn on top of every generated token. It's baked into the token file, so it looks the same everywhere.
- **Turn on Foundry's dynamic token ring**: uses whatever ring your system or modules provide.

If the ring cuts off heads, lower **Portrait size inside the token**.

## Cost

One forge = one fal.ai request for three images with GPT Image 1.5, plus your references as input. At medium quality that's about **30¢** per forge; the dialog shows the estimate. Unchosen candidates stay in `worlds/<your world>/face-forge/` (Foundry can't delete files from a module); clear them out now and then if you like.
