// The Map page: every map of a floor as built (maps/*.png, build_site_maps.py) with its trainers, items, hidden
// items and Delver trades as markers. A trainer's card shows the team on Normal or Hard and opens it in the damage
// calculator. map.html#Veil_F1_Seam opens a map; &t=TRAINER_ID picks a trainer on it.
let G, T, M;
const S = { floor: null, map: null, zoom: 1, pick: null, diff: "normal",
  show: { trainers: true, items: true, hidden: true, trades: true } };
const TRAINERS = new Map();            // id -> { t, floor, place }
const ZOOMS = [1, 2, 3];

// the game's own menu icons (assets/icons.png, build_site_data.py): 32 to a row, 32 x 32 each
function icon(species) {
  const n = G.species[species]?.icon ?? G.species[String(species).split("_")[0]]?.icon;
  if (n == null) return h("span", { class: "sc-icon", style: "background:none" });
  return h("span", { class: "sc-icon", style: `background-position:-${(n % 32) * 32}px -${Math.floor(n / 32) * 32}px` });
}
const calcLink = (id, d, i) => `calc.html#t=${encodeURIComponent(id)}&d=${d}&i=${i}`;
const floorData = () => M.floors.find((f) => f.floor === S.floor);
const mapData = () => floorData()?.maps.find((m) => m.name === S.map);

function save() {
  store("map:state", { floor: S.floor, zoom: S.zoom, diff: S.diff, show: S.show });
  if (S.map) history.replaceState(null, "", `#${S.map}${S.pick?.kind === "trainer" ? `&t=${S.pick.id}` : ""}`);
}

// ------------------------------------------------------------------------------------------------ toolbar
function renderTools() {
  document.getElementById("mp-floors").replaceChildren(...M.floors.map((f) =>
    h("button", { class: S.floor === f.floor ? "on" : null, role: "tab", "aria-selected": S.floor === f.floor ? "true" : "false",
      onclick: () => openFloor(f.floor) }, `Floor ${f.floor}`)));
  const open = S.floor != null;
  for (const id of ["mp-map", "mp-toggles", "mp-zoom"]) document.getElementById(id).hidden = !open;
  document.getElementById("mp-gate").hidden = open;
  document.getElementById("mp").hidden = !open;
  if (!open) return;
  const sel = document.getElementById("mp-map");
  sel.replaceChildren(...floorData().maps.map((m) => {
    const bits = [m.trainers.length && `${m.trainers.length} trainer${m.trainers.length > 1 ? "s" : ""}`,
      m.items.length && `${m.items.length} item${m.items.length > 1 ? "s" : ""}`].filter(Boolean).join(", ");
    return h("option", { value: m.name, selected: m.name === S.map ? true : null }, bits ? `${m.title} (${bits})` : m.title);
  }));
  sel.onchange = () => openMap(sel.value);
  const tog = (key, text, cls) => h("label", { class: "sc-check" }, h("input", { type: "checkbox", checked: S.show[key] ? true : null,
    onchange: (e) => { S.show[key] = e.target.checked; renderStage(); save(); } }), h("span", { class: `mp-key ${cls}` }), text);
  document.getElementById("mp-toggles").replaceChildren(tog("trainers", "Trainers", "trainer"), tog("items", "Items", "item"),
    tog("hidden", "Hidden items", "hidden"), tog("trades", "Trades", "trade"));
  document.getElementById("mp-zoom").replaceChildren(...ZOOMS.map((z) =>
    h("button", { class: S.zoom === z ? "on" : null, onclick: () => { S.zoom = z; renderTools(); renderStage(); save(); } }, `${z}×`)));
}

function openFloor(f) {
  S.floor = f;
  S.map = floorData().maps.find((m) => m.trainers.length || m.items.length)?.name || floorData().maps[0]?.name;
  S.pick = null;
  renderAll();
}
function openMap(name) {
  S.map = name; S.pick = null;
  document.getElementById("mp-view").scrollTo(0, 0);
  renderAll();
}
function renderAll() { renderTools(); renderStage(); renderInfo(); renderList(); save(); }
// a way out's map, on whichever floor it is
function goTo(name) {
  const f = M.floors.find((x) => x.maps.some((m) => m.name === name));
  if (!f) return;
  S.floor = f.floor;
  openMap(name);
}

