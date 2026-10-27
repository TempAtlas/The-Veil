// The damage calculator page, laid out like Pokémon Showdown's calculator: Pokémon 1 | moves, results and field |
// Pokémon 2, with the selected result across the top. The maths is in calc-engine.js.
let G, T;
const C = () => window.VeilCalc;
const P = {};                     // "p1" / "p2" -> panel state
let selected = ["p1", 0];
const FIELD = { format: "", terrain: "", weather: "", gravity: false };
const SIDE = { p1: { stealthRock: false, spikes: 0, reflect: false, lightScreen: false, auroraVeil: false, helpingHand: false, tailwind: false },
  p2: { stealthRock: false, spikes: 0, reflect: false, lightScreen: false, auroraVeil: false, helpingHand: false, tailwind: false } };

const SETS = new Map();           // datalist label -> {species} or a trainer set
const nameToMove = new Map(), nameToAbility = new Map();
const other = (id) => (id === "p1" ? "p2" : "p1");
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, isNaN(v) ? lo : v));
const label = (id) => (id === "p1" ? "Pokémon 1" : "Pokémon 2");

function blankMon(species) {
  const sp = G.species[species];
  return { species, types: null, level: G.caps[0], nature: "Hardy", ability: sp.abilities[0] || "", item: "",
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, boosts: {}, status: "", hpPct: 100,
    moves: ["", "", "", ""], over: [{}, {}, {}, {}], crit: [false, false, false, false], hits: [0, 0, 0, 0] };
}
function fromSet(set) {
  return Object.assign(blankMon(set.species), { level: set.level, nature: set.nature, ability: set.ability,
    item: set.item || "", moves: [...set.moves, "", "", "", ""].slice(0, 4), setLabel: set.label || null });
}

// ------------------------------------------------------------------------------------------------- a panel
function sel(id, options, value, onchange, cls) {
  return h("select", { id, class: cls || null, onchange: (e) => onchange(e.target.value) },
    options.map(([v, text]) => h("option", { value: v, selected: String(v) === String(value) ? true : null }, text)));
}

