// Shared by every page: the header and footer, data loading, and small helpers.
// The game's name lives here once - change it and every page follows.
const SITE = {
  // (tools/stamp-version.sh: the data is fetched with this, so an update reaches browsers that kept the old files)
  version: "202610291513",
  title: "The Veil",
  tagline: "A Pokémon Emerald descent",
  pages: [
    ["index.html", "About"],
    ["docs.html", "Docs"],
    ["map.html", "Map"],
    ["calc.html", "Damage Calc"],
    ["patcher.html", "Patcher"],
  ],
};

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function chrome() {
  const here = location.pathname.split("/").pop() || "index.html";
  const nav = h("nav", { class: "nav", "aria-label": "Main" },
    SITE.pages.map(([href, label]) => h("a", { href, class: here === href ? "active" : null }, label)));
  document.body.prepend(h("header", { class: "site-header" },
    h("div", { class: "inner" }, h("a", { class: "brand", href: "index.html" }, SITE.title), nav)));
  document.body.append(h("footer", { class: "site-footer" },
    `${SITE.title} is a fan-made ROM hack, not affiliated with Nintendo, Game Freak or The Pokémon Company. `,
    "No ROMs are hosted here. Pokémon sprites from Pokémon Showdown; party icons from the game's own graphics."));
  document.querySelectorAll("[data-title]").forEach((el) => (el.textContent = SITE.title));
  document.title = document.title.replace("{title}", SITE.title);
}

const _cache = {};
function loadJSON(name) {
  if (!_cache[name]) {
    _cache[name] = fetch(`data/${name}?v=${SITE.version}`).then((r) => {
      if (!r.ok) throw new Error(`data/${name}: ${r.status}`);
      return r.json();
    });
  }
  return _cache[name];
}

// "SPECIES_CONST" display helpers
const titleCase = (s) => String(s).toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
function typeBadge(t) { return h("span", { class: `type t-${t}` }, titleCase(t)); }

// Pokémon Showdown sprite names: lower case, no spaces; a form after a hyphen
const SPRITE_FIX = { "nidoranf": "nidoranf", "nidoranm": "nidoranm", "mrmime": "mrmime", "mimejr": "mimejr" };
const FORM_WORDS = { HISUI: "hisui", GALAR: "galar", ALOLA: "alola", PALDEA: "paldea", CORE: "" };
function spriteURL(key) {
  const parts = String(key).toLowerCase().split("_");
  let base = parts[0], form = parts.slice(1).join("");
  if (/^(mr|mime|type|tapu|porygon|ho|jangmo|hakamo|kommo|great|iron|roaring|walking|gouging|raging|scream|brute|flutter|slither|sandy|chien|chi|ting|wo)$/.test(base) && parts.length > 1) {
    base = parts.slice(0, 2).join(""); form = parts.slice(2).join("");
  }
  if (FORM_WORDS[parts[parts.length - 1]?.toUpperCase()] !== undefined && parts.length > 1) {
    form = FORM_WORDS[parts[parts.length - 1].toUpperCase()];
  }
  base = SPRITE_FIX[base] || base;
  const name = form ? `${base}-${form}` : base;
  return `https://play.pokemonshowdown.com/sprites/gen5/${name}.png`;
}
function sprite(key, cls) {
  const img = h("img", { src: spriteURL(key), alt: "", loading: "lazy", class: cls || null, width: 48, height: 48 });
  // (a form without its own sprite falls back to the base form; no sprite at all leaves the space blank)
  img.onerror = () => { img.onerror = () => { img.style.visibility = "hidden"; }; img.src = spriteURL(String(key).split("_")[0]); };
  return img;
}

function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(`veil:${key}`));
    localStorage.setItem(`veil:${key}`, JSON.stringify(val));
  } catch (e) { return null; }
}

document.addEventListener("DOMContentLoaded", chrome);
