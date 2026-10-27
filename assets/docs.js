// The Docs page: tabs, and the floor-gated trainer / wild / item listings built from data/*.json.
const FLOORS = [1, 2, 3, 4];
let GAME, TRAINERS, DOCS;
const state = { tab: "changes", trainerFloor: null, wildFloor: null, itemFloor: null, diff: "normal", shops: false };

const speciesName = (k) => GAME.species[k]?.name || titleCase(k);
const moveName = (k) => GAME.moves[k]?.name || titleCase(k);
const abilityName = (k) => GAME.abilities[k]?.name || titleCase(k);
const itemName = (k) => GAME.items[k]?.name || titleCase(k);

function floorButtons(id, key, render) {
  const seg = document.getElementById(id);
  seg.replaceChildren(...FLOORS.map((f) => h("button", {
    class: state[key] === f ? "on" : null,
    onclick: () => { state[key] = state[key] === f ? null : f; floorButtons(id, key, render); render(); },
  }, `Floor ${f}`)));
}

// ------------------------------------------------------------------------------------------------- changes
function renderChanges() {
  document.getElementById("caps").textContent = GAME.caps.join(" → ");
  const rows = {};
  for (const c of DOCS.speciesChanges) (rows[c.species] ||= { name: c.name })[c.field] = c;
  const body = document.querySelector("#species-changes tbody");
  body.replaceChildren(...Object.entries(rows).map(([sp, r]) => {
    const now = GAME.species[sp];
    const was = (f) => r[f] ? h("div", { class: "muted small" }, "was ", r[f].was.map((x) => f === "Type" ? titleCase(x)
      : f === "Abilities" ? abilityName(x) : x).join(f === "Base stats" ? " / " : ", ")) : null;
    return h("tr", {},
      h("td", {}, h("div", { class: "row" }, sprite(sp), h("strong", {}, r.name))),
      h("td", {}, now.types.map(typeBadge), was("Type")),
      h("td", {}, now.abilities.map(abilityName).join(", "), was("Abilities")),
      h("td", { class: "mono" }, now.bs.join(" / "), was("Base stats")));
  }));
}

// ------------------------------------------------------------------------------------------------ trainers
function monCard(mon, opts) {
  const { added, changed, link } = opts;
  const moves = mon.moves.map((m) => {
    const mv = GAME.moves[m];
    return h("li", {}, mv ? typeBadge(mv.type) : null,
      h("span", { class: changed.has(m) ? "plus" : null, title: changed.has(m) ? "changed on Hard" : null }, moveName(m)));
  });
  return h("div", { class: "mon" + (added ? " added" : "") },
    h("a", { class: "calc-link", href: link, title: "Open in the damage calculator" }, "calc ›"),
    h("div", { class: "top" }, sprite(mon.species),
      h("div", {}, h("div", { class: "name" }, speciesName(mon.species), added ? h("span", { class: "pill", style: "margin-left:.35rem" }, "Hard") : null),
        h("div", { class: "meta" }, `Lv ${mon.level}`, mon.item ? ` · @ ${itemName(mon.item)}` : ""),
        h("div", { class: "meta" }, `${abilityName(mon.ability)} · ${mon.nature}`))),
    h("ul", {}, moves));
}

function renderTrainers() {
  const body = document.getElementById("trainers-body");
  const f = state.trainerFloor;
  if (!f) return body.replaceChildren(h("div", { class: "gate" }, "Pick a floor above. Each floor's trainers stay hidden until you do."));
  const floor = TRAINERS.floors.find((x) => x.floor === f);
  const out = [];
  for (const place of floor.places) {
    out.push(h("div", { class: "place" }, place.place));
    for (const t of place.trainers) {
      const team = state.diff === "hard" ? t.hard : t.normal;
      const normalSp = new Map(t.normal.map((m) => [m.species, m]));
      const cards = team.map((mon, i) => {
        const base = normalSp.get(mon.species);
        const changed = new Set(state.diff === "hard" && base ? mon.moves.filter((m) => !base.moves.includes(m)) : []);
        return monCard(mon, {
          added: state.diff === "hard" && !base, changed,
          link: `calc.html#t=${encodeURIComponent(t.id)}&d=${state.diff}&i=${i}`,
        });
      });
      out.push(h("div", { class: "panel trainer" },
        h("div", { class: "trainer-head" }, h("h3", {}, t.title),
          t.double ? h("span", { class: "pill" }, "Double battle") : null,
          h("span", { class: "muted small" }, `${team.length} Pokémon`)),
        h("div", { class: "team" }, cards)));
    }
  }
  body.replaceChildren(...out);
}

// ---------------------------------------------------------------------------------------------------- wild
function slotTable(title, slots, levels, extra) {
  if (!slots.length) return null;
  return h("div", {}, h("h3", {}, title),
    h("div", { class: "table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, h("th", {}, "Pokémon"), extra ? h("th", {}, extra) : null,
        h("th", { class: "num" }, "Rate"), h("th", { class: "num" }, "Level"))),
      h("tbody", {}, slots.map((s) => h("tr", {},
        h("td", {}, h("div", { class: "row", style: "margin:0" }, sprite(s.species), speciesName(s.species))),
        extra ? h("td", {}, s.rod) : null,
        h("td", { class: "num" }, `${s.rate}%`),
        h("td", { class: "num" }, levels[0] === levels[1] ? levels[0] : `${levels[0]}-${levels[1]}`)))))));
}

function merge(slots, extraKey) {
  // the game's slots repeat a species; one row per species (and rod), rates added
  const out = new Map();
  for (const s of slots) {
    const k = s.species + (extraKey ? `|${s[extraKey]}` : "");
    if (out.has(k)) out.get(k).rate += s.rate; else out.set(k, { ...s });
  }
  return [...out.values()].sort((a, b) => b.rate - a.rate);
}

