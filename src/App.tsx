import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Coins,
  Gem,
  Music,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BattleView } from './components/BattleView';
import { FortressView } from './components/FortressView';
import { GddStudioView } from './components/GddStudioView';
import { HeroesView } from './components/HeroesView';
import {
  createInitialFortressState,
  CURRENT_ERA,
  GUIDED_PROGRESSION_STEPS,
  HEROES_CATALOG,
  MAX_HERO_LEVEL,
  SKILL_UNLOCK_LEVEL,
  STRUCTURES_CATALOG,
} from './data/gameCatalog';
import { soundEngine } from './engine/audio';
import { soundtrack } from './engine/soundtrack';
import {
  computeFortressEconomy,
  computeHeroUpgradeCost,
  computeSkillUpgradeCost,
  computeSpeedupCrystalCost,
  computeStructureBuildDurationSec,
  computeStructureUpgradeCost,
  computeStructureUpgradeDurationSec,
  getCoreLevel,
  getCoreProgression,
  getEffectiveSkillLevel,
  getMaxSkillLevelForHero,
  isStructureUnderConstruction,
} from './engine/math';
import {
  AppTab,
  BalanceConfig,
  FortressState,
  PlacedStructure,
  PlayerResources,
  StructureType,
} from './types/game';

const STORAGE_KEY = 'heroes_clash_stone_age_v4';

function finalizeCompletedConstructions(
  structures: PlacedStructure[],
  nowMs: number
): { structures: PlacedStructure[]; completedCount: number } {
  let completedCount = 0;
  const next = structures.map((s) => {
    if (s.constructionState && s.constructionEndsAt && s.constructionEndsAt <= nowMs) {
      completedCount += 1;
      const {
        constructionState,
        constructionStartedAt: _s,
        constructionEndsAt: _e,
        constructionDurationSec: _d,
        ...clean
      } = s;
      return {
        ...clean,
        level: constructionState === 'upgrading' ? clean.level + 1 : clean.level,
      };
    }
    return s;
  });
  return { structures: next, completedCount };
}

interface OfflineSummary {
  elapsedMinutes: number;
  cappedHours: number;
  earned: PlayerResources;
}

function sanitizeLoadedHeroes(parsed: FortressState): FortressState {
  const validIds = new Set(HEROES_CATALOG.map((h) => h.id));
  const cleanSquad = (parsed.attackSquadIds ?? []).filter((id) => validIds.has(id));
  const cleanDefenders = (parsed.defenderHeroIds ?? []).filter((id) => validIds.has(id));
  const cleanProgress = { ...(parsed.heroProgress ?? {}) };
  for (const h of HEROES_CATALOG) {
    const existing = cleanProgress[h.id];
    if (!existing) {
      cleanProgress[h.id] = {
        heroId: h.id,
        level: 1,
        skillLevel: 0,
        selectedTalentId: h.talents[0]?.id ?? '',
        equippedRelicId: h.relics[0]?.id ?? '',
      };
    } else {
      const clampedLevel = Math.max(1, Math.min(MAX_HERO_LEVEL, existing.level ?? 1));
      cleanProgress[h.id] = {
        ...existing,
        level: clampedLevel,
        skillLevel: getEffectiveSkillLevel({ ...existing, level: clampedLevel }),
      };
    }
  }

  const finishedStructures = finalizeCompletedConstructions(parsed.structures ?? [], Date.now()).structures;
  const altarHeroIds = finishedStructures
    .filter(
      (s) =>
        s.type === 'hero_altar' &&
        s.constructionState !== 'building' &&
        s.assignedHeroId &&
        validIds.has(s.assignedHeroId)
    )
    .map((s) => s.assignedHeroId!);

  return {
    ...parsed,
    structures: finishedStructures,
    heroProgress: cleanProgress,
    attackSquadIds: cleanSquad.length > 0 ? cleanSquad : ['aegor', 'sylva'],
    defenderHeroIds: Array.from(new Set(altarHeroIds)),
    claimedStepIds: Array.isArray(parsed.claimedStepIds) ? parsed.claimedStepIds : [],
  };
}

