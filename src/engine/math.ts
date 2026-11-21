import {
  HEROES_CATALOG,
  MAX_HERO_LEVEL,
  MAX_SKILL_LEVEL,
  PROGRESSION_TABLE,
  SKILL_UNLOCK_LEVEL,
  STRUCTURES_CATALOG,
  SYNERGIES_CATALOG,
} from '../data/gameCatalog';
import {
  BalanceConfig,
  FortressState,
  HeroCatalogEntry,
  HeroProgress,
  PlacedStructure,
  PlayerResources,
  StructureType,
  SynergyDefinition,
} from '../types/game';

export interface ComputedHeroStats {
  hp: number;
  attack: number;
  defense: number;
  moveSpeed: number;
  attackSpeed: number;
  range: number;
  splashRadius: number;
  energyGainMultiplier: number;
  powerScore: number;
}

export function getHeroById(heroId: string): HeroCatalogEntry | undefined {
  return HEROES_CATALOG.find((h) => h.id === heroId);
}

export function getActiveSynergies(heroIds: string[]): SynergyDefinition[] {
  const idSet = new Set(heroIds);
  return SYNERGIES_CATALOG.filter(
    (syn) => idSet.has(syn.heroIds[0]) && idSet.has(syn.heroIds[1])
  );
}

export function getCoreLevel(structures: PlacedStructure[]): number {
  const core = structures.find((s) => s.type === 'core');
  return core ? core.level : 1;
}

export function getCoreProgression(coreLevel: number) {
  const clamped = Math.max(1, Math.min(PROGRESSION_TABLE.length, coreLevel));
  return PROGRESSION_TABLE[clamped - 1];
}

export function computeHeroUpgradeCost(currentLevel: number): { essence: number; gold: number } {
  const step = Math.max(0, Math.min(MAX_HERO_LEVEL - 1, currentLevel - 1));
  return {
    essence: Math.round(32 + step * 14 + Math.pow(step, 1.42) * 2.2),
    gold: Math.round(45 + step * 18 + Math.pow(step, 1.45) * 2.8),
  };
}

export function isHeroSkillUnlocked(heroLevel: number): boolean {
  return heroLevel >= SKILL_UNLOCK_LEVEL;
}

export function getEffectiveSkillLevel(progress: HeroProgress | undefined): number {
  const heroLevel = progress?.level ?? 1;
  if (heroLevel < SKILL_UNLOCK_LEVEL) return 0;
  return Math.max(1, Math.min(MAX_SKILL_LEVEL, progress?.skillLevel || 1));
}

export function getMaxSkillLevelForHero(heroLevel: number): number {
  if (heroLevel < SKILL_UNLOCK_LEVEL) return 0;
  return Math.min(MAX_SKILL_LEVEL, heroLevel);
}

export function computeSkillUpgradeCost(currentSkillLevel: number): {
  essence: number;
  crystals: number;
} {
  const step = Math.max(0, currentSkillLevel - 1);
  return {
    essence: Math.round(55 * Math.pow(1.26, step)),
    crystals: Math.round(35 * Math.pow(1.24, step)),
  };
}

export function computeHeroSkillPower(heroId: string, skillLevel: number) {
  const lv = Math.max(1, Math.min(MAX_SKILL_LEVEL, skillLevel));
  if (heroId === 'aegor') {
    const shieldPct = 0.3 + (lv - 1) * 0.025;
    const durationSec = 5.5 + (lv - 1) * 0.25;
    return {
      shieldPct,
      durationSec,
      summary: `Escudo tribal de ${Math.round(shieldPct * 100)}% da Vida Máxima de Aegor para toda a equipe (${durationSec.toFixed(1)}s).`,
    };
  }
  const damageMult = 2.8 + (lv - 1) * 0.18;
  const atkSpeedBonusPct = Math.round(35 + (lv - 1) * 2.5);
  return {
    damageMult,
    atkSpeedBonusPct,
    summary: `Disparo incendiário de ${Math.round(damageMult * 100)}% do Ataque no alvo prioritário e +${atkSpeedBonusPct}% vel. de ataque por 5s.`,
  };
}