function renderWild() {
  const body = document.getElementById("wild-body");
  const f = state.wildFloor;
  if (!f) return body.replaceChildren(h("div", { class: "gate" }, "Pick a floor above. Each floor's encounters stay hidden until you do."));
  const floor = DOCS.encounters.find((x) => x.floor === f);
  const out = [];
  const special = DOCS.special.filter((s) => s.floor === f || (f === 1 && s.floor === 0));
  if (special.length) {
    out.push(h("div", { class: "place" }, "Gifts and special encounters"),
      h("div", { class: "panel" }, h("div", { class: "table-wrap" }, h("table", {},
        h("tbody", {}, special.map((s) => h("tr", {}, h("td", {}, h("strong", {}, s.where)), h("td", {}, s.what))))))));
  }
  for (const a of floor?.areas || []) {
    const parts = [slotTable(a.dive ? "Diving" : "Grass and cave", merge(a.land), a.levels),
      slotTable("Surfing", merge(a.surf), a.levels),
      slotTable("Fishing", merge(a.fishing, "rod"), a.levels, "Rod")].filter(Boolean);
    if (!parts.length) continue;
    out.push(h("div", { class: "place" }, a.area), h("div", { class: "panel" }, parts));
  }
  if (!out.length) out.push(h("p", { class: "muted" }, "No wild Pokémon on this floor."));
  body.replaceChildren(...out);
}

// --------------------------------------------------------------------------------------------------- items
function renderItems() {
  const body = document.getElementById("items-body");
  const f = state.itemFloor;
  if (!f) return body.replaceChildren(h("div", { class: "gate" }, "Pick a floor above. Each floor's items stay hidden until you do."));
  const floor = DOCS.items.find((x) => x.floor === f);
  const out = [];
  for (const p of floor?.places || []) {
    out.push(h("div", { class: "place" }, p.place), h("div", { class: "panel table-wrap" }, h("table", {},
      h("thead", {}, h("tr", {}, ["Item", "Qty", "How", "Where (x, y)", "Guarded by", "Notes"].map((t, i) => h("th", { class: i === 1 ? "num" : null }, t)))),
      h("tbody", {}, p.items.map((it) => h("tr", {},
        h("td", {}, h("strong", {}, it.item)), h("td", { class: "num" }, it.qty), h("td", {}, it.how),
        h("td", { class: "mono" }, it.at), h("td", {}, it.blockedBy), h("td", { class: "muted" }, it.notes)))))));
  }
  if (!out.length) out.push(h("p", { class: "muted" }, "No items listed for this floor yet."));
  out.push(h("p", { class: "muted small" }, "Guarded by: trainers whose line of sight you can't avoid on the way to the item."));
  body.replaceChildren(...out);
}

function renderShops() {
  const body = document.getElementById("shops-body");
  if (!state.shops) {
    return body.replaceChildren(h("div", { class: "gate" }, h("p", {}, "Shop stock and the Lost Delvers' trades, all floors."),
      h("button", { class: "primary", onclick: () => { state.shops = true; renderShops(); } }, "Show shops and trades")));
  }
  const out = DOCS.shops.map((s) => [h("div", { class: "place" }, s.title), h("div", { class: "panel table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, h("th", {}, "Item"), h("th", { class: "num" }, "Price"), h("th", {}, "Notes"))),
    h("tbody", {}, s.items.map((it) => h("tr", {}, h("td", {}, it.item), h("td", { class: "num" }, it.price), h("td", { class: "muted" }, it.notes))))))]);
  out.push(h("div", { class: "place" }, "Lost Delvers' trades (each trades once)"), h("div", { class: "panel table-wrap" }, h("table", {},
    h("thead", {}, h("tr", {}, ["Where", "Wants", "Gives", "At (x, y)"].map((t) => h("th", {}, t)))),
    h("tbody", {}, DOCS.trades.map((t) => h("tr", {}, h("td", {}, t.place), h("td", {}, t.wants), h("td", {}, t.gives), h("td", { class: "mono" }, t.at)))))));
  body.replaceChildren(...out.flat());
}

// ---------------------------------------------------------------------------------------------------- tabs
function showTab(tab) {
  state.tab = tab;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== `tab-${tab}`));
  history.replaceState(null, "", `#${tab}`);
}

async function init() {
  [GAME, TRAINERS, DOCS] = await Promise.all([loadJSON("game.json"), loadJSON("trainers.json"), loadJSON("docs.json")]);
  document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.querySelectorAll("[data-goto]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); showTab(a.dataset.goto); }));
  document.querySelectorAll("#diff button").forEach((b) => b.addEventListener("click", () => {
    state.diff = b.dataset.diff;
    document.querySelectorAll("#diff button").forEach((x) => x.classList.toggle("on", x === b));
    renderTrainers();
  }));
  floorButtons("floor-trainers", "trainerFloor", renderTrainers);
  floorButtons("floor-wild", "wildFloor", renderWild);
  floorButtons("floor-items", "itemFloor", renderItems);
  renderChanges(); renderTrainers(); renderWild(); renderItems(); renderShops();
  const want = location.hash.slice(1);
  if (want && document.getElementById(`tab-${want}`)) showTab(want);
}
document.addEventListener("DOMContentLoaded", () => init().catch((e) => {
  document.querySelector("main").append(h("p", { class: "gate" }, `Couldn't load the game data (${e.message}). `,
    "If you opened this file directly, serve the folder instead (see README)."));
}));
