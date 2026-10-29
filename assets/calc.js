// The damage calculator page, laid out like Pokémon Showdown's calculator: Pokémon 1 | moves, results and field |
// Pokémon 2, with the selected result across the top. The maths is in calc-engine.js. Above Pokémon 1: your party and
// PC boxes from your save (save.js, read in the browser); above Pokémon 2: the opponents, area by area.
let G, T, D;
const C = () => window.VeilCalc;
const P = {};                     // "p1" / "p2" -> panel state
let selected = ["p1", 0];
const FIELD = { format: "", terrain: "", weather: "", gravity: false, magicRoom: false, wonderRoom: false };
// each side's conditions (the attacker's: Helping Hand, Battery, Power Spot, Steely Spirit, Charge, Flower Gift; the
// target's: hazards, screens, Friend Guard, Flower Gift, Foresight)
const sideDefaults = () => ({ stealthRock: false, spikes: 0, reflect: false, lightScreen: false, auroraVeil: false,
  helpingHand: false, tailwind: false, battery: false, powerSpot: false, steelySpirit: false, charge: false,
  flowerGift: false, friendGuard: false, foresight: false });
const SIDE = { p1: sideDefaults(), p2: sideDefaults() };

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
    item: set.item || "", moves: [...set.moves, "", "", "", ""].slice(0, 4), setLabel: set.label || null,
    // (a trainer's set remembers whose it is: the finder lights it, Normal / Hard swaps it)
    tid: set.tid || null, idx: set.idx ?? null, diff: set.diff || null, floor: set.floor || null });
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
      if (id === "p2") { followTrainer(P.p2.mon); renderFinder(); }
      if (id === "p1") renderMine();
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
    // (2026-10-29, the author: no "Pokémon 1" / "Pokémon 2" heading - the panel's own Pokémon names it)
    h("div", { class: "sc-panel-head sc-panel-head-r" }, h("span", { class: "muted small" }, `Speed ${spe}`)),
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
      tog("helpingHand", "Helping Hand"), tog("tailwind", "Tailwind"),
      tog("battery", "Ally's Battery"), tog("powerSpot", "Ally's Power Spot"), tog("steelySpirit", "Ally's Steely Spirit"),
      tog("friendGuard", "Ally's Friend Guard"), tog("flowerGift", "Flower Gift"), tog("charge", "Charge"),
      tog("foresight", "Foresight (on it)"));
  }
  for (const [key, text] of [["magicRoom", "Magic Room"], ["wonderRoom", "Wonder Room"]]) {
    const el = document.getElementById(`f-${key}`);
    if (el) el.checked = FIELD[key];
  }
}

// ------------------------------------------------------------------------------------------------ results
function field() {
  return { weather: FIELD.weather, terrain: FIELD.terrain, doubles: FIELD.format === "doubles", gravity: FIELD.gravity,
    magicRoom: FIELD.magicRoom, wonderRoom: FIELD.wonderRoom };
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
  for (const f of T.floors) for (const p of f.places) for (const t of p.trainers) if (t.id === tid) return { t, floor: f.floor, place: p.place };
  return null;
}

// ------------------------------------------------------------------------------------------ party icons
// the game's own menu icons (assets/icons.png, build_site_data.py): 32 to a row, 32 x 32 each, by the species' cell
function icon(species) {
  // (a form with no icon of its own - Pikachu's costumes - shows its base form's)
  const n = G.species[species]?.icon ?? G.species[String(species).split("_")[0]]?.icon;
  if (n == null) return h("span", { class: "sc-icon", style: "background:none" });
  return h("span", { class: "sc-icon", style: `background-position:-${(n % 32) * 32}px -${Math.floor(n / 32) * 32}px` });
}
function iconButton(species, tip, on, onclick) {
  return h("button", { class: "sc-ibtn" + (on ? " on" : ""), title: tip, "aria-label": tip, onclick }, icon(species));
}
const setTip = (s) => `${s.nickname && s.nickname !== G.species[s.species]?.name ? s.nickname + " - " : ""}${G.species[s.species]?.name} Lv ${s.level}`
  + (s.item ? ` @ ${G.items[s.item]?.name || s.item}` : "") + (s.moves?.length ? `\n${s.moves.map((m) => G.moves[m]?.name || m).join(", ")}` : "");

