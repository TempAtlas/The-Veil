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

Run it inside WSL, from the game repo. It writes `game.json` (species, moves, abilities, items, level caps),
`trainers.json` (every team on Normal and Hard) and `docs.json` (encounters, items, shops, trades, and the species
that differ from the expansion the game is built on).

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
Technician, crits, screens, Eviolite, Weather Ball, Low Kick, and the Veil's retyped starters.

## Files

| Path | What |
|---|---|
| `index.html` | About |
| `docs.html`, `assets/docs.js` | Documentation, with each floor hidden until opened |
| `calc.html`, `assets/calc.js`, `assets/calc-engine.js` | Damage calculator (the engine is pure and runs in Node) |
| `patcher.html` | Patcher (coming soon) |
| `assets/site.js` | Header, footer, data loading. The game's title is set here once |
| `assets/style.css` | Styles |
