// The damage calculator page: two Pokémon panels, the field, and the results (the maths is in calc-engine.js).
let G, T;
const C = () => window.VeilCalc;
const SIDES = {};
let selected = null;           // [side, moveIndex]

const nameToSpecies = new Map(), nameToMove = new Map(), nameToAbility = new Map();

function blankMon(species) {
  return { species, level: G.caps[0], nature: "Hardy", ability: G.species[species].abilities[0] || "", item: "",
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, boosts: {}, status: "", hpPct: 100,
    moves: ["", "", "", ""], crit: [false, false, false, false], hits: [0, 0, 0, 0] };
}

function fromSet(set) {
  const m = blankMon(set.species);
  return Object.assign(m, { level: set.level, nature: set.nature, ability: set.ability, item: set.item || "",
    moves: [...set.moves, "", "", "", ""].slice(0, 4) });
}

// ------------------------------------------------------------------------------------------- one side's panel
function Side(id, title, initial) {
  const root = document.getElementById(id);
  const s = { id, mon: initial, diff: "normal", side: { reflect: false, lightScreen: false, auroraVeil: false, helpingHand: false, tailwind: false } };
  SIDES[id] = s;

  function sel(options, value, onchange, attrs) {
    const el = h("select", Object.assign({ onchange: (e) => onchange(e.target.value) }, attrs || {}),
      options.map(([v, label]) => h("option", { value: v, selected: v === value ? true : null }, label)));
    return el;
  }

  function render() {
    const m = s.mon, sp = G.species[m.species];
    const prep = C().prepare(G, m);
    // load a trainer's Pokémon: the floor first, so the list doesn't spoil the floors below
    const floorOpts = [["", "Trainer sets: floor…"], ...T.floors.map((f) => [String(f.floor), `Floor ${f.floor}`])];
    const trainerOpts = [["", "Trainer…"]];
    const fl = T.floors.find((f) => String(f.floor) === s.loadFloor);
    for (const p of fl ? fl.places : []) for (const t of p.trainers) trainerOpts.push([t.id, `${p.place} · ${t.title}`]);
    const loadBox = h("div", { class: "row" },
      sel(floorOpts, s.loadFloor || "", (v) => { s.loadFloor = v; s.loadTrainer = ""; render(); }),
      fl ? sel(trainerOpts, s.loadTrainer || "", (v) => { s.loadTrainer = v; render(); }, { style: "flex:1;min-width:0" }) : null,
      h("div", { class: "seg" }, ["normal", "hard"].map((d) => h("button", { class: s.diff === d ? "on" : null,
        onclick: () => { s.diff = d; render(); } }, d === "normal" ? "Normal" : "Hard"))));
    let chips = null;
    if (s.loadTrainer) {
      const t = findTrainer(s.loadTrainer);
      chips = h("div", { class: "row" }, (t?.[s.diff] || []).map((set) => h("button", {
        class: "pill", title: `Lv ${set.level}`, onclick: () => { s.mon = fromSet(set); render(); update(); },
      }, G.species[set.species]?.name || set.species)));
    }

    const speciesInput = h("input", { list: "dl-species", value: sp.name, style: "flex:1;min-width:0",
      onchange: (e) => { const k = nameToSpecies.get(e.target.value); if (k) { s.mon = Object.assign(blankMon(k), { level: m.level, moves: m.moves }); render(); update(); } } });

    const caps = h("div", { class: "row" }, h("label", {}, "Level"),
      h("input", { type: "number", min: 1, max: 100, value: m.level, onchange: (e) => { m.level = clamp(+e.target.value, 1, 100); render(); update(); } }),
      G.caps.map((c) => h("button", { class: "pill", title: "a level cap", onclick: () => { m.level = c; render(); update(); } }, c)));

    const abilities = [...new Set([...sp.abilities, m.ability].filter(Boolean))];
    const abilityRow = h("div", { class: "row" }, h("label", {}, "Ability"),
      sel([...abilities.map((a) => [a, G.abilities[a]?.name || a]), ["__other", "Other…"]], s.otherAbility ? "__other" : m.ability, (v) => {
        s.otherAbility = v === "__other";
        if (!s.otherAbility) m.ability = v;
        render(); update();
      }),
      s.otherAbility ? h("input", { list: "dl-abilities", placeholder: "Any ability", style: "flex:1;min-width:0",
        onchange: (e) => { const k = nameToAbility.get(e.target.value); if (k) { m.ability = k; s.otherAbility = false; render(); update(); } } }) : null);
    const desc = G.abilities[m.ability]?.desc;

    const items = [["", "(no item)"], ...Object.entries(G.items).map(([k, it]) => [k, it.name]).sort((a, b) => a[1].localeCompare(b[1]))];
    const itemRow = h("div", { class: "row" }, h("label", {}, "Item"), sel(items, m.item, (v) => { m.item = v; update(); render(); }));
    const natureRow = h("div", { class: "row" }, h("label", {}, "Nature"),
      sel(Object.entries(C().NATURES).map(([n, [u, d]]) => [n, u ? `${n} (+${C().STAT_LABEL[u]} -${C().STAT_LABEL[d]})` : n]), m.nature,
        (v) => { m.nature = v; render(); update(); }));

    const [up, down] = C().NATURES[m.nature] || [];
    const statRows = [h("span", { class: "h" }, ""), h("span", { class: "h" }, "Base"), h("span", { class: "h" }, "IV"), h("span", { class: "h" }, "Boost"), h("span", { class: "h" }, "Stat")];
    C().STATS.forEach((st, i) => {
      const boost = m.boosts[st] || 0;
      const final = st === "hp" ? prep.stats.hp : C().boosted(prep.stats[st], boost);
      statRows.push(h("span", { class: up === st ? "plus" : down === st ? "minus" : null }, C().STAT_LABEL[st]),
        h("span", { class: "muted" }, sp.bs[i]),
        h("input", { type: "number", min: 0, max: 31, value: m.ivs[st], onchange: (e) => { m.ivs[st] = clamp(+e.target.value, 0, 31); render(); update(); } }),
        st === "hp" ? h("span") : sel([6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6].map((b) => [String(b), b > 0 ? `+${b}` : String(b)]), String(boost),
          (v) => { m.boosts[st] = +v; render(); update(); }),
        h("strong", {}, final));
    });

    const statusRow = h("div", { class: "row" }, h("label", {}, "Status"),
      sel([["", "Healthy"], ["brn", "Burned"], ["psn", "Poisoned"], ["tox", "Badly poisoned"], ["par", "Paralysed"], ["slp", "Asleep"], ["frz", "Frozen"]], m.status,
        (v) => { m.status = v; update(); }),
      h("label", {}, "HP %"), h("input", { type: "number", min: 1, max: 100, value: m.hpPct, onchange: (e) => { m.hpPct = clamp(+e.target.value, 1, 100); render(); update(); } }),
      h("span", { class: "muted small" }, `${prep.curHP}/${prep.maxHP}`));

    const toggles = h("div", { class: "row small" },
      check("Flash Fire on", m.flashFire, (v) => (m.flashFire = v)),
      check("Ambush ready", m.ambush, (v) => (m.ambush = v)),
      check("Just switched in", m.switchedIn, (v) => (m.switchedIn = v)));
    const sideRow = h("div", { class: "row small" },
      check("Reflect", s.side.reflect, (v) => (s.side.reflect = v)),
      check("Light Screen", s.side.lightScreen, (v) => (s.side.lightScreen = v)),
      check("Aurora Veil", s.side.auroraVeil, (v) => (s.side.auroraVeil = v)),
      check("Helping Hand", s.side.helpingHand, (v) => (s.side.helpingHand = v)),
      check("Tailwind", s.side.tailwind, (v) => (s.side.tailwind = v)));

    const moveRows = m.moves.map((mv, i) => {
      const md = G.moves[mv];
      const multi = md && md.flags && md.flags.includes("multiHit");
      return h("div", { class: "row" },
        md ? typeBadge(md.type) : h("span", { class: "type", style: "background:var(--line)" }, "-"),
        h("input", { list: "dl-moves", value: md ? md.name : "", placeholder: `Move ${i + 1}`, style: "flex:1;min-width:0",
          onchange: (e) => { m.moves[i] = nameToMove.get(e.target.value) || ""; render(); update(); } }),
        md && md.bp > 1 ? h("span", { class: "muted small mono" }, md.bp) : null,
        check("Crit", m.crit[i], (v) => (m.crit[i] = v)),
        multi && m.ability !== "SKILL_LINK" ? sel([["0", "auto"], ["2", "2 hits"], ["3", "3 hits"], ["4", "4 hits"], ["5", "5 hits"]], String(m.hits[i] || 0),
          (v) => { m.hits[i] = +v; update(); }) : null);
    });

    root.replaceChildren(...[
      h("h2", {}, title), loadBox, chips,
      h("div", { class: "row" }, sprite(m.species, "sprite-lg"), h("div", { style: "flex:1;min-width:0" },
        h("div", { class: "row" }, speciesInput), h("div", { class: "row" }, sp.types.map(typeBadge)))),
      caps, natureRow, abilityRow, desc ? h("div", { class: "muted small", style: "margin:-.2rem 0 .3rem 4.9rem" }, desc) : null,
      itemRow, h("div", { class: "stats", style: "margin:.6rem 0" }, statRows), statusRow, toggles,
      h("h3", {}, "Moves"), h("div", { class: "moves" }, moveRows),
      h("h3", {}, "This side's field"), sideRow].filter(Boolean));
    store(`calc:${id}`, s.mon);
  }

  function check(label, value, set) {
    return h("label", {}, h("input", { type: "checkbox", checked: value ? true : null, onchange: (e) => { set(e.target.checked); update(); } }), " ", label);
  }

  s.render = render;
  return s;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
function findTrainer(id) {
  for (const f of T.floors) for (const p of f.places) for (const t of p.trainers) if (t.id === id) return t;
  return null;
}

// --------------------------------------------------------------------------------------------- results
function field() {
  return { weather: document.getElementById("f-weather").value, terrain: document.getElementById("f-terrain").value,
    doubles: document.getElementById("f-format").value === "doubles", gravity: document.getElementById("f-gravity").checked };
}

function update() {
  const f = field();
  const a = SIDES["side-a"], b = SIDES["side-b"];
  renderResults("res-a", a, b, f, `${G.species[a.mon.species].name}'s moves`);
  renderResults("res-b", b, a, f, `${G.species[b.mon.species].name}'s moves`);
  showDetail();
}

function runCalc(att, def, i, f) {
  const mv = att.mon.moves[i];
  if (!mv) return null;
  return C().calculate(G, att.mon, def.mon, mv, Object.assign({}, f, { attSide: att.side, defSide: def.side }),
    { crit: att.mon.crit[i], hits: att.mon.hits[i] || 0 });
}

function renderResults(elId, att, def, f, title) {
  const el = document.getElementById(elId);
  const rows = att.mon.moves.map((mv, i) => {
    if (!mv) return null;
    let r;
    try { r = runCalc(att, def, i, f); } catch (e) { return h("div", { class: "result" }, `${mv}: ${e.message}`); }
    if (!r) return null;
    const on = selected && selected[0] === att.id && selected[1] === i;
    const pct = r.status ? "-" : r.eff === 0 ? "0%" : `${r.minPct.toFixed(1)} - ${r.maxPct.toFixed(1)}%`;
    return h("button", { class: "result" + (on ? " on" : ""), onclick: () => { selected = [att.id, i]; update(); } },
      h("span", { class: "pct" }, pct), h("span", { class: "mv" }, r.move.name),
      h("span", { class: "ko" }, r.status ? "status move" : r.eff === 0 ? "no effect" : `${r.min}-${r.max} · ${r.ko.text}${r.eff > 1 ? " · super effective" : r.eff < 1 ? " · not very effective" : ""}`));
  }).filter(Boolean);
  el.replaceChildren(h("h3", { style: "margin-top:.6rem" }, title), ...(rows.length ? rows : [h("p", { class: "muted small" }, "No moves picked.")]));
}

function showDetail() {
  const box = document.getElementById("detail");
  if (!selected) return;
  const [sid, i] = selected;
  const att = SIDES[sid], def = SIDES[sid === "side-a" ? "side-b" : "side-a"];
  let r;
  try { r = runCalc(att, def, i, field()); } catch (e) { box.textContent = e.message; return; }
  if (!r) { box.textContent = "Pick a move to see the full calculation."; return; }
  if (r.status) { box.textContent = r.desc; return; }
  const lines = [r.desc];
  if (r.hits.length > 1) lines.push(`Per hit: ${r.hits.map((x) => `${x.rolls[0]}-${x.rolls[15]}`).join(", ")}`);
  else if (!r.hits[0].fixed && r.eff) lines.push(`Possible damage amounts: (${r.hits[0].rolls.join(", ")})`);
  if (r.recoil) lines.push(`Recoil: ${r.recoil[0]}-${r.recoil[1]} HP (${pctOf(r.recoil, r.att.maxHP)})`);
  if (r.drain) lines.push(`Drains: ${r.drain[0]}-${r.drain[1]} HP (${pctOf(r.drain, r.att.maxHP)})`);
  if (r.lifeOrb) lines.push(`Life Orb: ${r.lifeOrb} HP recoil`);
  lines.push(`Speed: ${G.species[r.att.species].name} ${r.attSpe} vs ${G.species[r.def.species].name} ${r.defSpe}`);
  box.textContent = lines.join("\n");
}
const pctOf = ([a, b], max) => `${((100 * a) / max).toFixed(1)} - ${((100 * b) / max).toFixed(1)}%`;

// ------------------------------------------------------------------------------------------------ start
async function init() {
  [G, T] = await Promise.all([loadJSON("game.json"), loadJSON("trainers.json")]);
  const dls = document.getElementById("dl-species"), dlm = document.getElementById("dl-moves");
  for (const [k, sp] of Object.entries(G.species)) {
    const n = nameToSpecies.has(sp.name) ? `${sp.name} [${k}]` : sp.name;
    nameToSpecies.set(n, k);
    dls.append(h("option", { value: n }));
  }
  const dla = document.getElementById("dl-abilities");
  for (const [k, ab] of Object.entries(G.abilities)) {
    if (nameToAbility.has(ab.name)) continue;
    nameToAbility.set(ab.name, k);
    dla.append(h("option", { value: ab.name }));
  }
  for (const [k, mv] of Object.entries(G.moves)) {
    if (nameToMove.has(mv.name)) continue;
    nameToMove.set(mv.name, k);
    dlm.append(h("option", { value: mv.name }));
  }
  const saved = store("calc:side-a");
  const a = Side("side-a", "Your Pokémon", saved && G.species[saved.species] ? saved : fromSet({ species: "CHIKORITA", level: G.caps[0], nature: "Modest", ability: "ILLUMINATE", moves: ["RAZOR_LEAF", "POISON_POWDER", "SYNTHESIS", "TACKLE"] }));
  const b = Side("side-b", "Opponent", fromSet(T.floors[0].places[0]?.trainers[0]?.normal[0] || { species: "ZUBAT", level: 21, nature: "Hardy", ability: "INNER_FOCUS", moves: [] }));
  // calc.html#t=TRAINER_ID&d=hard&i=0 opens that trainer's Pokémon as the opponent
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.get("t")) {
    const t = findTrainer(q.get("t"));
    const d = q.get("d") === "hard" ? "hard" : "normal";
    const set = t?.[d]?.[+q.get("i") || 0];
    if (set) {
      b.mon = fromSet(set); b.loadTrainer = t.id; b.diff = d;
      b.loadFloor = String(T.floors.find((f) => f.places.some((p) => p.trainers.includes(t))).floor);
    }
  }
  a.render(); b.render();
  ["f-weather", "f-terrain", "f-format", "f-gravity"].forEach((id) => document.getElementById(id).addEventListener("change", update));
  selected = ["side-a", 0];
  update();
}
document.addEventListener("DOMContentLoaded", () => init().catch((e) => {
  document.querySelector("main").append(h("p", { class: "gate" }, `Couldn't load the game data (${e.message}). `,
    "If you opened this file directly, serve the folder instead (see README)."));
}));
