# Scenario Selector: Bolt Action & Konflikt '47

A small static web app for setting up **Battle Scenarios** and keeping score in two-player games of
**Bolt Action** (3rd ed.) and **Konflikt '47** (2nd ed.). It's built for phones. It needs no build
step and no server code, so it runs as-is on GitHub Pages.

**Live site: <https://fieldorders.anotherwally.dev>**

> Unofficial fan-made tool. Not affiliated with Warlord Games.

## What it does

| Tab | Purpose |
| --- | --- |
| **Scenario** | Pick or roll (D6) the **victory conditions**, **deployment zones** and **deployment type**. A table map shows the zones, the objective markers and the player names. Each option shows a short summary, and you can expand it to read the full rules. |
| **Battle** | Turn counter (6 turns, with the roll for turn 7), VP for both players with quick-score buttons from the chosen victory conditions, a battle log with undo, and the final result. |
| **Rules** | Reference for the current battle and the general rules, with a **Summary / Full** toggle. |

- Switch between **BA** and **K47** in the top bar. Each system remembers its own scenario picks.
- Player names, turn, VP and the log are saved in the browser's `localStorage` on the device. A reload,
  a closed tab or a locked phone won't lose the game. **New game** resets everything except the names.
- Once loaded, the app works offline thanks to a service worker. You can add it to the home screen.

## Project layout

```
index.html              App shell and the inline SVG icon sprite
css/styles.css          All styles (colour tokens at the top, light and dark)
js/app.js               Rendering and actions
js/state.js             localStorage save and load
js/diagram.js           Table map (SVG) built from JSON
js/text.js              Escaping and the mini-markup for rule text
data/systems.json       List of game systems
data/bolt-action.json   Bolt Action scenario rules
data/konflikt-47.json   Konflikt '47 scenario rules
assets/                 App icons
sw.js                   Offline cache
manifest.webmanifest    Home-screen app details
CNAME                   Custom domain for GitHub Pages (don't delete)
.nojekyll               Stops GitHub Pages from running Jekyll
```

## Run it locally

The app loads its JSON files with `fetch`, and browsers block that for `file://` pages. Serve the
folder over HTTP instead:

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Hosting

The site is served by **GitHub Pages** from the `main` branch (folder `/ (root)`) at the custom domain
**`fieldorders.anotherwally.dev`**. Every push to `main` redeploys it within a minute or two. The old
address, `https://anotherwally.github.io/wg_scenario_builder/`, redirects to the custom domain.

### How the custom domain is set up

| Where | Setting |
| --- | --- |
| GitHub repo → **Settings → Pages** | Source: *Deploy from a branch*, `main`, `/ (root)`. Custom domain: `fieldorders.anotherwally.dev`. **Enforce HTTPS** on. |
| `CNAME` file in the repo root | `fieldorders.anotherwally.dev`. GitHub reads the domain from this file, so deleting it turns the custom domain off. |
| Cloudflare DNS for `anotherwally.dev` | `CNAME` record: name `fieldorders`, target `anotherwally.github.io`, proxy **DNS only** (grey cloud). |
| Cloudflare DNS for `anotherwally.dev` | `TXT` record `_github-pages-challenge-anotherwally` with the code from GitHub **account** Settings → Pages. This verifies the domain so nobody else can claim its subdomains for their own Pages site. Leave it in place. |

Notes:

- Keep the Cloudflare proxy **off** for the `fieldorders` record. With the orange cloud on, GitHub can't
  check the domain or renew its HTTPS certificate.
- `.dev` domains only work over HTTPS. GitHub issues and renews the certificate automatically.
- If you change the custom domain in the GitHub settings, GitHub commits a new `CNAME` file. Run
  `git pull --ff-only` before your next push.

### Publishing a copy elsewhere

1. Push this folder to the `main` branch of a GitHub repository.
2. In **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, with branch `main`
   and folder `/ (root)`. GitHub Free needs a public repository for this.
3. Delete or replace the `CNAME` file. Otherwise your copy tries to claim `fieldorders.anotherwally.dev`.
4. The app is then live at `https://<user>.github.io/<repo>/`, or at your own domain if you set one.

All paths are relative, so the app works both from a project sub-path and at the root of a custom domain.
The `.nojekyll` file stops GitHub from running Jekyll over the files.

## Editing the rules data

Each game system has one JSON file. The app is fully data-driven: add, remove or rename options and the
UI follows.

