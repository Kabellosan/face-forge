# Face Forge

Describe a character → get three AI-painted portraits in your campaign's art style → pick one, and it becomes the character's portrait **and** a round token. Players forge their own at character creation; the GM forges NPCs from the Actors sidebar.

Works on Foundry v13 and v14. Built for Dragonbane (reads kin, profession, age and appearance from the sheet), works with any system.

## Install

1. In Foundry (or Sqyre's Module Manager) choose **Install by manifest URL** and paste:
   `https://github.com/Kabellosan/face-forge/releases/latest/download/module.json`
2. Restart Foundry and enable **Face Forge** in *Manage Modules*.
3. *Configure Settings → Face Forge*:
   - **fal.ai API key**: leave empty if Terrain Forge already has one; Face Forge uses it.
   - **Style reference folder**: see below. Required.

## Style references: the look of your campaign

Face Forge doesn't describe a style in words; it *shows* the image model examples. Put 6–8 portraits in the look you want into one folder (upload them with Foundry's file browser), and point the setting at it.

- Pick **single-character busts** with transparent backgrounds. Group shots and full-body art pull the results away from token-friendly portraits.
- Pick **variety**: young and old, human and non-human, different expressions. Too many similar faces and the model starts copying faces instead of the style.
- With more than 8 images in the folder, 8 are picked at random each time.

The references stay in your world. They're never part of this module.

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

- **Token ring image**: a round frame with a transparent middle, drawn on top of every generated token. It's baked into the token file, so it looks the same everywhere.
- **Turn on Foundry's dynamic token ring**: uses whatever ring your system or modules provide.

If the ring cuts off heads, lower **Portrait size inside the token**.

## Cost

One forge = one fal.ai request for three images with GPT Image 1.5, plus your references as input. At medium quality that's about **30¢** per forge; the dialog shows the estimate. Unchosen candidates stay in `worlds/<your world>/face-forge/` (Foundry can't delete files from a module); clear them out now and then if you like.
