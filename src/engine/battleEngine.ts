import {
  DEPLOY_MARGIN,
  GRID_SIZE,
  HERO_ALTAR_GUARD_RADIUS,
  HERO_ALTAR_PATROL_RADIUS,
  SKILL_UNLOCK_LEVEL,
  STRUCTURES_CATALOG,
} from '../data/gameCatalog';
import {
  BalanceConfig,
  BattleHeroEntity,
  BattleParticle,
  BattleProjectile,
  BattleState,
  BattleStructureEntity,
  CampaignTarget,
  HeroProgress,
} from '../types/game';
import { soundEngine } from './audio';
import {
  computeHeroSkillPower,
  computeHeroStats,
  computeMitigatedDamage,
  computeStructureStats,
  getActiveSynergies,
  getEffectiveSkillLevel,
  getHeroById,
} from './math';

let idCounter = 1;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function isPerimeterCell(x: number, y: number): boolean {
  return (
    x < DEPLOY_MARGIN ||
    y < DEPLOY_MARGIN ||
    x >= GRID_SIZE - DEPLOY_MARGIN ||
    y >= GRID_SIZE - DEPLOY_MARGIN
  );
}

function pushParticle(state: BattleState, p: Omit<BattleParticle, 'id' | 'age'>) {
  if (state.particles.length > 360) {
    state.particles.shift();
  }
  state.particles.push({
    ...p,
    id: nextId('pt'),
    age: 0,
  });
}

function spawnHitDebris(
  state: BattleState,
  gx: number,
  gy: number,
  count: number,
  isCollapse = false
) {
  const stonePalette = ['#D6CCB8', '#B8AC96', '#8C806D', '#64748B'];
  const woodPalette = ['#9A6B3F', '#784E27', '#B45309'];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = isCollapse ? 1.0 + Math.random() * 2.4 : 0.45 + Math.random() * 1.1;
    const isWood = Math.random() < 0.35;
    pushParticle(state, {
      x: gx + (Math.random() - 0.5) * 0.35,
      y: gy + (Math.random() - 0.5) * 0.35,
      z: isCollapse ? 8 + Math.random() * 18 : 10 + Math.random() * 10,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      vz: isCollapse ? 55 + Math.random() * 65 : 28 + Math.random() * 35,
      gravity: 165,
      size: isCollapse ? 3.5 + Math.random() * 4.5 : 2.2 + Math.random() * 2.6,
      color: isWood
        ? woodPalette[Math.floor(Math.random() * woodPalette.length)]
        : stonePalette[Math.floor(Math.random() * stonePalette.length)],
      alpha: 1,
      duration: isCollapse ? 0.85 + Math.random() * 0.45 : 0.48 + Math.random() * 0.25,
      shape: isWood ? 'wood' : 'stone',
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 12,
    });
  }

  if (isCollapse) {
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      pushParticle(state, {
        x: gx + Math.cos(angle) * 0.25,
        y: gy + Math.sin(angle) * 0.25,
        z: 6 + Math.random() * 10,
        vx: Math.cos(angle) * (0.2 + Math.random() * 0.5),
        vy: Math.sin(angle) * (0.2 + Math.random() * 0.5),
        vz: 18 + Math.random() * 22,
        gravity: -4,
        size: 7 + Math.random() * 7,
        color: i % 2 === 0 ? '#475569' : '#94A3B8',
        alpha: 0.72,
        duration: 0.9 + Math.random() * 0.5,
        shape: 'smoke',
        rotation: 0,
        vRot: 0,
      });
    }
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      pushParticle(state, {
        x: gx,
        y: gy,
        z: 10,
        vx: Math.cos(angle) * (0.7 + Math.random() * 1.4),
        vy: Math.sin(angle) * (0.7 + Math.random() * 1.4),
        vz: 45 + Math.random() * 40,
        gravity: 85,
        size: 2.5 + Math.random() * 2.5,
        color: i % 2 === 0 ? '#F97316' : '#FDE047',
        alpha: 1,
        duration: 0.55 + Math.random() * 0.35,
        shape: 'ember',
        rotation: 0,
        vRot: 0,
      });
    }
  }
}

export function createBattleState(
  target: CampaignTarget,
  squadIds: string[],
  heroProgress: Record<string, HeroProgress>,
  balance: BalanceConfig
): BattleState {
  const activeSynergies = getActiveSynergies(squadIds);

  const structures: BattleStructureEntity[] = target.structures.map((s) => {
    const stats = computeStructureStats(s.type, s.level, balance);
    return {
      id: s.id,
      type: s.type,
      gridX: s.gridX,
      gridY: s.gridY,
      level: s.level,
      assignedHeroId: s.assignedHeroId,
      maxHp: stats.maxHp,
      hp: stats.maxHp,
      defense: stats.defense,
      range: stats.range,
      damage: stats.damage,
      attackSpeed: stats.attackSpeed,
      splashRadius: stats.splashRadius,
      attackCooldown: 0.35 + Math.random() * 0.25,
      stunTimer: 0,
      burnTimer: 0,
      burnDps: 0,
      triggered: false,
      destroyed: false,
      recoil: 0,
      hitFlash: 0,
      shakeTime: 0,
      aimAngle: -0.4,
      countsForDestruction: s.type !== 'wall' && s.type !== 'trap',
    };
  });

  // Spawn defender heroes anchored to their Hero Altars (no generic troops — only unique heroes!)
  const altarStructures = structures.filter((s) => s.type === 'hero_altar');
  const spawnedHeroIds = new Set<string>();
  const defenderSpawns: Array<{
    heroId: string;
    homeX: number;
    homeY: number;
    altarStructureId?: string;
  }> = [];

  for (const altar of altarStructures) {
    const assigned =
      altar.assignedHeroId ??
      target.defenderHeroIds.find((id) => !spawnedHeroIds.has(id));
    if (assigned && !spawnedHeroIds.has(assigned)) {
      spawnedHeroIds.add(assigned);
      defenderSpawns.push({
        heroId: assigned,
        homeX: altar.gridX + 0.5,
        homeY: altar.gridY + 0.5,
        altarStructureId: altar.id,
      });
    }
  }

  // Fallback for any target defender hero without a placed altar
  const centerGrid = GRID_SIZE * 0.5;
  target.defenderHeroIds.forEach((heroId, idx) => {
    if (!spawnedHeroIds.has(heroId)) {
      spawnedHeroIds.add(heroId);
      defenderSpawns.push({
        heroId,
        homeX: idx === 0 ? centerGrid - 1.5 : centerGrid + 1.5,
        homeY: idx === 0 ? centerGrid + 1.5 : centerGrid - 1.5,
      });
    }
  });

  const isPlayerDefenseTest = target.id === 'my_fortress_defense';
  const defenderHeroes: BattleHeroEntity[] = defenderSpawns
    .map((spawn, idx): BattleHeroEntity | null => {
      const entry = getHeroById(spawn.heroId);
      if (!entry) return null;
      const ownProg = isPlayerDefenseTest ? heroProgress[spawn.heroId] : undefined;
      const defLevel = ownProg?.level ?? target.defenderLevel;
      const defSkillLevel = ownProg
        ? getEffectiveSkillLevel(ownProg)
        : defLevel >= SKILL_UNLOCK_LEVEL
        ? Math.min(20, defLevel)
        : 0;
      const computed = computeHeroStats(
        entry,
        ownProg ?? {
          heroId: spawn.heroId,
          level: defLevel,
          skillLevel: defSkillLevel,
          selectedTalentId: entry.talents[0]?.id ?? '',
          equippedRelicId: entry.relics[0]?.id ?? '',
        },
        [],
        balance
      );
      const startAngle = idx * Math.PI * 0.85;
      const startX = spawn.homeX + Math.cos(startAngle) * HERO_ALTAR_PATROL_RADIUS;
      const startY = spawn.homeY + Math.sin(startAngle) * HERO_ALTAR_PATROL_RADIUS;
      return {
        instanceId: nextId('def_hero'),
        heroId: spawn.heroId,
        heroLevel: defLevel,
        skillLevel: defSkillLevel,
        team: 'defender',
        x: startX,
        y: startY,
        homeX: spawn.homeX,
        homeY: spawn.homeY,
        guardRadius: HERO_ALTAR_GUARD_RADIUS,
        altarStructureId: spawn.altarStructureId,
        maxHp: Math.round(computed.hp * (isPlayerDefenseTest ? 1 : 0.9)),
        hp: Math.round(computed.hp * (isPlayerDefenseTest ? 1 : 0.9)),
        shield: 0,
        attack: Math.round(computed.attack * (isPlayerDefenseTest ? 1 : 0.85)),
        defense: computed.defense,
        moveSpeed: computed.moveSpeed,
        attackSpeed: computed.attackSpeed,
        range: computed.range,
        splashRadius: computed.splashRadius,
        energy: 0,
        maxEnergy: entry.ultimate.energyCost,
        attackCooldown: 0.4,
        stealthTimer: 0,
        slowTimer: 0,
        poisonTimer: 0,
        damageReductionTimer: 0,
        attackSpeedBuffTimer: 0,
        targetId: null,
        alive: true,
        facing: 1,
        isMoving: true,
        attackAnim: 0,
        ultAnim: 0,
        hitFlash: 0,
        animTime: idx * 1.4,
        stats: {
          damageDealt: 0,
          damageTaken: 0,
          healingDone: 0,
          structuresDestroyed: 0,
          ultimatesCast: 0,
        },
      };
    })
    .filter((h): h is BattleHeroEntity => h !== null);

  return {
    phase: 'PREP',
    target,
    timeRemaining: 90,
    maxTime: 90,
    speedMultiplier: 1,
    destructionPct: 0,
    coreDestroyed: false,
    starsEarned: 0,
    deployedHeroIds: [],
    pendingDeployHeroId: squadIds[0] ?? null,
    heroes: defenderHeroes,
    structures,
    projectiles: [],
    particles: [],
    vfx: [],
    floatingTexts: [],
    activeSynergies,
    rewardEarned: null,
  };
}

