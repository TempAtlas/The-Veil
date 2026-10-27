// The damage engine: the modern (Gen 5+, as the game's expansion runs it) formula, 4096-based modifier chains and
// rounding as the games do them, the 16 damage rolls, multi-hit moves and KO chances. Pure functions over the data in
// game.json; the page (calc.js) only builds the inputs. Runs in Node too, for tests.
(function (root) {
  "use strict";

  const TYPES = ["NORMAL", "FIRE", "WATER", "ELECTRIC", "GRASS", "ICE", "FIGHTING", "POISON", "GROUND", "FLYING",
    "PSYCHIC", "BUG", "ROCK", "GHOST", "DRAGON", "DARK", "STEEL", "FAIRY"];
  // attacking type -> {defending type: multiplier} (only the entries that aren't 1)
  const CHART = {
    NORMAL: { ROCK: .5, GHOST: 0, STEEL: .5 },
    FIRE: { FIRE: .5, WATER: .5, GRASS: 2, ICE: 2, BUG: 2, ROCK: .5, DRAGON: .5, STEEL: 2 },
    WATER: { FIRE: 2, WATER: .5, GRASS: .5, GROUND: 2, ROCK: 2, DRAGON: .5 },
    ELECTRIC: { WATER: 2, ELECTRIC: .5, GRASS: .5, GROUND: 0, FLYING: 2, DRAGON: .5 },
    GRASS: { FIRE: .5, WATER: 2, GRASS: .5, POISON: .5, GROUND: 2, FLYING: .5, BUG: .5, ROCK: 2, DRAGON: .5, STEEL: .5 },
    ICE: { FIRE: .5, WATER: .5, GRASS: 2, ICE: .5, GROUND: 2, FLYING: 2, DRAGON: 2, STEEL: .5 },
    FIGHTING: { NORMAL: 2, ICE: 2, POISON: .5, FLYING: .5, PSYCHIC: .5, BUG: .5, ROCK: 2, GHOST: 0, DARK: 2, STEEL: 2, FAIRY: .5 },
    POISON: { GRASS: 2, POISON: .5, GROUND: .5, ROCK: .5, GHOST: .5, STEEL: 0, FAIRY: 2 },
    GROUND: { FIRE: 2, ELECTRIC: 2, GRASS: .5, POISON: 2, FLYING: 0, BUG: .5, ROCK: 2, STEEL: 2 },
    FLYING: { ELECTRIC: .5, GRASS: 2, FIGHTING: 2, BUG: 2, ROCK: .5, STEEL: .5 },
    PSYCHIC: { FIGHTING: 2, POISON: 2, PSYCHIC: .5, DARK: 0, STEEL: .5 },
    BUG: { FIRE: .5, GRASS: 2, FIGHTING: .5, POISON: .5, FLYING: .5, PSYCHIC: 2, GHOST: .5, DARK: 2, STEEL: .5, FAIRY: .5 },
    ROCK: { FIRE: 2, ICE: 2, FIGHTING: .5, GROUND: .5, FLYING: 2, BUG: 2, STEEL: .5 },
    GHOST: { NORMAL: 0, PSYCHIC: 2, GHOST: 2, DARK: .5 },
    DRAGON: { DRAGON: 2, STEEL: .5, FAIRY: 0 },
    DARK: { FIGHTING: .5, PSYCHIC: 2, GHOST: 2, DARK: .5, FAIRY: .5 },
    STEEL: { FIRE: .5, WATER: .5, ELECTRIC: .5, ICE: 2, ROCK: 2, STEEL: .5, FAIRY: 2 },
    FAIRY: { FIRE: .5, FIGHTING: 2, POISON: .5, DRAGON: 2, DARK: 2, STEEL: .5 },
  };
  const STATS = ["hp", "atk", "def", "spa", "spd", "spe"];
  const STAT_LABEL = { hp: "HP", atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe" };
  const NATURES = {
    Hardy: [], Lonely: ["atk", "def"], Brave: ["atk", "spe"], Adamant: ["atk", "spa"], Naughty: ["atk", "spd"],
    Bold: ["def", "atk"], Docile: [], Relaxed: ["def", "spe"], Impish: ["def", "spa"], Lax: ["def", "spd"],
    Timid: ["spe", "atk"], Hasty: ["spe", "def"], Serious: [], Jolly: ["spe", "spa"], Naive: ["spe", "spd"],
    Modest: ["spa", "atk"], Mild: ["spa", "def"], Quiet: ["spa", "spe"], Bashful: [], Rash: ["spa", "spd"],
    Calm: ["spd", "atk"], Gentle: ["spd", "def"], Sassy: ["spd", "spe"], Careful: ["spd", "spa"], Quirky: [],
  };

  // ---- the games' arithmetic
  const pokeRound = (n) => (n % 1 > 0.5 ? Math.ceil(n) : Math.floor(n));
  function chain(mods) {
    let M = 4096;
    for (const m of mods) if (m !== 4096) M = (M * m + 2048) >> 12;
    return Math.max(Math.min(M, 131072), 41);
  }
  const applyMod = (v, mods) => pokeRound((v * chain(mods)) / 4096);

  function calcStat(stat, base, iv, ev, level, nature) {
    if (stat === "hp") return base === 1 ? 1 : Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
    const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
    const [up, down] = NATURES[nature] || [];
    return Math.floor(raw * (up === stat ? 1.1 : down === stat ? 0.9 : 1));
  }
  function boosted(v, stage) {
    stage = Math.max(-6, Math.min(6, stage || 0));
    return stage >= 0 ? Math.floor((v * (2 + stage)) / 2) : Math.floor((v * 2) / (2 - stage));
  }

  // ---- a Pokémon as the engine sees it
  function prepare(G, mon) {
    const sp = G.species[mon.species];
    if (!sp) throw new Error(`unknown species ${mon.species}`);
    const stats = {};
    STATS.forEach((s, i) => (stats[s] = calcStat(s, sp.bs[i], mon.ivs?.[s] ?? 31, 0, mon.level, mon.nature)));
    const maxHP = stats.hp;
    const curHP = mon.curHP != null ? Math.min(mon.curHP, maxHP) : Math.max(1, Math.round((maxHP * (mon.hpPct ?? 100)) / 100));
    return Object.assign({}, mon, { sp, types: mon.types || sp.types, stats, maxHP, curHP, boosts: mon.boosts || {},
      ability: mon.ability || "", item: mon.item || "", status: mon.status || "" });
  }

  const has = (m, flag) => !!(m && m.flags && m.flags.includes(flag));
  const itemOf = (G, p) => (p.item && G.items[p.item]) || null;

  function grounded(G, p, field, moldBreaker) {
    if (field.gravity) return true;
    if (p.types.includes("FLYING") || (p.ability === "LEVITATE" && !moldBreaker)) return false;
    const it = itemOf(G, p);
    return !(it && it.hold === "AIR_BALLOON");
  }

  function speed(G, p, field) {
    let s = boosted(p.stats.spe, p.boosts.spe);
    const mods = [];
    const it = itemOf(G, p);
    if (it && it.hold === "CHOICE_SCARF") mods.push(6144);
    if (it && (it.hold === "IRON_BALL" || it.hold === "MACHO_BRACE" || it.hold === "POWER_ITEM")) mods.push(2048);
    const w = field.weather;
    if ((p.ability === "SWIFT_SWIM" && w === "rain") || (p.ability === "CHLOROPHYLL" && w === "sun") ||
        (p.ability === "SAND_RUSH" && w === "sand") || (p.ability === "SLUSH_RUSH" && (w === "snow" || w === "hail")) ||
        (p.ability === "SURGE_SURFER" && field.terrain === "electric") || (p.ability === "UNBURDEN" && p.unburden)) mods.push(8192);
    if (p.ability === "QUICK_FEET" && p.status) mods.push(6144);
    s = applyMod(s, mods);
    if (p.status === "par" && p.ability !== "QUICK_FEET") s = Math.floor(s / 2);
    if (p.tailwind) s *= 2;
    return s;
  }

  // ---- type effectiveness, immunities included
  function effectiveness(G, moveType, move, att, def, field, moldBreaker) {
    let e = 1;
    for (const t of def.types) {
      let m = CHART[moveType]?.[t] ?? 1;
      if (m === 0 && t === "GHOST" && (moveType === "NORMAL" || moveType === "FIGHTING") &&
          (att.ability === "SCRAPPY" || att.ability === "MINDS_EYE")) m = 1;
      if (m === 0 && t === "FLYING" && moveType === "GROUND" && (move.key === "THOUSAND_ARROWS" || field.gravity)) m = 1;
      if (move.key === "FREEZE_DRY" && t === "WATER") m = 2;
      e *= m;
      if (move.key === "FLYING_PRESS") e *= CHART.FLYING[t] ?? 1;
    }
    if (moveType === "GROUND" && e > 0 && !grounded(G, def, field, moldBreaker) && move.key !== "THOUSAND_ARROWS") e = 0;
    if (!moldBreaker) {
      const a = def.ability;
      const imm = { LEVITATE: "GROUND", EARTH_EATER: "GROUND", FLASH_FIRE: "FIRE", WELL_BAKED_BODY: "FIRE",
        WATER_ABSORB: "WATER", STORM_DRAIN: "WATER", DRY_SKIN: "WATER", VOLT_ABSORB: "ELECTRIC", LIGHTNING_ROD: "ELECTRIC",
        MOTOR_DRIVE: "ELECTRIC", SAP_SIPPER: "GRASS" };
      if (imm[a] === moveType && !(a === "LEVITATE" && move.key === "THOUSAND_ARROWS")) e = 0;
      if (a === "WONDER_GUARD" && e <= 1) e = 0;
      if (a === "BULLETPROOF" && has(move, "ballisticMove")) e = 0;
      if (a === "SOUNDPROOF" && has(move, "soundMove")) e = 0;
      if (a === "WIND_RIDER" && has(move, "windMove")) e = 0;
      if ((a === "DAZZLING" || a === "QUEENLY_MAJESTY" || a === "ARMOR_TAIL") && move.pri > 0) e = 0;
    }
    if (field.terrain === "psychic" && move.pri > 0 && grounded(G, def, field)) e = 0;
    return e;
  }

  // ---- the move's type and power for this attacker / target / field
  function moveType(G, move, att, field) {
    let t = move.type;
    const w = field.weather;
    if (move.key === "WEATHER_BALL") t = { sun: "FIRE", rain: "WATER", sand: "ROCK", snow: "ICE", hail: "ICE" }[w] || "NORMAL";
    if (move.key === "TERRAIN_PULSE") t = { electric: "ELECTRIC", grassy: "GRASS", psychic: "PSYCHIC", misty: "FAIRY" }[field.terrain] || "NORMAL";
    const ate = { AERILATE: "FLYING", PIXILATE: "FAIRY", REFRIGERATE: "ICE", GALVANIZE: "ELECTRIC" }[att.ability];
    let ated = false;
    if (ate && t === "NORMAL") { t = ate; ated = true; }
    if (att.ability === "NORMALIZE") { t = "NORMAL"; ated = true; }
    if (att.ability === "LIQUID_VOICE" && has(move, "soundMove")) t = "WATER";
    return { t, ated };
  }

  const WEIGHT_BP = (w) => (w < 100 ? 20 : w < 250 ? 40 : w < 500 ? 60 : w < 1000 ? 80 : w < 2000 ? 100 : 120);

  function basePower(G, move, att, def, field, ctx) {
    let bp = move.bp;
    const k = move.key;
    const attIt = itemOf(G, att), defIt = itemOf(G, def);
    const pct = (p) => p.curHP / p.maxHP;
    switch (k) {
      case "FACADE": if (att.status) bp *= 2; break;
      case "HEX": case "INFERNAL_PARADE": case "BITTER_MALICE": if (def.status) bp *= 2; break;
      case "VENOSHOCK": case "BARB_BARRAGE": if (def.status === "psn" || def.status === "tox") bp *= 2; break;
      case "BRINE": if (pct(def) <= 0.5) bp *= 2; break;
      case "ACROBATICS": if (!att.item) bp *= 2; break;
      case "WEATHER_BALL": if (field.weather) bp = 100; break;
      case "TERRAIN_PULSE": if (field.terrain && grounded(G, att, field)) bp = 100; break;
      case "LOW_KICK": case "GRASS_KNOT": bp = WEIGHT_BP(def.sp.weight); break;
      case "HEAVY_SLAM": case "HEAT_CRASH": {
        const r = att.sp.weight / Math.max(1, def.sp.weight);
        bp = r >= 5 ? 120 : r >= 4 ? 100 : r >= 3 ? 80 : r >= 2 ? 60 : 40; break;
      }
      case "GYRO_BALL": bp = Math.min(150, Math.floor((25 * ctx.defSpe) / Math.max(1, ctx.attSpe)) + 1); break;
      case "ELECTRO_BALL": {
        const r = ctx.attSpe / Math.max(1, ctx.defSpe);
        bp = r >= 4 ? 150 : r >= 3 ? 120 : r >= 2 ? 80 : r >= 1 ? 60 : 40; break;
      }
      case "STORED_POWER": case "POWER_TRIP":
        bp = 20 + 20 * Object.values(att.boosts).reduce((s, v) => s + Math.max(0, v || 0), 0); break;
      case "FLAIL": case "REVERSAL": {
        const p = Math.floor((48 * att.curHP) / att.maxHP);
        bp = p <= 1 ? 200 : p <= 4 ? 150 : p <= 9 ? 100 : p <= 16 ? 80 : p <= 32 ? 40 : 20; break;
      }
      case "ERUPTION": case "WATER_SPOUT": case "DRAGON_ENERGY": bp = Math.max(1, Math.floor((150 * att.curHP) / att.maxHP)); break;
      case "WRING_OUT": case "CRUSH_GRIP": bp = Math.max(1, Math.floor((120 * def.curHP) / def.maxHP)); break;
      case "HARD_PRESS": bp = Math.max(1, Math.floor((100 * def.curHP) / def.maxHP)); break;
      case "RETURN": case "FRUSTRATION": bp = 102; break;
      case "PAYBACK": if (!ctx.attFirst) bp *= 2; break;
      case "BOLT_BEAK": case "FISHIOUS_REND": if (ctx.attFirst) bp *= 2; break;
      case "KNOCK_OFF": if (def.item && !(defIt && /MEGA_STONE|Z_CRYSTAL|PRIMAL_ORB/.test(defIt.hold))) ctx.knock = true; break;
      case "SOLAR_BEAM": case "SOLAR_BLADE":
        if (["rain", "sand", "snow", "hail"].includes(field.weather)) bp = Math.floor(bp / 2); break;
      case "MAGNITUDE": bp = 70; break;
      case "PURSUIT": if (ctx.switching) bp *= 2; break;
    }
    return bp;
  }

  const FIXED = { SEISMIC_TOSS: "level", NIGHT_SHADE: "level", SUPER_FANG: "half", NATURES_MADNESS: "half", RUINATION: "half",
    ENDEAVOR: "endeavor", FINAL_GAMBIT: "gambit", DRAGON_RAGE: 40, SONIC_BOOM: 20 };

  // ---- one hit: the 16 damage rolls
  function hitRolls(G, move, att, def, field, opts, hitBP, ctx) {
    const { t: type, ated } = moveType(G, move, att, field);
    const moldBreaker = ["MOLD_BREAKER", "TERAVOLT", "TURBOBLAZE"].includes(att.ability);
    const dAb = moldBreaker ? "" : def.ability;
    const eff = effectiveness(G, type, move, att, def, field, moldBreaker);
    const out = { type, eff };
    if (eff === 0) return Object.assign(out, { rolls: new Array(16).fill(0) });

    const fixed = FIXED[move.key];
    if (fixed) {
      const v = fixed === "level" ? att.level : fixed === "half" ? Math.max(1, Math.floor(def.curHP / 2))
        : fixed === "endeavor" ? Math.max(0, def.curHP - att.curHP) : fixed === "gambit" ? att.curHP : fixed;
      return Object.assign(out, { rolls: new Array(16).fill(v), fixed: true });
    }

    const physical = move.cat === "Physical";
    const attIt = itemOf(G, att), defIt = itemOf(G, def);
    let crit = !!opts.crit || has(move, "alwaysCriticalHit") || (att.ability === "MERCILESS" && (def.status === "psn" || def.status === "tox"));
    if (["BATTLE_ARMOR", "SHELL_ARMOR"].includes(dAb)) crit = false;
    out.crit = crit;
    const notes = [];

    // base power
    let bp = hitBP;
    const bpMods = [];
    if (att.ability === "TECHNICIAN" && bp <= 60) bpMods.push(6144);
    if (att.ability === "IRON_FIST" && has(move, "punchingMove")) bpMods.push(4915);
    if (att.ability === "STRONG_JAW" && has(move, "bitingMove")) bpMods.push(6144);
    if (att.ability === "MEGA_LAUNCHER" && has(move, "pulseMove")) bpMods.push(6144);
    if (att.ability === "SHARPNESS" && has(move, "slicingMove")) bpMods.push(6144);
    if (att.ability === "TOUGH_CLAWS" && has(move, "makesContact")) bpMods.push(5325);
    if (att.ability === "RECKLESS" && (move.recoil || /RECOIL/.test(move.effect))) bpMods.push(4915);
    if (att.ability === "SHEER_FORCE" && has(move, "secondary")) bpMods.push(5325);
    if (att.ability === "SAND_FORCE" && field.weather === "sand" && ["ROCK", "GROUND", "STEEL"].includes(type)) bpMods.push(5325);
    if (att.ability === "ANALYTIC" && !ctx.attFirst) bpMods.push(5325);
    if (att.ability === "PUNK_ROCK" && has(move, "soundMove")) bpMods.push(5325);
    if (att.ability === "STEELY_SPIRIT" && type === "STEEL") bpMods.push(6144);
    if (ated) bpMods.push(4915);
    if (att.ability === "TOXIC_BOOST" && physical && (att.status === "psn" || att.status === "tox")) bpMods.push(6144);
    if (att.ability === "FLARE_BOOST" && !physical && att.status === "brn") bpMods.push(6144);
    if (att.ability === "AMBUSH" && att.ambush) bpMods.push(4915);
    if (dAb === "HEATPROOF" && type === "FIRE") bpMods.push(2048);
    if (dAb === "DRY_SKIN" && type === "FIRE") bpMods.push(5120);
    if (attIt) {
      const h = attIt.hold;
      if ((h === "TYPE_POWER" || h === "PLATE") && attIt.type === type) bpMods.push(4915);
      if (h === "GEMS" && attIt.type === type) bpMods.push(5325);
      if (h === "MUSCLE_BAND" && physical) bpMods.push(4505);
      if (h === "WISE_GLASSES" && !physical) bpMods.push(4505);
      if (h === "PUNCHING_GLOVE" && has(move, "punchingMove")) bpMods.push(4505);
      if (h === "SOUL_DEW" && /^LATI(AS|OS)/.test(att.species) && (type === "DRAGON" || type === "PSYCHIC")) bpMods.push(4915);
      if (h === "ADAMANT_ORB" && /^DIALGA/.test(att.species) && (type === "DRAGON" || type === "STEEL")) bpMods.push(4915);
      if (h === "LUSTROUS_ORB" && /^PALKIA/.test(att.species) && (type === "DRAGON" || type === "WATER")) bpMods.push(4915);
      if (h === "GRISEOUS_ORB" && /^GIRATINA/.test(att.species) && (type === "DRAGON" || type === "GHOST")) bpMods.push(4915);
    }
    if (ctx.knock) bpMods.push(6144);
    if (field.helpingHand) bpMods.push(6144);
    const gA = grounded(G, att, field), gD = grounded(G, def, field);
    const terrainBoost = { electric: "ELECTRIC", grassy: "GRASS", psychic: "PSYCHIC" }[field.terrain];
    if (terrainBoost === type && gA) bpMods.push(5325);
    if (field.terrain === "misty" && type === "DRAGON" && gD) bpMods.push(2048);
    if (field.terrain === "grassy" && ["EARTHQUAKE", "BULLDOZE", "MAGNITUDE"].includes(move.key) && gD) bpMods.push(2048);
    bp = Math.max(1, applyMod(bp, bpMods));

    // attack
    const atkStat = move.key === "BODY_PRESS" ? "def" : physical ? "atk" : "spa";
    const source = move.key === "FOUL_PLAY" ? def : att;
    let atkStage = source.boosts[atkStat] || 0;
    if (dAb === "UNAWARE") atkStage = 0;
    if (crit && atkStage < 0) atkStage = 0;
    let atk = boosted(source.stats[atkStat], atkStage);
    if (att.ability === "HUSTLE" && physical) atk = applyMod(atk, [6144]);
    const atkMods = [];
    if ((att.ability === "HUGE_POWER" || att.ability === "PURE_POWER") && physical) atkMods.push(8192);
    if (att.ability === "GUTS" && att.status && physical) atkMods.push(6144);
    if (att.ability === "GORILLA_TACTICS" && physical) atkMods.push(6144);
    if (att.ability === "SOLAR_POWER" && !physical && field.weather === "sun") atkMods.push(6144);
    if (att.ability === "FLASH_FIRE" && att.flashFire && type === "FIRE") atkMods.push(6144);
    const pinch = { BLAZE: "FIRE", TORRENT: "WATER", OVERGROW: "GRASS", SWARM: "BUG" }[att.ability];
    if (pinch === type && att.curHP * 3 <= att.maxHP) atkMods.push(6144);
    if (att.ability === "DEFEATIST" && att.curHP * 2 <= att.maxHP) atkMods.push(2048);
    if (att.ability === "SLOW_START" && physical) atkMods.push(2048);
    if ((att.ability === "STEELWORKER") && type === "STEEL") atkMods.push(6144);
    if (att.ability === "TRANSISTOR" && type === "ELECTRIC") atkMods.push(5325);
    if (att.ability === "DRAGONS_MAW" && type === "DRAGON") atkMods.push(6144);
    if (att.ability === "ROCKY_PAYLOAD" && type === "ROCK") atkMods.push(6144);
    if (att.ability === "WATER_BUBBLE" && type === "WATER") atkMods.push(8192);
    if (att.ability === "STAKEOUT" && def.switchedIn) atkMods.push(8192);
    if (dAb === "THICK_FAT" && (type === "FIRE" || type === "ICE")) atkMods.push(2048);
    if (dAb === "WATER_BUBBLE" && type === "FIRE") atkMods.push(2048);
    if (dAb === "PURIFYING_SALT" && type === "GHOST") atkMods.push(2048);
    if (attIt && source === att) {
      const h = attIt.hold;
      if (h === "CHOICE_BAND" && physical) atkMods.push(6144);
      if (h === "CHOICE_SPECS" && !physical) atkMods.push(6144);
      if (h === "LIGHT_BALL" && /^PIKACHU/.test(att.species)) atkMods.push(8192);
      if (h === "THICK_CLUB" && /^(CUBONE|MAROWAK)/.test(att.species) && physical) atkMods.push(8192);
      if (h === "DEEP_SEA_TOOTH" && att.species === "CLAMPERL" && !physical) atkMods.push(8192);
    }
    atk = Math.max(1, applyMod(atk, atkMods));

    // defence
    const useDef = physical || ["PSYSHOCK", "PSYSTRIKE", "SECRET_SWORD"].includes(move.key);
    const defStat = useDef ? "def" : "spd";
    let defStage = def.boosts[defStat] || 0;
    if (att.ability === "UNAWARE") defStage = 0;
    if (crit && defStage > 0) defStage = 0;
    let dfs = boosted(def.stats[defStat], defStage);
    if (field.weather === "sand" && def.types.includes("ROCK") && !useDef) dfs = applyMod(dfs, [6144]);
    if (field.weather === "snow" && def.types.includes("ICE") && useDef) dfs = applyMod(dfs, [6144]);
    const dfMods = [];
    if (dAb === "FUR_COAT" && useDef) dfMods.push(8192);
    if (dAb === "MARVEL_SCALE" && def.status && useDef) dfMods.push(6144);
    if (dAb === "GRASS_PELT" && field.terrain === "grassy" && useDef) dfMods.push(6144);
    if (defIt) {
      const h = defIt.hold;
      if (h === "EVIOLITE" && def.sp.nfe) dfMods.push(6144);
      if (h === "ASSAULT_VEST" && !useDef) dfMods.push(6144);
      if (h === "DEEP_SEA_SCALE" && def.species === "CLAMPERL" && !useDef) dfMods.push(8192);
      if (h === "METAL_POWDER" && def.species === "DITTO" && useDef) dfMods.push(8192);
    }
    dfs = Math.max(1, applyMod(dfs, dfMods));

    // the formula
    let base = Math.floor(Math.floor((Math.floor((2 * att.level) / 5 + 2) * bp * atk) / dfs) / 50) + 2;
    if (field.doubles && has(move, "spread")) base = pokeRound((base * 3072) / 4096);
    const w = field.weather;
    const weatherHeld = attIt && attIt.hold === "UTILITY_UMBRELLA";
    if (!weatherHeld && w === "sun") { if (type === "FIRE") base = pokeRound((base * 6144) / 4096); else if (type === "WATER") base = pokeRound((base * 2048) / 4096); }
    if (!weatherHeld && w === "rain") { if (type === "WATER") base = pokeRound((base * 6144) / 4096); else if (type === "FIRE") base = pokeRound((base * 2048) / 4096); }
    if (crit) base = Math.floor(base * 1.5);

    let stab = 4096;
    if (att.types.includes(type)) stab = att.ability === "ADAPTABILITY" ? 8192 : 6144;
    const burn = att.status === "brn" && physical && att.ability !== "GUTS" && move.key !== "FACADE";

    const finals = [];
    const screen = (physical && (field.reflect || field.auroraVeil)) || (!physical && (field.lightScreen || field.auroraVeil));
    if (screen && !crit && att.ability !== "INFILTRATOR") finals.push(field.doubles ? 2732 : 2048);
    if ((dAb === "MULTISCALE" || def.ability === "SHADOW_SHIELD") && def.curHP === def.maxHP) finals.push(2048);
    if (dAb === "FLUFFY" && has(move, "makesContact")) finals.push(2048);
    if (dAb === "FLUFFY" && type === "FIRE") finals.push(8192);
    if (dAb === "PUNK_ROCK" && has(move, "soundMove")) finals.push(2048);
    if (dAb === "ICE_SCALES" && !physical) finals.push(2048);
    if ((dAb === "FILTER" || dAb === "SOLID_ROCK" || def.ability === "PRISM_ARMOR") && eff > 1) finals.push(3072);
    if (att.ability === "NEUROFORCE" && eff > 1) finals.push(5120);
    if (att.ability === "SNIPER" && crit) finals.push(6144);
    if (att.ability === "TINTED_LENS" && eff < 1) finals.push(8192);
    if ((move.key === "COLLISION_COURSE" || move.key === "ELECTRO_DRIFT") && eff > 1) finals.push(5461);
    if (attIt && attIt.hold === "EXPERT_BELT" && eff > 1) finals.push(4915);
    if (attIt && attIt.hold === "LIFE_ORB") finals.push(5324);
    if (defIt && defIt.hold === "RESIST_BERRY" && defIt.type === type && (eff > 1 || type === "NORMAL") && !opts.berryUsed) {
      finals.push(def.ability === "RIPEN" ? 1024 : 2048); notes.push(`${defIt.name} halves it`);
    }
    const finalMod = chain(finals);

    const rolls = [];
    for (let r = 85; r <= 100; r++) {
      let d = Math.floor((base * r) / 100);
      d = pokeRound((d * stab) / 4096);
      d = Math.floor(d * eff);
      if (burn) d = Math.floor(d / 2);
      d = pokeRound((d * finalMod) / 4096);
      rolls.push(Math.max(1, d));
    }
    return Object.assign(out, { rolls, bp, atk, def: dfs, atkStat, defStat, stab: stab > 4096, burn, notes });
  }

  // ---- how many times a move hits, and with what power each time
  function hitPlan(G, move, att, opts) {
    const it = itemOf(G, att);
    const k = move.key;
    if (k === "TRIPLE_AXEL") return [20, 40, 60];
    if (k === "TRIPLE_KICK") return [10, 20, 30];
    if (move.hits && !has(move, "multiHit")) return new Array(move.hits).fill(move.bp);
    if (k === "POPULATION_BOMB") {
      const n = att.ability === "SKILL_LINK" ? 10 : opts.hits || (it && it.hold === "LOADED_DICE" ? 7 : 10);
      return new Array(n).fill(move.bp);
    }
    if (has(move, "multiHit")) {
      const n = att.ability === "SKILL_LINK" ? 5 : opts.hits || (it && it.hold === "LOADED_DICE" ? 4 : 3);
      return new Array(n).fill(move.bp);
    }
    return [null];
  }

  // a probability distribution over damage: Map damage -> chance
  function rollDist(rolls) { const m = new Map(); for (const r of rolls) m.set(r, (m.get(r) || 0) + 1 / rolls.length); return m; }
  function convolve(a, b, cap) {
    const out = new Map();
    for (const [x, p] of a) for (const [y, q] of b) {
      const k = Math.min(cap, x + y);
      out.set(k, (out.get(k) || 0) + p * q);
    }
    return out;
  }

  // the chance to KO in n uses: hp is what's left after entry hazards; eot is the HP the target gains (Leftovers) or
  // loses (weather, poison) between uses
  function koText(dist, hp, maxHits, eot, after) {
    let acc = new Map([[0, 1]]);
    const tail = after.length ? ` after ${after.join(" and ")}` : "";
    for (let n = 1; n <= maxHits; n++) {
      const need = hp + (n - 1) * eot;
      if (need <= 0) return { n, chance: 1, text: `guaranteed ${n === 1 ? "OHKO" : n + "HKO"}${tail}` };
      acc = convolve(acc, dist, Math.max(need, hp) + 100000);
      let p = 0;
      for (const [d, q] of acc) if (d >= need) p += q;
      if (p > 0) {
        const name = n === 1 ? "OHKO" : `${n}HKO`;
        if (p >= 0.99999) return { n, chance: 1, text: `guaranteed ${name}${tail}` };
        return { n, chance: p, text: `${p < 0.001 ? "<0.1" : (p * 100).toFixed(1)}% chance to ${name}${tail}` };
      }
    }
    return { n: null, chance: 0, text: `takes ${maxHits + 1}+ hits to KO${tail}` };
  }

  // entry hazards on the target's side, and what the end of each turn does to it
  function chip(G, def, field) {
    const side = field.defSide || {};
    const after = [];
    let hazard = 0, eot = 0;
    const it = itemOf(G, def);
    const guard = def.ability === "MAGIC_GUARD";
    if (!guard && !(it && it.hold === "HEAVY_DUTY_BOOTS")) {
      if (side.stealthRock) {
        let e = 1;
        for (const t of def.types) e *= CHART.ROCK[t] ?? 1;
        hazard += Math.floor((def.maxHP * e) / 8); after.push("Stealth Rock");
      }
      const sp = +side.spikes || 0;
      if (sp && grounded(G, def, field)) {
        hazard += Math.floor(def.maxHP / [0, 8, 6, 4][Math.min(3, sp)]); after.push(`${sp} layer${sp > 1 ? "s" : ""} of Spikes`);
      }
    }
    const w = field.weather;
    if (!guard && w === "sand" && !def.types.some((t) => ["ROCK", "GROUND", "STEEL"].includes(t)) &&
        !["SAND_VEIL", "SAND_RUSH", "SAND_FORCE", "OVERCOAT"].includes(def.ability) && !(it && it.hold === "SAFETY_GOGGLES")) {
      eot -= Math.floor(def.maxHP / 16); after.push("sandstorm damage");
    }
    if (!guard && w === "hail" && !def.types.includes("ICE") && !["ICE_BODY", "SNOW_CLOAK", "OVERCOAT"].includes(def.ability)) {
      eot -= Math.floor(def.maxHP / 16); after.push("hail damage");
    }
    if (def.ability === "ICE_BODY" && (w === "hail" || w === "snow")) { eot += Math.floor(def.maxHP / 16); after.push("Ice Body recovery"); }
    if (def.ability === "RAIN_DISH" && w === "rain") { eot += Math.floor(def.maxHP / 16); after.push("Rain Dish recovery"); }
    if (def.ability === "DRY_SKIN" && w === "rain") { eot += Math.floor(def.maxHP / 8); after.push("Dry Skin recovery"); }
    if (it && it.hold === "LEFTOVERS") { eot += Math.floor(def.maxHP / 16); after.push("Leftovers recovery"); }
    if (it && it.hold === "BLACK_SLUDGE") {
      if (def.types.includes("POISON")) { eot += Math.floor(def.maxHP / 16); after.push("Black Sludge recovery"); }
      else if (!guard) { eot -= Math.floor(def.maxHP / 8); after.push("Black Sludge damage"); }
    }
    if (field.grassyHeal && field.terrain === "grassy" && grounded(G, def, field)) { eot += Math.floor(def.maxHP / 16); after.push("Grassy Terrain recovery"); }
    if (!guard && (def.status === "psn" || def.status === "tox")) {
      if (def.ability === "POISON_HEAL") { eot += Math.floor(def.maxHP / 8); after.push("Poison Heal"); }
      else { eot -= Math.floor(def.maxHP / (def.status === "tox" ? 16 : 8)); after.push(def.status === "tox" ? "toxic damage" : "poison damage"); }
    }
    if (!guard && def.status === "brn") { eot -= Math.floor(def.maxHP / 16); after.push("burn damage"); }
    return { hazard, eot, after };
  }

  // ---- the whole calculation for one move
  function calculate(G, attIn, defIn, moveKey, field, opts) {
    opts = opts || {};
    field = field || {};
    const att = prepare(G, attIn), def = prepare(G, defIn);
    if (!G.moves[moveKey]) return null;
    // (the panel's own power / type / category boxes, where they were changed)
    const over = {};
    for (const [k, v] of Object.entries(opts.override || {})) if (v !== "" && v != null) over[k] = k === "bp" ? +v : v;
    const move = Object.assign({ key: moveKey }, G.moves[moveKey], over);
    att.tailwind = !!(field.attSide || {}).tailwind;
    def.tailwind = !!(field.defSide || {}).tailwind;
    const attSpe = speed(G, att, field), defSpe = speed(G, def, field);
    const ctx = { attSpe, defSpe, attFirst: move.pri > 0 || attSpe > defSpe, switching: !!opts.switching };
    if (move.cat === "Status" || (!move.bp && !FIXED[moveKey])) {
      return { move, status: true, att, def, desc: `${move.name} doesn't deal damage.` };
    }
    const fieldFor = Object.assign({}, field, field.defSide || {}, { helpingHand: (field.attSide || {}).helpingHand });
    const plan = hitPlan(G, move, att, opts);
    const hits = plan.map((bp) => hitRolls(G, move, att, def, fieldFor, opts, basePower(G, Object.assign({}, move, bp != null ? { bp } : {}), att, def, fieldFor, ctx), ctx));
    // (the ctx flags basePower sets - Knock Off - apply from the first hit on)
    let dist = new Map([[0, 1]]);
    const cap = def.curHP + 100000;
    for (const hr of hits) dist = convolve(dist, rollDist(hr.rolls), cap);
    const min = hits.reduce((s, hr) => s + hr.rolls[0], 0);
    const max = hits.reduce((s, hr) => s + hr.rolls[15], 0);
    const first = hits[0];
    const pct = (d) => (100 * d) / def.maxHP;
    const ch = chip(G, def, field);
    const ko = first.eff === 0 ? { text: "no effect" } : koText(dist, Math.max(1, def.curHP - ch.hazard), 4, ch.eot, ch.after);
    const res = { move, att, def, hits, min, max, minPct: pct(min), maxPct: pct(max), ko, eff: first.eff, type: first.type,
      crit: first.crit, attSpe, defSpe, nHits: plan.length };
    if (move.recoil) res.recoil = [Math.floor((min * move.recoil) / 100), Math.floor((max * move.recoil) / 100)];
    if (move.drain) res.drain = [Math.floor((min * move.drain) / 100), Math.floor((max * move.drain) / 100)];
    if (itemOf(G, att)?.hold === "LIFE_ORB" && max > 0 && att.ability !== "MAGIC_GUARD") res.lifeOrb = Math.floor(att.maxHP / 10);
    res.desc = describe(G, res, field, opts);
    return res;
  }

  function boostTag(p, stat) { const b = p.boosts[stat] || 0; return b ? `${b > 0 ? "+" : ""}${b} ` : ""; }

  function describe(G, r, field, opts) {
    const { att, def, move, hits } = r;
    const f = hits[0];
    const name = (p) => G.species[p.species].name;
    const parts = [];
    if (f.fixed) {
      parts.push(`Lv ${att.level} ${name(att)} ${move.name} vs. Lv ${def.level} ${name(def)}`);
    } else {
      const statTag = f.atkStat ? `${boostTag(move.key === "FOUL_PLAY" ? def : att, f.atkStat)}${STAT_LABEL[f.atkStat]} ${f.atk}` : "";
      parts.push(`Lv ${att.level} ${name(att)}${att.item ? " @ " + G.items[att.item].name : ""}${att.ability ? " (" + (G.abilities[att.ability]?.name || att.ability) + ")" : ""}`
        + ` [${statTag}]${att.status === "brn" && f.burn ? " burned" : ""} ${move.name}${r.nHits > 1 ? ` (${r.nHits} hits)` : ""}`
        + `${r.crit ? " on a critical hit" : ""} vs. Lv ${def.level} ${name(def)}${def.item ? " @ " + G.items[def.item].name : ""}`
        + `${def.ability ? " (" + (G.abilities[def.ability]?.name || def.ability) + ")" : ""} [${boostTag(def, f.defStat)}${STAT_LABEL[f.defStat]} ${f.def}, HP ${def.curHP}/${def.maxHP}]`);
      const fx = [];
      if (field.weather) fx.push({ sun: "in sun", rain: "in rain", sand: "in sand", snow: "in snow", hail: "in hail" }[field.weather]);
      if (field.terrain) fx.push(`on ${field.terrain} terrain`);
      const ds = field.defSide || {};
      if (ds.reflect && f.defStat === "def") fx.push("through Reflect");
      if (ds.lightScreen && f.defStat === "spd") fx.push("through Light Screen");
      if (ds.auroraVeil) fx.push("through Aurora Veil");
      if (fx.length) parts[0] += " " + fx.join(", ");
    }
    const range = r.eff === 0 ? "0 (no effect)" : `${r.min}-${r.max} (${r.minPct.toFixed(1)} - ${r.maxPct.toFixed(1)}%) -- ${r.ko.text}`;
    return `${parts[0]}: ${range}`;
  }

  const API = { TYPES, CHART, NATURES, STATS, STAT_LABEL, calcStat, boosted, prepare, speed, calculate, effectiveness,
    pokeRound, chain };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.VeilCalc = API;
})(typeof window !== "undefined" ? window : globalThis);