function renderPanel(id) {
  const m = P[id].mon, sp = G.species[m.species];
  const prep = C().prepare(G, m);
  const types = m.types || sp.types;
  const typeOpts = [["", "(none)"], ...C().TYPES.map((t) => [t, titleCase(t)])];
  const root = document.getElementById(id);

  // set search: a species, or a trainer's set
  const search = h("input", { id: `${id}-set`, list: "dl-sets", value: m.setLabel || sp.name, autocomplete: "off",
    class: "sc-set", "aria-label": `${label(id)}: Pokémon or set`,
    onfocus: (e) => e.target.select(),
    onchange: (e) => {
      const hit = SETS.get(e.target.value);
      if (!hit) return;
      P[id].mon = hit.moves ? fromSet(hit) : Object.assign(blankMon(hit.species), { level: m.level });
      renderPanel(id); update();
    } });

  const rows = [];
  const row = (name, ...kids) => rows.push(h("div", { class: "sc-row" }, h("span", { class: "sc-l" }, name), h("div", { class: "sc-v" }, ...kids)));

  row("Type", sel(`${id}-t1`, typeOpts.slice(1), types[0], (v) => { m.types = [v, types[1]].filter(Boolean); renderPanel(id); update(); }),
    sel(`${id}-t2`, typeOpts, types[1] || "", (v) => { m.types = [types[0], v].filter(Boolean); renderPanel(id); update(); }));
  row("Level", h("input", { id: `${id}-lv`, type: "number", min: 1, max: 100, value: m.level, class: "sc-num",
    onchange: (e) => { m.level = clamp(+e.target.value, 1, 100); renderPanel(id); update(); } }),
    h("span", { class: "sc-caps" }, G.caps.map((c) => h("button", { class: "sc-mini" + (m.level === c ? " on" : ""), title: "a level cap",
      onclick: () => { m.level = c; renderPanel(id); update(); } }, c))));

  // stats
  const [up, down] = C().NATURES[m.nature] || [];
  const stats = [h("span"), h("span", { class: "sc-th" }, "Base"), h("span", { class: "sc-th" }, "IVs"), h("span", { class: "sc-th" }, "Stat"), h("span", { class: "sc-th" }, "")];
  C().STATS.forEach((st, i) => {
    const stage = m.boosts[st] || 0;
    stats.push(h("span", { class: "sc-stat " + (up === st ? "plus" : down === st ? "minus" : "") }, C().STAT_LABEL[st]),
      h("span", { class: "sc-base" }, sp.bs[i]),
      h("input", { id: `${id}-iv-${st}`, type: "number", min: 0, max: 31, value: m.ivs[st], class: "sc-num",
        onchange: (e) => { m.ivs[st] = clamp(+e.target.value, 0, 31); renderPanel(id); update(); } }),
      h("strong", { class: "sc-final" }, st === "hp" ? prep.stats.hp : C().boosted(prep.stats[st], stage)),
      st === "hp" ? h("span") : sel(`${id}-bst-${st}`, [6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5, -6].map((b) => [b, b > 0 ? `+${b}` : String(b)]),
        stage, (v) => { m.boosts[st] = +v; renderPanel(id); update(); }, "sc-boost" + (stage > 0 ? " plus" : stage < 0 ? " minus" : "")));
  });
  const fieldFor = Object.assign({}, FIELD, { weather: FIELD.weather, terrain: FIELD.terrain });
  const spe = C().speed(G, Object.assign(prep, { tailwind: SIDE[id].tailwind }), fieldFor);

  const natureOpts = Object.entries(C().NATURES).map(([n, [u, d]]) => [n, u ? `${n} (+${C().STAT_LABEL[u]}, -${C().STAT_LABEL[d]})` : n]);
  const abilities = [...new Set([...sp.abilities, m.ability].filter(Boolean))];
  const items = [["", "(none)"], ...Object.entries(G.items).map(([k, it]) => [k, it.name]).sort((a, b) => a[1].localeCompare(b[1]))];

  const after = [];
  const arow = (name, ...kids) => after.push(h("div", { class: "sc-row" }, h("span", { class: "sc-l" }, name), h("div", { class: "sc-v" }, ...kids)));
  arow("Nature", sel(`${id}-nature`, natureOpts, m.nature, (v) => { m.nature = v; renderPanel(id); update(); }));
  arow("Ability", P[id].otherAbility
    ? h("input", { id: `${id}-ab-any`, list: "dl-abilities", placeholder: "Any ability", autocomplete: "off",
      onchange: (e) => { const k = nameToAbility.get(e.target.value); if (k) { m.ability = k; P[id].otherAbility = false; renderPanel(id); update(); } } })
    : sel(`${id}-ability`, [...abilities.map((a) => [a, G.abilities[a]?.name || a]), ["__other", "Other…"]], m.ability, (v) => {
      if (v === "__other") P[id].otherAbility = true; else m.ability = v;
      renderPanel(id); update();
    }));
  if (G.abilities[m.ability]?.desc) after.push(h("div", { class: "sc-desc" }, G.abilities[m.ability].desc));
  arow("Item", sel(`${id}-item`, items, m.item, (v) => { m.item = v; renderPanel(id); update(); }));
  arow("Status", sel(`${id}-status`, [["", "Healthy"], ["psn", "Poisoned"], ["tox", "Badly Poisoned"], ["brn", "Burned"], ["par", "Paralyzed"], ["slp", "Asleep"], ["frz", "Frozen"]],
    m.status, (v) => { m.status = v; renderPanel(id); update(); }));
  arow("Current HP",
    h("input", { id: `${id}-hp`, type: "number", min: 1, max: prep.maxHP, value: prep.curHP, class: "sc-num",
      onchange: (e) => { m.hpPct = (100 * clamp(+e.target.value, 1, prep.maxHP)) / prep.maxHP; renderPanel(id); update(); } }),
    h("span", { class: "muted" }, `/${prep.maxHP}`),
    h("input", { id: `${id}-hppct`, type: "number", min: 1, max: 100, value: Math.round((100 * prep.curHP) / prep.maxHP), class: "sc-num",
      onchange: (e) => { m.hpPct = clamp(+e.target.value, 1, 100); renderPanel(id); update(); } }), h("span", { class: "muted" }, "%"));
  const pct = (100 * prep.curHP) / prep.maxHP;
  after.push(h("div", { class: "hpbar" }, h("span", { style: `width:${pct}%;background:${pct > 50 ? "var(--good)" : pct > 20 ? "var(--gold)" : "var(--bad)"}` })));
  after.push(h("div", { class: "sc-flags" },
    flag(`${id}-ff`, "Flash Fire on", m.flashFire, (v) => (m.flashFire = v)),
    flag(`${id}-amb`, "Ambush ready", m.ambush, (v) => (m.ambush = v)),
    flag(`${id}-sw`, "Just switched in", m.switchedIn, (v) => (m.switchedIn = v))));

  // moves: name, power, type, category, crit (and hits for 2-5 hit moves)
  const moves = m.moves.map((mv, i) => {
    const md = G.moves[mv] || null;
    const o = m.over[i] || (m.over[i] = {});
    const multi = md && md.flags && md.flags.includes("multiHit") && m.ability !== "SKILL_LINK";
    return h("div", { class: "sc-move" },
      h("input", { id: `${id}-mv${i}`, list: "dl-moves", value: md ? md.name : "", placeholder: "(No Move)", autocomplete: "off", class: "sc-mvname",
        onfocus: (e) => e.target.select(),
        onchange: (e) => { m.moves[i] = nameToMove.get(e.target.value) || ""; m.over[i] = {}; m.hits[i] = 0; renderPanel(id); update(); } }),
      h("input", { id: `${id}-bp${i}`, type: "number", min: 0, max: 999, class: "sc-num sc-bp", value: md ? (o.bp ?? md.bp) : "", title: "Base power",
        disabled: md ? null : true, onchange: (e) => { o.bp = e.target.value === "" ? null : +e.target.value; update(); } }),
      sel(`${id}-ty${i}`, C().TYPES.map((t) => [t, titleCase(t)]), md ? (o.type || md.type) : "NORMAL", (v) => { o.type = v; update(); }, "sc-mvtype"),
      sel(`${id}-cat${i}`, [["Physical", "Physical"], ["Special", "Special"], ["Status", "Status"]], md ? (o.cat || md.cat) : "Physical", (v) => { o.cat = v; update(); }, "sc-mvcat"),
      h("label", { class: "sc-crit", title: "Critical hit" }, h("input", { id: `${id}-crit${i}`, type: "checkbox", checked: m.crit[i] ? true : null,
        onchange: (e) => { m.crit[i] = e.target.checked; update(); } }), "Crit"),
      multi ? sel(`${id}-hits${i}`, [[0, "auto"], [2, "2 hits"], [3, "3 hits"], [4, "4 hits"], [5, "5 hits"]], m.hits[i] || 0, (v) => { m.hits[i] = +v; update(); }, "sc-hits") : null);
  });

  root.replaceChildren(...[
    h("div", { class: "sc-panel-head" }, h("div", { class: "sc-h" }, label(id)), h("span", { class: "muted small" }, `Speed ${spe}`)),
    h("div", { class: "sc-pick" }, sprite(m.species, "sc-sprite"), search),
    ...rows,
    h("div", { class: "sc-stats" }, stats),
    ...after,
    h("div", { class: "sc-h", style: "margin-top:.6rem" }, "Moves"),
    ...moves,
  ].filter(Boolean));
  store(`calc:${id}`, m);
}