// ------------------------------------------------------------------------------- your Pokémon (the save)
const MINE = { save: null, box: 0, error: "" };     // save: { party, boxes } (save.js), kept in this browser

function fromSaveMon(s) {
  return Object.assign(blankMon(s.species), { level: s.level, nature: s.nature, ability: s.ability, item: s.item || "",
    ivs: Object.assign({}, s.ivs), moves: [...s.moves, "", "", "", ""].slice(0, 4), hpPct: s.hpPct || 100,
    setLabel: `${s.nickname || G.species[s.species].name} (your ${G.species[s.species].name})`, mine: s });
}

function loadSaveFile(file) {
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      MINE.save = window.VeilSave.read(rd.result, G);
      MINE.error = "";
      MINE.box = Math.max(0, MINE.save.boxes.findIndex((b) => b.mons.some(Boolean)));
      store("calc:save", MINE.save);
      if (MINE.save.party[0]) { P.p1.mon = fromSaveMon(MINE.save.party[0]); renderPanel("p1"); update(); }
    } catch (e) { MINE.error = e.message; }
    renderMine();
  };
  rd.readAsArrayBuffer(file);
}

function renderMine() {
  const root = document.getElementById("mine");
  const pick = () => document.getElementById("save-file").click();
  const cur = P.p1?.mon?.mine;
  const btn = (s) => iconButton(s.species, setTip(s), cur && JSON.stringify(cur) === JSON.stringify(s), () => {
    P.p1.mon = fromSaveMon(s); renderPanel("p1"); renderMine(); update();
  });
  const head = h("div", { class: "sc-panel-head" }, h("div", { class: "sc-h" }, "Your Pokémon"),
    h("span", {}, h("button", { class: "sc-mini", onclick: pick }, "Import .sav"),
      MINE.save ? h("button", { class: "sc-mini", onclick: () => { MINE.save = null; store("calc:save", null); renderMine(); } }, "Clear") : null));
  if (!MINE.save) {
    root.replaceChildren(...[head, h("div", { class: "sc-drop", id: "save-drop", onclick: pick, role: "button", tabindex: 0 },
      "Drop your save file here (or anywhere on the page) to load your party and PC boxes. ",
      h("span", { class: "muted" }, "It's read in your browser and never uploaded.")),
      MINE.error ? h("div", { class: "small", style: "color:var(--bad);margin-top:.3rem" }, MINE.error) : null].filter(Boolean));
    return;
  }
  const boxes = MINE.save.boxes;
  const box = boxes[MINE.box] || { mons: [] };
  // (2026-10-29, the author: drag Pokémon between the box and the party) every slot takes a drop: the two swap
  const party = [...MINE.save.party, ...Array(6).fill(null)].slice(0, 6);
  const slot = (s, where, i) => {
    const el = s ? btn(s) : h("span", { class: "sc-ibtn empty", "aria-label": "Empty slot" },
      h("span", { class: "sc-icon", style: "background:none" }));
    if (s) {
      el.draggable = true;
      el.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("application/x-veil-slot", JSON.stringify({ where, box: MINE.box, i }));
        e.dataTransfer.effectAllowed = "move";
        el.classList.add("dragging");
      });
      el.addEventListener("dragend", () => el.classList.remove("dragging"));
    }
    el.addEventListener("dragover", (e) => {
      if (![...e.dataTransfer.types].includes("application/x-veil-slot")) return;
      e.preventDefault(); e.dataTransfer.dropEffect = "move"; el.classList.add("over");
    });
    el.addEventListener("dragleave", () => el.classList.remove("over"));
    el.addEventListener("drop", (e) => {
      const raw = e.dataTransfer.getData("application/x-veil-slot");
      if (!raw) return;
      e.preventDefault(); e.stopPropagation();
      moveMon(JSON.parse(raw), { where, box: MINE.box, i });
    });
    return el;
  };
  root.replaceChildren(head,
    h("div", { class: "sc-sub muted small" }, "Party ", h("span", { class: "sc-hint" }, "· drag to move between the party and boxes")),
    h("div", { class: "sc-icons" }, party.map((s, i) => slot(s, "party", i))),
    h("div", { class: "sc-row2" }, h("span", { class: "muted small" }, "Box"),
      sel("mine-box", boxes.map((b, i) => [i, `${b.name} (${b.mons.filter(Boolean).length})`]), MINE.box,
        (v) => { MINE.box = +v; renderMine(); })),
    h("div", { class: "sc-grid" }, box.mons.map((s, i) => slot(s, "box", i))));
}

