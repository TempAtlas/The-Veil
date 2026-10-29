# The Veil - website

The game's site: About, Docs (trainers, wild Pokémon, items, changes from Emerald), a damage calculator, and the
patcher page. It's a plain static site with no build step. GitHub Pages can serve it straight from the repo root
(the `.nojekyll` file is there so Pages doesn't touch it).

**This repo never holds a ROM, a save or a patch.** `.gitignore` blocks them, and the pre-commit hook in
`tools/check-no-roms.sh` refuses any that get staged anyway. Run `sh tools/install-hooks.sh` once after cloning. The
patch is added deliberately at launch. Until then the patcher page says "Coming soon".

## Updating the data

Everything under `data/` is generated from the game's source tree by the build repo:

```
python3 tools/scripts/build_site_data.py <path to this repo>/data
```

Run it inside WSL, from the game repo. It writes `game.json` (species, moves, abilities, items, level caps, and what
the calculator needs to read a save: the numbers a save stores, each species' ability slots and growth rate),
`trainers.json` (every team on Normal and Hard) and `docs.json` (encounters, items, shops, trades, and the species
that differ from the expansion the game is built on). It also draws `assets/icons.png`, every species' party icon
from the game's own graphics and icon palettes.

## Previewing locally

The pages load `data/*.json`, which browsers won't do from a `file://` page, so serve the folder:

```
node tools/serve.js
```

Then open http://localhost:8080.

## Tests

```
node tests/engine.test.js
```

This checks the damage engine against figures worked out by hand: stats, rolls, immunities, Skill Link,
Technician, crits, screens, Eviolite, Weather Ball, Low Kick, the Veil's retyped starters, and the field extras
(Friend Guard, Power Spot, Battery, Charge, Foresight, Magic Room, Wonder Room).

```
node tests/save.test.js [path/to/file.sav]
```

This reads a real save with `assets/save.js` (the party and every PC box) and checks what comes out. The save is never
in this repo; by default it looks for one beside the project, and skips if there's none.

## Files

| Path | What |
|---|---|
| `index.html` | About |
| `docs.html`, `assets/docs.js` | Documentation, with each floor hidden until opened |
| `calc.html`, `assets/calc.js`, `assets/calc-engine.js` | Damage calculator (the engine is pure and runs in Node): your party and boxes from a dropped save, the opponents by floor and area, Showdown import / export |
| `assets/save.js` | Reads a save in the browser (never uploaded) |
| `assets/icons.png` | Party icons, from the game's own graphics (generated) |
| `patcher.html` | Patcher (coming soon) |
| `assets/site.js` | Header, footer, data loading. The game's title is set here once |
| `assets/style.css` | Styles |