export function computeStructureUpgradeCost(
  type: StructureType,
  currentLevel: number
): { gold: number; crystals: number } {
  const entry = STRUCTURES_CATALOG[type];
  if (type === 'core') {
    const nextRow = PROGRESSION_TABLE[currentLevel]; // 0-indexed, so currentLevel = next level row
    if (nextRow) {
      return { gold: nextRow.upgradeGold, crystals: nextRow.upgradeCrystals };
    }
  }
  const factor = Math.pow(entry.upgradeCostScale, currentLevel);
  return {
    gold: Math.round(entry.baseCost.gold * factor),
    crystals: Math.round(entry.baseCost.crystals * factor),
  };
}

export function computeStructureBuildDurationSec(type: StructureType): number {
  return Math.max(3, STRUCTURES_CATALOG[type].buildTimeSec);
}

export function computeStructureUpgradeDurationSec(
  type: StructureType,
  currentLevel: number
): number {
  const base = Math.max(4, STRUCTURES_CATALOG[type].buildTimeSec);
  if (type === 'core') {
    return Math.round(18 * Math.pow(1.48, currentLevel));
  }
  return Math.round(base * Math.pow(1.42, currentLevel) + currentLevel * 4);
}

export function computeSpeedupCrystalCost(remainingSec: number): number {
  if (remainingSec <= 3) return 0;
  return Math.max(1, Math.ceil(remainingSec / 18));
}

export function formatDurationSec(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  if (mins < 60) {
    return remSec > 0 ? `${mins}m ${String(remSec).padStart(2, '0')}s` : `${mins}m`;
  }
  const hrs = Math.floor(mins / 60);
  const remMin = mins % 60;
  return `${hrs}h ${String(remMin).padStart(2, '0')}m`;
}

export function isStructureUnderConstruction(s: PlacedStructure, nowMs = Date.now()): boolean {
  return Boolean(s.constructionState && s.constructionEndsAt && s.constructionEndsAt > nowMs);
}

export function evaluateGuidedStepProgress(
  stepId: string,
  fortress: FortressState
): { completed: boolean; current: number; target: number } {
  const built = fortress.structures.filter((s) => s.constructionState !== 'building');
  switch (stepId) {
    case 'step_1_cannon': {
      const count = built.filter((s) => s.type === 'cannon').length;
      return { completed: count >= 1, current: Math.min(1, count), target: 1 };
    }
    case 'step_2_altar_1': {
      const count = built.filter((s) => s.type === 'hero_altar').length;
      return { completed: count >= 1, current: Math.min(1, count), target: 1 };
    }
    case 'step_3_gold_mine': {
      const count = built.filter((s) => s.type === 'gold_mine').length;
      return { completed: count >= 1, current: Math.min(1, count), target: 1 };
    }
    case 'step_4_archer': {
      const count = built.filter((s) => s.type === 'archer_tower').length;
      return { completed: count >= 1, current: Math.min(1, count), target: 1 };
    }
    case 'step_5_upgrade_cannon': {
      const maxLv = built
        .filter((s) => s.type === 'cannon')
        .reduce((m, s) => Math.max(m, s.level), 0);
      return { completed: maxLv >= 2, current: Math.min(2, maxLv), target: 2 };
    }
    case 'step_6_altar_2': {
      const count = built.filter((s) => s.type === 'hero_altar').length;
      return { completed: count >= 2, current: Math.min(2, count), target: 2 };
    }
    case 'step_7_walls': {
      const count = built.filter((s) => s.type === 'wall').length;
      return { completed: count >= 6, current: Math.min(6, count), target: 6 };
    }
    case 'step_8_core_lv2': {
      const lv = getCoreLevel(fortress.structures);
      return { completed: lv >= 2, current: Math.min(2, lv), target: 2 };
    }
    case 'step_9_hero_lv5': {
      const maxHeroLv = Math.max(
        1,
        ...Object.values(fortress.heroProgress).map((p) => p.level ?? 1)
      );
      return { completed: maxHeroLv >= 5, current: Math.min(5, maxHeroLv), target: 5 };
    }
    case 'step_10_first_win': {
      const wins = fortress.battlesWon ?? 0;
      return { completed: wins >= 1, current: Math.min(1, wins), target: 1 };
    }
    default:
      return { completed: false, current: 0, target: 1 };
  }
}