export function deployHeroInBattle(
  state: BattleState,
  heroId: string,
  gridX: number,
  gridY: number,
  squadIds: string[],
  heroProgress: Record<string, HeroProgress>,
  balance: BalanceConfig
): BattleState {
  if (state.deployedHeroIds.includes(heroId)) return state;
  if (!isPerimeterCell(gridX, gridY)) return state;

  const entry = getHeroById(heroId);
  if (!entry) return state;

  const prog = heroProgress[heroId];
  const heroLevel = prog?.level ?? 1;
  const skillLevel = getEffectiveSkillLevel(prog);
  const computed = computeHeroStats(entry, prog, state.activeSynergies, balance);

  const entity: BattleHeroEntity = {
    instanceId: nextId('hero'),
    heroId,
    heroLevel,
    skillLevel,
    team: 'attacker',
    x: gridX + 0.5,
    y: gridY + 0.5,
    maxHp: computed.hp,
    hp: computed.hp,
    shield: entry.heroClass === 'TANQUE' ? Math.round(computed.hp * 0.12) : 0,
    attack: computed.attack,
    defense: computed.defense,
    moveSpeed: computed.moveSpeed,
    attackSpeed: computed.attackSpeed,
    range: computed.range,
    splashRadius: computed.splashRadius,
    energy: skillLevel > 0 ? 25 : 0,
    maxEnergy: entry.ultimate.energyCost,
    attackCooldown: 0.2,
    stealthTimer: entry.heroClass === 'ASSASSINO' ? 3.5 : 0,
    slowTimer: 0,
    poisonTimer: 0,
    damageReductionTimer: 0,
    attackSpeedBuffTimer: 0,
    targetId: null,
    alive: true,
    facing: gridX < GRID_SIZE / 2 ? 1 : -1,
    isMoving: false,
    attackAnim: 0,
    ultAnim: 0.6, // heroic landing pose
    hitFlash: 0,
    animTime: 0,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      healingDone: 0,
      structuresDestroyed: 0,
      ultimatesCast: 0,
    },
  };

  soundEngine.playDeploy();

  const deployedHeroIds = [...state.deployedHeroIds, heroId];
  const nextUndeployed = squadIds.find((id) => !deployedHeroIds.includes(id)) ?? null;

  const nextState: BattleState = {
    ...state,
    phase: state.phase === 'PREP' ? 'RUNNING' : state.phase,
    deployedHeroIds,
    pendingDeployHeroId: nextUndeployed,
    heroes: [...state.heroes, entity],
    particles: [...state.particles],
    vfx: [
      ...state.vfx,
      {
        id: nextId('vfx'),
        kind: 'pillar',
        x: entity.x,
        y: entity.y,
        radius: 1.15,
        color: heroId === 'aegor' ? '#F59E0B' : '#22C55E',
        age: 0,
        duration: 0.65,
      },
      {
        id: nextId('vfx'),
        kind: 'shockwave',
        x: entity.x,
        y: entity.y,
        radius: 1.75,
        color: heroId === 'aegor' ? '#FDE047' : '#FB923C',
        age: 0,
        duration: 0.55,
      },
    ],
  };

  // Heroic entry dust + blazing golden/tribal sparks burst
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const isSpark = i % 2 === 0;
    pushParticle(nextState, {
      x: entity.x + Math.cos(a) * 0.22,
      y: entity.y + Math.sin(a) * 0.22,
      z: isSpark ? 10 : 2,
      vx: Math.cos(a) * (isSpark ? 1.45 : 0.95),
      vy: Math.sin(a) * (isSpark ? 1.45 : 0.95),
      vz: isSpark ? 36 + Math.random() * 18 : 14,
      gravity: isSpark ? 75 : 40,
      size: isSpark ? 3.4 : 4.2,
      color: isSpark ? (heroId === 'aegor' ? '#FDE047' : '#FB923C') : '#E7D8B6',
      alpha: isSpark ? 1 : 0.78,
      duration: isSpark ? 0.55 : 0.45,
      shape: isSpark ? 'spark' : 'dust',
      rotation: 0,
      vRot: 0,
    });
  }

  return nextState;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function getStructurePriorityScore(s: BattleStructureEntity, heroClass: string): number {
  if (s.type === 'wall' || s.type === 'trap') return -10;
  if (heroClass === 'ASSASSINO') {
    if (s.type === 'arcane_tower' || s.type === 'electric_tower') return 120;
    if (s.type === 'cannon' || s.type === 'poison_tower') return 105;
    if (s.type === 'core') return 95;
    if (s.type === 'hero_altar') return 92;
    if (STRUCTURES_CATALOG[s.type].category === 'defense') return 85;
    return 25;
  }
  if (heroClass === 'CONTROLADOR') {
    if (s.stunTimer > 0.8) return 20;
    if (s.type === 'electric_tower' || s.type === 'cannon' || s.type === 'arcane_tower') return 120;
    if (STRUCTURES_CATALOG[s.type].category === 'defense') return 95;
    if (s.type === 'hero_altar') return 85;
    return 30;
  }
  if (heroClass === 'ATIRADOR') {
    if (s.type === 'cannon' || s.type === 'arcane_tower' || s.type === 'electric_tower') return 110;
    if (s.type === 'core') return 100;
    if (s.type === 'hero_altar') return 92;
    if (STRUCTURES_CATALOG[s.type].category === 'defense') return 90;
    return 35;
  }
  if (STRUCTURES_CATALOG[s.type].category === 'defense') return 100;
  if (s.type === 'hero_altar') return 88;
  if (s.type === 'core') return 70;
  return 40;
}

function selectAttackerTarget(
  hero: BattleHeroEntity,
  structures: BattleStructureEntity[],
  defenders: BattleHeroEntity[]
): { kind: 'structure' | 'hero'; id: string; x: number; y: number } | null {
  const entry = getHeroById(hero.heroId);
  const heroClass = entry?.heroClass ?? 'TANQUE';

  const aliveDefenders = defenders.filter((d) => d.alive);
  const engageRadius = Math.max(4.5, hero.range + 1.6);
  const nearbyDefender = [...aliveDefenders]
    .filter((d) => dist(hero.x, hero.y, d.x, d.y) <= engageRadius)
    .sort((a, b) => dist(hero.x, hero.y, a.x, a.y) - dist(hero.x, hero.y, b.x, b.y))[0];
  if (nearbyDefender && (heroClass === 'TANQUE' || heroClass === 'ATIRADOR' || heroClass === 'ASSASSINO')) {
    return { kind: 'hero', id: nearbyDefender.instanceId, x: nearbyDefender.x, y: nearbyDefender.y };
  }

  const validStructures = structures.filter((s) => !s.destroyed && s.type !== 'trap' && s.type !== 'wall');
  if (validStructures.length === 0) return null;

  if (heroClass === 'MAGO') {
    let best: BattleStructureEntity | null = null;
    let bestScore = -Infinity;
    for (const s of validStructures) {
      const neighbors = validStructures.filter(
        (other) => other.id !== s.id && dist(s.gridX, s.gridY, other.gridX, other.gridY) <= 2.3
      ).length;
      const d = dist(hero.x, hero.y, s.gridX + 0.5, s.gridY + 0.5);
      const isDef = STRUCTURES_CATALOG[s.type].category === 'defense' ? 18 : 0;
      const score = neighbors * 30 + isDef - d * 6.5;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    if (best) {
      return { kind: 'structure', id: best.id, x: best.gridX + 0.5, y: best.gridY + 0.5 };
    }
  }

  let best: BattleStructureEntity | null = null;
  let bestScore = -Infinity;
  for (const s of validStructures) {
    const d = dist(hero.x, hero.y, s.gridX + 0.5, s.gridY + 0.5);
    const prio = getStructurePriorityScore(s, heroClass);
    const distWeight = heroClass === 'TANQUE' ? 18 : heroClass === 'ASSASSINO' ? 5.5 : 9;
    const score = prio - d * distWeight;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }

  if (!best) return null;
  return { kind: 'structure', id: best.id, x: best.gridX + 0.5, y: best.gridY + 0.5 };
}

function applyDamageToHero(
  target: BattleHeroEntity,
  amount: number,
  state: BattleState,
  balance: BalanceConfig,
  labelColor = '#FCA5A5'
) {
  let finalAmount = amount;
  if (target.damageReductionTimer > 0) {
    finalAmount = Math.round(finalAmount * 0.75);
  }
  const entry = getHeroById(target.heroId);
  if (entry?.heroClass === 'TANQUE') {
    finalAmount = Math.round(finalAmount * 0.9);
  }

  target.hitFlash = 0.22;

  let remaining = finalAmount;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
    // Shield-block spark burst when Aegor's barrier absorbs incoming defense hits
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      pushParticle(state, {
        x: target.x + Math.cos(a) * 0.18,
        y: target.y + Math.sin(a) * 0.18,
        z: 14 + Math.random() * 8,
        vx: Math.cos(a) * (0.9 + Math.random() * 0.8),
        vy: Math.sin(a) * (0.9 + Math.random() * 0.8),
        vz: 24 + Math.random() * 18,
        gravity: 90,
        size: 2.6,
        color: i % 2 === 0 ? '#93C5FD' : '#FEF08A',
        alpha: 0.95,
        duration: 0.35,
        shape: 'spark',
        rotation: 0,
        vRot: 0,
      });
    }
  }

  if (remaining > 0) {
    target.hp = Math.max(0, target.hp - remaining);
    target.stats.damageTaken += remaining;
    if (target.skillLevel > 0) {
      target.energy = Math.min(target.maxEnergy, target.energy + balance.energyPerHitTaken);
    }
  }

  state.floatingTexts.push({
    id: nextId('ft'),
    x: target.x + (Math.random() - 0.5) * 0.3,
    y: target.y - 0.35,
    text: `-${finalAmount}`,
    color: labelColor,
    age: 0,
    duration: 0.7,
  });

  if (target.hp <= 0) {
    target.alive = false;
    state.vfx.push({
      id: nextId('vfx'),
      kind: 'explosion',
      x: target.x,
      y: target.y,
      radius: 0.95,
      color: '#EF4444',
      age: 0,
      duration: 0.45,
    });
  }
}