function loadSavedState(): { state: FortressState; offline: OfflineSummary | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { state: createInitialFortressState(), offline: null };
    }
    const parsedRaw = JSON.parse(raw) as FortressState;
    if (!parsedRaw || !Array.isArray(parsedRaw.structures) || !parsedRaw.resources) {
      return { state: createInitialFortressState(), offline: null };
    }
    const parsed = sanitizeLoadedHeroes(parsedRaw);

    const now = Date.now();
    const elapsedMs = Math.max(0, now - (parsed.lastTickTimestamp || now));
    const capMs = (parsed.balanceConfig?.offlineCapHours ?? 8) * 3600 * 1000;
    const effectiveMin = Math.min(elapsedMs, capMs) / 60000;

    if (effectiveMin >= 0.5) {
      const { productionPerMin, storageCap } = computeFortressEconomy(
        parsed.structures,
        parsed.balanceConfig
      );
      const earned: PlayerResources = {
        gold: Math.min(
          Math.max(0, storageCap.gold - parsed.resources.gold),
          Math.floor(productionPerMin.gold * effectiveMin)
        ),
        crystals: Math.min(
          Math.max(0, storageCap.crystals - parsed.resources.crystals),
          Math.floor(productionPerMin.crystals * effectiveMin)
        ),
        essence: Math.min(
          Math.max(0, storageCap.essence - parsed.resources.essence),
          Math.floor(productionPerMin.essence * effectiveMin)
        ),
      };

      const totalEarned = earned.gold + earned.crystals + earned.essence;
      parsed.lastTickTimestamp = now;
      if (totalEarned > 0) {
        return {
          state: parsed,
          offline: {
            elapsedMinutes: Math.round(effectiveMin),
            cappedHours: parsed.balanceConfig.offlineCapHours,
            earned,
          },
        };
      }
    }

    parsed.lastTickTimestamp = now;
    return { state: parsed, offline: null };
  } catch {
    return { state: createInitialFortressState(), offline: null };
  }
}