```jsonc
{
  "id": "bolt-action",
  "name": "Bolt Action",
  "edition": "Third Edition",
  "status": "verified",           // anything else (e.g. "review") shows statusNote as a dismissible banner
  "statusNote": "…",
  "source": { "book": "Bolt Action Third Edition rulebook", "pages": "162–174" },
  "table": { "width": 72, "height": 48, "label": "6' × 4' table" },   // inches
  "game": {
    "turns": 6,
    "extraTurn": { "die": 6, "on": 4, "turns": 1, "summary": "…" }   // omit to disable
  },
  "categories": [                 // the three scenario tables
    {
      "id": "victory", "name": "Victory Conditions", "shortName": "Victory",
      "icon": "target",           // any i-* symbol in index.html: target, map, deploy, dice, flag, book, clock, info, trophy
      "die": 6,
      "options": [
        {
          "id": "top-secret",
          "name": "Top Secret",
          "roll": [4],            // die results that select this option (e.g. [1,2,3]); omit = choose by agreement only
          "page": 165,            // rulebook page, shown as "p. 165"
          "summary": "Short version shown by default.",
          "full": [               // full version: one entry per line
            "A plain paragraph.",
            "## A sub-heading",
            "- A bullet point with **bold** text"
          ],
          "scoring": [            // quick-score buttons on the Battle tab
            { "label": "Briefcase carried off table (wins)", "points": 1, "endsGame": true }
          ],
          "winMargin": 1,         // lead needed to win; less is a draw (Seek and Destroy uses 2)
          "scoreUnit": "VP",      // label on the score counter, e.g. "Obj" for Key Positions
          "excludes": ["fog-of-war"],  // option ids in other tables this rules out (re-rolled)
          "markers": [ { "x": 36, "y": 24, "label": "Briefcase", "ring": 12 } ]  // map marker + no-deploy ring
        }
      ]
    }
  ],
  "general": [ { "id": "game-length", "name": "Game length", "icon": "clock", "summary": "…", "full": ["…"] } ]
}
```

**Deployment zone maps.** A deployment-zone option can carry a `diagram`, drawn on the table in inches.
`side` is `"a"` (player 1), `"b"` (player 2) or `"none"` (a no-deployment area drawn on top):

```json
"diagram": {
  "shapes": [
    { "type": "rect", "side": "a", "x": 0, "y": 0, "w": 72, "h": 12 },
    { "type": "circle", "side": "none", "cx": 36, "cy": 24, "r": 12 },
    { "type": "polygon", "side": "b", "points": [[0,48],[24,48],[0,24]] }
  ],
  "lines": [ { "x1": 0, "y1": 24, "x2": 72, "y2": 24, "label": "Table middle line" } ],
  "dims": [ { "x1": 60, "y1": 12, "x2": 60, "y2": 24, "label": "12\"" } ]
}
```

In JSON, write inches as `12\"` (escaped quote).

**Adding another game system:** copy one of the data files, change its `id` and `name`, and add an
entry to `data/systems.json`. To give it its own colours, add a `:root[data-system="<id>"]` block in
`css/styles.css`.

After changing which files exist, bump `CACHE` in `sw.js` and update its `CORE` list.

## About the rules text

The bundled rules are paraphrased from the battle-scenario chapters of the **Bolt Action Third Edition**
rulebook (pp. 162–174) and the **Konflikt '47 Second Edition** rulebook (pp. 142–153). Each option and
general rule carries its page number. Both files have been checked against the books and are marked
`"status": "verified"`, so the app shows no notice. If you make big changes to a file, set its status back
to `"review"` to show its `statusNote` until it's been checked again.

Main differences between the two systems, reflected in the data:

| | Bolt Action | Konflikt '47 |
| --- | --- | --- |
| Standard game | 1,000 points | 1,500 points |
| Who declares reserves first | Higher roller | Lower roller |
| Fog of War reserves | At least half, rounded up. Reserves enter from any edge | Up to half, rounded down. Any edge except the one the last enemy reserve used that turn |
| Demolition | 4+ roll per unit within 3"; deploy more than 18" from enemy base | Automatic with a model within 3"; deploy more than 12" from enemy base |
| Key Positions | Objectives can't be doubled up | Markers that can't be placed legally stack up and count as two |
| Capturing objectives | Unit ends its *activation* within 3" | Unit ends its *movement* within 3" |

This site is public on GitHub Pages, so keep the rules text in your own words. Don't paste rulebook
pages in verbatim, because that text is Warlord Games' copyright.