function applyDamageToStructure(
  target: BattleStructureEntity,
  amount: number,
  attackerHero: BattleHeroEntity | undefined,
  state: BattleState,
  isCrit = false
) {
  if (target.destroyed) return;
  target.hp = Math.max(0, target.hp - amount);
  target.hitFlash = 0.2;
  target.shakeTime = 0.24;

  if (attackerHero) {
    attackerHero.stats.damageDealt += amount;
  }

  spawnHitDebris(state, target.gridX + 0.5, target.gridY + 0.5, isCrit ? 6 : 3, false);

  state.floatingTexts.push({
    id: nextId('ft'),
    x: target.gridX + 0.5 + (Math.random() - 0.5) * 0.3,
    y: target.gridY + 0.2,
    text: isCrit ? `${amount}!` : `-${amount}`,
    color: isCrit ? '#FDE047' : '#FFF7ED',
    age: 0,
    duration: 0.75,
    large: isCrit,
  });

  if (target.hp <= 0) {
    target.destroyed = true;
    target.destroyedAt = state.maxTime - state.timeRemaining;
    if (attackerHero) {
      attackerHero.stats.structuresDestroyed += 1;
    }
    soundEngine.playStructureDestroyed();
    spawnHitDebris(
      state,
      target.gridX + 0.5,
      target.gridY + 0.5,
      target.type === 'core' ? 24 : 14,
      true
    );
    state.vfx.push({
      id: nextId('vfx'),
      kind: 'explosion',
      x: target.gridX + 0.5,
      y: target.gridY + 0.5,
      radius: target.type === 'core' ? 2.1 : 1.35,
      color: '#F59E0B',
      age: 0,
      duration: 0.65,
    });
  }
}

export function triggerHeroUltimate(
  state: BattleState,
  heroInstanceId: string,
  balance: BalanceConfig
): BattleState {
  if (state.phase !== 'RUNNING') return state;
  const hero = state.heroes.find((h) => h.instanceId === heroInstanceId);
  if (
    !hero ||
    !hero.alive ||
    hero.team !== 'attacker' ||
    hero.skillLevel <= 0 ||
    hero.energy < hero.maxEnergy
  ) {
    return state;
  }

  const skillPower = computeHeroSkillPower(hero.heroId, hero.skillLevel);
  hero.energy = 0;
  hero.ultAnim = 1.0;
  hero.stats.ultimatesCast += 1;
  soundEngine.playUltimate();

  const allies = state.heroes.filter((h) => h.team === 'attacker' && h.alive);
  const aliveStructures = state.structures.filter((s) => !s.destroyed && s.type !== 'trap' && s.type !== 'wall');

  if (hero.heroId === 'aegor') {
    const shieldAmount = Math.round(hero.maxHp * (skillPower.shieldPct ?? 0.3));
    // Monumental Stone Age tribal stomp: vertical golden light pillar + twin shockwave rings + erupting stone/rune shards
    state.vfx.push({
      id: nextId('vfx'),
      kind: 'pillar',
      x: hero.x,
      y: hero.y,
      radius: 1.65,
      color: '#60A5FA',
      age: 0,
      duration: 0.95,
    });
    state.vfx.push({
      id: nextId('vfx'),
      kind: 'shockwave',
      x: hero.x,
      y: hero.y,
      radius: 3.1,
      color: '#F59E0B',
      age: 0,
      duration: 0.78,
    });
    state.vfx.push({
      id: nextId('vfx'),
      kind: 'ring',
      x: hero.x,
      y: hero.y,
      radius: 2.35,
      color: '#93C5FD',
      age: 0,
      duration: 0.68,
    });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pushParticle(state, {
        x: hero.x + Math.cos(a) * 0.28,
        y: hero.y + Math.sin(a) * 0.28,
        z: 6 + Math.random() * 10,
        vx: Math.cos(a) * (1.7 + Math.random() * 1.1),
        vy: Math.sin(a) * (1.7 + Math.random() * 1.1),
        vz: 34 + Math.random() * 28,
        gravity: 85,
        size: i % 3 === 0 ? 4.8 : 3.4,
        color: i % 3 === 0 ? '#93C5FD' : i % 3 === 1 ? '#FDE047' : '#D97706',
        alpha: 1,
        duration: 0.72,
        shape: i % 4 === 0 ? 'stone' : i % 2 === 0 ? 'spark' : 'dust',
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 10,
      });
    }
    allies.forEach((ally) => {
      ally.shield += shieldAmount;
      state.vfx.push({
        id: nextId('vfx'),
        kind: 'shield',
        x: ally.x,
        y: ally.y,
        radius: 1.65,
        color: '#60A5FA',
        age: 0,
        duration: 1.15,
      });
    });
    state.floatingTexts.push({
      id: nextId('ft'),
      x: hero.x,
      y: hero.y - 0.5,
      text: `BARREIRA Nv.${hero.skillLevel} +${shieldAmount}`,
      color: '#93C5FD',
      age: 0,
      duration: 1.2,
      large: true,
    });
  } else if (hero.heroId === 'nyra') {
    let center: { x: number; y: number } = { x: GRID_SIZE * 0.5, y: GRID_SIZE * 0.5 };
    let bestNeighbors = -1;
    for (const s of aliveStructures) {
      const count = aliveStructures.filter(
        (o) => dist(s.gridX, s.gridY, o.gridX, o.gridY) <= 2.4
      ).length;
      if (count > bestNeighbors) {
        bestNeighbors = count;
        center = { x: s.gridX + 0.5, y: s.gridY + 0.5 };
      }
    }
    // 3 falling meteors around center
    const offsets = [
      { dx: 0, dy: 0 },
      { dx: -0.9, dy: 0.6 },
      { dx: 0.85, dy: -0.55 },
    ];
    offsets.forEach((o) => {
      state.vfx.push({
        id: nextId('vfx'),
        kind: 'meteor',
        x: center.x + o.dx,
        y: center.y + o.dy,
        radius: 2.3,
        color: '#F97316',
        age: 0,
        duration: 0.95,
      });
    });
    aliveStructures.forEach((s) => {
      if (dist(center.x, center.y, s.gridX + 0.5, s.gridY + 0.5) <= 2.6) {
        const dmg = computeMitigatedDamage(hero.attack * 2.4, s.defense, 1, balance);
        applyDamageToStructure(s, dmg, hero, state, true);
        s.burnTimer = 4.5;
        s.burnDps = Math.round(hero.attack * balance.burnDpsRatio);
      }
    });
    state.floatingTexts.push({
      id: nextId('ft'),
      x: center.x,
      y: center.y - 0.6,
      text: 'CHUVA DE METEOROS!',
      color: '#FDBA74',
      age: 0,
      duration: 1.25,
      large: true,
    });
  } else if (hero.heroId === 'kael') {
    const priorityTargets = [...aliveStructures].sort(
      (a, b) => getStructurePriorityScore(b, 'ASSASSINO') - getStructurePriorityScore(a, 'ASSASSINO')
    );
    const target = priorityTargets[0];
    if (target) {
      // Smoke trail at departure point
      for (let i = 0; i < 6; i++) {
        pushParticle(state, {
          x: hero.x,
          y: hero.y,
          z: 8,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          vz: 16,
          gravity: 0,
          size: 6,
          color: '#7C3AED',
          alpha: 0.65,
          duration: 0.5,
          shape: 'smoke',
          rotation: 0,
          vRot: 0,
        });
      }
      hero.x = target.gridX + 0.5;
      hero.y = target.gridY + 0.95;
      hero.stealthTimer = 2.5;
      hero.attackAnim = 1.0;
      const dmg = computeMitigatedDamage(hero.attack * 3.2, target.defense * 0.4, 1, balance);
      applyDamageToStructure(target, dmg, hero, state, true);
      state.vfx.push({
        id: nextId('vfx'),
        kind: 'slash',
        x: target.gridX + 0.5,
        y: target.gridY + 0.5,
        radius: 1.5,
        color: '#A78BFA',
        age: 0,
        duration: 0.6,
      });
      state.floatingTexts.push({
        id: nextId('ft'),
        x: target.gridX + 0.5,
        y: target.gridY,
        text: 'EXECUÇÃO SOMBRIA!',
        color: '#C4B5FD',
        age: 0,
        duration: 1.15,
        large: true,
      });
    }
  } else if (hero.heroId === 'zarek') {
    const defenses = aliveStructures
      .filter((s) => STRUCTURES_CATALOG[s.type].category === 'defense' || s.type === 'core')
      .sort((a, b) => dist(hero.x, hero.y, a.gridX + 0.5, a.gridY + 0.5) - dist(hero.x, hero.y, b.gridX + 0.5, b.gridY + 0.5))
      .slice(0, 4);

    let prevX = hero.x;
    let prevY = hero.y;
    defenses.forEach((s) => {
      const dmg = computeMitigatedDamage(hero.attack * 1.75, s.defense, 1, balance);
      applyDamageToStructure(s, dmg, hero, state, true);
      s.stunTimer = Math.max(s.stunTimer, 3.2);
      state.vfx.push({
        id: nextId('vfx'),
        kind: 'lightning',
        x: prevX,
        y: prevY,
        targetX: s.gridX + 0.5,
        targetY: s.gridY + 0.5,
        radius: 1,
        color: '#38BDF8',
        age: 0,
        duration: 0.8,
      });
      prevX = s.gridX + 0.5;
      prevY = s.gridY + 0.5;
    });
    state.floatingTexts.push({
      id: nextId('ft'),
      x: hero.x,
      y: hero.y - 0.5,
      text: 'TEMPESTADE ELÉTRICA!',
      color: '#7DD3FC',
      age: 0,
      duration: 1.2,
      large: true,
    });
  } else if (hero.heroId === 'sylva') {
    const target = [...aliveStructures].sort(
      (a, b) => getStructurePriorityScore(b, 'ATIRADOR') - getStructurePriorityScore(a, 'ATIRADOR')
    )[0];
    hero.attackSpeedBuffTimer = 5.0;
    hero.attackAnim = 1.0;
    if (target) {
      const tx = target.gridX + 0.5;
      const ty = target.gridY + 0.5;
      // Blazing solar ignition pillar at Sylva + triple-layer fire lance beam + explosive ember nova on target!
      state.vfx.push({
        id: nextId('vfx'),
        kind: 'pillar',
        x: hero.x,
        y: hero.y,
        radius: 1.35,
        color: '#F97316',
        age: 0,
        duration: 0.72,
      });
      state.vfx.push({
        id: nextId('vfx'),
        kind: 'beam',
        x: hero.x,
        y: hero.y,
        targetX: tx,
        targetY: ty,
        radius: 1.75,
        color: '#F97316',
        age: 0,
        duration: 0.88,
      });
      // Spiraling blazing flint-fire embers along the full trajectory
      for (let i = 1; i <= 22; i++) {
        const frac = i / 22;
        const spiral = Math.sin(frac * Math.PI * 4) * 0.24;
        pushParticle(state, {
          x: hero.x + (tx - hero.x) * frac + spiral,
          y: hero.y + (ty - hero.y) * frac - spiral * 0.7,
          z: 14 + Math.random() * 10,
          vx: (Math.random() - 0.5) * 0.85,
          vy: (Math.random() - 0.5) * 0.85,
          vz: 22 + Math.random() * 24,
          gravity: 30,
          size: 3.8 + Math.random() * 1.6,
          color: i % 3 === 0 ? '#FFFBEB' : i % 2 === 0 ? '#FEF08A' : '#F97316',
          alpha: 1,
          duration: 0.65,
          shape: 'ember',
          rotation: 0,
          vRot: 0,
        });
      }
      state.vfx.push({
        id: nextId('vfx'),
        kind: 'ember_nova',
        x: tx,
        y: ty,
        radius: 2.05,
        color: '#F97316',
        age: 0,
        duration: 0.72,
      });
      state.vfx.push({
        id: nextId('vfx'),
        kind: 'shockwave',
        x: tx,
        y: ty,
        radius: 2.3,
        color: '#FEF08A',
        age: 0,
        duration: 0.62,
      });
      const dmg = computeMitigatedDamage(
        hero.attack * (skillPower.damageMult ?? 2.8),
        target.defense * 0.55,
        1,
        balance
      );
      applyDamageToStructure(target, dmg, hero, state, true);
      target.burnTimer = Math.max(target.burnTimer, 3.8);
      target.burnDps = Math.max(target.burnDps, Math.round(hero.attack * 0.35));
      state.floatingTexts.push({
        id: nextId('ft'),
        x: tx,
        y: ty - 0.4,
        text: `FLECHA Nv.${hero.skillLevel}!`,
        color: '#FEF08A',
        age: 0,
        duration: 1.15,
        large: true,
      });
    }
  } else if (hero.heroId === 'elowen') {
    const healAmount = Math.round(hero.attack * 3.2);
    allies.forEach((ally) => {
      const actualHeal = Math.min(ally.maxHp - ally.hp, healAmount);
      ally.hp += actualHeal;
      ally.slowTimer = 0;
      ally.poisonTimer = 0;
      ally.damageReductionTimer = 5.0;
      hero.stats.healingDone += actualHeal;
      state.vfx.push({
        id: nextId('vfx'),
        kind: 'heal',
        x: ally.x,
        y: ally.y,
        radius: 1.25,
        color: '#4ADE80',
        age: 0,
        duration: 0.9,
      });
      for (let i = 0; i < 6; i++) {
        pushParticle(state, {
          x: ally.x + (Math.random() - 0.5) * 0.5,
          y: ally.y + (Math.random() - 0.5) * 0.5,
          z: 6 + Math.random() * 14,
          vx: 0,
          vy: 0,
          vz: 24 + Math.random() * 16,
          gravity: -5,
          size: 4,
          color: '#86EFAC',
          alpha: 0.95,
          duration: 0.75,
          shape: 'heal',
          rotation: 0,
          vRot: 0,
        });
      }
      state.floatingTexts.push({
        id: nextId('ft'),
        x: ally.x,
        y: ally.y - 0.45,
        text: `+${actualHeal}`,
        color: '#86EFAC',
        age: 0,
        duration: 0.9,
      });
    });
    state.floatingTexts.push({
      id: nextId('ft'),
      x: hero.x,
      y: hero.y - 0.7,
      text: 'BÊNÇÃO RESTAURADORA!',
      color: '#86EFAC',
      age: 0,
      duration: 1.2,
      large: true,
    });
  }

  return { ...state };
}