export function computeHeroStats(
  hero: HeroCatalogEntry,
  progress: HeroProgress | undefined,
  activeSynergies: SynergyDefinition[],
  balance: BalanceConfig
): ComputedHeroStats {
  const level = progress?.level ?? 1;
  const lvlDelta = level - 1;

  let hp = hero.baseStats.hp + hero.growthPerLevel.hp * lvlDelta;
  let attack = hero.baseStats.attack + hero.growthPerLevel.attack * lvlDelta;
  let defense = hero.baseStats.defense + hero.growthPerLevel.defense * lvlDelta;
  let moveSpeed = hero.baseStats.moveSpeed;
  const attackSpeed = hero.baseStats.attackSpeed;
  let range = hero.baseStats.range;
  const splashRadius = hero.baseStats.splashRadius ?? 0;
  let energyGainMultiplier = 1.0;

  // Apply selected talent
  const talent = hero.talents.find((t) => t.id === progress?.selectedTalentId) ?? hero.talents[0];
  if (talent) {
    if (talent.hpBonusPct) hp *= 1 + talent.hpBonusPct;
    if (talent.atkBonusPct) attack *= 1 + talent.atkBonusPct;
    if (talent.defBonusPct) defense *= 1 + talent.defBonusPct;
    if (talent.speedBonusPct) moveSpeed *= 1 + talent.speedBonusPct;
    if (talent.energyGainBonusPct) energyGainMultiplier += talent.energyGainBonusPct;
  }

  // Apply equipped relic
  const relic = hero.relics.find((r) => r.id === progress?.equippedRelicId);
  if (relic) {
    if (relic.hpBonus) hp += relic.hpBonus;
    if (relic.atkBonus) attack += relic.atkBonus;
    if (relic.defBonus) defense += relic.defBonus;
    if (relic.rangeBonus) range += relic.rangeBonus;
  }

  // Apply active squad synergies
  for (const syn of activeSynergies) {
    if (syn.bonuses.hpPct) hp *= 1 + syn.bonuses.hpPct;
    if (syn.bonuses.atkPct) attack *= 1 + syn.bonuses.atkPct;
    if (syn.bonuses.defPct) defense *= 1 + syn.bonuses.defPct;
    if (syn.bonuses.energyGainPct) energyGainMultiplier += syn.bonuses.energyGainPct;
  }

  attack *= balance.heroDamageMultiplier;

  const finalHp = Math.round(hp);
  const finalAtk = Math.round(attack);
  const finalDef = Math.round(defense);
  const powerScore = Math.round(finalHp * 0.25 + finalAtk * attackSpeed * 3.1 + finalDef * 4.2);

  return {
    hp: finalHp,
    attack: finalAtk,
    defense: finalDef,
    moveSpeed,
    attackSpeed,
    range,
    splashRadius,
    energyGainMultiplier,
    powerScore,
  };
}

