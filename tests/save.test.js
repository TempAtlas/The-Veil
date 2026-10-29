// node tests/save.test.js [path/to/file.sav]: reads a real save with assets/save.js and checks what comes out. The
// save itself is never in this repo (.gitignore blocks *.sav): by default it's the author's old playtest save beside
// the project (../Old Save/veil-playtest.sav); with none there, the test is skipped.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const savPath = process.argv[2] || path.join(root, "..", "Old Save", "veil-playtest.sav");
if (!fs.existsSync(savPath)) { console.log(`skip: no save at ${savPath}`); process.exit(0); }

const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, "assets", "save.js"), "utf8"), ctx);
const G = JSON.parse(fs.readFileSync(path.join(root, "data", "game.json"), "utf8"));
const file = fs.readFileSync(savPath);
const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const save = ctx.window.VeilSave.read(buf, G);

let fails = 0;
const ok = (cond, what) => { console.log(`${cond ? "ok  " : "FAIL"} ${what}`); if (!cond) fails++; };
const show = (m) => `${m.nickname ? m.nickname + " " : ""}${G.species[m.species].name} Lv ${m.level} ${m.nature} ` +
  `[${m.ability}] @${m.item || "-"} ivs ${Object.values(m.ivs).join("/")} | ${m.moves.filter(Boolean).join(", ")}`;

console.log("party:");
save.party.forEach((m) => console.log("  " + show(m)));
const boxed = save.boxes.flatMap((b) => b.mons.filter(Boolean));
console.log(`boxes: ${boxed.length} Pokémon in ${save.boxes.filter((b) => b.mons.some(Boolean)).length} box(es)`);
boxed.slice(0, 8).forEach((m) => console.log("  " + show(m)));

ok(save.party.length >= 1 && save.party.length <= 6, `a party of ${save.party.length}`);
const all = [...save.party, ...boxed];
ok(all.every((m) => G.species[m.species]), "every Pokémon is a species the game has");
ok(all.every((m) => m.level >= 1 && m.level <= 100), "every level is 1-100");
ok(all.every((m) => m.moves.some((mv) => mv && G.moves[mv])), "every Pokémon knows a move the game has");
ok(all.every((m) => Object.values(m.ivs).every((v) => v >= 0 && v <= 31)), "every IV is 0-31");
ok(save.party.every((m) => m.level <= 45), "the party is within that save's level cap (45)");
console.log(fails ? `${fails} check(s) failed` : "all save checks pass");
process.exit(fails ? 1 : 0);