export function stepBattleSimulation(
  state: BattleState,
  rawDt: number,
  squadIds: string[],
  balance: BalanceConfig
): BattleState {
  if (state.phase !== 'RUNNING') return state;

  const dt = Math.min(0.05, rawDt) * state.speedMultiplier;
  state.timeRemaining = Math.max(0, state.timeRemaining - dt);

  const attackers = state.heroes.filter((h) => h.team === 'attacker' && h.alive);
  const defenders = state.heroes.filter((h) => h.team === 'defender' && h.alive);

  // 1. Update timers, ambient damage smoke/flames & DoTs on structures
  for (const s of state.structures) {
    if (s.recoil > 0) s.recoil = Math.max(0, s.recoil - dt * 4.5);
    if (s.hitFlash > 0) s.hitFlash = Math.max(0, s.hitFlash - dt);
    if (s.shakeTime > 0) s.shakeTime = Math.max(0, s.shakeTime - dt);

    // Smoldering smoke from recently destroyed ruins
    if (s.destroyed) {
      if (s.type !== 'wall' && s.type !== 'trap' && Math.random() < dt * 1.4) {
        pushParticle(state, {
          x: s.gridX + 0.5 + (Math.random() - 0.5) * 0.4,
          y: s.gridY + 0.5 + (Math.random() - 0.5) * 0.4,
          z: 4,
          vx: (Math.random() - 0.5) * 0.15,
          vy: (Math.random() - 0.5) * 0.15,
          vz: 14 + Math.random() * 10,
          gravity: -2,
          size: 5 + Math.random() * 4,
          color: '#64748B',
          alpha: 0.45,
          duration: 1.1,
          shape: 'smoke',
          rotation: 0,
          vRot: 0,
        });
      }
      continue;
    }

    const hpPct = s.hp / s.maxHp;
    // Ongoing smoke when structure is damaged (<65% HP)
    if (hpPct < 0.65 && Math.random() < dt * (hpPct < 0.35 ? 4.5 : 2.0)) {
      pushParticle(state, {
        x: s.gridX + 0.5 + (Math.random() - 0.5) * 0.35,
        y: s.gridY + 0.5 + (Math.random() - 0.5) * 0.35,
        z: 18,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        vz: 18 + Math.random() * 12,
        gravity: -4,
        size: hpPct < 0.35 ? 6.5 : 4.8,
        color: hpPct < 0.35 ? '#334155' : '#94A3B8',
        alpha: 0.55,
        duration: 0.85,
        shape: 'smoke',
        rotation: 0,
        vRot: 0,
      });
    }
    // Live flames when critical (<35% HP) or burning
    if ((hpPct < 0.35 || s.burnTimer > 0) && Math.random() < dt * 6.5) {
      pushParticle(state, {
        x: s.gridX + 0.5 + (Math.random() - 0.5) * 0.4,
        y: s.gridY + 0.5 + (Math.random() - 0.5) * 0.4,
        z: 12 + Math.random() * 10,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        vz: 24 + Math.random() * 20,
        gravity: -8,
        size: 3 + Math.random() * 2.5,
        color: Math.random() < 0.5 ? '#F97316' : '#FACC15',
        alpha: 0.95,
        duration: 0.55,
        shape: 'ember',
        rotation: 0,
        vRot: 0,
      });
    }
    // Electric stun sparks
    if (s.stunTimer > 0 && Math.random() < dt * 7) {
      pushParticle(state, {
        x: s.gridX + 0.5 + (Math.random() - 0.5) * 0.45,
        y: s.gridY + 0.5 + (Math.random() - 0.5) * 0.45,
        z: 16 + Math.random() * 14,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        vz: 15,
        gravity: 30,
        size: 2.8,
        color: '#38BDF8',
        alpha: 1,
        duration: 0.32,
        shape: 'spark',
        rotation: 0,
        vRot: 0,
      });
    }

    if (s.stunTimer > 0) s.stunTimer = Math.max(0, s.stunTimer - dt);
    if (s.burnTimer > 0) {
      s.burnTimer = Math.max(0, s.burnTimer - dt);
      const burnTick = Math.max(1, Math.round(s.burnDps * dt));
      s.hp = Math.max(0, s.hp - burnTick);
      if (s.hp <= 0) {
        s.destroyed = true;
        s.destroyedAt = state.maxTime - state.timeRemaining;
        spawnHitDebris(state, s.gridX + 0.5, s.gridY + 0.5, 12, true);
        soundEngine.playStructureDestroyed();
      }
    }

    // Trigger hidden traps
    if (s.type === 'trap' && !s.triggered) {
      const victim = attackers.find((h) => dist(h.x, h.y, s.gridX + 0.5, s.gridY + 0.5) <= s.range);
      if (victim) {
        s.triggered = true;
        s.destroyed = true;
        victim.stealthTimer = 0;
        const dmg = computeMitigatedDamage(s.damage, victim.defense * 0.6, 1, balance);
        applyDamageToHero(victim, dmg, state, balance, '#FB923C');
        spawnHitDebris(state, s.gridX + 0.5, s.gridY + 0.5, 8, false);
        state.vfx.push({
          id: nextId('vfx'),
          kind: 'explosion',
          x: s.gridX + 0.5,
          y: s.gridY + 0.5,
          radius: 1.35,
          color: '#EA580C',
          age: 0,
          duration: 0.45,
        });
        state.floatingTexts.push({
          id: nextId('ft'),
          x: s.gridX + 0.5,
          y: s.gridY,
          text: 'ARMADILHA!',
          color: '#FDBA74',
          age: 0,
          duration: 0.9,
        });
        soundEngine.playHit('cannon');
      }
    }
  }

  // 2. Update Attacker Heroes
  for (const hero of attackers) {
    hero.animTime += dt;
    hero.isMoving = false;
    if (hero.attackAnim > 0) hero.attackAnim = Math.max(0, hero.attackAnim - dt * 3.4);
    if (hero.ultAnim > 0) hero.ultAnim = Math.max(0, hero.ultAnim - dt * 1.6);
    if (hero.hitFlash > 0) hero.hitFlash = Math.max(0, hero.hitFlash - dt);
    if (hero.stealthTimer > 0) hero.stealthTimer = Math.max(0, hero.stealthTimer - dt);
    if (hero.slowTimer > 0) hero.slowTimer = Math.max(0, hero.slowTimer - dt);
    if (hero.damageReductionTimer > 0) hero.damageReductionTimer = Math.max(0, hero.damageReductionTimer - dt);
    if (hero.attackSpeedBuffTimer > 0) hero.attackSpeedBuffTimer = Math.max(0, hero.attackSpeedBuffTimer - dt);
    if (hero.poisonTimer > 0) {
      hero.poisonTimer = Math.max(0, hero.poisonTimer - dt);
      const poisonDmg = hero.maxHp * balance.poisonDpsPctPerSec * dt;
      hero.hp = Math.max(1, hero.hp - poisonDmg);
    }

    const entry = getHeroById(hero.heroId);
    const speedFactor = hero.slowTimer > 0 ? balance.iceSlowFactor : 1;
    const atkSpeedFactor =
      (hero.slowTimer > 0 ? balance.iceSlowFactor : 1) *
      (hero.attackSpeedBuffTimer > 0 ? 1.4 : 1);

    // Support AI
    if (entry?.heroClass === 'SUPORTE') {
      const otherAllies = attackers.filter((a) => a.instanceId !== hero.instanceId);
      const wounded = [...attackers].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      const followTarget = otherAllies.find((a) => getHeroById(a.heroId)?.heroClass === 'TANQUE') ?? otherAllies[0];

      if (wounded && wounded.hp / wounded.maxHp < 0.96) {
        const d = dist(hero.x, hero.y, wounded.x, wounded.y);
        if (d > hero.range) {
          const dx = (wounded.x - hero.x) / d;
          const dy = (wounded.y - hero.y) / d;
          hero.x += dx * hero.moveSpeed * speedFactor * dt;
          hero.y += dy * hero.moveSpeed * speedFactor * dt;
          hero.facing = dx - dy >= 0 ? 1 : -1;
          hero.isMoving = true;
        } else {
          hero.facing = wounded.x - hero.x - (wounded.y - hero.y) >= 0 ? 1 : -1;
          hero.attackCooldown -= dt * atkSpeedFactor;
          if (hero.attackCooldown <= 0) {
            hero.attackCooldown = 1 / hero.attackSpeed;
            hero.attackAnim = 1.0;
            const healAmt = Math.round(hero.attack * 1.45);
            const actual = Math.min(wounded.maxHp - wounded.hp, healAmt);
            wounded.hp += actual;
            hero.stats.healingDone += actual;
            if (hero.skillLevel > 0) {
              hero.energy = Math.min(hero.maxEnergy, hero.energy + balance.energyPerAttack * 1.05);
            }
            soundEngine.playHit('heal');
            state.vfx.push({
              id: nextId('vfx'),
              kind: 'heal',
              x: wounded.x,
              y: wounded.y,
              radius: 0.75,
              color: '#4ADE80',
              age: 0,
              duration: 0.45,
            });
            for (let i = 0; i < 4; i++) {
              pushParticle(state, {
                x: wounded.x + (Math.random() - 0.5) * 0.3,
                y: wounded.y + (Math.random() - 0.5) * 0.3,
                z: 8,
                vx: 0,
                vy: 0,
                vz: 24,
                gravity: -4,
                size: 3.5,
                color: '#86EFAC',
                alpha: 0.9,
                duration: 0.55,
                shape: 'heal',
                rotation: 0,
                vRot: 0,
              });
            }
            state.floatingTexts.push({
              id: nextId('ft'),
              x: wounded.x,
              y: wounded.y - 0.3,
              text: `+${actual}`,
              color: '#86EFAC',
              age: 0,
              duration: 0.65,
            });
          }
        }
        continue;
      } else if (followTarget) {
        const d = dist(hero.x, hero.y, followTarget.x, followTarget.y);
        if (d > 2.3) {
          const dx = (followTarget.x - hero.x) / d;
          const dy = (followTarget.y - hero.y) / d;
          hero.x += dx * hero.moveSpeed * speedFactor * dt;
          hero.y += dy * hero.moveSpeed * speedFactor * dt;
          hero.facing = dx - dy >= 0 ? 1 : -1;
          hero.isMoving = true;
          continue;
        }
      }
    }

    const target = selectAttackerTarget(hero, state.structures, defenders);
    if (!target) continue;
    hero.targetId = target.id;
    const d = dist(hero.x, hero.y, target.x, target.y);

    if (d > hero.range) {
      const dx = (target.x - hero.x) / d;
      const dy = (target.y - hero.y) / d;
      const nextX = hero.x + dx * hero.moveSpeed * speedFactor * dt;
      const nextY = hero.y + dy * hero.moveSpeed * speedFactor * dt;

      const blockingWall =
        entry?.heroClass !== 'ASSASSINO'
          ? state.structures.find(
              (s) =>
                !s.destroyed &&
                s.type === 'wall' &&
                dist(nextX, nextY, s.gridX + 0.5, s.gridY + 0.5) < 0.72
            )
          : undefined;

      if (blockingWall) {
        hero.facing = blockingWall.gridX + 0.5 - hero.x - (blockingWall.gridY + 0.5 - hero.y) >= 0 ? 1 : -1;
        hero.attackCooldown -= dt * atkSpeedFactor;
        if (hero.attackCooldown <= 0) {
          hero.attackCooldown = 1 / hero.attackSpeed;
          hero.attackAnim = 1.0;
          const dmg = computeMitigatedDamage(hero.attack * 1.15, blockingWall.defense, 1, balance);
          applyDamageToStructure(blockingWall, dmg, hero, state);
          if (hero.skillLevel > 0) {
            hero.energy = Math.min(hero.maxEnergy, hero.energy + balance.energyPerAttack * 0.65);
          }
          soundEngine.playHit('arrow');
        }
      } else {
        hero.x = Math.max(0.25, Math.min(GRID_SIZE - 0.25, nextX));
        hero.y = Math.max(0.25, Math.min(GRID_SIZE - 0.25, nextY));
        // Screen-space horizontal facing in isometric projection is sign(dx - dy)
        hero.facing = dx - dy >= 0 ? 1 : -1;
        hero.isMoving = true;

        // Signature hero stride trails: heavy dust & golden earth motes for Aegor, solar sparks & wind trail for Sylva!
        if (Math.random() < dt * (hero.attackSpeedBuffTimer > 0 ? 11 : 6.5)) {
          const isSylva = hero.heroId === 'sylva';
          pushParticle(state, {
            x: hero.x + (Math.random() - 0.5) * 0.2,
            y: hero.y + (Math.random() - 0.5) * 0.2,
            z: isSylva ? 8 + Math.random() * 8 : 2,
            vx: -dx * (isSylva ? 0.45 : 0.28) + (Math.random() - 0.5) * 0.15,
            vy: -dy * (isSylva ? 0.45 : 0.28) + (Math.random() - 0.5) * 0.15,
            vz: isSylva ? 14 : 9,
            gravity: isSylva ? 12 : 26,
            size: isSylva ? 3.0 : 3.2,
            color: isSylva
              ? hero.attackSpeedBuffTimer > 0
                ? '#FEF08A'
                : '#FB923C'
              : Math.random() < 0.35
              ? '#FDE047'
              : '#E5D7B8',
            alpha: isSylva ? 0.85 : 0.65,
            duration: isSylva ? 0.42 : 0.38,
            shape: isSylva ? 'ember' : 'dust',
            rotation: 0,
            vRot: 0,
          });
        }
      }
    } else {
      hero.facing = target.x - hero.x - (target.y - hero.y) >= 0 ? 1 : -1;
      hero.attackCooldown -= dt * atkSpeedFactor;
      if (hero.attackCooldown <= 0) {
        hero.attackCooldown = 1 / hero.attackSpeed;
        hero.attackAnim = 1.0;
        if (hero.skillLevel > 0) {
          hero.energy = Math.min(hero.maxEnergy, hero.energy + balance.energyPerAttack);
        }
        if (hero.stealthTimer > 0 && entry?.heroClass === 'ASSASSINO') {
          hero.stealthTimer = Math.min(hero.stealthTimer, 0.25);
        }

        const isMelee = hero.range <= 1.5;
        if (isMelee) {
          if (target.kind === 'structure') {
            const st = state.structures.find((s) => s.id === target.id);
            if (st && !st.destroyed) {
              const dmg = computeMitigatedDamage(hero.attack, st.defense, 1, balance);
              applyDamageToStructure(st, dmg, hero, state);
              soundEngine.playHit('cannon');
              state.vfx.push({
                id: nextId('vfx'),
                kind: 'slash',
                x: st.gridX + 0.5,
                y: st.gridY + 0.5,
                radius: 1.15,
                color: '#FDE047',
                age: 0,
                duration: 0.34,
              });
              state.vfx.push({
                id: nextId('vfx'),
                kind: 'shockwave',
                x: st.gridX + 0.5,
                y: st.gridY + 0.5,
                radius: 1.25,
                color: '#F59E0B',
                age: 0,
                duration: 0.36,
              });
              // Heavy club impact rock & golden spark spray
              for (let i = 0; i < 6; i++) {
                const a = Math.random() * Math.PI * 2;
                pushParticle(state, {
                  x: st.gridX + 0.5,
                  y: st.gridY + 0.5,
                  z: 14,
                  vx: Math.cos(a) * (1.1 + Math.random() * 0.9),
                  vy: Math.sin(a) * (1.1 + Math.random() * 0.9),
                  vz: 26 + Math.random() * 20,
                  gravity: 95,
                  size: 3.1,
                  color: i % 2 === 0 ? '#FEF08A' : '#F59E0B',
                  alpha: 1,
                  duration: 0.36,
                  shape: 'spark',
                  rotation: 0,
                  vRot: 0,
                });
              }
            }
          } else {
            const dh = defenders.find((h) => h.instanceId === target.id);
            if (dh && dh.alive) {
              const dmg = computeMitigatedDamage(hero.attack, dh.defense, 1, balance);
              applyDamageToHero(dh, dmg, state, balance);
              hero.stats.damageDealt += dmg;
              soundEngine.playHit('cannon');
              state.vfx.push({
                id: nextId('vfx'),
                kind: 'slash',
                x: dh.x,
                y: dh.y,
                radius: 1.12,
                color: '#FDE047',
                age: 0,
                duration: 0.32,
              });
              state.vfx.push({
                id: nextId('vfx'),
                kind: 'shockwave',
                x: (hero.x + dh.x) * 0.5,
                y: (hero.y + dh.y) * 0.5,
                radius: 1.15,
                color: '#FEF08A',
                age: 0,
                duration: 0.32,
              });
              // Dramatic Hero-vs-Hero weapon clash sparks
              for (let i = 0; i < 10; i++) {
                const a = Math.random() * Math.PI * 2;
                pushParticle(state, {
                  x: (hero.x + dh.x) * 0.5,
                  y: (hero.y + dh.y) * 0.5,
                  z: 16,
                  vx: Math.cos(a) * (1.4 + Math.random() * 1.1),
                  vy: Math.sin(a) * (1.4 + Math.random() * 1.1),
                  vz: 30 + Math.random() * 24,
                  gravity: 85,
                  size: 3.4,
                  color: i % 3 === 0 ? '#FFFFFF' : i % 2 === 0 ? '#FEF08A' : '#F97316',
                  alpha: 1,
                  duration: 0.4,
                  shape: 'spark',
                  rotation: 0,
                  vRot: 0,
                });
              }
            }
          }
        } else {
          // Bright solar bow launch flare for ranged hero shots
          if (hero.heroId === 'sylva') {
            state.vfx.push({
              id: nextId('vfx'),
              kind: 'muzzle',
              x: hero.x,
              y: hero.y,
              radius: 0.75,
              color: '#FDE047',
              age: 0,
              duration: 0.22,
            });
          }
          let style: BattleProjectile['style'] = 'arrow';
          let onHitEffect: BattleProjectile['onHitEffect'];
          let arcHeight = 20;
          if (hero.heroId === 'nyra') {
            style = 'fire';
            onHitEffect = 'burn';
            arcHeight = 28;
          } else if (hero.heroId === 'zarek') {
            style = 'electric';
            onHitEffect = 'stun';
            arcHeight = 8;
          } else if (hero.heroId === 'sylva') {
            style = 'solar';
            arcHeight = 14;
          } else if (hero.heroId === 'elowen') {
            style = 'heal';
            arcHeight = 18;
          }

          state.projectiles.push({
            id: nextId('proj'),
            fromX: hero.x,
            fromY: hero.y,
            x: hero.x,
            y: hero.y,
            prevX: hero.x,
            prevY: hero.y,
            targetX: target.x,
            targetY: target.y,
            targetId: target.id,
            targetKind: target.kind,
            speed: style === 'electric' ? 14 : 9.2,
            arcHeight,
            progress: 0,
            totalDist: Math.max(0.2, dist(hero.x, hero.y, target.x, target.y)),
            damage: hero.attack,
            color: entry?.accentColor ?? '#F59E0B',
            style,
            splashRadius: hero.splashRadius,
            sourceHeroId: hero.instanceId,
            onHitEffect,
          });
        }
      }
    }
  }

  // 3. Update Defender Heroes (tethered to their Hero Altar circle; intercept intruders entering guard zone)
  for (const defHero of defenders) {
    defHero.animTime += dt;
    defHero.isMoving = false;
    if (defHero.attackAnim > 0) defHero.attackAnim = Math.max(0, defHero.attackAnim - dt * 3.4);
    if (defHero.hitFlash > 0) defHero.hitFlash = Math.max(0, defHero.hitFlash - dt);

    const homeX = defHero.homeX ?? GRID_SIZE * 0.5;
    const homeY = defHero.homeY ?? GRID_SIZE * 0.5;
    const guardRadius = defHero.guardRadius ?? HERO_ALTAR_GUARD_RADIUS;
    const altar = defHero.altarStructureId
      ? state.structures.find((s) => s.id === defHero.altarStructureId)
      : undefined;
    const altarThreatened = Boolean(altar && (altar.destroyed || altar.hp < altar.maxHp));
    const aggroRadius = altarThreatened || defHero.hp < defHero.maxHp ? guardRadius + 3.2 : guardRadius;

    const visibleAttackers = attackers.filter((a) => a.stealthTimer <= 0);
    const inGuardZone = visibleAttackers
      .filter(
        (a) =>
          dist(homeX, homeY, a.x, a.y) <= aggroRadius ||
          dist(defHero.x, defHero.y, a.x, a.y) <= Math.max(3.2, defHero.range)
      )
      .sort((a, b) => dist(defHero.x, defHero.y, a.x, a.y) - dist(defHero.x, defHero.y, b.x, b.y));

    const targetAttacker = inGuardZone[0];

    if (targetAttacker) {
      const d = dist(defHero.x, defHero.y, targetAttacker.x, targetAttacker.y);
      if (d > defHero.range) {
        const dx = (targetAttacker.x - defHero.x) / d;
        const dy = (targetAttacker.y - defHero.y) / d;
        defHero.x = Math.max(0.35, Math.min(GRID_SIZE - 0.35, defHero.x + dx * defHero.moveSpeed * 0.92 * dt));
        defHero.y = Math.max(0.35, Math.min(GRID_SIZE - 0.35, defHero.y + dy * defHero.moveSpeed * 0.92 * dt));
        defHero.facing = dx - dy >= 0 ? 1 : -1;
        defHero.isMoving = true;
      } else {
        defHero.facing = targetAttacker.x - defHero.x - (targetAttacker.y - defHero.y) >= 0 ? 1 : -1;
        defHero.attackCooldown -= dt;
        if (defHero.attackCooldown <= 0) {
          defHero.attackCooldown = 1 / defHero.attackSpeed;
          defHero.attackAnim = 1.0;

          if (defHero.range <= 1.5) {
            const dmg = computeMitigatedDamage(defHero.attack, targetAttacker.defense, 1, balance);
            applyDamageToHero(targetAttacker, dmg, state, balance, '#F87171');
            soundEngine.playHit('cannon');
            state.vfx.push({
              id: nextId('vfx'),
              kind: 'slash',
              x: targetAttacker.x,
              y: targetAttacker.y,
              radius: 0.82,
              color: '#F87171',
              age: 0,
              duration: 0.28,
            });
          } else {
            state.projectiles.push({
              id: nextId('dproj'),
              fromX: defHero.x,
              fromY: defHero.y,
              x: defHero.x,
              y: defHero.y,
              prevX: defHero.x,
              prevY: defHero.y,
              targetX: targetAttacker.x,
              targetY: targetAttacker.y,
              targetId: targetAttacker.instanceId,
              targetKind: 'hero',
              speed: 9.2,
              arcHeight: 14,
              progress: 0,
              totalDist: Math.max(0.2, dist(defHero.x, defHero.y, targetAttacker.x, targetAttacker.y)),
              damage: defHero.attack,
              color: '#F97316',
              style: 'solar',
              sourceHeroId: defHero.instanceId,
            });
          }
        }
      }
    } else {
      // Calmly walk in a tight circle right around their own Hero Altar
      const orbitAngle = defHero.animTime * 0.85;
      const goalX = homeX + Math.cos(orbitAngle) * HERO_ALTAR_PATROL_RADIUS;
      const goalY = homeY + Math.sin(orbitAngle) * HERO_ALTAR_PATROL_RADIUS;
      const toGoal = dist(defHero.x, defHero.y, goalX, goalY);
      if (toGoal > 0.04) {
        const dx = (goalX - defHero.x) / toGoal;
        const dy = (goalY - defHero.y) / toGoal;
        const stepDist = Math.min(toGoal, defHero.moveSpeed * 0.58 * dt);
        defHero.x += dx * stepDist;
        defHero.y += dy * stepDist;
        defHero.facing = dx - dy >= 0 ? 1 : -1;
        defHero.isMoving = true;
      }
    }
  }

  // 4. Update Defensive Structures
  for (const s of state.structures) {
    if (s.destroyed || s.damage <= 0 || s.type === 'trap' || s.stunTimer > 0) continue;

    const visibleInRange = attackers.filter(
      (h) => h.stealthTimer <= 0 && dist(s.gridX + 0.5, s.gridY + 0.5, h.x, h.y) <= s.range
    );
    if (visibleInRange.length === 0) continue;

    const tauntingTank = visibleInRange.find(
      (h) =>
        getHeroById(h.heroId)?.heroClass === 'TANQUE' &&
        dist(s.gridX + 0.5, s.gridY + 0.5, h.x, h.y) <= 3.5
    );
    const targetHero =
      tauntingTank ??
      visibleInRange.sort(
        (a, b) =>
          dist(s.gridX + 0.5, s.gridY + 0.5, a.x, a.y) -
          dist(s.gridX + 0.5, s.gridY + 0.5, b.x, b.y)
      )[0];

    // Update isometric screen-space aim angle for Cannon & Archer rotation
    const isoDx = (targetHero.x - (s.gridX + 0.5)) - (targetHero.y - (s.gridY + 0.5));
    const isoDy = ((targetHero.x - (s.gridX + 0.5)) + (targetHero.y - (s.gridY + 0.5))) * 0.5;
    s.aimAngle = Math.atan2(isoDy, isoDx);

    s.attackCooldown -= dt;
    if (s.attackCooldown <= 0) {
      s.attackCooldown = 1 / s.attackSpeed;
      s.recoil = 1;

      let style: BattleProjectile['style'] = 'arrow';
      let onHitEffect: BattleProjectile['onHitEffect'];
      let color = '#FDE68A';
      let arcHeight = 20;
      if (s.type === 'cannon') {
        style = 'cannon';
        color = '#78716C';
        arcHeight = 38;
        // Stone catapult launch dust puff
        for (let i = 0; i < 4; i++) {
          pushParticle(state, {
            x: s.gridX + 0.5,
            y: s.gridY + 0.5,
            z: 14,
            vx: (Math.random() - 0.5) * 0.55,
            vy: (Math.random() - 0.5) * 0.55,
            vz: 16,
            gravity: 20,
            size: 4.5,
            color: '#D6C4A1',
            alpha: 0.7,
            duration: 0.45,
            shape: 'dust',
            rotation: 0,
            vRot: 0,
          });
        }
      } else if (s.type === 'arcane_tower') {
        style = 'arcane';
        color = '#A855F7';
        arcHeight = 24;
      } else if (s.type === 'electric_tower') {
        style = 'electric';
        color = '#38BDF8';
        arcHeight = 4;
        // Immediate jagged thunder bolt visual from Monolith peak to hero
        state.vfx.push({
          id: nextId('vfx'),
          kind: 'lightning',
          x: s.gridX + 0.5,
          y: s.gridY + 0.5,
          targetX: targetHero.x,
          targetY: targetHero.y,
          radius: 1,
          color: '#38BDF8',
          age: 0,
          duration: 0.34,
        });
      } else if (s.type === 'ice_tower') {
        style = 'ice';
        color = '#38BDF8';
        onHitEffect = 'slow';
        arcHeight = 22;
      } else if (s.type === 'poison_tower') {
        style = 'poison';
        color = '#22C55E';
        onHitEffect = 'poison';
        arcHeight = 34;
      }

      const tx = targetHero.x;
      const ty = targetHero.y;
      state.projectiles.push({
        id: nextId('tproj'),
        fromX: s.gridX + 0.5,
        fromY: s.gridY + 0.5,
        x: s.gridX + 0.5,
        y: s.gridY + 0.5,
        prevX: s.gridX + 0.5,
        prevY: s.gridY + 0.5,
        targetX: tx,
        targetY: ty,
        targetId: targetHero.instanceId,
        targetKind: 'hero',
        speed: s.type === 'electric_tower' ? 15 : s.type === 'cannon' ? 6.8 : 8.5,
        arcHeight,
        progress: 0,
        totalDist: Math.max(0.2, dist(s.gridX + 0.5, s.gridY + 0.5, tx, ty)),
        damage: s.damage,
        color,
        style,
        splashRadius: s.splashRadius,
        sourceStructureType: s.type,
        onHitEffect,
      });
    }
  }

  // 5. Advance Projectiles
  const remainingProjectiles: BattleProjectile[] = [];
  for (const p of state.projectiles) {
    if (p.targetKind === 'hero') {
      const th = state.heroes.find((h) => h.instanceId === p.targetId && h.alive);
      if (th) {
        p.targetX = th.x;
        p.targetY = th.y;
      }
    }
    const d = dist(p.x, p.y, p.targetX, p.targetY);
    const step = p.speed * dt;

    // Rich flight trails for Stone Age elemental & flaming projectiles
    if (
      (p.style === 'fire' ||
        p.style === 'arcane' ||
        p.style === 'solar' ||
        p.style === 'ice' ||
        p.style === 'poison') &&
      Math.random() < 0.72
    ) {
      const trailColor =
        p.style === 'fire'
          ? '#F97316'
          : p.style === 'solar'
          ? Math.random() < 0.5
            ? '#F97316'
            : '#FEF08A'
          : p.style === 'ice'
          ? '#BAE6FD'
          : p.style === 'poison'
          ? '#4ADE80'
          : '#C084FC';
      pushParticle(state, {
        x: p.x,
        y: p.y,
        z: 14 + Math.sin(p.progress * Math.PI) * p.arcHeight,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        vz: p.style === 'poison' ? -4 : 5,
        gravity: p.style === 'poison' ? 25 : 10,
        size: p.style === 'solar' ? 2.9 : 2.5,
        color: trailColor,
        alpha: 0.88,
        duration: 0.28,
        shape: p.style === 'ice' ? 'spark' : 'ember',
        rotation: 0,
        vRot: 0,
      });
    }

    if (d <= step + 0.15) {
      soundEngine.playHit(p.style);
      if (p.targetKind === 'structure') {
        const attackerHero = state.heroes.find((h) => h.instanceId === p.sourceHeroId);
        const st = state.structures.find((s) => s.id === p.targetId);
        if (st && !st.destroyed) {
          const isCrit = attackerHero?.heroId === 'sylva' && Math.random() < 0.25;
          const mult = isCrit ? 1.65 : 1.0;
          const dmg = computeMitigatedDamage(p.damage, st.defense, mult, balance);
          applyDamageToStructure(st, dmg, attackerHero, state, isCrit);

          // Fiery flint arrow impact embers + ember nova starburst on Sylva hits/crits!
          if (p.style === 'solar') {
            const sparkCount = isCrit ? 14 : 6;
            for (let i = 0; i < sparkCount; i++) {
              const a = Math.random() * Math.PI * 2;
              pushParticle(state, {
                x: st.gridX + 0.5,
                y: st.gridY + 0.5,
                z: 16,
                vx: Math.cos(a) * (isCrit ? 1.8 : 1.0),
                vy: Math.sin(a) * (isCrit ? 1.8 : 1.0),
                vz: 26 + Math.random() * 26,
                gravity: 70,
                size: isCrit ? 3.8 : 2.6,
                color: i % 3 === 0 ? '#FFFFFF' : i % 2 === 0 ? '#F97316' : '#FEF08A',
                alpha: 1,
                duration: isCrit ? 0.52 : 0.32,
                shape: 'ember',
                rotation: 0,
                vRot: 0,
              });
            }
            state.vfx.push({
              id: nextId('vfx'),
              kind: isCrit ? 'ember_nova' : 'explosion',
              x: st.gridX + 0.5,
              y: st.gridY + 0.5,
              radius: isCrit ? 1.35 : 0.65,
              color: isCrit ? '#F97316' : '#F59E0B',
              age: 0,
              duration: isCrit ? 0.45 : 0.25,
            });
          }

          if (p.onHitEffect === 'burn') {
            st.burnTimer = 3.2;
            st.burnDps = Math.round(p.damage * balance.burnDpsRatio);
          }
          if (p.onHitEffect === 'stun') {
            st.stunTimer = Math.max(st.stunTimer, 0.7);
          }
          if (p.splashRadius && p.splashRadius > 0) {
            state.vfx.push({
              id: nextId('vfx'),
              kind: 'ring',
              x: st.gridX + 0.5,
              y: st.gridY + 0.5,
              radius: p.splashRadius,
              color: p.color,
              age: 0,
              duration: 0.35,
            });
            state.structures.forEach((other) => {
              if (
                other.id !== st.id &&
                !other.destroyed &&
                other.type !== 'trap' &&
                dist(st.gridX + 0.5, st.gridY + 0.5, other.gridX + 0.5, other.gridY + 0.5) <=
                  (p.splashRadius ?? 0)
              ) {
                const sd = computeMitigatedDamage(p.damage * 0.65, other.defense, 1, balance);
                applyDamageToStructure(other, sd, attackerHero, state);
                if (p.onHitEffect === 'burn') {
                  other.burnTimer = 3.2;
                  other.burnDps = Math.round(p.damage * balance.burnDpsRatio);
                }
              }
            });
          }
        }
      } else {
        const targetHero = state.heroes.find((h) => h.instanceId === p.targetId);
        if (targetHero && targetHero.alive) {
          const heroEntry = getHeroById(targetHero.heroId);
          let mult = 1.0;
          if (p.sourceStructureType === 'cannon' && heroEntry?.heroClass === 'TANQUE') {
            mult = balance.cannonVsTankMultiplier;
          }
          const dmg = computeMitigatedDamage(p.damage, targetHero.defense, mult, balance);
          applyDamageToHero(targetHero, dmg, state, balance);

          // Distinct thematic Stone Age defense impact bursts!
          if (p.sourceStructureType === 'cannon') {
            // Shattering catapult boulder -> flying stone shards & dust shockwave ring
            spawnHitDebris(state, targetHero.x, targetHero.y, 7, false);
            state.vfx.push({
              id: nextId('vfx'),
              kind: 'ring',
              x: targetHero.x,
              y: targetHero.y,
              radius: 1.05,
              color: '#D6C4A1',
              age: 0,
              duration: 0.36,
            });
          } else if (p.sourceStructureType === 'electric_tower') {
            targetHero.energy = Math.max(0, targetHero.energy - 12);
            for (let i = 0; i < 6; i++) {
              const a = Math.random() * Math.PI * 2;
              pushParticle(state, {
                x: targetHero.x,
                y: targetHero.y,
                z: 14,
                vx: Math.cos(a) * 1.1,
                vy: Math.sin(a) * 1.1,
                vz: 22,
                gravity: 60,
                size: 2.8,
                color: i % 2 === 0 ? '#E0F2FE' : '#38BDF8',
                alpha: 1,
                duration: 0.32,
                shape: 'spark',
                rotation: 0,
                vRot: 0,
              });
            }
          } else if (p.sourceStructureType === 'ice_tower') {
            for (let i = 0; i < 7; i++) {
              const a = Math.random() * Math.PI * 2;
              pushParticle(state, {
                x: targetHero.x,
                y: targetHero.y,
                z: 12,
                vx: Math.cos(a) * 0.9,
                vy: Math.sin(a) * 0.9,
                vz: 20,
                gravity: 45,
                size: 3.1,
                color: i % 2 === 0 ? '#E0F2FE' : '#22D3EE',
                alpha: 0.95,
                duration: 0.48,
                shape: 'spark',
                rotation: 0,
                vRot: 0,
              });
            }
          } else if (p.sourceStructureType === 'poison_tower') {
            // Bubbling toxic herb cloud on impact
            for (let i = 0; i < 8; i++) {
              const a = Math.random() * Math.PI * 2;
              pushParticle(state, {
                x: targetHero.x + Math.cos(a) * 0.25,
                y: targetHero.y + Math.sin(a) * 0.25,
                z: 8,
                vx: Math.cos(a) * 0.45,
                vy: Math.sin(a) * 0.45,
                vz: 14 + Math.random() * 12,
                gravity: -6,
                size: 5 + Math.random() * 3,
                color: i % 2 === 0 ? '#22C55E' : '#86EFAC',
                alpha: 0.75,
                duration: 0.72,
                shape: 'smoke',
                rotation: 0,
                vRot: 0,
              });
            }
          } else if (p.sourceStructureType === 'arcane_tower') {
            for (let i = 0; i < 7; i++) {
              const a = Math.random() * Math.PI * 2;
              pushParticle(state, {
                x: targetHero.x,
                y: targetHero.y,
                z: 12,
                vx: Math.cos(a) * 1.15,
                vy: Math.sin(a) * 1.15,
                vz: 20,
                gravity: 25,
                size: 3.2,
                color: i % 2 === 0 ? '#C084FC' : '#F59E0B',
                alpha: 0.95,
                duration: 0.45,
                shape: 'ember',
                rotation: 0,
                vRot: 0,
              });
            }
          }

          if (p.onHitEffect === 'slow') {
            targetHero.slowTimer = Math.max(targetHero.slowTimer, 2.6);
          }
          if (p.onHitEffect === 'poison') {
            targetHero.poisonTimer = Math.max(targetHero.poisonTimer, 3.5);
          }

          if (p.splashRadius && p.splashRadius > 0) {
            state.vfx.push({
              id: nextId('vfx'),
              kind: 'ring',
              x: targetHero.x,
              y: targetHero.y,
              radius: p.splashRadius,
              color: p.color,
              age: 0,
              duration: 0.42,
            });
            attackers.forEach((other) => {
              if (
                other.instanceId !== targetHero.instanceId &&
                other.alive &&
                dist(targetHero.x, targetHero.y, other.x, other.y) <= (p.splashRadius ?? 0)
              ) {
                const sd = computeMitigatedDamage(p.damage * 0.55, other.defense, 1, balance);
                applyDamageToHero(other, sd, state, balance);
                if (p.onHitEffect === 'slow') other.slowTimer = Math.max(other.slowTimer, 2.0);
                if (p.onHitEffect === 'poison') other.poisonTimer = Math.max(other.poisonTimer, 2.5);
              }
            });
          }
        }
      }
    } else {
      const dx = (p.targetX - p.x) / d;
      const dy = (p.targetY - p.y) / d;
      p.prevX = p.x;
      p.prevY = p.y;
      p.x += dx * step;
      p.y += dy * step;
      p.progress = Math.min(1, 1 - d / Math.max(0.2, p.totalDist));
      remainingProjectiles.push(p);
    }
  }
  state.projectiles = remainingProjectiles;

  // 6. Advance Physics Particles, VFX & Floating Texts
  const nextParticles: BattleParticle[] = [];
  for (const pt of state.particles) {
    pt.age += dt;
    if (pt.age >= pt.duration) continue;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vz -= pt.gravity * dt;
    pt.z += pt.vz * dt;
    if (pt.z < 0 && (pt.shape === 'stone' || pt.shape === 'wood')) {
      pt.z = 0;
      pt.vz = -pt.vz * 0.35;
      pt.vx *= 0.65;
      pt.vy *= 0.65;
    }
    pt.rotation += pt.vRot * dt;
    nextParticles.push(pt);
  }
  state.particles = nextParticles;

  state.vfx = state.vfx
    .map((v) => ({ ...v, age: v.age + dt }))
    .filter((v) => v.age < v.duration);
  state.floatingTexts = state.floatingTexts
    .map((f) => ({ ...f, age: f.age + dt, y: f.y - dt * 0.55 }))
    .filter((f) => f.age < f.duration);

  // 7. Compute Destruction & Victory / Defeat Conditions
  const countable = state.structures.filter((s) => s.countsForDestruction);
  const destroyedCount = countable.filter((s) => s.destroyed).length;
  state.destructionPct =
    countable.length > 0 ? Math.round((destroyedCount / countable.length) * 100) : 100;
  state.coreDestroyed = Boolean(state.structures.find((s) => s.type === 'core')?.destroyed);

  let stars = 0;
  if (state.destructionPct >= 50) stars += 1;
  if (state.coreDestroyed) stars += 1;
  if (state.destructionPct === 100) stars = 3;
  state.starsEarned = stars;

  const aliveAttackersNow = state.heroes.filter((h) => h.team === 'attacker' && h.alive);
  const undeployedRemaining = squadIds.filter((id) => !state.deployedHeroIds.includes(id)).length;

  const allDestroyed = state.destructionPct === 100;
  const allHeroesFallen = aliveAttackersNow.length === 0 && undeployedRemaining === 0 && state.deployedHeroIds.length > 0;
  const timedOut = state.timeRemaining <= 0;

  if (allDestroyed || allHeroesFallen || timedOut) {
    const won = state.starsEarned >= 1;
    state.phase = won ? 'VICTORY' : 'DEFEAT';
    if (state.target) {
      const lootFactor = won
        ? state.starsEarned === 3
          ? 1.0
          : state.starsEarned === 2
          ? 0.8
          : 0.6
        : Math.max(0.15, (state.destructionPct / 100) * 0.45);
      state.rewardEarned = {
        gold: Math.round(state.target.reward.gold * lootFactor),
        crystals: Math.round(state.target.reward.crystals * lootFactor),
        essence: Math.round(state.target.reward.essence * lootFactor),
      };
    }
    if (won) soundEngine.playVictory();
    else soundEngine.playDefeat();
  }

  return state;
}