// a dragged Pokémon onto another slot: the two trade places (the party closes up; it never empties)
function moveMon(from, to) {
  const sv = MINE.save;
  const party = [...sv.party, ...Array(6).fill(null)].slice(0, 6);
  const get = (p) => (p.where === "party" ? party[p.i] : sv.boxes[p.box].mons[p.i]);
  const put = (p, v) => { if (p.where === "party") party[p.i] = v; else sv.boxes[p.box].mons[p.i] = v; };
  if (from.where === to.where && from.i === to.i && from.box === to.box) return;
  const a = get(from), b = get(to);
  put(to, a); put(from, b);
  const next = party.filter(Boolean);
  if (!next.length) { put(from, a); put(to, b); return; }          // (the last one can't leave the party)
  sv.party = next;
  store("calc:save", sv);
  renderMine();
}

function dropAnywhere() {
  const veil = document.getElementById("dropveil");
  let depth = 0;
  const isFile = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  document.addEventListener("dragenter", (e) => { if (isFile(e)) { depth++; veil.hidden = false; } });
  document.addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; veil.hidden = true; } });
  document.addEventListener("dragover", (e) => { if (isFile(e)) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    if (!isFile(e)) return;
    e.preventDefault(); depth = 0; veil.hidden = true;
    loadSaveFile(e.dataTransfer.files[0]);
  });
  document.getElementById("save-file").addEventListener("change", (e) => { loadSaveFile(e.target.files[0]); e.target.value = ""; });
}

// ----------------------------------------------------------------------------- the opponents, by area
const FIND = { floor: 1, area: "", diff: "normal" };

function areasOf(floor) {
  const f = T.floors.find((x) => x.floor === floor);
  const wild = D.encounters.find((x) => x.floor === floor);
  return [...(f ? f.places.map((p) => ({ kind: "trainers", name: p.place, place: p })) : []),
    ...(wild ? wild.areas.map((a) => ({ kind: "wild", name: a.area, area: a })) : [])];
}

function trainerSet(t, d, i, floor) {
  const set = t[d][i];
  return Object.assign({}, set, { label: `${G.species[set.species].name} (${t.title}, F${floor} ${d === "hard" ? "Hard" : "Normal"})`,
    tid: t.id, idx: i, diff: d, floor });
}

function renderFinder() {
  const root = document.getElementById("finder");
  const floors = T.floors.map((f) => f.floor);
  const areas = areasOf(FIND.floor);
  if (!areas.some((a) => a.kind + ":" + a.name === FIND.area)) FIND.area = areas[0] ? areas[0].kind + ":" + areas[0].name : "";
  const area = areas.find((a) => a.kind + ":" + a.name === FIND.area);
  const cur = P.p2?.mon;
  const list = [];
  if (area?.kind === "trainers") {
    for (const t of area.place.trainers) {
      const team = t[FIND.diff] || t.normal;
      list.push(h("div", { class: "sc-trainer" + (cur?.tid === t.id ? " on" : "") },
        h("div", { class: "sc-tname" }, t.title, t.double ? h("span", { class: "muted" }, " · double") : null),
        h("div", { class: "sc-icons" }, team.map((s, i) => iconButton(s.species, setTip(s),
          cur?.tid === t.id && cur?.idx === i, () => { P.p2.mon = fromSet(trainerSet(t, FIND.diff, i, FIND.floor)); renderPanel("p2"); renderFinder(); update(); })))));
    }
  } else if (area?.kind === "wild") {
    const lv = area.area.levels[1];
    for (const [key, title] of [["land", "Walking"], ["surf", "Surfing"], ["fishing", "Fishing"]]) {
      const slots = area.area[key] || [];
      if (!slots.length) continue;
      const seen = new Set();
      list.push(h("div", { class: "sc-trainer" }, h("div", { class: "sc-tname" }, title,
        h("span", { class: "muted" }, ` · Lv ${area.area.levels[0]}-${lv}`)),
        h("div", { class: "sc-icons" }, slots.filter((s) => !seen.has(s.species) && seen.add(s.species)).map((s) =>
          iconButton(s.species, `${s.name} Lv ${lv} (${s.rate}%)`, cur?.wild === s.species, () => {
            P.p2.mon = Object.assign(blankMon(s.species), { level: lv, wild: s.species, setLabel: `${s.name} (wild, ${area.name})` });
            renderPanel("p2"); renderFinder(); update();
          })))));
    }
  }
  root.replaceChildren(
    h("div", { class: "sc-panel-head" }, h("div", { class: "sc-h" }, "Opponents"),
      h("span", { class: "seg sc-seg" }, [["normal", "Normal"], ["hard", "Hard"]].map(([v, text]) =>
        h("button", { class: FIND.diff === v ? "on" : null, onclick: () => { FIND.diff = v; switchDiff(); renderFinder(); } }, text)))),
    h("div", { class: "sc-row2" },
      sel("find-floor", floors.map((f) => [f, `Floor ${f}`]), FIND.floor, (v) => { FIND.floor = +v; FIND.area = ""; renderFinder(); }),
      h("select", { id: "find-area", onchange: (e) => { FIND.area = e.target.value; renderFinder(); } },
        ["trainers", "wild"].map((kind) => {
          const opts = areas.filter((a) => a.kind === kind);
          return opts.length ? h("optgroup", { label: kind === "trainers" ? "Trainers" : "Wild Pokémon" }, opts.map((a) =>
            h("option", { value: a.kind + ":" + a.name, selected: a.kind + ":" + a.name === FIND.area ? true : null }, a.name))) : null;
        }))),
    h("div", { class: "sc-area-list" }, list.length ? list : h("div", { class: "muted small" }, "Nobody here.")));
  store("calc:find", FIND);
}