// --------------------------------------------------------------------------------------------- the map
const trainerName = (t) => TRAINERS.get(t.id)?.t.title || t.fallback;
// the trainers fought at one spot (the arena's doubles at its dealer, the Overseer's six teams): one marker for them all
const groupOf = (m, i) => m.trainers.map((t, j) => j).filter((j) => m.trainers[j].x === m.trainers[i].x && m.trainers[j].y === m.trainers[i].y);

function markers(m) {
  const out = [];
  if (S.show.trainers) m.trainers.forEach((t, i) => {
    const g = groupOf(m, i);
    if (g[0] === i) out.push({ kind: "trainer", id: t.id, x: t.x, y: t.y, i, tip: g.map((j) => trainerName(m.trainers[j])).join(" / ") });
  });
  m.items.forEach((it, i) => { if (it.hidden ? S.show.hidden : S.show.items) out.push({ kind: it.hidden ? "hidden" : "item", x: it.x, y: it.y, i,
    tip: `${it.item}${it.qty > 1 ? ` ×${it.qty}` : ""}${it.hidden ? " (hidden)" : ""}` }); });
  if (S.show.trades) m.trades.forEach((d, i) => out.push({ kind: "trade", x: d.x, y: d.y, i, tip: `Trade: ${d.wants || "talk"} → ${d.gives || "?"}` }));
  return out;
}
const same = (a, b) => a && b && a.kind === b.kind && (a.i === b.i
  || (a.kind === "trainer" && mapData() && groupOf(mapData(), a.i).includes(b.i)));

function renderStage() {
  const m = mapData();
  const stage = document.getElementById("mp-stage");
  if (!m) { stage.replaceChildren(); return; }
  const px = M.tile * S.zoom;
  stage.style.width = `${m.w * px}px`;
  stage.style.height = `${m.h * px}px`;
  const cursor = h("div", { class: "mp-cursor", style: `width:${px}px;height:${px}px`, hidden: true });
  const at = (p) => p && ["person", "sign", "exit", "spot"].includes(p.kind) ? p : null;
  const spot = at(S.pick);
  stage.replaceChildren(h("img", { src: m.img, alt: `${m.title}, as built`, width: m.w * px, height: m.h * px, class: "mp-img" }),
    spot ? h("div", { class: "mp-cursor on", style: `width:${px}px;height:${px}px;left:${spot.x * px}px;top:${spot.y * px}px` }) : null,
    cursor,
    ...markers(m).map((k) => h("button", { class: `mp-pin ${k.kind}${same(S.pick, k) ? " on" : ""}`, title: k.tip, "aria-label": k.tip,
      style: `left:${(k.x + 0.5) * px}px;top:${(k.y + 0.5) * px}px`,
      onclick: (e) => { e.stopPropagation(); S.pick = k; renderStage(); renderInfo(); renderList(); save(); } })));
  // anywhere on the map: what stands on that tile (a person's sprite reaches a tile above their own)
  const tileOf = (e) => { const r = stage.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / px), Math.floor((e.clientY - r.top) / px)]; };
  stage.onmousemove = (e) => {
    const [x, y] = tileOf(e);
    cursor.hidden = x < 0 || y < 0 || x >= m.w || y >= m.h;
    cursor.style.left = `${x * px}px`; cursor.style.top = `${y * px}px`;
  };
  stage.onmouseleave = () => { cursor.hidden = true; };
  stage.onclick = (e) => {
    if (e.target.closest(".mp-pin")) return;
    const [x, y] = tileOf(e);
    S.pick = whatIsAt(m, x, y);
    renderStage(); renderInfo(); renderList(); save();
  };
}