function flag(id, text, value, set) {
  return h("label", { class: "sc-check" }, h("input", { id, type: "checkbox", checked: value ? true : null,
    onchange: (e) => { set(e.target.checked); update(); } }), " ", text);
}

// ------------------------------------------------------------------------------------------------- field
function renderField() {
  const groups = {
    format: [["", "Singles"], ["doubles", "Doubles"]],
    terrain: [["", "None"], ["electric", "Electric"], ["grassy", "Grassy"], ["psychic", "Psychic"], ["misty", "Misty"]],
    weather: [["", "None"], ["sun", "Sun"], ["rain", "Rain"], ["sand", "Sand"], ["snow", "Snow"], ["hail", "Hail"]],
  };
  document.querySelectorAll(".sc-btnrow").forEach((rowEl) => {
    const key = rowEl.dataset.key;
    rowEl.replaceChildren(rowEl.firstElementChild, h("div", { class: "seg sc-seg" }, groups[key].map(([v, text]) =>
      h("button", { class: FIELD[key] === v ? "on" : null, onclick: () => { FIELD[key] = v; renderField(); renderPanel("p1"); renderPanel("p2"); update(); } }, text))));
  });
  for (const id of ["p1", "p2"]) {
    const s = SIDE[id];
    const box = document.getElementById(`side-${id}`);
    const tog = (key, text) => h("label", { class: "sc-check" }, h("input", { id: `side-${id}-${key}`, type: "checkbox", checked: s[key] ? true : null,
      onchange: (e) => { s[key] = e.target.checked; renderPanel(id); update(); } }), " ", text);
    box.replaceChildren(h("div", { class: "sc-sub" }, `${label(id)}'s side`),
      tog("stealthRock", "Stealth Rock"),
      h("div", { class: "sc-check" }, "Spikes ", h("span", { class: "seg sc-seg" }, [0, 1, 2, 3].map((n) =>
        h("button", { class: s.spikes === n ? "on" : null, onclick: () => { s.spikes = n; renderField(); update(); } }, n)))),
      tog("reflect", "Reflect"), tog("lightScreen", "Light Screen"), tog("auroraVeil", "Aurora Veil"),
      tog("helpingHand", "Helping Hand"), tog("tailwind", "Tailwind"));
  }
}

