export type HeroClass =
  | 'TANQUE'
  | 'ASSASSINO'
  | 'MAGO'
  | 'ATIRADOR'
  | 'SUPORTE'
  | 'CONTROLADOR';

export type HeroRarity = 'Comum' | 'Raro' | 'Épico' | 'Lendário';

export type DamageType = 'fisico' | 'magico';

export interface HeroTalent {
  id: string;
  name: string;
  description: string;
  hpBonusPct?: number;
  atkBonusPct?: number;
  defBonusPct?: number;
  speedBonusPct?: number;
  energyGainBonusPct?: number;
}

export interface HeroRelic {
  id: string;
  name: string;
  slot: 'Arma' | 'Armadura' | 'Artefato';
  description: string;
  hpBonus?: number;
  atkBonus?: number;
  defBonus?: number;
  rangeBonus?: number;
}

export interface HeroCatalogEntry {
  id: string;
  name: string;
  title: string;
  heroClass: HeroClass;
  rarity: HeroRarity;
  playableInPhase1: boolean;
  portraitUrl?: string;
  accentColor: string;
  emblemSymbol: string;
  lore: string;
  personality: string;
  damageType: DamageType;
  baseStats: {
    hp: number;
    attack: number;
    defense: number;
    moveSpeed: number; // tiles per second
    attackSpeed: number; // attacks per second
    range: number; // tiles
    splashRadius?: number;
  };
  growthPerLevel: {
    hp: number;
    attack: number;
    defense: number;
  };
  passive: {
    name: string;
    description: string;
  };
  ultimate: {
    name: string;
    description: string;
    energyCost: number;
  };
  aiBehaviorSummary: string;
  talents: HeroTalent[];
  relics: HeroRelic[];
  strongAgainst: string;
  weakAgainst: string;
}

export interface SynergyDefinition {
  id: string;
  name: string;
  heroIds: [string, string];
  description: string;
  effectLabel: string;
  bonuses: {
    hpPct?: number;
    atkPct?: number;
    defPct?: number;
    energyGainPct?: number;
  };
}

export type StructureCategory = 'core' | 'economy' | 'defense' | 'utility';

export type StructureType =
  | 'core'
  | 'gold_mine'
  | 'crystal_mine'
  | 'essence_well'
  | 'storage'
  | 'archer_tower'
  | 'cannon'
  | 'arcane_tower'
  | 'electric_tower'
  | 'ice_tower'
  | 'poison_tower'
  | 'hero_altar'
  | 'wall'
  | 'trap';

export interface StructureCatalogEntry {
  type: StructureType;
  name: string;
  shortName: string;
  category: StructureCategory;
  description: string;
  color: string;
  roofColor: string;
  baseCost: {
    gold: number;
    crystals: number;
  };
  upgradeCostScale: number;
  buildTimeSec: number;
  maxCountBase: number;
  baseHp: number;
  hpPerLevel: number;
  defense: number;
  range: number;
  damage: number;
  damagePerLevel: number;
  attackSpeed: number; // shots per second
  splashRadius?: number;
  damageType?: DamageType;
  specialEffect?: string;
  strongAgainst?: string;
  weakAgainst?: string;
  productionPerMin?: {
    gold?: number;
    crystals?: number;
    essence?: number;
  };
  storageBonus?: {
    gold: number;
    crystals: number;
    essence: number;
  };
}

export interface PlacedStructure {
  id: string;
  type: StructureType;
  gridX: number;
  gridY: number;
  level: number;
  assignedHeroId?: string;
  constructionState?: 'building' | 'upgrading';
  constructionStartedAt?: number;
  constructionEndsAt?: number;
  constructionDurationSec?: number;
}

export interface ProgressionStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  actionLabel: string;
  recommendedBuildType?: StructureType;
  recommendedTab?: AppTab;
  reward: PlayerResources;
}

export interface SavedLayout {
  slot: 1 | 2 | 3;
  name: string;
  updatedAt: number;
  structures: PlacedStructure[];
}

export interface PlayerResources {
  gold: number;
  crystals: number;
  essence: number;
}

export interface HeroProgress {
  heroId: string;
  level: number;
  skillLevel: number; // 0 while level < 5; 1..20 once unlocked at hero level 5
  selectedTalentId: string;
  equippedRelicId: string;
}

export interface BalanceConfig {
  defenseMitigationK: number;
  cannonVsTankMultiplier: number;
  iceSlowFactor: number;
  electricStunDurationSec: number;
  poisonDpsPctPerSec: number;
  burnDpsRatio: number;
  energyPerAttack: number;
  energyPerHitTaken: number;
  offlineCapHours: number;
  resourceProdMultiplier: number;
  heroDamageMultiplier: number;
  defenseDamageMultiplier: number;
}