// the thing on a tile: a marker's own (trainer, item, trade), else a person, a sign, a way out - else the bare tile
function whatIsAt(m, x, y) {
  const on = (o, tall) => o.x === x && (o.y === y || (tall && o.y === y + 1));
  for (const tall of [false, true]) {
    const ti = m.trainers.findIndex((t) => on(t, tall));
    if (ti >= 0) return { kind: "trainer", id: m.trainers[ti].id, i: ti };
    const ii = m.items.findIndex((it) => on(it, false) && (it.hidden ? S.show.hidden : true));
    if (ii >= 0 && !tall) return { kind: m.items[ii].hidden ? "hidden" : "item", i: ii };
    const di = m.trades.findIndex((d) => on(d, tall));
    if (di >= 0) return { kind: "trade", i: di };
    const pi = (m.people || []).findIndex((p) => on(p, tall));
    if (pi >= 0) return { kind: "person", i: pi, x: m.people[pi].x, y: m.people[pi].y };
  }
  const si = (m.signs || []).findIndex((s) => on(s, false));
  if (si >= 0) return { kind: "sign", i: si, x, y };
  const ei = (m.exits || []).findIndex((d) => on(d, false));
  if (ei >= 0) return { kind: "exit", i: ei, x, y };
  return { kind: "spot", x, y };
}

// ------------------------------------------------------------------------------------------- the card
function teamRows(t, d) {
  return (t[d] || t.normal).map((s, i) => h("a", { class: "mp-mon", href: calcLink(t.id, d, i), title: "Open in the damage calculator" },
    icon(s.species),
    h("span", { class: "mp-mon-name" }, h("strong", {}, G.species[s.species]?.name || titleCase(s.species)), ` Lv ${s.level}`,
      s.item ? h("span", { class: "muted" }, ` @ ${G.items[s.item]?.name || titleCase(s.item)}`) : null),
    h("span", { class: "mp-mon-moves muted" }, (s.moves || []).map((mv) => G.moves[mv]?.name || titleCase(mv)).join(" · "))));
}