// Normal <-> Hard: the opponent's Pokémon becomes the same trainer's Pokémon on the other difficulty
function switchDiff() {
  const m = P.p2.mon;
  if (!m.tid) return;
  const found = findTrainer(m.tid);
  const team = found?.t[FIND.diff];
  if (!team || !team.length) return;
  const i = Math.min(m.idx || 0, team.length - 1);
  P.p2.mon = fromSet(trainerSet(found.t, FIND.diff, i, found.floor));
  renderPanel("p2"); update();
}

// the finder follows a trainer's set picked from the search box
function followTrainer(m) {
  if (!m?.tid) return;
  const found = findTrainer(m.tid);
  if (!found) return;
  FIND.floor = found.floor; FIND.area = "trainers:" + found.place; FIND.diff = m.diff || FIND.diff;
}

// ------------------------------------------------------------------------ Showdown text: import / export
// "Nickname (Species) @ Item / Ability: X / Level: N / Jolly Nature / IVs: 0 Atk / - Move"
const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
let BYNAME = null;
function byName() {
  if (BYNAME) return BYNAME;
  const mk = (obj, extra) => {
    const m = new Map();
    for (const [k, v] of Object.entries(obj)) { m.set(norm(v.name || v), k); m.set(norm(k), k); }
    return Object.assign(m, extra || {});
  };
  BYNAME = { species: mk(G.species), moves: mk(G.moves), items: mk(G.items), abilities: mk(G.abilities) };
  // (Showdown writes forms "Growlithe-Hisui"; the game "Growlithe (Hisui)" - both reduce to the same letters)
  return BYNAME;
}
const IV_LABEL = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };

function exportSet(m) {
  const sp = G.species[m.species];
  const lines = [`${m.mine?.nickname ? `${m.mine.nickname} (${sp.name})` : sp.name}${m.item ? ` @ ${G.items[m.item]?.name || m.item}` : ""}`];
  if (m.ability) lines.push(`Ability: ${G.abilities[m.ability]?.name || m.ability}`);
  lines.push(`Level: ${m.level}`);
  lines.push(`${m.nature} Nature`);
  const ivs = Object.keys(IV_LABEL).filter((k) => m.ivs[k] !== 31).map((k) => `${m.ivs[k]} ${IV_LABEL[k]}`);
  if (ivs.length) lines.push(`IVs: ${ivs.join(" / ")}`);
  for (const mv of m.moves) if (mv) lines.push(`- ${G.moves[mv]?.name || mv}`);
  return lines.join("\n");
}