export function computeStructureStats(
  type: StructureType,
  level: number,
  balance: BalanceConfig
) {
  const entry = STRUCTURES_CATALOG[type];
  const lvlDelta = level - 1;
  const maxHp = Math.round(entry.baseHp + entry.hpPerLevel * lvlDelta);
  const damage = Math.round((entry.damage + entry.damagePerLevel * lvlDelta) * balance.defenseDamageMultiplier);
  const defense = Math.round(entry.defense + lvlDelta * 3);
  const prodScale = (1 + lvlDelta * 0.45) * balance.resourceProdMultiplier;

  return {
    maxHp,
    damage,
    defense,
    range: entry.range,
    attackSpeed: entry.attackSpeed,
    splashRadius: entry.splashRadius ?? 0,
    productionPerMin: {
      gold: Math.round((entry.productionPerMin?.gold ?? 0) * prodScale),
      crystals: Math.round((entry.productionPerMin?.crystals ?? 0) * prodScale),
      essence: Math.round((entry.productionPerMin?.essence ?? 0) * prodScale),
    },
    storageBonus: entry.storageBonus
      ? {
          gold: Math.round(entry.storageBonus.gold * (1 + lvlDelta * 0.55)),
          crystals: Math.round(entry.storageBonus.crystals * (1 + lvlDelta * 0.55)),
          essence: Math.round(entry.storageBonus.essence * (1 + lvlDelta * 0.55)),
        }
      : { gold: 0, crystals: 0, essence: 0 },
  };
}

export function computeFortressEconomy(
  structures: PlacedStructure[],
  balance: BalanceConfig
): {
  productionPerMin: PlayerResources;
  storageCap: PlayerResources;
} {
  const productionPerMin: PlayerResources = { gold: 0, crystals: 0, essence: 0 };
  const storageCap: PlayerResources = { gold: 500, crystals: 250, essence: 250 };

  for (const s of structures) {
    if (s.constructionState === 'building') continue;
    const stats = computeStructureStats(s.type, s.level, balance);
    productionPerMin.gold += stats.productionPerMin.gold;
    productionPerMin.crystals += stats.productionPerMin.crystals;
    productionPerMin.essence += stats.productionPerMin.essence;
    storageCap.gold += stats.storageBonus.gold;
    storageCap.crystals += stats.storageBonus.crystals;
    storageCap.essence += stats.storageBonus.essence;
  }

  return { productionPerMin, storageCap };
}

/**
 * Core asymptotic defense mitigation formula:
 * EffectiveDamage = RawDamage * TacticalMultiplier * (K / (K + EffectiveDefense))
 */
export function computeMitigatedDamage(
  rawDamage: number,
  targetDefense: number,
  tacticalMultiplier: number,
  balance: BalanceConfig
): number {
  const k = Math.max(20, balance.defenseMitigationK);
  const mitigation = k / (k + Math.max(0, targetDefense));
  return Math.max(1, Math.round(rawDamage * tacticalMultiplier * mitigation));
}

export interface SimulationInput {
  heroIds: string[];
  heroLevel: number;
  defenses: Array<{ type: StructureType; level: number }>;
  balance: BalanceConfig;
}

export interface SimulationOutput {
  winOutcome: 'Vitória' | 'Derrota';
  estimatedSeconds: number;
  teamEffectiveDps: number;
  defenseEffectiveDps: number;
  survivingHeroes: number;
  totalHeroes: number;
  destructionEstimatePct: number;
  activeSynergies: SynergyDefinition[];
  tacticalNotes: string[];
}

/**
 * Fast deterministic combat balance simulator used in the GDD & Balance Studio
 * so designers can test any combination of the 12 heroes against custom defense arrays.
 */