// ------------------------------------------------------------------------------------------------ results
function field() {
  return { weather: FIELD.weather, terrain: FIELD.terrain, doubles: FIELD.format === "doubles", gravity: FIELD.gravity };
}

function runCalc(attId, i) {
  const att = P[attId].mon, def = P[other(attId)].mon;
  const mv = att.moves[i];
  if (!mv) return null;
  return C().calculate(G, att, def, mv, Object.assign(field(), { attSide: SIDE[attId], defSide: SIDE[other(attId)] }),
    { crit: att.crit[i], hits: att.hits[i] || 0, override: att.over[i] });
}

function moveList(attId) {
  const box = document.getElementById(`moves-${attId}`);
  document.getElementById(`moves-${attId}-title`).textContent = `${G.species[P[attId].mon.species].name}'s moves`;
  const items = P[attId].mon.moves.map((mv, i) => {
    if (!mv) return null;
    let r = null, err = null;
    try { r = runCalc(attId, i); } catch (e) { err = e.message; }
    const on = selected[0] === attId && selected[1] === i;
    const pct = err ? "error" : !r ? "" : r.status ? "" : r.eff === 0 ? "0%" : `${r.minPct.toFixed(1)} - ${r.maxPct.toFixed(1)}%`;
    return h("button", { class: "sc-res" + (on ? " on" : ""), role: "radio", "aria-checked": on ? "true" : "false",
      onclick: () => { selected = [attId, i]; update(); } },
      h("span", { class: "sc-res-name" }, G.moves[mv]?.name || mv), h("span", { class: "sc-res-pct" }, pct));
  }).filter(Boolean);
  box.replaceChildren(...(items.length ? items : [h("div", { class: "muted small" }, "No moves")]));
}

function mainResult() {
  const text = document.getElementById("result-text"), rolls = document.getElementById("result-rolls");
  const [id, i] = selected;
  let r = null;
  try { r = runCalc(id, i); } catch (e) { text.textContent = e.message; rolls.textContent = ""; return; }
  if (!r) { text.textContent = "Select a move."; rolls.textContent = ""; return; }
  text.textContent = r.desc;
  if (r.status) { rolls.textContent = ""; return; }
  const extra = [];
  if (r.hits.length > 1) extra.push(`Per hit: ${r.hits.map((x) => `${x.rolls[0]}-${x.rolls[15]}`).join(", ")}`);
  else if (!r.hits[0].fixed && r.eff) extra.push(`Possible damage amounts: (${r.hits[0].rolls.join(", ")})`);
  const pct = ([a, b], max) => `${((100 * a) / max).toFixed(1)} - ${((100 * b) / max).toFixed(1)}%`;
  if (r.recoil) extra.push(`${r.recoil[0]}-${r.recoil[1]} (${pct(r.recoil, r.att.maxHP)}) recoil damage`);
  if (r.drain) extra.push(`Recovers ${r.drain[0]}-${r.drain[1]} (${pct(r.drain, r.att.maxHP)})`);
  if (r.lifeOrb) extra.push(`${r.lifeOrb} (${((100 * r.lifeOrb) / r.att.maxHP).toFixed(1)}%) Life Orb damage`);
  rolls.textContent = extra.join("\n");
}

