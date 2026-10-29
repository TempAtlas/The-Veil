// Reading a save file in the browser: the party and every PC box. The file never leaves the visitor's computer.
// The layout is the game's own (pokeemerald-expansion as the Veil builds it - include/pokemon.h, include/save.h; the
// offsets checked against a real save, tools/scripts/veil_save.py): two slots of 14 sectors (4 KiB: 3968 bytes of
// data and a footer), the newer slot by its counter; SaveBlock1 in sectors 1-4 (the party), the PC in 5-13.
window.VeilSave = (() => {
  const SECTOR = 0x1000, DATA = 3968, SIG = 0x08012025, SLOT_SECTORS = 14;
  const PARTY_COUNT = 0x234, PARTY = 0x238, MON = 100, BOXMON = 80;
  const BOXES = 14, IN_BOX = 30, BOXES_AT = 4, BOX_NAMES_AT = 0x8344;
  // which 12-byte part holds substructure 0-3, by personality % 24 (pokemon.c sSubstructOffsets)
  const ORDER = [
    [0, 0, 0, 0, 0, 0, 1, 1, 2, 3, 2, 3, 1, 1, 2, 3, 2, 3, 1, 1, 2, 3, 2, 3],
    [1, 1, 2, 3, 2, 3, 0, 0, 0, 0, 0, 0, 2, 3, 1, 1, 3, 2, 2, 3, 1, 1, 3, 2],
    [2, 3, 1, 1, 3, 2, 2, 3, 1, 1, 3, 2, 0, 0, 0, 0, 0, 0, 3, 2, 3, 2, 1, 1],
    [3, 2, 3, 2, 1, 1, 3, 2, 3, 2, 1, 1, 3, 2, 3, 2, 1, 1, 0, 0, 0, 0, 0, 0],
  ];
  const NATURES = ["Hardy", "Lonely", "Brave", "Adamant", "Naughty", "Bold", "Docile", "Relaxed", "Impish", "Lax",
    "Timid", "Hasty", "Serious", "Jolly", "Naive", "Modest", "Mild", "Quiet", "Bashful", "Rash", "Calm", "Gentle",
    "Sassy", "Careful", "Quirky"];

  // the game's text encoding, enough for names
  const CHARS = {};
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => (CHARS[0xBB + i] = c));
  "abcdefghijklmnopqrstuvwxyz".split("").forEach((c, i) => (CHARS[0xD5 + i] = c));
  "0123456789".split("").forEach((c, i) => (CHARS[0xA1 + i] = c));
  Object.assign(CHARS, { 0x00: " ", 0xAB: "!", 0xAC: "?", 0xAD: ".", 0xAE: "-", 0xB0: "…", 0xB1: "“", 0xB2: "”",
    0xB3: "‘", 0xB4: "’", 0xB5: "♂", 0xB6: "♀", 0xB8: ",", 0xBA: "/", 0x1B: "é" });
  function text(bytes) {
    let s = "";
    for (const b of bytes) { if (b === 0xFF) break; s += CHARS[b] ?? ""; }
    return s.trim();
  }

  // EXP to level (the six curves; level 1 is 0 EXP on every one)
  function expAt(curve, n) {
    if (n <= 1) return 0;
    const c = n ** 3;
    switch (curve) {
      case "ms": return Math.floor((6 * c) / 5) - 15 * n * n + 100 * n - 140;
      case "f": return Math.floor((4 * c) / 5);
      case "s": return Math.floor((5 * c) / 4);
      case "er":
        if (n <= 50) return Math.floor((c * (100 - n)) / 50);
        if (n <= 68) return Math.floor((c * (150 - n)) / 100);
        if (n <= 98) return Math.floor((c * Math.floor((1911 - 10 * n) / 3)) / 500);
        return Math.floor((c * (160 - n)) / 100);
      case "fl":
        if (n <= 15) return Math.floor((c * (Math.floor((n + 1) / 3) + 24)) / 50);
        if (n <= 36) return Math.floor((c * (n + 14)) / 50);
        return Math.floor((c * (Math.floor(n / 2) + 32)) / 50);
      default: return c;
    }
  }
  function levelFor(curve, exp) {
    let lv = 1;
    while (lv < 100 && expAt(curve, lv + 1) <= exp) lv++;
    return lv;
  }

  // the newer slot's sectors, by id
  function sectors(buf) {
    const dv = new DataView(buf);
    if (buf.byteLength < 2 * SLOT_SECTORS * SECTOR) throw new Error("That file is too small to be a save.");
    let best = null;
    for (let slot = 0; slot < 2; slot++) {
      const byId = {};
      let counter = -1;
      for (let k = 0; k < SLOT_SECTORS; k++) {
        const off = (slot * SLOT_SECTORS + k) * SECTOR;
        if (dv.getUint32(off + 0xFF8, true) !== SIG) continue;
        byId[dv.getUint16(off + 0xFF4, true)] = off;
        counter = Math.max(counter, dv.getUint32(off + 0xFFC, true));
      }
      if (Object.keys(byId).length === SLOT_SECTORS && (!best || counter > best.counter)) best = { byId, counter };
    }
    if (!best) throw new Error("No complete save slot in that file - is it a .sav from the game?");
    const join = (from, to) => {
      const out = new Uint8Array((to - from + 1) * DATA);
      for (let id = from; id <= to; id++) out.set(new Uint8Array(buf, best.byId[id], DATA), (id - from) * DATA);
      return new DataView(out.buffer);
    };
    return { sb1: join(1, 4), storage: join(5, 13) };
  }

  // one Pokémon (80 bytes boxed, 100 in the party) -> a calculator set, or null for an empty slot or an Egg
  function mon(dv, off, G, party) {
    const personality = dv.getUint32(off, true), otId = dv.getUint32(off + 4, true);
    const flags = dv.getUint8(off + 19);
    if (!(flags & 2) || (flags & 4) || (flags & 1)) return null;          // no species, an Egg, a bad Egg
    const key = (otId ^ personality) >>> 0;
    const sec = new DataView(new ArrayBuffer(48));
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const w = (dv.getUint32(off + 32 + 4 * i, true) ^ key) >>> 0;
      sec.setUint32(4 * i, w, true);
      sum = (sum + w + (w >>> 16)) & 0xFFFF;
    }
    if (sum !== dv.getUint16(off + 28, true)) return null;             // (a corrupt slot)
    const part = (n) => 12 * ORDER[n][personality % 24];
    const p0 = part(0), p1 = part(1), p3 = part(3);
    const species = G.ids.species[sec.getUint16(p0, true) & 0x7FF];
    if (!species || !G.species[species]) return null;
    const item = G.ids.items[sec.getUint16(p0 + 2, true) & 0x3FF] || "";
    const exp = sec.getUint32(p0 + 4, true) & 0x1FFFFF;
    const moves = [0, 2, 4, 6].map((o) => G.ids.moves[sec.getUint16(p1 + o, true) & 0x7FF] || "");
    const ivw = sec.getUint32(p3 + 4, true);
    const ivs = { hp: ivw & 31, atk: (ivw >>> 5) & 31, def: (ivw >>> 10) & 31, spe: (ivw >>> 15) & 31,
      spa: (ivw >>> 20) & 31, spd: (ivw >>> 25) & 31 };
    const abilityNum = (sec.getUint32(p3 + 8, true) >>> 29) & 3;
    const sp = G.species[species];
    const nature = NATURES[((personality % 25) ^ (dv.getUint8(off + 18) >>> 3)) % 25];
    const nick = text([...new Uint8Array(dv.buffer, dv.byteOffset + off + 8, 10),
      (sec.getUint32(p0 + 4, true) >>> 21) & 0xFF, (sec.getUint16(p0 + 10, true) >>> 6) & 0xFF]);
    const level = party ? dv.getUint8(off + 84) : levelFor(sp.growth, exp);
    const ability = (sp.slots && sp.slots[abilityNum] && sp.slots[abilityNum] !== "NONE") ? sp.slots[abilityNum]
      : sp.abilities[0] || "";
    const out = { species, level, nature, ability, item: G.items[item] ? item : "", ivs, moves,
      nickname: nick && nick.toLowerCase() !== sp.name.toLowerCase() ? nick : "" };
    if (party) {
      const hp = dv.getUint16(off + 86, true), max = dv.getUint16(off + 88, true);
      if (max) out.hpPct = Math.max(1, Math.round((100 * hp) / max));
    }
    return out;
  }

  // the whole save: {party: [set], boxes: [{name, mons: [set or null] x30}]}
  function read(buf, G) {
    const { sb1, storage } = sectors(buf);
    const n = Math.min(6, sb1.getUint8(PARTY_COUNT));
    const party = [];
    for (let i = 0; i < n; i++) { const m = mon(sb1, PARTY + i * MON, G, true); if (m) party.push(m); }
    const boxes = [];
    for (let b = 0; b < BOXES; b++) {
      const mons = [];
      for (let i = 0; i < IN_BOX; i++) mons.push(mon(storage, BOXES_AT + (b * IN_BOX + i) * BOXMON, G, false));
      const name = text(new Uint8Array(storage.buffer, BOX_NAMES_AT + b * 9, 9)) || `BOX ${b + 1}`;
      boxes.push({ name, mons });
    }
    return { party, boxes };
  }

  return { read, levelFor, expAt, text };
})();