function renderInfo() {
  const box = document.getElementById("mp-info");
  const m = mapData();
  const p = S.pick;
  if (!m) { box.replaceChildren(); return; }
  if (!p) {
    box.replaceChildren(h("div", { class: "sc-h" }, m.title),
      h("p", { class: "muted small" }, "Click anything on the map - a marker, a person, a sign, a doorway - to see what it is."),
      h("div", { class: "mp-legend small" }, [["trainer", "Trainer"], ["item", "Item ball"], ["hidden", "Hidden item"], ["trade", "Delver trade"],
        ["person", "Person"], ["sign", "Sign"], ["exit", "Way out"]]
        .map(([c, t]) => h("span", {}, h("span", { class: `mp-key ${c}` }), t))));
    return;
  }
  if (p.kind === "trainer") {
    const raw = m.trainers[p.i];
    const found = TRAINERS.get(raw.id);
    const group = groupOf(m, p.i);
    const others = group.length > 1 ? h("div", { class: "mp-others" }, h("div", { class: "muted small" }, "Fought here:"),
      h("div", { class: "seg sc-seg" }, group.map((j) => h("button", { class: j === p.i ? "on" : null,
        onclick: () => { S.pick = { kind: "trainer", id: m.trainers[j].id, i: j }; renderInfo(); renderList(); save(); } },
        trainerName(m.trainers[j]))))) : null;
    if (!found) { box.replaceChildren(...[h("div", { class: "sc-h" }, raw.fallback), others, h("p", { class: "muted small" }, "No team on record.")].filter(Boolean)); return; }
    const t = found.t;
    box.replaceChildren(...[others,
      h("div", { class: "sc-panel-head" }, h("div", { class: "sc-h" }, t.title),
        h("span", { class: "seg sc-seg" }, [["normal", "Normal"], ["hard", "Hard"]].map(([v, text]) =>
          h("button", { class: S.diff === v ? "on" : null, onclick: () => { S.diff = v; renderInfo(); save(); } }, text)))),
      h("div", { class: "muted small" }, `${found.place} · (${raw.x}, ${raw.y})${t.double ? " · double battle" : ""}`),
      h("div", { class: "mp-team" }, teamRows(t, S.diff)),
      h("a", { class: "btn mp-calc", href: calcLink(t.id, S.diff, 0) }, "Open in the damage calculator ›")].filter(Boolean));
    return;
  }
  if (p.kind === "person") {
    const o = m.people[p.i];
    box.replaceChildren(...[h("div", { class: "sc-h" }, o.who),
      o.says ? h("p", { class: "mp-says" }, `“${o.says}”`) : h("p", { class: "muted small" }, "Has nothing to say."),
      h("div", { class: "muted small" }, `(${o.x}, ${o.y})`)].filter(Boolean));
    return;
  }
  if (p.kind === "sign") {
    const s = m.signs[p.i];
    box.replaceChildren(h("div", { class: "sc-h" }, "A sign"), h("p", { class: "mp-says" }, s.says),
      h("div", { class: "muted small" }, `(${s.x}, ${s.y})`));
    return;
  }
  if (p.kind === "exit") {
    const d = m.exits[p.i];
    const there = M.floors.some((f) => f.maps.some((x) => x.name === d.to));
    box.replaceChildren(...[h("div", { class: "sc-h" }, "A way out"), h("p", {}, `Leads to ${d.toTitle}.`),
      there ? h("button", { class: "btn mp-calc", onclick: () => goTo(d.to) }, `Go to ${d.toTitle} ›`) : null,
      h("div", { class: "muted small" }, `(${d.x}, ${d.y})`)].filter(Boolean));
    return;
  }
  if (p.kind === "spot") {
    box.replaceChildren(h("div", { class: "sc-h" }, m.title), h("p", { class: "muted small" }, `(${p.x}, ${p.y}): nothing here.`),
      h("p", { class: "muted small" }, "Click a person, an item, a sign or a doorway to see what it is."));
    return;
  }
  if (p.kind === "trade") {
    const d = m.trades[p.i];
    box.replaceChildren(...[h("div", { class: "sc-h" }, "A Lost Delver"),
      h("p", {}, d.wants ? `Wants: ${d.wants}` : "Talks; trades nothing."), d.gives ? h("p", {}, `Gives: ${d.gives}`) : null,
      h("div", { class: "muted small" }, `(${d.x}, ${d.y}) · each Delver trades once`)].filter(Boolean));
    return;
  }
  const it = m.items[p.i];
  box.replaceChildren(...[h("div", { class: "sc-h" }, `${it.item}${it.qty > 1 ? ` ×${it.qty}` : ""}`),
    h("p", {}, it.hidden ? "Hidden item - a sparkle shows where. Face it and press A." : "Item ball."),
    it.guard ? h("p", { class: "small" }, `Guarded: ${it.guard} stands watch over it.`) : null,
    h("div", { class: "muted small" }, `(${it.x}, ${it.y})`)].filter(Boolean));
}