function importSet(text) {
  const N = byName();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) throw new Error("Paste a set first.");
  let [head, item] = lines[0].split(" @ ");
  head = head.replace(/\s*\((M|F)\)\s*$/, "");
  const inner = head.match(/\(([^)]+)\)\s*$/);
  const speciesName = inner && N.species.has(norm(inner[1])) ? inner[1] : head;
  const species = N.species.get(norm(speciesName));
  if (!species) throw new Error(`"${speciesName}" isn't a Pokémon in the game.`);
  const m = blankMon(species);
  if (item) { const it = N.items.get(norm(item)); if (it) m.item = it; }
  const moves = [];
  for (const l of lines.slice(1)) {
    let r;
    if ((r = l.match(/^Ability:\s*(.+)$/i))) { const a = N.abilities.get(norm(r[1])); if (a) m.ability = a; }
    else if ((r = l.match(/^Level:\s*(\d+)/i))) m.level = clamp(+r[1], 1, 100);
    else if ((r = l.match(/^(\w+)\s+Nature/i))) { const n = Object.keys(C().NATURES).find((x) => norm(x) === norm(r[1])); if (n) m.nature = n; }
    else if ((r = l.match(/^IVs:\s*(.+)$/i))) {
      for (const part of r[1].split("/")) {
        const [v, lab] = part.trim().split(/\s+/);
        const k = Object.keys(IV_LABEL).find((x) => norm(IV_LABEL[x]) === norm(lab));
        if (k) m.ivs[k] = clamp(+v, 0, 31);
      }
    } else if ((r = l.match(/^[-~]\s*(.+)$/))) { const mv = N.moves.get(norm(r[1].replace(/\[.*\]/, ""))); if (mv) moves.push(mv); }
  }
  m.moves = [...moves, "", "", "", ""].slice(0, 4);
  return m;
}

function renderIO() {
  const root = document.getElementById("io");
  if (!root) return;
  const ta = h("textarea", { id: "io-text", "aria-label": "Set text (Showdown format)", spellcheck: "false",
    placeholder: "Paste a set in Showdown's format, or export one here." });
  const msg = h("div", { class: "sc-msg muted" });
  const doImport = (id) => {
    try { P[id].mon = importSet(ta.value); msg.textContent = `Imported as ${label(id)}.`; renderPanel(id); update(); }
    catch (e) { msg.textContent = e.message; }
  };
  root.replaceChildren(h("div", { class: "sc-h" }, "Import / Export"), ta,
    h("div", { class: "sc-btns" },
      h("button", { class: "sc-mini", onclick: () => doImport("p1") }, "Import as Pokémon 1"),
      h("button", { class: "sc-mini", onclick: () => doImport("p2") }, "Import as Pokémon 2"),
      h("button", { class: "sc-mini", onclick: () => { ta.value = exportSet(P.p1.mon); msg.textContent = ""; } }, "Export Pokémon 1"),
      h("button", { class: "sc-mini", onclick: () => { ta.value = exportSet(P.p2.mon); msg.textContent = ""; } }, "Export Pokémon 2"),
      h("button", { class: "sc-mini", onclick: () => document.getElementById("save-file").click() }, "Import .sav")),
    msg);
}

// ------------------------------------------------------------------------------------------------- start
async function init() {
  [G, T, D] = await Promise.all([loadJSON("game.json"), loadJSON("trainers.json"), loadJSON("docs.json")]);
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
        SETS.set(lab, Object.assign({}, set, { label: lab, tid: t.id, idx: i, diff: d, floor: f.floor }));
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
    if (set) P.p2.mon = fromSet(trainerSet(found.t, d, +q.get("i") || 0, found.floor));
  }
  // what this browser remembers: the save it was given, where the finder was
  const saved = store("calc:save");
  if (saved && Array.isArray(saved.party) && Array.isArray(saved.boxes)) MINE.save = saved;
  MINE.box = Math.max(0, (MINE.save?.boxes || []).findIndex((b) => b.mons.some(Boolean)));
  const f = store("calc:find");
  if (f && T.floors.some((x) => x.floor === f.floor)) Object.assign(FIND, f);
  followTrainer(P.p2.mon);
  for (const key of ["gravity", "magicRoom", "wonderRoom"]) {
    document.getElementById(`f-${key}`).addEventListener("change", (e) => { FIELD[key] = e.target.checked; update(); });
  }
  renderField(); renderPanel("p1"); renderPanel("p2");
  renderMine(); renderFinder(); renderIO(); dropAnywhere();
  update();
}
document.addEventListener("DOMContentLoaded", () => init().catch((e) => {
  document.getElementById("result-text").textContent = `Couldn't load the game data (${e.message}). If you opened this file directly, serve the folder instead (see README).`;
}));
