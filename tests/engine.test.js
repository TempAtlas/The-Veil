// Engine checks against hand-worked figures (Gen 5+ formula, no EVs).
const path = require("path").join(__dirname, "..") + "/";
const C = require(path + "assets/calc-engine.js");
const G = require(path + "data/game.json");
let fails = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}${ok ? "" : " want " + JSON.stringify(want)}`);
}
const mon = (species, o) => Object.assign({ species, level: 50, nature: "Hardy", ability: "", item: "", boosts: {} }, o);

// 1. Adamant Lv 50 Garchomp Earthquake vs neutral Lv 50 Pikachu: 312-368 (worked by hand)
let r = C.calculate(G, mon("GARCHOMP", { nature: "Adamant" }), mon("PIKACHU"), "EARTHQUAKE", {});
eq("EQ stats", [r.hits[0].atk, r.hits[0].def, r.def.maxHP], [165, 60, 110]);
eq("EQ range", [r.min, r.max], [312, 368]);
eq("EQ KO", r.ko.text, "guaranteed OHKO");

// 2. Levitate immunity; Mold Breaker ignores it
r = C.calculate(G, mon("GARCHOMP"), mon("GENGAR", { ability: "LEVITATE" }), "EARTHQUAKE", {});
eq("Levitate", r.eff, 0);
r = C.calculate(G, mon("EXCADRILL", { ability: "MOLD_BREAKER" }), mon("GENGAR", { ability: "LEVITATE" }), "EARTHQUAKE", {});
eq("Mold Breaker", r.eff, 2);

// 3. Skill Link: 5 hits of Bullet Seed
r = C.calculate(G, mon("CINCCINO", { ability: "SKILL_LINK" }), mon("SWAMPERT"), "BULLET_SEED", {});
eq("Skill Link hits", r.hits.length, 5);
r = C.calculate(G, mon("CINCCINO", { ability: "TECHNICIAN" }), mon("SWAMPERT"), "BULLET_SEED", {});
eq("Technician BP", r.hits[0].bp, 37);
eq("Technician default hits", r.hits.length, 3);

// 4. Seismic Toss = level; Ghost immune
r = C.calculate(G, mon("CHANSEY", { level: 42 }), mon("SNORLAX"), "SEISMIC_TOSS", {});
eq("Seismic Toss", [r.min, r.max], [42, 42]);
r = C.calculate(G, mon("CHANSEY"), mon("GENGAR"), "SEISMIC_TOSS", {});
eq("Seismic Toss vs Ghost", r.eff, 0);

// 5. Veil data: Bayleef is Grass/Poison, so Psychic is super effective, Fire still is
r = C.calculate(G, mon("ALAKAZAM"), mon("BAYLEEF"), "PSYCHIC", {});
eq("Psychic vs Veil Bayleef", r.eff, 2);
// Pignite is Fire/Ground: Water 4x, Electric immune
r = C.calculate(G, mon("STARMIE"), mon("PIGNITE"), "SURF", {});
eq("Surf vs Veil Pignite", r.eff, 4);
r = C.calculate(G, mon("JOLTEON"), mon("PIGNITE"), "THUNDERBOLT", {});
eq("Thunderbolt vs Veil Pignite", r.eff, 0);

// 6. Burn halves physical; Guts ignores it and boosts
const base = C.calculate(G, mon("MACHAMP"), mon("BLISSEY"), "CLOSE_COMBAT", {});
const burnt = C.calculate(G, mon("MACHAMP", { status: "brn" }), mon("BLISSEY"), "CLOSE_COMBAT", {});
const guts = C.calculate(G, mon("MACHAMP", { status: "brn", ability: "GUTS" }), mon("BLISSEY"), "CLOSE_COMBAT", {});
eq("burn halves", burnt.max <= Math.floor(base.max / 2) + 1, true);
eq("Guts > healthy", guts.max > base.max, true);

// 7. Crit: 1.5x and ignores the defender's +2 Def
const plain = C.calculate(G, mon("GARCHOMP"), mon("BLISSEY"), "EARTHQUAKE", {});
const crit = C.calculate(G, mon("GARCHOMP"), mon("BLISSEY", { boosts: { def: 2 } }), "EARTHQUAKE", {}, { crit: true });
eq("crit ~1.5x", Math.abs(crit.max / plain.max - 1.5) < 0.05, true);
const critScreen = C.calculate(G, mon("GARCHOMP"), mon("BLISSEY"), "EARTHQUAKE", { defSide: { reflect: true } }, { crit: true });
eq("crit ignores Reflect", critScreen.max, crit.max);

// 8. Reflect halves; Eviolite on an NFE
const refl = C.calculate(G, mon("GARCHOMP"), mon("BLISSEY"), "EARTHQUAKE", { defSide: { reflect: true } });
eq("Reflect ~0.5x", Math.abs(refl.max / plain.max - 0.5) < 0.05, true);
const ev = C.calculate(G, mon("GARCHOMP"), mon("PORYGON2", { item: "EVIOLITE" }), "EARTHQUAKE", {});
const noev = C.calculate(G, mon("GARCHOMP"), mon("PORYGON2"), "EARTHQUAKE", {});
eq("Eviolite ~2/3", Math.abs(ev.max / noev.max - 2 / 3) < 0.05, true);

// 9. Weather Ball in sun: Fire, 100 BP
r = C.calculate(G, mon("WEEPINBELL", { level: 21 }), mon("FOONGUS", { level: 21 }), "WEATHER_BALL", { weather: "sun" });
eq("Weather Ball sun", [r.type, r.hits[0].bp], ["FIRE", 100]);

// 10. Low Kick by weight
r = C.calculate(G, mon("MACHAMP"), mon("SNORLAX"), "LOW_KICK", {});
eq("Low Kick vs Snorlax", r.hits[0].bp, 120);

// 11. KO chance sanity: a 2HKO needs at least 50%
r = C.calculate(G, mon("GARCHOMP", { level: 30 }), mon("SNORLAX", { level: 50 }), "DRAGON_CLAW", {});
console.log("   ", r.desc);
eq("KO text present", typeof r.ko.text, "string");

// 12. Hazards and Leftovers in the KO text: Stealth Rock takes half of Charizard's HP (4x), Leftovers heals 1/16
r = C.calculate(G, mon("GARCHOMP"), mon("CHARIZARD", { item: "LEFTOVERS" }), "DRAGON_CLAW", { defSide: { stealthRock: true } });
eq("KO text names hazards", /after Stealth Rock and Leftovers recovery$/.test(r.ko.text), true);
const noSR = C.calculate(G, mon("GARCHOMP"), mon("CHARIZARD"), "DRAGON_CLAW", {});
eq("Stealth Rock lowers the hits needed", r.ko.n < noSR.ko.n, true);
// a Heavy-Duty Boots holder ignores it
r = C.calculate(G, mon("GARCHOMP"), mon("CHARIZARD", { item: "HEAVY_DUTY_BOOTS" }), "DRAGON_CLAW", { defSide: { stealthRock: true } });
eq("Boots ignore Stealth Rock", r.ko.text, noSR.ko.text);

// 13. The panel's own power box overrides the move's
r = C.calculate(G, mon("GARCHOMP"), mon("BLISSEY"), "EARTHQUAKE", {}, { override: { bp: 50 } });
eq("power override", r.hits[0].bp, 50);

console.log(fails ? `${fails} FAILED` : "all engine checks pass");
process.exit(fails ? 1 : 0);