export interface FortressState {
  fortressName: string;
  resources: PlayerResources;
  pendingProduction: PlayerResources;
  structures: PlacedStructure[];
  savedLayouts: SavedLayout[];
  activeLayoutSlot: 1 | 2 | 3;
  heroProgress: Record<string, HeroProgress>;
  attackSquadIds: string[];
  defenderHeroIds: string[];
  campaignStars: Record<string, number>;
  battlesWon: number;
  claimedStepIds: string[];
  lastTickTimestamp: number;
  balanceConfig: BalanceConfig;
}

export interface CampaignTarget {
  id: string;
  name: string;
  subtitle: string;
  difficulty: 'Treino' | 'Iniciante' | 'Tático' | 'Avançado' | 'Veterano' | 'Mestre';
  recommendedPower: number;
  tacticalHint: string;
  reward: PlayerResources;
  defenderHeroIds: string[];
  defenderLevel: number;
  structures: PlacedStructure[];
}

export type BattlePhase =
  | 'TARGET_SELECT'
  | 'PREP'
  | 'RUNNING'
  | 'PAUSED'
  | 'VICTORY'
  | 'DEFEAT';

export interface BattleHeroEntity {
  instanceId: string;
  heroId: string;
  team: 'attacker' | 'defender';
  heroLevel: number;
  skillLevel: number;
  x: number;
  y: number;
  homeX?: number;
  homeY?: number;
  guardRadius?: number;
  altarStructureId?: string;
  maxHp: number;
  hp: number;
  shield: number;
  attack: number;
  defense: number;
  moveSpeed: number;
  attackSpeed: number;
  range: number;
  splashRadius: number;
  energy: number;
  maxEnergy: number;
  attackCooldown: number;
  stealthTimer: number;
  slowTimer: number;
  poisonTimer: number;
  damageReductionTimer: number;
  attackSpeedBuffTimer: number;
  targetId: string | null;
  alive: boolean;
  facing: number;
  isMoving: boolean;
  attackAnim: number;
  ultAnim: number;
  hitFlash: number;
  animTime: number;
  stats: {
    damageDealt: number;
    damageTaken: number;
    healingDone: number;
    structuresDestroyed: number;
    ultimatesCast: number;
  };
}

export interface BattleStructureEntity {
  id: string;
  type: StructureType;
  gridX: number;
  gridY: number;
  level: number;
  assignedHeroId?: string;
  maxHp: number;
  hp: number;
  defense: number;
  range: number;
  damage: number;
  attackSpeed: number;
  splashRadius: number;
  attackCooldown: number;
  stunTimer: number;
  burnTimer: number;
  burnDps: number;
  triggered?: boolean; // for traps
  destroyed: boolean;
  destroyedAt?: number;
  recoil: number;
  hitFlash: number;
  shakeTime: number;
  aimAngle: number;
  countsForDestruction: boolean;
}

export interface BattleProjectile {
  id: string;
  fromX: number;
  fromY: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  targetId: string;
  targetKind: 'hero' | 'structure';
  speed: number;
  arcHeight: number;
  progress: number;
  totalDist: number;
  damage: number;
  color: string;
  style: 'arrow' | 'cannon' | 'arcane' | 'electric' | 'ice' | 'poison' | 'fire' | 'solar' | 'heal';
  splashRadius?: number;
  sourceHeroId?: string;
  sourceStructureType?: StructureType;
  onHitEffect?: 'burn' | 'slow' | 'stun' | 'poison';
}

export interface BattleParticle {
  id: string;
  x: number;
  y: number;
  z: number; // height above ground in pixels
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  size: number;
  color: string;
  alpha: number;
  age: number;
  duration: number;
  shape: 'stone' | 'wood' | 'smoke' | 'ember' | 'spark' | 'heal' | 'dust';
  rotation: number;
  vRot: number;
}

export interface BattleVfx {
  id: string;
  kind:
    | 'ring'
    | 'shockwave'
    | 'pillar'
    | 'ember_nova'
    | 'meteor'
    | 'lightning'
    | 'shield'
    | 'heal'
    | 'slash'
    | 'beam'
    | 'explosion'
    | 'muzzle';
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  radius: number;
  color: string;
  age: number;
  duration: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  duration: number;
  large?: boolean;
}

export interface BattleState {
  phase: BattlePhase;
  target: CampaignTarget | null;
  timeRemaining: number;
  maxTime: number;
  speedMultiplier: 1 | 2;
  destructionPct: number;
  coreDestroyed: boolean;
  starsEarned: number;
  deployedHeroIds: string[];
  pendingDeployHeroId: string | null;
  heroes: BattleHeroEntity[];
  structures: BattleStructureEntity[];
  projectiles: BattleProjectile[];
  particles: BattleParticle[];
  vfx: BattleVfx[];
  floatingTexts: FloatingText[];
  activeSynergies: SynergyDefinition[];
  rewardEarned: PlayerResources | null;
}

export type AppTab = 'fortress' | 'heroes' | 'battle' | 'gdd';