// ----------------------------------------------------------------------------- everything on this map
function renderList() {
  const box = document.getElementById("mp-list");
  const m = mapData();
  if (!m) { box.replaceChildren(); return; }
  const pickBtn = (k, text) => h("button", { class: "mp-row" + (same(S.pick, k) ? " on" : ""), onclick: () => {
    S.pick = k; renderStage(); renderInfo(); renderList(); save();
    document.querySelector(".mp-pin.on, .mp-cursor.on")?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  } }, h("span", { class: `mp-key ${k.kind}` }), text);
  const rows = [];
  if (m.trainers.length) {
    rows.push(h("div", { class: "sc-sub muted small" }, "Trainers"));
    m.trainers.forEach((t, i) => rows.push(pickBtn({ kind: "trainer", id: t.id, i }, TRAINERS.get(t.id)?.t.title || t.fallback)));
  }
  if (m.items.length) {
    rows.push(h("div", { class: "sc-sub muted small" }, "Items"));
    m.items.forEach((it, i) => rows.push(pickBtn({ kind: it.hidden ? "hidden" : "item", i },
      `${it.item}${it.qty > 1 ? ` ×${it.qty}` : ""}${it.hidden ? " (hidden)" : ""}`)));
  }
  if (m.trades.length) {
    rows.push(h("div", { class: "sc-sub muted small" }, "Trades"));
    m.trades.forEach((d, i) => rows.push(pickBtn({ kind: "trade", i }, `${d.wants || "Talks"} → ${d.gives || "-"}`)));
  }
  if (m.people?.length) {
    rows.push(h("div", { class: "sc-sub muted small" }, "People"));
    m.people.forEach((o, i) => rows.push(pickBtn({ kind: "person", i, x: o.x, y: o.y }, o.who)));
  }
  if (m.signs?.length) {
    rows.push(h("div", { class: "sc-sub muted small" }, "Signs"));
    m.signs.forEach((s, i) => rows.push(pickBtn({ kind: "sign", i, x: s.x, y: s.y }, s.says.length > 34 ? s.says.slice(0, 33) + "…" : s.says)));
  }
  if (m.exits?.length) {
    rows.push(h("div", { class: "sc-sub muted small" }, "Ways out"));
    const seen = new Set();
    m.exits.forEach((d, i) => { if (!seen.has(d.to)) { seen.add(d.to); rows.push(pickBtn({ kind: "exit", i, x: d.x, y: d.y }, `→ ${d.toTitle}`)); } });
  }
  if (m.rewards.length) {
    rows.push(h("div", { class: "sc-sub muted small" }, "Given here (no marker)"));
    m.rewards.forEach((r) => rows.push(h("div", { class: "mp-row static" }, `${r.item}${r.qty > 1 ? ` ×${r.qty}` : ""}`,
      h("span", { class: "muted" }, ` - ${titleCase(r.from.replace(/([a-z])([A-Z0-9])/g, "$1 $2"))}`))));
  }
  box.replaceChildren(h("div", { class: "sc-h" }, "On this map"), ...(rows.length ? rows : [h("div", { class: "muted small" }, "Nothing to pick up, nobody to fight.")]));
}

// ------------------------------------------------------------------------------------------------ start
async function init() {
  [G, T, M] = await Promise.all([loadJSON("game.json"), loadJSON("trainers.json"), loadJSON("maps.json")]);
  for (const f of T.floors) for (const p of f.places) for (const t of p.trainers) TRAINERS.set(t.id, { t, floor: f.floor, place: p.place });
  const st = store("map:state") || {};
  if (ZOOMS.includes(st.zoom)) S.zoom = st.zoom;
  if (st.diff === "hard") S.diff = "hard";
  if (st.show) Object.assign(S.show, st.show);
  window.addEventListener("hashchange", () => { if (fromHash()) renderAll(); });
  if (fromHash()) renderAll();
  else if (st.floor && M.floors.some((f) => f.floor === st.floor)) openFloor(st.floor);
  else renderAll();
}

// map.html#Veil_F1_Seam&t=TRAINER_X: that map (its floor opens with it) and that trainer -> TRUE if it named a map
function fromHash() {
  const [name, ...rest] = location.hash.slice(1).split("&");
  const want = M.floors.find((f) => f.maps.some((m) => m.name === name));
  if (!want) return false;
  const tid = new URLSearchParams(rest.join("&")).get("t");
  if (want.floor === S.floor && name === S.map && (!tid || S.pick?.id === tid)) return false;   // (our own replaceState)
  S.floor = want.floor; S.map = name; S.pick = null;
  const i = tid ? mapData().trainers.findIndex((t) => t.id === tid) : -1;
  if (i >= 0) S.pick = { kind: "trainer", id: tid, i };
  return true;
}
document.addEventListener("DOMContentLoaded", () => init().catch((e) => {
  document.getElementById("mp-gate").textContent = `Couldn't load the maps (${e.message}). If you opened this file directly, serve the folder instead (see README).`;
}));