export default function App() {
  const initialLoad = useMemo(() => loadSavedState(), []);
  const [fortress, setFortress] = useState<FortressState>(initialLoad.state);
  const [offlineModal, setOfflineModal] = useState<OfflineSummary | null>(initialLoad.offline);
  const [activeTab, setActiveTab] = useState<AppTab>('fortress');
  const [muted, setMuted] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [trackTitle, setTrackTitle] = useState(() => soundtrack.getTrackTitle());

  useEffect(() => {
    soundtrack.armAutoStart();
    return soundtrack.subscribe(() => {
      setMusicOn(soundtrack.isMusicEnabled());
      setTrackTitle(soundtrack.getTrackTitle());
    });
  }, []);

  useEffect(() => {
    if (activeTab !== 'battle') {
      soundtrack.setMode('fortress');
    }
  }, [activeTab]);

  const economy = useMemo(
    () => computeFortressEconomy(fortress.structures, fortress.balanceConfig),
    [fortress.structures, fortress.balanceConfig]
  );

  // Persist to localStorage whenever fortress changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fortress));
    } catch {
      // Ignore quota errors
    }
  }, [fortress]);

  // Real-time idle resource accumulator + live build/upgrade completion (1-second tick)
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      let playFinishSfx = false;
      setFortress((prev) => {
        const finalized = finalizeCompletedConstructions(prev.structures, now);
        if (finalized.completedCount > 0) {
          playFinishSfx = true;
        }
        const nextStructures = finalized.completedCount > 0 ? finalized.structures : prev.structures;
        const nextDefenders =
          finalized.completedCount > 0
            ? Array.from(
                new Set(
                  nextStructures
                    .filter(
                      (s) =>
                        s.type === 'hero_altar' &&
                        s.constructionState !== 'building' &&
                        Boolean(s.assignedHeroId)
                    )
                    .map((s) => s.assignedHeroId!)
                )
              )
            : prev.defenderHeroIds;

        const { productionPerMin, storageCap } = computeFortressEconomy(
          nextStructures,
          prev.balanceConfig
        );
        const addGold = productionPerMin.gold / 60;
        const addCrystals = productionPerMin.crystals / 60;
        const addEssence = productionPerMin.essence / 60;

        return {
          ...prev,
          structures: nextStructures,
          defenderHeroIds: nextDefenders,
          lastTickTimestamp: now,
          pendingProduction: {
            gold: Math.min(storageCap.gold, prev.pendingProduction.gold + addGold),
            crystals: Math.min(storageCap.crystals, prev.pendingProduction.crystals + addCrystals),
            essence: Math.min(storageCap.essence, prev.pendingProduction.essence + addEssence),
          },
        };
      });
      if (playFinishSfx) {
        soundEngine.playUpgrade();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handleToggleMute = () => {
    const next = !muted;
    soundEngine.muted = next;
    soundtrack.setMuted(next);
    setMuted(next);
  };

  const handleToggleMusic = () => {
    if (muted) {
      soundEngine.muted = false;
      soundtrack.setMuted(false);
      setMuted(false);
      if (!soundtrack.isMusicEnabled()) {
        soundtrack.toggleMusic();
      }
      return;
    }
    soundtrack.toggleMusic();
  };

  const handleClaimOffline = () => {
    if (!offlineModal) return;
    soundEngine.playCollect();
    setFortress((prev) => {
      const { storageCap } = computeFortressEconomy(prev.structures, prev.balanceConfig);
      return {
        ...prev,
        resources: {
          gold: Math.min(storageCap.gold, prev.resources.gold + offlineModal.earned.gold),
          crystals: Math.min(
            storageCap.crystals,
            prev.resources.crystals + offlineModal.earned.crystals
          ),
          essence: Math.min(
            storageCap.essence,
            prev.resources.essence + offlineModal.earned.essence
          ),
        },
        lastTickTimestamp: Date.now(),
      };
    });
    setOfflineModal(null);
  };

  const handleSimulateOfflineJump = (hours: number) => {
    const { productionPerMin, storageCap } = computeFortressEconomy(
      fortress.structures,
      fortress.balanceConfig
    );
    const effectiveMin = Math.min(hours, fortress.balanceConfig.offlineCapHours) * 60;
    const earned: PlayerResources = {
      gold: Math.min(
        Math.max(0, storageCap.gold - fortress.resources.gold),
        Math.floor(productionPerMin.gold * effectiveMin)
      ),
      crystals: Math.min(
        Math.max(0, storageCap.crystals - fortress.resources.crystals),
        Math.floor(productionPerMin.crystals * effectiveMin)
      ),
      essence: Math.min(
        Math.max(0, storageCap.essence - fortress.resources.essence),
        Math.floor(productionPerMin.essence * effectiveMin)
      ),
    };
    setOfflineModal({
      elapsedMinutes: Math.round(effectiveMin),
      cappedHours: fortress.balanceConfig.offlineCapHours,
      earned,
    });
  };

  const handleCollectPending = useCallback(() => {
    setFortress((prev) => {
      const { storageCap } = computeFortressEconomy(prev.structures, prev.balanceConfig);
      const gainGold = Math.floor(prev.pendingProduction.gold);
      const gainCrystals = Math.floor(prev.pendingProduction.crystals);
      const gainEssence = Math.floor(prev.pendingProduction.essence);
      return {
        ...prev,
        resources: {
          gold: Math.min(storageCap.gold, prev.resources.gold + gainGold),
          crystals: Math.min(storageCap.crystals, prev.resources.crystals + gainCrystals),
          essence: Math.min(storageCap.essence, prev.resources.essence + gainEssence),
        },
        pendingProduction: {
          gold: prev.pendingProduction.gold - gainGold,
          crystals: prev.pendingProduction.crystals - gainCrystals,
          essence: prev.pendingProduction.essence - gainEssence,
        },
      };
    });
  }, []);

  const handlePlaceStructure = useCallback((type: StructureType, gx: number, gy: number) => {
    const entry = STRUCTURES_CATALOG[type];
    const buildSec = computeStructureBuildDurationSec(type);
    const now = Date.now();
    setFortress((prev) => {
      if (
        prev.resources.gold < entry.baseCost.gold ||
        prev.resources.crystals < entry.baseCost.crystals
      ) {
        return prev;
      }

      let assignedHeroId: string | undefined;
      if (type === 'hero_altar') {
        const usedHeroIds = new Set(
          prev.structures
            .filter((s) => s.type === 'hero_altar' && s.assignedHeroId)
            .map((s) => s.assignedHeroId!)
        );
        assignedHeroId =
          HEROES_CATALOG.find((h) => h.playableInPhase1 && !usedHeroIds.has(h.id))?.id ??
          HEROES_CATALOG[0]?.id;
      }

      const newStruct: PlacedStructure = {
        id: `s_${now}_${Math.floor(Math.random() * 1000)}`,
        type,
        gridX: gx,
        gridY: gy,
        level: 1,
        ...(assignedHeroId ? { assignedHeroId } : {}),
        ...(buildSec > 0
          ? {
              constructionState: 'building' as const,
              constructionStartedAt: now,
              constructionEndsAt: now + buildSec * 1000,
              constructionDurationSec: buildSec,
            }
          : {}),
      };
      const nextStructures = [...prev.structures, newStruct];
      const nextDefenders =
        assignedHeroId && buildSec <= 0
          ? Array.from(new Set([...prev.defenderHeroIds, assignedHeroId]))
          : prev.defenderHeroIds;

      return {
        ...prev,
        resources: {
          ...prev.resources,
          gold: prev.resources.gold - entry.baseCost.gold,
          crystals: prev.resources.crystals - entry.baseCost.crystals,
        },
        structures: nextStructures,
        defenderHeroIds: nextDefenders,
      };
    });
  }, []);

  const handleMoveStructure = useCallback((structureId: string, gx: number, gy: number) => {
    setFortress((prev) => ({
      ...prev,
      structures: prev.structures.map((s) =>
        s.id === structureId ? { ...s, gridX: gx, gridY: gy } : s
      ),
    }));
  }, []);

  const handleUpgradeStructure = useCallback((structureId: string) => {
    const now = Date.now();
    setFortress((prev) => {
      const target = prev.structures.find((s) => s.id === structureId);
      if (!target || isStructureUnderConstruction(target, now)) return prev;
      const cost = computeStructureUpgradeCost(target.type, target.level);
      if (prev.resources.gold < cost.gold || prev.resources.crystals < cost.crystals) {
        return prev;
      }
      const upgradeSec = computeStructureUpgradeDurationSec(target.type, target.level);
      return {
        ...prev,
        resources: {
          ...prev.resources,
          gold: prev.resources.gold - cost.gold,
          crystals: prev.resources.crystals - cost.crystals,
        },
        structures: prev.structures.map((s) =>
          s.id === structureId
            ? {
                ...s,
                constructionState: 'upgrading' as const,
                constructionStartedAt: now,
                constructionEndsAt: now + upgradeSec * 1000,
                constructionDurationSec: upgradeSec,
              }
            : s
        ),
      };
    });
  }, []);

  const handleSpeedupStructure = useCallback((structureId: string) => {
    const now = Date.now();
    let succeeded = false;
    setFortress((prev) => {
      const target = prev.structures.find((s) => s.id === structureId);
      if (!target || !isStructureUnderConstruction(target, now)) return prev;
      const remainingSec = Math.max(0, ((target.constructionEndsAt ?? now) - now) / 1000);
      const crystalCost = computeSpeedupCrystalCost(remainingSec);
      if (prev.resources.crystals < crystalCost) return prev;
      succeeded = true;

      const nextStructures = prev.structures.map((s) => {
        if (s.id !== structureId) return s;
        const {
          constructionState,
          constructionStartedAt: _s,
          constructionEndsAt: _e,
          constructionDurationSec: _d,
          ...clean
        } = s;
        return {
          ...clean,
          level: constructionState === 'upgrading' ? clean.level + 1 : clean.level,
        };
      });
      const nextDefenders = Array.from(
        new Set(
          nextStructures
            .filter(
              (s) =>
                s.type === 'hero_altar' &&
                s.constructionState !== 'building' &&
                Boolean(s.assignedHeroId)
            )
            .map((s) => s.assignedHeroId!)
        )
      );

      return {
        ...prev,
        resources: {
          ...prev.resources,
          crystals: prev.resources.crystals - crystalCost,
        },
        structures: nextStructures,
        defenderHeroIds: nextDefenders,
      };
    });
    if (succeeded) {
      soundEngine.playUpgrade();
    }
  }, []);

  const handleClaimStep = useCallback((stepId: string) => {
    const step = GUIDED_PROGRESSION_STEPS.find((st) => st.id === stepId);
    if (!step) return;
    soundEngine.playCollect();
    setFortress((prev) => {
      if (prev.claimedStepIds.includes(stepId)) return prev;
      return {
        ...prev,
        resources: {
          gold: prev.resources.gold + step.reward.gold,
          crystals: prev.resources.crystals + step.reward.crystals,
          essence: prev.resources.essence + step.reward.essence,
        },
        claimedStepIds: [...prev.claimedStepIds, stepId],
      };
    });
  }, []);

  const handleRemoveStructure = useCallback((structureId: string) => {
    setFortress((prev) => {
      const target = prev.structures.find((s) => s.id === structureId);
      if (!target || target.type === 'core') return prev;
      const refundGold = Math.round(STRUCTURES_CATALOG[target.type].baseCost.gold * 0.5);
      const { storageCap } = computeFortressEconomy(prev.structures, prev.balanceConfig);
      const nextStructures = prev.structures.filter((s) => s.id !== structureId);
      const nextDefenders =
        target.type === 'hero_altar'
          ? Array.from(
              new Set(
                nextStructures
                  .filter((s) => s.type === 'hero_altar' && s.assignedHeroId)
                  .map((s) => s.assignedHeroId!)
              )
            )
          : prev.defenderHeroIds;
      return {
        ...prev,
        resources: {
          ...prev.resources,
          gold: Math.min(storageCap.gold, prev.resources.gold + refundGold),
        },
        structures: nextStructures,
        defenderHeroIds: nextDefenders,
      };
    });
  }, []);

  const handleAssignAltarHero = useCallback((structureId: string, heroId: string) => {
    setFortress((prev) => {
      const target = prev.structures.find((s) => s.id === structureId && s.type === 'hero_altar');
      if (!target) return prev;
      const previousHeroOnTarget = target.assignedHeroId;
      const nextStructures = prev.structures.map((s) => {
        if (s.id === structureId) {
          return { ...s, assignedHeroId: heroId };
        }
        if (s.type === 'hero_altar' && s.assignedHeroId === heroId) {
          return { ...s, assignedHeroId: previousHeroOnTarget };
        }
        return s;
      });
      const nextDefenders = Array.from(
        new Set(
          nextStructures
            .filter((s) => s.type === 'hero_altar' && s.assignedHeroId)
            .map((s) => s.assignedHeroId!)
        )
      );
      return {
        ...prev,
        structures: nextStructures,
        defenderHeroIds: nextDefenders,
      };
    });
  }, []);

  const handleSaveLayout = useCallback((slot: 1 | 2 | 3) => {
    setFortress((prev) => ({
      ...prev,
      activeLayoutSlot: slot,
      savedLayouts: prev.savedLayouts.map((l) =>
        l.slot === slot
          ? {
              ...l,
              updatedAt: Date.now(),
              structures: prev.structures.map((s) => ({ ...s })),
            }
          : l
      ),
    }));
  }, []);

  const handleLoadLayout = useCallback((slot: 1 | 2 | 3) => {
    setFortress((prev) => {
      const found = prev.savedLayouts.find((l) => l.slot === slot);
      if (!found) return prev;
      return {
        ...prev,
        activeLayoutSlot: slot,
        structures: found.structures.map((s) => ({ ...s })),
      };
    });
  }, []);

  const handleUpgradeHero = useCallback((heroId: string) => {
    setFortress((prev) => {
      const prog = prev.heroProgress[heroId];
      if (!prog) return prev;
      if (prog.level >= MAX_HERO_LEVEL) return prev;
      const cost = computeHeroUpgradeCost(prog.level);
      if (prev.resources.essence < cost.essence || prev.resources.gold < cost.gold) {
        return prev;
      }
      const nextLevel = prog.level + 1;
      const currentSkill = prog.skillLevel ?? 0;
      const nextSkillLevel =
        nextLevel >= SKILL_UNLOCK_LEVEL && currentSkill === 0 ? 1 : currentSkill;
      return {
        ...prev,
        resources: {
          ...prev.resources,
          essence: prev.resources.essence - cost.essence,
          gold: prev.resources.gold - cost.gold,
        },
        heroProgress: {
          ...prev.heroProgress,
          [heroId]: { ...prog, level: nextLevel, skillLevel: nextSkillLevel },
        },
      };
    });
  }, []);

  const handleUpgradeHeroSkill = useCallback((heroId: string) => {
    setFortress((prev) => {
      const prog = prev.heroProgress[heroId];
      if (!prog || prog.level < SKILL_UNLOCK_LEVEL) return prev;
      const currentSkill = getEffectiveSkillLevel(prog);
      const maxSkill = getMaxSkillLevelForHero(prog.level);
      if (currentSkill >= maxSkill) return prev;
      const cost = computeSkillUpgradeCost(currentSkill);
      if (prev.resources.essence < cost.essence || prev.resources.crystals < cost.crystals) {
        return prev;
      }
      return {
        ...prev,
        resources: {
          ...prev.resources,
          essence: prev.resources.essence - cost.essence,
          crystals: prev.resources.crystals - cost.crystals,
        },
        heroProgress: {
          ...prev.heroProgress,
          [heroId]: { ...prog, skillLevel: currentSkill + 1 },
        },
      };
    });
  }, []);

  const handleSelectTalent = useCallback((heroId: string, talentId: string) => {
    setFortress((prev) => {
      const prog = prev.heroProgress[heroId];
      if (!prog) return prev;
      return {
        ...prev,
        heroProgress: {
          ...prev.heroProgress,
          [heroId]: { ...prog, selectedTalentId: talentId },
        },
      };
    });
  }, []);

  const handleEquipRelic = useCallback((heroId: string, relicId: string) => {
    setFortress((prev) => {
      const prog = prev.heroProgress[heroId];
      if (!prog) return prev;
      return {
        ...prev,
        heroProgress: {
          ...prev.heroProgress,
          [heroId]: { ...prog, equippedRelicId: relicId },
        },
      };
    });
  }, []);

  const handleToggleSquadHero = useCallback((heroId: string) => {
    setFortress((prev) => {
      const exists = prev.attackSquadIds.includes(heroId);
      if (exists) {
        if (prev.attackSquadIds.length <= 1) return prev; // Keep at least 1 hero
        return {
          ...prev,
          attackSquadIds: prev.attackSquadIds.filter((id) => id !== heroId),
        };
      }
      const coreProg = getCoreProgression(getCoreLevel(prev.structures));
      if (prev.attackSquadIds.length >= coreProg.heroSlots) {
        // Replace oldest hero if full so user never gets stuck
        return {
          ...prev,
          attackSquadIds: [...prev.attackSquadIds.slice(1), heroId],
        };
      }
      return {
        ...prev,
        attackSquadIds: [...prev.attackSquadIds, heroId],
      };
    });
  }, []);

  const handleToggleDefenderHero = useCallback((heroId: string) => {
    setFortress((prev) => {
      const exists = prev.defenderHeroIds.includes(heroId);
      if (exists) {
        return {
          ...prev,
          defenderHeroIds: prev.defenderHeroIds.filter((id) => id !== heroId),
        };
      }
      const coreProg = getCoreProgression(getCoreLevel(prev.structures));
      if (prev.defenderHeroIds.length >= coreProg.defenderSlots) {
        return {
          ...prev,
          defenderHeroIds: [...prev.defenderHeroIds.slice(1), heroId],
        };
      }
      return {
        ...prev,
        defenderHeroIds: [...prev.defenderHeroIds, heroId],
      };
    });
  }, []);

  const handleBattleComplete = useCallback(
    (targetId: string, stars: number, reward: PlayerResources) => {
      if (targetId === 'my_fortress_defense') return;
      setFortress((prev) => {
        const { storageCap } = computeFortressEconomy(prev.structures, prev.balanceConfig);
        const prevBest = prev.campaignStars[targetId] ?? 0;
        return {
          ...prev,
          resources: {
            gold: Math.min(storageCap.gold, prev.resources.gold + reward.gold),
            crystals: Math.min(storageCap.crystals, prev.resources.crystals + reward.crystals),
            essence: Math.min(storageCap.essence, prev.resources.essence + reward.essence),
          },
          campaignStars: {
            ...prev.campaignStars,
            [targetId]: Math.max(prevBest, stars),
          },
          battlesWon: stars >= 1 ? prev.battlesWon + 1 : prev.battlesWon,
        };
      });
    },
    []
  );

  const handleUpdateBalance = useCallback((next: BalanceConfig) => {
    setFortress((prev) => ({ ...prev, balanceConfig: next }));
  }, []);

  const handleResetSave = () => {
    const fresh = createInitialFortressState();
    setFortress(fresh);
    localStorage.removeItem(STORAGE_KEY);
    setActiveTab('fortress');
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#151A22] text-[#F5EFE2]">
      {/* Strict 3-Zone Top Bar */}
      <header className="h-14 shrink-0 px-4 md:px-6 bg-[#151A22] border-b border-[#E5A93C]/20 flex items-center justify-between gap-4 z-20">
        {/* Zone 1: Single-line Brand Wordmark + Active Era */}
        <button
          onClick={() => setActiveTab('fortress')}
          className="flex items-baseline gap-2.5 text-left whitespace-nowrap shrink-0 group"
        >
          <span className="font-display text-base md:text-lg font-bold tracking-wider text-[#FFF8E7] group-hover:text-[#F4C462] transition-colors">
            Heroes Clash
          </span>
          <span className="hidden sm:inline text-xs font-medium text-[#D6B67C]/90">
            · {CURRENT_ERA.code}: {CURRENT_ERA.name}
          </span>
        </button>

        {/* Zone 2: 4 Clean Single-Line Navigation Links */}
        <nav className="flex items-center gap-4 md:gap-7 text-xs md:text-sm font-medium overflow-x-auto">
          {(
            [
              { id: 'fortress', label: 'Fortaleza' },
              { id: 'heroes', label: 'Heróis' },
              { id: 'battle', label: 'Batalha' },
              { id: 'gdd', label: 'GDD' },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  active
                    ? 'text-[#F4C462] border-[#E5A93C] font-semibold'
                    : 'text-slate-300 border-transparent hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Resource Readout + Audio / Reset Utility */}
        <div className="flex items-center gap-3 md:gap-4 shrink-0">
          <div className="hidden sm:flex items-center gap-3.5 font-mono text-xs tabular-nums">
            <span
              className="flex items-center gap-1.5 text-[#F4C462]"
              title={`Ouro: ${fortress.resources.gold} / ${economy.storageCap.gold}`}
            >
              <Coins className="w-3.5 h-3.5" />
              <span>{fortress.resources.gold}</span>
            </span>
            <span
              className="flex items-center gap-1.5 text-[#38BDF8]"
              title={`Cristais: ${fortress.resources.crystals} / ${economy.storageCap.crystals}`}
            >
              <Gem className="w-3.5 h-3.5" />
              <span>{fortress.resources.crystals}</span>
            </span>
            <span
              className="flex items-center gap-1.5 text-[#4ADE80]"
              title={`Essência: ${fortress.resources.essence} / ${economy.storageCap.essence}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{fortress.resources.essence}</span>
            </span>
          </div>

          <button
            onClick={handleToggleMusic}
            className={`p-2 rounded-lg transition-colors ${
              musicOn && !muted
                ? 'text-[#F4C462] hover:bg-white/10'
                : 'text-slate-500 hover:text-slate-300 hover:bg-white/10'
            }`}
            title={
              musicOn && !muted
                ? `Música ativa: ${trackTitle} (clique para pausar)`
                : 'Ativar trilha sonora original'
            }
            aria-label={musicOn && !muted ? 'Pausar música' : 'Ativar música'}
          >
            <Music className="w-4 h-4" />
          </button>

          <button
            onClick={handleToggleMute}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            title={muted ? 'Ativar som' : 'Silenciar som'}
            aria-label={muted ? 'Ativar som' : 'Silenciar som'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={handleResetSave}
            className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
            title="Reiniciar progresso local da Fase 1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Resetar</span>
          </button>
        </div>
      </header>

      {/* Main Viewport Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'fortress' && (
          <FortressView
            fortress={fortress}
            onPlaceStructure={handlePlaceStructure}
            onMoveStructure={handleMoveStructure}
            onUpgradeStructure={handleUpgradeStructure}
            onSpeedupStructure={handleSpeedupStructure}
            onRemoveStructure={handleRemoveStructure}
            onAssignAltarHero={handleAssignAltarHero}
            onCollectPending={handleCollectPending}
            onClaimStep={handleClaimStep}
            onSaveLayout={handleSaveLayout}
            onLoadLayout={handleLoadLayout}
            onGoToBattle={() => setActiveTab('battle')}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === 'heroes' && (
          <HeroesView
            fortress={fortress}
            onUpgradeHero={handleUpgradeHero}
            onUpgradeHeroSkill={handleUpgradeHeroSkill}
            onSelectTalent={handleSelectTalent}
            onEquipRelic={handleEquipRelic}
            onToggleSquadHero={handleToggleSquadHero}
            onToggleDefenderHero={handleToggleDefenderHero}
          />
        )}

        {activeTab === 'battle' && (
          <BattleView
            fortress={fortress}
            onBattleComplete={handleBattleComplete}
            onReturnToFortress={() => setActiveTab('fortress')}
          />
        )}

        {activeTab === 'gdd' && (
          <GddStudioView
            balanceConfig={fortress.balanceConfig}
            onUpdateBalance={handleUpdateBalance}
            onSimulateOfflineJump={handleSimulateOfflineJump}
          />
        )}
      </div>

      {/* Offline Return Production Modal */}
      {offlineModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-[#1F2631] border border-[#E5A93C]/50 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#E5A93C]/15 flex items-center justify-center text-[#F4C462]">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-[#FFF8E7]">
                  Produção Offline Acumulada
                </h2>
                <p className="text-xs text-slate-400">
                  Tempo contabilizado: {offlineModal.elapsedMinutes} min (teto de{' '}
                  {offlineModal.cappedHours}h).
                </p>
              </div>
            </div>

            <div className="bg-[#151A22] border border-white/10 rounded-xl p-4 flex items-center justify-around font-mono text-sm tabular-nums">
              <div className="flex items-center gap-1.5 text-[#F4C462]">
                <Coins className="w-4 h-4" />
                <span>+{offlineModal.earned.gold}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#38BDF8]">
                <Gem className="w-4 h-4" />
                <span>+{offlineModal.earned.crystals}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[#4ADE80]">
                <Sparkles className="w-4 h-4" />
                <span>+{offlineModal.earned.essence}</span>
              </div>
            </div>

            <button
              onClick={handleClaimOffline}
              className="w-full py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F4C462] text-[#151A22] font-bold text-sm transition-colors"
            >
              Coletar Recursos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