export function simulateBalanceMatchup(input: SimulationInput): SimulationOutput {
  const { heroIds, heroLevel, defenses, balance } = input;
  const activeSynergies = getActiveSynergies(heroIds);
  const heroes = heroIds
    .map((id) => getHeroById(id))
    .filter((h): h is HeroCatalogEntry => Boolean(h));

  if (heroes.length === 0 || defenses.length === 0) {
    return {
      winOutcome: 'Derrota',
      estimatedSeconds: 0,
      teamEffectiveDps: 0,
      defenseEffectiveDps: 0,
      survivingHeroes: 0,
      totalHeroes: heroes.length,
      destructionEstimatePct: 0,
      activeSynergies,
      tacticalNotes: ['Selecione pelo menos 1 herói e 1 estrutura defensiva para simular.'],
    };
  }

  const simHeroes = heroes.map((h) => {
    const computed = computeHeroStats(
      h,
      {
        heroId: h.id,
        level: heroLevel,
        skillLevel: heroLevel >= SKILL_UNLOCK_LEVEL ? Math.max(1, Math.min(MAX_SKILL_LEVEL, Math.floor(heroLevel / 5))) : 0,
        selectedTalentId: h.talents[0]?.id ?? '',
        equippedRelicId: h.relics[0]?.id ?? '',
      },
      activeSynergies,
      balance
    );
    return {
      entry: h,
      hp: computed.hp,
      maxHp: computed.hp,
      atk: computed.attack,
      def: computed.defense,
      atkSpeed: computed.attackSpeed,
      splash: computed.splashRadius,
      isTank: h.heroClass === 'TANQUE',
      isSupport: h.heroClass === 'SUPORTE',
      isController: h.heroClass === 'CONTROLADOR',
      energy: 0,
      energyMult: computed.energyGainMultiplier,
    };
  });

  const simTowers = defenses.map((d) => {
    const stats = computeStructureStats(d.type, d.level, balance);
    return {
      type: d.type,
      hp: stats.maxHp,
      maxHp: stats.maxHp,
      dmg: stats.damage,
      def: stats.defense,
      atkSpeed: stats.attackSpeed,
      splash: stats.splashRadius,
      stunRemaining: 0,
    };
  });

  const dt = 0.5;
  let elapsed = 0;
  let totalHeroDmg = 0;
  let totalDefenseDmg = 0;
  const tacticalNotes: string[] = [];

  const hasCannon = simTowers.some((t) => t.type === 'cannon');
  const hasTank = simHeroes.some((h) => h.isTank);
  const hasIce = simTowers.some((t) => t.type === 'ice_tower');
  const hasAssassin = simHeroes.some((h) => h.entry.heroClass === 'ASSASSINO');
  const hasSupport = simHeroes.some((h) => h.isSupport);
  const hasPoison = simTowers.some((t) => t.type === 'poison_tower');

  if (hasCannon && hasTank) {
    tacticalNotes.push(`Canhão aplica multiplicador x${balance.cannonVsTankMultiplier.toFixed(2)} contra Tanques.`);
  }
  if (hasIce && hasAssassin) {
    tacticalNotes.push(`Torre de Gelo reduz velocidade de Assassinos para ${Math.round(balance.iceSlowFactor * 100)}%.`);
  }
  if (hasPoison && hasSupport) {
    tacticalNotes.push('Suporte neutraliza grande parte do desgaste contínuo da Torre de Veneno.');
  }
  if (activeSynergies.length > 0) {
    tacticalNotes.push(`Sinergias ativas: ${activeSynergies.map((s) => s.name).join(', ')}.`);
  }

  while (elapsed < 90) {
    const aliveHeroes = simHeroes.filter((h) => h.hp > 0);
    const aliveTowers = simTowers.filter((t) => t.hp > 0);
    if (aliveHeroes.length === 0 || aliveTowers.length === 0) break;

    elapsed += dt;

    // Heroes act
    for (const h of aliveHeroes) {
      const slowMod = hasIce ? (h.entry.heroClass === 'ASSASSINO' ? balance.iceSlowFactor : 0.88) : 1;
      if (h.isSupport) {
        const wounded = [...aliveHeroes].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (wounded) {
          const heal = h.atk * 1.35 * h.atkSpeed * dt;
          wounded.hp = Math.min(wounded.maxHp, wounded.hp + heal);
        }
        h.energy += balance.energyPerAttack * h.atkSpeed * dt * h.energyMult;
        if (h.energy >= 100) {
          h.energy = 0;
          aliveHeroes.forEach((ally) => {
            ally.hp = Math.min(ally.maxHp, ally.hp + h.atk * 2.5);
          });
        }
        continue;
      }

      const targetTower = aliveTowers[0];
      if (!targetTower) continue;

      const raw = h.atk * h.atkSpeed * slowMod * dt;
      const eff = computeMitigatedDamage(raw, targetTower.def, 1, balance);
      targetTower.hp -= eff;
      totalHeroDmg += eff;

      // Splash hits second tower
      if (h.splash > 0 && aliveTowers.length > 1) {
        const splashEff = Math.round(eff * 0.65);
        aliveTowers[1].hp -= splashEff;
        totalHeroDmg += splashEff;
      }

      if (h.isController) {
        targetTower.stunRemaining = Math.max(targetTower.stunRemaining, 0.45);
      }

      h.energy += balance.energyPerAttack * h.atkSpeed * dt * h.energyMult;
      if (h.energy >= 100) {
        h.energy = 0;
        if (h.isTank) {
          aliveHeroes.forEach((ally) => {
            ally.hp = Math.min(ally.maxHp * 1.25, ally.hp + h.maxHp * 0.25);
          });
        } else if (h.isController) {
          aliveTowers.slice(0, 3).forEach((t) => {
            t.stunRemaining = Math.max(t.stunRemaining, balance.electricStunDurationSec + 1.0);
            const burst = computeMitigatedDamage(h.atk * 1.6, t.def, 1, balance);
            t.hp -= burst;
            totalHeroDmg += burst;
          });
        } else {
          const burst = computeMitigatedDamage(h.atk * 2.5, targetTower.def, 1, balance);
          targetTower.hp -= burst;
          totalHeroDmg += burst;
        }
      }
    }

    // Towers act
    const currentAliveHeroes = simHeroes.filter((h) => h.hp > 0);
    if (currentAliveHeroes.length === 0) break;
    // Prefer targeting Tank if alive
    const primaryTarget =
      currentAliveHeroes.find((h) => h.isTank) ?? currentAliveHeroes[0];

    for (const t of aliveTowers) {
      if (t.hp <= 0) continue;
      if (t.stunRemaining > 0) {
        t.stunRemaining = Math.max(0, t.stunRemaining - dt);
        continue;
      }
      if (t.dmg <= 0) continue;

      let mult = 1.0;
      if (t.type === 'cannon' && primaryTarget.isTank) {
        mult = balance.cannonVsTankMultiplier;
      }
      const raw = t.dmg * t.atkSpeed * dt;
      const eff = computeMitigatedDamage(raw, primaryTarget.def, mult, balance);
      primaryTarget.hp -= eff;
      totalDefenseDmg += eff;
      primaryTarget.energy = Math.min(100, primaryTarget.energy + balance.energyPerHitTaken * 0.4);

      if (t.type === 'poison_tower') {
        const poisonDmg = primaryTarget.maxHp * balance.poisonDpsPctPerSec * dt;
        primaryTarget.hp -= poisonDmg;
        totalDefenseDmg += poisonDmg;
      }
      if (t.type === 'electric_tower') {
        primaryTarget.energy = Math.max(0, primaryTarget.energy - 8 * dt);
      }
      if (t.splash > 0 && currentAliveHeroes.length > 1) {
        const second = currentAliveHeroes.find((h) => h !== primaryTarget);
        if (second) {
          const splashD = Math.round(eff * 0.55);
          second.hp -= splashD;
          totalDefenseDmg += splashD;
        }
      }
    }
  }

  const destroyedTowers = simTowers.filter((t) => t.hp <= 0).length;
  const survivingHeroes = simHeroes.filter((h) => h.hp > 0).length;
  const destructionEstimatePct = Math.round((destroyedTowers / simTowers.length) * 100);
  const winOutcome = destroyedTowers === simTowers.length ? 'Vitória' : 'Derrota';

  return {
    winOutcome,
    estimatedSeconds: Math.round(elapsed * 10) / 10,
    teamEffectiveDps: elapsed > 0 ? Math.round(totalHeroDmg / elapsed) : 0,
    defenseEffectiveDps: elapsed > 0 ? Math.round(totalDefenseDmg / elapsed) : 0,
    survivingHeroes,
    totalHeroes: simHeroes.length,
    destructionEstimatePct,
    activeSynergies,
    tacticalNotes:
      tacticalNotes.length > 0
        ? tacticalNotes
        : ['Confronto equilibrado sem multiplicadores extremos de contra-jogada.'],
  };
}