function update() { moveList("p1"); moveList("p2"); mainResult(); }

function findTrainer(tid) {
  for (const f of T.floors) for (const p of f.places) for (const t of p.trainers) if (t.id === tid) return { t, floor: f.floor };
  return null;
}

// ------------------------------------------------------------------------------------------------- start
async function init() {
  [G, T] = await Promise.all([loadJSON("game.json"), loadJSON("trainers.json")]);
  const dls = document.getElementById("dl-sets");
  for (const [k, sp] of Object.entries(G.species)) {
    const n = SETS.has(sp.name) ? `${sp.name} [${k}]` : sp.name;
    SETS.set(n, { species: k });
    dls.append(h("option", { value: n }));
  }
  // every trainer's set, Showdown-style: "Mareanie (Delver Mara, F1 Hard)"
  for (const f of T.floors) for (const p of f.places) for (const t of p.trainers) {
    for (const d of ["normal", "hard"]) {
      t[d].forEach((set, i) => {
        if (d === "hard" && JSON.stringify(set) === JSON.stringify(t.normal.find((n) => n.species === set.species))) return;
        const name = G.species[set.species]?.name || set.species;
        let lab = `${name} (${t.title}, F${f.floor} ${d === "hard" ? "Hard" : "Normal"})`;
        if (SETS.has(lab)) lab += ` #${i + 1}`;
        SETS.set(lab, Object.assign({}, set, { label: lab }));
        dls.append(h("option", { value: lab }));
      });
    }
  }
  const dla = document.getElementById("dl-abilities");
  for (const [k, ab] of Object.entries(G.abilities)) if (!nameToAbility.has(ab.name)) { nameToAbility.set(ab.name, k); dla.append(h("option", { value: ab.name })); }
  const dlm = document.getElementById("dl-moves");
  for (const [k, mv] of Object.entries(G.moves)) if (!nameToMove.has(mv.name)) { nameToMove.set(mv.name, k); dlm.append(h("option", { value: mv.name })); }

  const ok = (m) => m && G.species[m.species] && Array.isArray(m.over);
  const s1 = store("calc:p1"), s2 = store("calc:p2");
  P.p1 = { mon: ok(s1) ? s1 : fromSet({ species: "CHIKORITA", level: G.caps[0], nature: "Modest", ability: "ILLUMINATE", moves: ["RAZOR_LEAF", "POISON_POWDER", "SYNTHESIS", "TACKLE"] }) };
  const firstSet = T.floors[0].places[0]?.trainers[0]?.normal[0];
  P.p2 = { mon: ok(s2) ? s2 : fromSet(firstSet) };
  // calc.html#t=TRAINER_ID&d=hard&i=0 opens that trainer's Pokémon as Pokémon 2 (the docs' "calc ›" links)
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.get("t")) {
    const found = findTrainer(q.get("t"));
    const d = q.get("d") === "hard" ? "hard" : "normal";
    const set = found?.t[d]?.[+q.get("i") || 0];
    if (set) P.p2.mon = fromSet(Object.assign({}, set, { label: `${G.species[set.species].name} (${found.t.title}, F${found.floor} ${d === "hard" ? "Hard" : "Normal"})` }));
  }
  document.getElementById("f-gravity").addEventListener("change", (e) => { FIELD.gravity = e.target.checked; update(); });
  renderField(); renderPanel("p1"); renderPanel("p2");
  update();
}
document.addEventListener("DOMContentLoaded", () => init().catch((e) => {
  document.getElementById("result-text").textContent = `Couldn't load the game data (${e.message}). If you opened this file directly, serve the folder instead (see README).`;
}));
