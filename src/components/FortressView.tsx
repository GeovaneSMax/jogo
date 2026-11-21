import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpCircle,
  BookmarkCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  Coins,
  Gem,
  Hammer,
  Maximize2,
  Move,
  Shield,
  Sparkles,
  Trash2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CURRENT_ERA,
  DEPLOY_MARGIN,
  GRID_SIZE,
  GUIDED_PROGRESSION_STEPS,
  HERO_ALTAR_PATROL_RADIUS,
  HEROES_CATALOG,
  PROGRESSION_TABLE,
  STRUCTURES_CATALOG,
} from '../data/gameCatalog';
import { soundEngine } from '../engine/audio';
import {
  computeIsoViewport,
  drawBattleHero,
  drawIsoStructure,
  drawSunlitArena,
  IsoViewport,
  screenToGrid,
} from '../engine/isoRenderer';
import {
  computeFortressEconomy,
  computeSpeedupCrystalCost,
  computeStructureBuildDurationSec,
  computeStructureStats,
  computeStructureUpgradeCost,
  computeStructureUpgradeDurationSec,
  evaluateGuidedStepProgress,
  formatDurationSec,
  getCoreLevel,
  getCoreProgression,
  getEffectiveSkillLevel,
  getHeroById,
  isStructureUnderConstruction,
} from '../engine/math';
import {
  getBuildingSprite,
  getBuildingVisualTier,
  subscribeSpritesLoaded,
} from '../engine/spriteLoader';
import { useGameCamera } from '../hooks/useGameCamera';
import {
  AppTab,
  BattleHeroEntity,
  FortressState,
  PlacedStructure,
  StructureType,
} from '../types/game';

function BuildingSpriteThumb({
  type,
  level = 1,
  size = 44,
}: {
  type: StructureType;
  level?: number;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribeSpritesLoaded(() => setTick((t) => t + 1));
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;

    const sprite = getBuildingSprite(type, level);
    if (sprite) {
      const pad = 2;
      const maxDim = size - pad * 2;
      const scale = Math.min(maxDim / sprite.width, maxDim / sprite.height);
      const dw = sprite.width * scale;
      const dh = sprite.height * scale;
      ctx.drawImage(sprite.canvas, (size - dw) * 0.5, (size - dh) * 0.5, dw, dh);
    } else {
      const entry = STRUCTURES_CATALOG[type];
      ctx.fillStyle = entry.color;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.5, size * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [type, level, size, tick]);

  return (
    <canvas
      ref={ref}
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
      className="shrink-0 rounded-md bg-[#12161E] border border-white/10"
    />
  );
}

interface FortressViewProps {
  fortress: FortressState;
  onPlaceStructure: (type: StructureType, gx: number, gy: number) => void;
  onMoveStructure: (structureId: string, gx: number, gy: number) => void;
  onUpgradeStructure: (structureId: string) => void;
  onSpeedupStructure: (structureId: string) => void;
  onRemoveStructure: (structureId: string) => void;
  onAssignAltarHero: (structureId: string, heroId: string) => void;
  onCollectPending: () => void;
  onClaimStep: (stepId: string) => void;
  onSaveLayout: (slot: 1 | 2 | 3) => void;
  onLoadLayout: (slot: 1 | 2 | 3) => void;
  onGoToBattle: () => void;
  onNavigateTab: (tab: AppTab) => void;
}

const BUILD_GROUPS: Array<{
  key: 'defense' | 'economy' | 'utility';
  label: string;
  types: StructureType[];
}> = [
  {
    key: 'defense',
    label: 'Defesas (6)',
    types: [
      'cannon',
      'archer_tower',
      'arcane_tower',
      'electric_tower',
      'ice_tower',
      'poison_tower',
    ],
  },
  {
    key: 'economy',
    label: 'Economia',
    types: ['gold_mine', 'crystal_mine', 'essence_well', 'storage'],
  },
  {
    key: 'utility',
    label: 'Altares e Muralhas',
    types: ['hero_altar', 'wall', 'trap'],
  },
];

export function FortressView({
  fortress,
  onPlaceStructure,
  onMoveStructure,
  onUpgradeStructure,
  onSpeedupStructure,
  onRemoveStructure,
  onAssignAltarHero,
  onCollectPending,
  onClaimStep,
  onSaveLayout,
  onLoadLayout,
  onGoToBattle,
  onNavigateTab,
}: FortressViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const vpRef = useRef<IsoViewport>(computeIsoViewport(1200, 700));
  const {
    camera,
    cameraRef,
    zoomPercent,
    zoomIn,
    zoomOut,
    resetCamera,
    suppressNextClickRef,
  } = useGameCamera(containerRef, true);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [buildDrawerOpen, setBuildDrawerOpen] = useState(false);
  const [buildGroup, setBuildGroup] = useState<'defense' | 'economy' | 'utility'>('defense');
  const [placingType, setPlacingType] = useState<StructureType | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<{ gx: number; gy: number } | null>(null);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const activeConstructionsCount = useMemo(
    () => fortress.structures.filter((s) => isStructureUnderConstruction(s, nowMs)).length,
    [fortress.structures, nowMs]
  );

  // Smooth 500ms UI countdown clock while any building/upgrade is active
  useEffect(() => {
    if (!fortress.structures.some((s) => Boolean(s.constructionState))) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [fortress.structures]);

  const coreLevel = useMemo(() => getCoreLevel(fortress.structures), [fortress.structures]);
  const coreProg = useMemo(() => getCoreProgression(coreLevel), [coreLevel]);
  const economy = useMemo(
    () => computeFortressEconomy(fortress.structures, fortress.balanceConfig),
    [fortress.structures, fortress.balanceConfig]
  );

  const selectedStructure = useMemo(
    () => fortress.structures.find((s) => s.id === selectedId) ?? null,
    [fortress.structures, selectedId]
  );

  const activeGuidedStep = useMemo(() => {
    return (
      GUIDED_PROGRESSION_STEPS.find((st) => !fortress.claimedStepIds.includes(st.id)) ?? null
    );
  }, [fortress.claimedStepIds]);

  const activeGuidedProgress = useMemo(() => {
    if (!activeGuidedStep) return null;
    return evaluateGuidedStepProgress(activeGuidedStep.id, fortress);
  }, [activeGuidedStep, fortress]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => setToastMsg((prev) => (prev === msg ? null : prev)), 2600);
  };

  const isCellOccupied = (gx: number, gy: number, ignoreId?: string | null) =>
    fortress.structures.some((s) => s.id !== ignoreId && s.gridX === gx && s.gridY === gy);

  const isValidPlacementCell = (gx: number, gy: number, ignoreId?: string | null) => {
    // Keep wide outer meadow margin open for attacking heroes entry
    if (
      gx < DEPLOY_MARGIN ||
      gy < DEPLOY_MARGIN ||
      gx >= GRID_SIZE - DEPLOY_MARGIN ||
      gy >= GRID_SIZE - DEPLOY_MARGIN
    ) {
      return false;
    }
    return !isCellOccupied(gx, gy, ignoreId);
  };

  const countByType = (type: StructureType) =>
    fortress.structures.filter((s) => s.type === type).length;

  const activeDefenseCount = useMemo(
    () =>
      fortress.structures.filter((s) => STRUCTURES_CATALOG[s.type].category === 'defense').length,
    [fortress.structures]
  );

  const totalPending =
    Math.floor(fortress.pendingProduction.gold) +
    Math.floor(fortress.pendingProduction.crystals) +
    Math.floor(fortress.pendingProduction.essence);

  // Canvas animation loop
  useEffect(() => {
    let rafId = 0;
    const render = (now: number) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = container.getBoundingClientRect();
        const w = Math.max(320, Math.floor(rect.width));
        const h = Math.max(300, Math.floor(rect.height));
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
          canvas.width = w * dpr;
          canvas.height = h * dpr;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const vp = computeIsoViewport(w, h, cameraRef.current);
          vpRef.current = vp;
          const timeSec = now / 1000;

          const activeTypeForPreview =
            placingType ??
            (movingId ? fortress.structures.find((s) => s.id === movingId)?.type ?? null : null);

          const canPlaceHere =
            hoverCell && activeTypeForPreview
              ? isValidPlacementCell(hoverCell.gx, hoverCell.gy, movingId)
              : false;

          let rangeOverlay: { gx: number; gy: number; range: number; color: string } | null = null;
          if (selectedStructure) {
            const entry = STRUCTURES_CATALOG[selectedStructure.type];
            if (entry.range > 0) {
              rangeOverlay = {
                gx: selectedStructure.gridX,
                gy: selectedStructure.gridY,
                range: entry.range,
                color: entry.color,
              };
            }
          } else if (hoverCell && activeTypeForPreview) {
            const entry = STRUCTURES_CATALOG[activeTypeForPreview];
            if (entry.range > 0) {
              rangeOverlay = {
                gx: hoverCell.gx,
                gy: hoverCell.gy,
                range: entry.range,
                color: entry.color,
              };
            }
          }

          drawSunlitArena(ctx, vp, {
            showGridGuides: Boolean(placingType || movingId),
            hoverCell,
            placingType: activeTypeForPreview,
            canPlace: canPlaceHere,
            selectedCell: selectedStructure
              ? { gx: selectedStructure.gridX, gy: selectedStructure.gridY }
              : null,
            rangeOverlay,
            timeSec,
          });

          // Combine structures + patrolling squad/defender heroes for true isometric depth sorting
          type DrawItem = { depth: number; draw: () => void };
          const drawItems: DrawItem[] = [];

          const frameNowMs = Date.now();
          for (const s of fortress.structures) {
            if (s.id === movingId) continue;
            let collectLabel: string | undefined;
            if (s.constructionState !== 'building') {
              if (s.type === 'gold_mine' && fortress.pendingProduction.gold >= 10) {
                collectLabel = `+${Math.floor(fortress.pendingProduction.gold)} O`;
              } else if (s.type === 'crystal_mine' && fortress.pendingProduction.crystals >= 5) {
                collectLabel = `+${Math.floor(fortress.pendingProduction.crystals)} C`;
              } else if (s.type === 'essence_well' && fortress.pendingProduction.essence >= 5) {
                collectLabel = `+${Math.floor(fortress.pendingProduction.essence)} E`;
              }
            }
            const isSelected = s.id === selectedId;
            const isHovered = Boolean(
              hoverCell && hoverCell.gx === s.gridX && hoverCell.gy === s.gridY
            );
            drawItems.push({
              depth: s.gridX + s.gridY + 0.4,
              draw: () =>
                drawIsoStructure(ctx, s, vp, {
                  timeSec,
                  nowMs: frameNowMs,
                  isSelected,
                  isHovered,
                  hasCollectible: Boolean(collectLabel),
                  collectLabel,
                }),
            });
          }

          // Tether every hero strictly to a tight patrol circle around their completed Hero Altar
          const heroAltars = fortress.structures.filter(
            (s) =>
              s.type === 'hero_altar' &&
              s.id !== movingId &&
              s.constructionState !== 'building' &&
              Boolean(s.assignedHeroId)
          );

          heroAltars.forEach((altar, idx) => {
            const heroId = altar.assignedHeroId!;
            const prog = fortress.heroProgress[heroId];
            const heroLevel = prog?.level ?? 1;
            const skillLevel = getEffectiveSkillLevel(prog);
            const homeX = altar.gridX + 0.5;
            const homeY = altar.gridY + 0.5;
            const angle = timeSec * (0.82 + idx * 0.08) + idx * Math.PI * 0.9;
            const hx = homeX + Math.cos(angle) * HERO_ALTAR_PATROL_RADIUS;
            const hy = homeY + Math.sin(angle) * HERO_ALTAR_PATROL_RADIUS;
            const vx = -Math.sin(angle);
            const vy = Math.cos(angle);
            const patrolEntity: BattleHeroEntity = {
              instanceId: `patrol_${altar.id}_${heroId}`,
              heroId,
              heroLevel,
              skillLevel,
              team: 'attacker',
              x: hx,
              y: hy,
              homeX,
              homeY,
              altarStructureId: altar.id,
              maxHp: 100,
              hp: 100,
              shield: 0,
              attack: 0,
              defense: 0,
              moveSpeed: 1.4,
              attackSpeed: 1,
              range: 1,
              splashRadius: 0,
              energy: 0,
              maxEnergy: 100,
              attackCooldown: 0,
              stealthTimer: 0,
              slowTimer: 0,
              poisonTimer: 0,
              damageReductionTimer: 0,
              attackSpeedBuffTimer: 0,
              targetId: null,
              alive: true,
              facing: vx - vy >= 0 ? 1 : -1,
              isMoving: true,
              attackAnim: 0,
              ultAnim: 0,
              hitFlash: 0,
              animTime: timeSec,
              stats: {
                damageDealt: 0,
                damageTaken: 0,
                healingDone: 0,
                structuresDestroyed: 0,
                ultimatesCast: 0,
              },
            };
            drawItems.push({
              depth: hx + hy,
              draw: () => drawBattleHero(ctx, patrolEntity, vp, timeSec),
            });
          });

          drawItems.sort((a, b) => a.depth - b.depth);
          for (const item of drawItems) item.draw();

          // Draw ghost preview when placing or moving
          if (hoverCell && activeTypeForPreview) {
            const ghost: PlacedStructure = {
              id: 'ghost',
              type: activeTypeForPreview,
              gridX: hoverCell.gx,
              gridY: hoverCell.gy,
              level: 1,
            };
            drawIsoStructure(ctx, ghost, vp, { timeSec, isGhost: true });
          }
        }
      }
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [fortress, hoverCell, placingType, movingId, selectedStructure]);

  const getPointerGridCell = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { gx, gy } = screenToGrid(sx, sy, vpRef.current);
    if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) return null;
    return { gx, gy };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (suppressNextClickRef.current) return;
    const cell = getPointerGridCell(e);
    if (!cell) {
      setSelectedId(null);
      return;
    }

    if (placingType) {
      if (!isValidPlacementCell(cell.gx, cell.gy)) {
        showToast('Posição inválida: construa dentro do pátio central e evite sobreposição.');
        return;
      }
      onPlaceStructure(placingType, cell.gx, cell.gy);
      soundEngine.playBuild();
      if (placingType !== 'wall') {
        setPlacingType(null);
      }
      return;
    }

    if (movingId) {
      if (!isValidPlacementCell(cell.gx, cell.gy, movingId)) {
        showToast('Escolha um bloco interno desocupado para mover a estrutura.');
        return;
      }
      onMoveStructure(movingId, cell.gx, cell.gy);
      soundEngine.playBuild();
      setMovingId(null);
      return;
    }

    const clicked = fortress.structures.find(
      (s) => s.gridX === cell.gx && s.gridY === cell.gy
    );
    if (clicked) {
      // Quick collect if clicking an economic producer with accumulated resources
      if (
        (clicked.type === 'gold_mine' && fortress.pendingProduction.gold >= 10) ||
        (clicked.type === 'crystal_mine' && fortress.pendingProduction.crystals >= 5) ||
        (clicked.type === 'essence_well' && fortress.pendingProduction.essence >= 5)
      ) {
        onCollectPending();
        soundEngine.playCollect();
      }
      setSelectedId(clicked.id);
      setBuildDrawerOpen(false);
    } else {
      setSelectedId(null);
    }
  };

  const handleStartBuild = (type: StructureType) => {
    const entry = STRUCTURES_CATALOG[type];
    const currentCount = countByType(type);
    const isDefense = entry.category === 'defense';
    if (isDefense && activeDefenseCount >= coreProg.maxActiveDefenses) {
      showToast(`Limite de ${coreProg.maxActiveDefenses} defesas ativas no Núcleo Nv.${coreLevel}. Evolua o Núcleo.`);
      return;
    }
    const maxAllowedForType =
      type === 'hero_altar' ? entry.maxCountBase : entry.maxCountBase + (coreLevel >= 4 ? 1 : 0);
    if (currentCount >= maxAllowedForType) {
      showToast(`Você já atingiu o limite de ${entry.name} para o nível atual.`);
      return;
    }
    if (
      fortress.resources.gold < entry.baseCost.gold ||
      fortress.resources.crystals < entry.baseCost.crystals
    ) {
      showToast('Recursos insuficientes para construir esta estrutura.');
      return;
    }
    setMovingId(null);
    setSelectedId(null);
    setPlacingType(type);
    setBuildDrawerOpen(false);
  };

  const handleGuidedStepAction = () => {
    if (!activeGuidedStep) return;
    if (activeGuidedProgress?.completed) {
      onClaimStep(activeGuidedStep.id);
      showToast(`Etapa ${activeGuidedStep.stepNumber} concluída! Recompensa coletada.`);
      return;
    }
    if (activeGuidedStep.recommendedBuildType) {
      handleStartBuild(activeGuidedStep.recommendedBuildType);
      return;
    }
    if (activeGuidedStep.id === 'step_5_upgrade_cannon') {
      const cannon = fortress.structures.find((s) => s.type === 'cannon');
      if (cannon) {
        setBuildDrawerOpen(false);
        setPlacingType(null);
        setSelectedId(cannon.id);
      } else {
        handleStartBuild('cannon');
      }
      return;
    }
    if (activeGuidedStep.id === 'step_8_core_lv2') {
      const core = fortress.structures.find((s) => s.type === 'core');
      if (core) {
        setBuildDrawerOpen(false);
        setPlacingType(null);
        setSelectedId(core.id);
      }
      return;
    }
    if (activeGuidedStep.recommendedTab) {
      onNavigateTab(activeGuidedStep.recommendedTab);
    }
  };

  const selectedEntry = selectedStructure ? STRUCTURES_CATALOG[selectedStructure.type] : null;
  const selectedStats = selectedStructure
    ? computeStructureStats(selectedStructure.type, selectedStructure.level, fortress.balanceConfig)
    : null;
  const upgradeCost = selectedStructure
    ? computeStructureUpgradeCost(selectedStructure.type, selectedStructure.level)
    : null;
  const upgradeDurationSec = selectedStructure
    ? computeStructureUpgradeDurationSec(selectedStructure.type, selectedStructure.level)
    : 0;
  const selectedUnderConstruction = selectedStructure
    ? isStructureUnderConstruction(selectedStructure, nowMs)
    : false;
  const selectedRemainingSec =
    selectedStructure && selectedUnderConstruction
      ? Math.max(0, ((selectedStructure.constructionEndsAt ?? nowMs) - nowMs) / 1000)
      : 0;
  const selectedConstructionPct =
    selectedStructure && selectedUnderConstruction
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              (1 - selectedRemainingSec / Math.max(1, selectedStructure.constructionDurationSec ?? 10)) *
                100
            )
          )
        )
      : 0;
  const speedupCrystalCost = selectedUnderConstruction
    ? computeSpeedupCrystalCost(selectedRemainingSec)
    : 0;
  const maxAllowedLevel =
    selectedStructure?.type === 'core' ? PROGRESSION_TABLE.length : coreProg.maxTowerLevel;
  const canUpgrade =
    Boolean(selectedStructure && upgradeCost) &&
    !selectedUnderConstruction &&
    (selectedStructure?.level ?? 0) < maxAllowedLevel &&
    fortress.resources.gold >= (upgradeCost?.gold ?? 0) &&
    fortress.resources.crystals >= (upgradeCost?.crystals ?? 0);
  const nextCoreRow =
    selectedStructure?.type === 'core' && coreLevel < PROGRESSION_TABLE.length
      ? PROGRESSION_TABLE[coreLevel]
      : null;

  return (
    <div className="relative flex-1 w-full h-full overflow-hidden select-none">
      {/* Full-viewport 2D Isometric Canvas (zoom/pan isolated to game world only) */}
      <div ref={containerRef} className="absolute inset-0 touch-none">
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => setHoverCell(getPointerGridCell(e))}
          onMouseLeave={() => setHoverCell(null)}
          onClick={handleCanvasClick}
          className={`w-full h-full block ${
            placingType || movingId
              ? 'cursor-crosshair'
              : 'cursor-grab active:cursor-grabbing'
          }`}
        />
      </div>

      {/* Top-Left Compact Fortress Summary */}
      <div className="pointer-events-none absolute top-4 left-4 flex flex-col gap-2 max-w-xs">
        <div className="pointer-events-auto bg-[#151A22]/88 backdrop-blur-md border border-[#E5A93C]/25 rounded-lg px-4 py-2.5 shadow-lg">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-sm font-bold text-[#FFF8E7] tracking-wide">
              {fortress.fortressName}
            </h2>
            <span className="font-mono text-xs text-[#F4C462] tabular-nums whitespace-nowrap">
              Cabana Nv.{coreLevel}
            </span>
          </div>
          <div className="text-[11px] font-medium text-[#D9A760] mt-0.5">
            {CURRENT_ERA.code} · {CURRENT_ERA.name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-300 tabular-nums">
            <span>+{economy.productionPerMin.gold}/min Ouro</span>
            <span aria-hidden="true">·</span>
            <span>+{economy.productionPerMin.crystals}/min Cristal</span>
            <span aria-hidden="true">·</span>
            <span>+{economy.productionPerMin.essence}/min Essência</span>
          </div>
          <div className="mt-1.5 pt-1.5 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
            <span>
              Defesas:{' '}
              <strong className="text-slate-200 font-mono">
                {activeDefenseCount}/{coreProg.maxActiveDefenses}
              </strong>
            </span>
            <span>
              {activeConstructionsCount > 0 ? (
                <strong className="text-[#FACC15] font-mono">
                  {activeConstructionsCount} em obra
                </strong>
              ) : (
                <>
                  Guarda:{' '}
                  <strong className="text-slate-200">
                    {fortress.defenderHeroIds
                      .map((id) => getHeroById(id)?.name)
                      .filter(Boolean)
                      .join(', ') || 'Nenhum'}
                  </strong>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Guided Step-by-Step Village Progression Tracker */}
        {activeGuidedStep && activeGuidedProgress ? (
          <div
            className={`pointer-events-auto bg-[#151A22]/92 backdrop-blur-md border rounded-lg px-3.5 py-2.5 shadow-xl transition-colors ${
              activeGuidedProgress.completed
                ? 'border-[#22C55E]/70 shadow-[0_0_18px_rgba(34,197,94,0.2)]'
                : 'border-[#E5A93C]/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-mono font-semibold text-[#F4C462] uppercase tracking-wide">
                Passo {activeGuidedStep.stepNumber}/{GUIDED_PROGRESSION_STEPS.length}
              </span>
              <span className="font-mono text-slate-300 tabular-nums">
                {activeGuidedProgress.current}/{activeGuidedProgress.target}
              </span>
            </div>
            <div className="text-xs font-semibold text-[#FFF8E7] mt-0.5">
              {activeGuidedStep.title}
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
              {activeGuidedStep.description}
            </p>
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  activeGuidedProgress.completed ? 'bg-[#22C55E]' : 'bg-[#E5A93C]'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((activeGuidedProgress.current / activeGuidedProgress.target) * 100)
                  )}%`,
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-mono text-[10.5px] tabular-nums">
                <span className="text-[#F4C462]">+{activeGuidedStep.reward.gold} O</span>
                <span className="text-[#38BDF8]">+{activeGuidedStep.reward.crystals} C</span>
                <span className="text-[#4ADE80]">+{activeGuidedStep.reward.essence} E</span>
              </div>
              <button
                onClick={handleGuidedStepAction}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 ${
                  activeGuidedProgress.completed
                    ? 'bg-[#22C55E] hover:bg-[#16A34A] text-[#052E16]'
                    : 'bg-[#E5A93C] hover:bg-[#F4C462] text-[#151A22]'
                }`}
              >
                {activeGuidedProgress.completed ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Resgatar</span>
                  </>
                ) : (
                  <>
                    <span>Fazer Agora</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="pointer-events-auto bg-[#151A22]/85 backdrop-blur-md border border-[#22C55E]/35 rounded-lg px-3.5 py-2 text-[11px] text-slate-200 flex items-center gap-2 shadow-lg">
            <CheckCircle2 className="w-4 h-4 text-[#4ADE80] shrink-0" />
            <span>
              Jornada inicial completa! Evolua a Cabana até Nv.{PROGRESSION_TABLE.length}.
            </span>
          </div>
        )}

        {(placingType || movingId) && (
          <div className="pointer-events-auto bg-[#1F2631]/95 border border-[#E5A93C] rounded-lg px-3.5 py-2 flex items-center justify-between gap-3 text-xs text-[#FFF8E7] shadow-lg">
            <span>
              {placingType
                ? `Clique no gramado interno para construir: ${STRUCTURES_CATALOG[placingType].name} (${formatDurationSec(
                    computeStructureBuildDurationSec(placingType)
                  )})`
                : 'Clique em um bloco livre para reposicionar a estrutura'}
            </span>
            <button
              onClick={() => {
                setPlacingType(null);
                setMovingId(null);
              }}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white font-medium whitespace-nowrap shrink-0"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 bg-[#151A22]/95 border border-[#E5A93C]/50 text-[#FFF8E7] text-xs font-medium px-4 py-2 rounded-lg shadow-xl">
          {toastMsg}
        </div>
      )}

      {/* Right Floating Quick Actions: Collect & Layouts */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        {totalPending >= 10 && (
          <button
            onClick={() => {
              onCollectPending();
              soundEngine.playCollect();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#22C55E] hover:bg-[#16A34A] text-[#052E16] font-semibold text-xs shadow-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              Coletar (+{Math.floor(fortress.pendingProduction.gold)} O · +
              {Math.floor(fortress.pendingProduction.crystals)} C · +
              {Math.floor(fortress.pendingProduction.essence)} E)
            </span>
          </button>
        )}

        <div className="relative">
          <button
            onClick={() => setLayoutMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#151A22]/88 hover:bg-[#1F2631] border border-white/15 text-xs font-medium text-slate-100 backdrop-blur-md whitespace-nowrap shrink-0"
          >
            <BookmarkCheck className="w-4 h-4 text-[#E5A93C]" />
            <span>Layouts ({fortress.activeLayoutSlot}/3)</span>
          </button>

          {layoutMenuOpen && (
            <div className="mt-2 w-72 bg-[#151A22]/95 border border-[#E5A93C]/30 rounded-lg p-3 shadow-2xl backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#FFF8E7]">
                  Layouts da Fortaleza
                </span>
                <button
                  onClick={() => setLayoutMenuOpen(false)}
                  className="text-slate-400 hover:text-white"
                  aria-label="Fechar layouts"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                {fortress.savedLayouts.map((layout) => (
                  <div
                    key={layout.slot}
                    className={`flex items-center justify-between gap-2 p-2 rounded border ${
                      fortress.activeLayoutSlot === layout.slot
                        ? 'border-[#E5A93C]/60 bg-[#E5A93C]/10'
                        : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-white truncate">
                        Slot {layout.slot}: {layout.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                        {layout.structures.length} estruturas
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          onSaveLayout(layout.slot);
                          showToast(`Layout ${layout.slot} salvo com sucesso.`);
                        }}
                        className="px-2 py-1 text-[11px] font-medium rounded bg-white/10 hover:bg-white/20 text-slate-100"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => {
                          onLoadLayout(layout.slot);
                          showToast(`Layout ${layout.slot} carregado.`);
                        }}
                        className="px-2 py-1 text-[11px] font-medium rounded bg-[#E5A93C] hover:bg-[#F4C462] text-[#151A22]"
                      >
                        Usar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Selected Structure Inspector Panel (Bottom Center) */}
      {selectedStructure && selectedEntry && selectedStats && upgradeCost && !buildDrawerOpen && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[min(94vw,640px)] bg-[#151A22]/94 backdrop-blur-md border border-[#E5A93C]/35 rounded-xl p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <BuildingSpriteThumb
                type={selectedStructure.type}
                level={selectedStructure.level}
                size={52}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                  <h3 className="font-display text-base font-bold text-[#FFF8E7] truncate">
                    {selectedEntry.name}
                  </h3>
                  <span className="font-mono text-xs text-[#F4C462] tabular-nums shrink-0">
                    Nível {selectedStructure.level} / {maxAllowedLevel}
                  </span>
                  {selectedStructure.type !== 'trap' && (
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                      Visual {getBuildingVisualTier(selectedStructure.level)}/3
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 mt-0.5">{selectedEntry.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selectedStructure.type !== 'trap' && selectedStructure.level < 3 && (
                <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                  <span className="text-[10px] text-slate-400 font-mono">
                    Próx. Nv.{selectedStructure.level + 1}
                  </span>
                  <BuildingSpriteThumb
                    type={selectedStructure.type}
                    level={selectedStructure.level + 1}
                    size={34}
                  />
                </div>
              )}
              <button
                onClick={() => setSelectedId(null)}
                className="text-slate-400 hover:text-white p-1"
                aria-label="Fechar inspetor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-200 font-mono tabular-nums">
            <span>HP: {selectedStats.maxHp}</span>
            <span>DEF: {selectedStats.defense}</span>
            {selectedStats.damage > 0 && (
              <>
                <span>Dano: {selectedStats.damage}</span>
                <span>Alcance: {selectedStats.range.toFixed(1)}</span>
                <span>Cadência: {selectedStats.attackSpeed.toFixed(2)}/s</span>
              </>
            )}
            {selectedStats.productionPerMin.gold > 0 && (
              <span className="text-[#F4C462]">+{selectedStats.productionPerMin.gold} Ouro/min</span>
            )}
            {selectedStats.productionPerMin.crystals > 0 && (
              <span className="text-[#38BDF8]">+{selectedStats.productionPerMin.crystals} Cristal/min</span>
            )}
            {selectedStats.productionPerMin.essence > 0 && (
              <span className="text-[#4ADE80]">+{selectedStats.productionPerMin.essence} Essência/min</span>
            )}
          </div>

          {selectedEntry.specialEffect && (
            <div className="mt-1.5 text-xs text-[#F4C462]">
              Efeito tático: {selectedEntry.specialEffect}
            </div>
          )}

          {selectedStructure.type === 'hero_altar' && (
            <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-300">
                Herói guardião deste altar (patrulha e defende a vila):
              </span>
              <div className="flex items-center gap-1.5">
                {HEROES_CATALOG.filter((h) => h.playableInPhase1).map((hero) => {
                  const isAssigned = selectedStructure.assignedHeroId === hero.id;
                  const heroLvl = fortress.heroProgress[hero.id]?.level ?? 1;
                  return (
                    <button
                      key={hero.id}
                      onClick={() => onAssignAltarHero(selectedStructure.id, hero.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                        isAssigned
                          ? 'bg-[#E5A93C] text-[#151A22]'
                          : 'bg-white/10 text-slate-200 hover:bg-white/20'
                      }`}
                    >
                      {hero.name} (Nv.{heroLvl})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {nextCoreRow && !selectedUnderConstruction && (
            <div className="mt-2 text-[11px] text-[#7DD3FC] bg-[#10151C] border border-[#38BDF8]/25 rounded-md px-2.5 py-1.5">
              Próximo Nv.{nextCoreRow.coreLevel}: {nextCoreRow.unlockHighlight} (Defesas máx.{' '}
              {nextCoreRow.maxActiveDefenses} · Torres até Nv.{nextCoreRow.maxTowerLevel})
            </div>
          )}

          {selectedUnderConstruction && (
            <div className="mt-3 p-2.5 rounded-lg bg-[#10151C] border border-[#FACC15]/40 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-[#FACC15]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {selectedStructure.constructionState === 'building'
                      ? 'Construindo estrutura...'
                      : `Melhorando para Nível ${selectedStructure.level + 1}...`}
                  </span>
                </span>
                <span className="font-mono text-[#FFF8E7] tabular-nums">
                  {formatDurationSec(selectedRemainingSec)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[#FACC15] transition-all duration-300"
                  style={{ width: `${selectedConstructionPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                disabled={selectedUnderConstruction}
                onClick={() => {
                  setMovingId(selectedStructure.id);
                  setSelectedId(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                  selectedUnderConstruction
                    ? 'bg-white/5 text-slate-500 cursor-not-allowed'
                    : 'bg-white/10 hover:bg-white/15 text-white'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                <span>Mover</span>
              </button>
              {selectedStructure.type !== 'core' && (
                <button
                  onClick={() => {
                    onRemoveStructure(selectedStructure.id);
                    setSelectedId(null);
                    showToast('Estrutura removida (50% do Ouro reembolsado).');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-xs font-medium text-red-300 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover</span>
                </button>
              )}
            </div>

            {selectedUnderConstruction ? (
              <button
                disabled={fortress.resources.crystals < speedupCrystalCost}
                onClick={() => onSpeedupStructure(selectedStructure.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  fortress.resources.crystals >= speedupCrystalCost
                    ? 'bg-[#38BDF8] hover:bg-[#7DD3FC] text-[#082F49]'
                    : 'bg-white/10 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>
                  {speedupCrystalCost === 0
                    ? 'Concluir Grátis'
                    : `Acelerar Agora (${speedupCrystalCost} C)`}
                </span>
              </button>
            ) : selectedStructure.level < maxAllowedLevel ? (
              <button
                disabled={!canUpgrade}
                onClick={() => {
                  onUpgradeStructure(selectedStructure.id);
                  soundEngine.playBuild();
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  canUpgrade
                    ? 'bg-[#E5A93C] hover:bg-[#F4C462] text-[#151A22]'
                    : 'bg-white/10 text-slate-400 cursor-not-allowed'
                }`}
              >
                <ArrowUpCircle className="w-4 h-4" />
                <span>
                  Melhorar Nv.{selectedStructure.level + 1} ({upgradeCost.gold} O
                  {upgradeCost.crystals > 0 ? ` · ${upgradeCost.crystals} C` : ''} ·{' '}
                  {formatDurationSec(upgradeDurationSec)})
                </span>
              </button>
            ) : (
              <span className="text-xs text-slate-400">
                {selectedStructure.type === 'core'
                  ? 'Nível máximo atingido'
                  : `Evolua a Cabana para liberar Nv.${selectedStructure.level + 1}`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Build Catalog Drawer */}
      {buildDrawerOpen && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[min(95vw,860px)] bg-[#151A22]/96 backdrop-blur-md border border-[#E5A93C]/35 rounded-xl p-4 shadow-2xl">
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/10">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5">
              {BUILD_GROUPS.map((grp) => (
                <button
                  key={grp.key}
                  onClick={() => setBuildGroup(grp.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    buildGroup === grp.key
                      ? 'bg-[#E5A93C] text-[#151A22]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {grp.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setBuildDrawerOpen(false)}
              className="text-slate-400 hover:text-white p-1"
              aria-label="Fechar menu de construção"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
            {BUILD_GROUPS.find((g) => g.key === buildGroup)?.types.map((type) => {
              const entry = STRUCTURES_CATALOG[type];
              const count = countByType(type);
              const maxAllowed =
                type === 'hero_altar'
                  ? entry.maxCountBase
                  : entry.maxCountBase + (coreLevel >= 4 ? 1 : 0);
              const affordable =
                fortress.resources.gold >= entry.baseCost.gold &&
                fortress.resources.crystals >= entry.baseCost.crystals;
              const isGuidedNext = activeGuidedStep?.recommendedBuildType === type;
              const buildTimeLabel = formatDurationSec(computeStructureBuildDurationSec(type));
              return (
                <button
                  key={type}
                  onClick={() => handleStartBuild(type)}
                  className={`text-left p-2.5 rounded-lg border transition-colors flex items-start gap-2.5 ${
                    isGuidedNext
                      ? 'border-[#FACC15] bg-[#262319] shadow-[0_0_16px_rgba(250,204,21,0.18)]'
                      : affordable
                      ? 'border-white/12 bg-[#1F2631] hover:border-[#E5A93C]/65'
                      : 'border-white/5 bg-[#1A2029] opacity-65'
                  }`}
                >
                  <BuildingSpriteThumb type={type} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#FFF8E7] truncate">
                        {entry.name}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                        {count}/{maxAllowed}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                      {entry.specialEffect ?? entry.description}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[11px] tabular-nums">
                      <span className="flex items-center gap-1 text-[#F4C462]">
                        <Coins className="w-3 h-3" />
                        {entry.baseCost.gold}
                      </span>
                      {entry.baseCost.crystals > 0 && (
                        <span className="flex items-center gap-1 text-[#38BDF8]">
                          <Gem className="w-3 h-3" />
                          {entry.baseCost.crystals}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-slate-300">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {buildTimeLabel}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Game-Only Camera Zoom Controls */}
      <div className="absolute bottom-16 right-4 flex items-center gap-1 bg-[#151A22]/88 backdrop-blur-md border border-white/15 rounded-lg p-1 shadow-lg">
        <button
          onClick={zoomOut}
          className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          title="Afastar zoom do jogo (-)"
          aria-label="Afastar zoom do jogo"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={resetCamera}
          className="px-1.5 py-1 rounded text-[11px] font-mono tabular-nums text-[#F4C462] hover:bg-white/10 transition-colors min-w-[44px]"
          title="Centralizar câmera (100%)"
        >
          {zoomPercent}%
        </button>
        <button
          onClick={zoomIn}
          className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          title="Ampliar zoom do jogo (+)"
          aria-label="Ampliar zoom do jogo"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        {(zoomPercent !== 100 || Math.abs(camera.panX) > 4 || Math.abs(camera.panY) > 4) && (
          <button
            onClick={resetCamera}
            className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            title="Resetar visualização"
            aria-label="Resetar visualização"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={() => {
              setSelectedId(null);
              setPlacingType(null);
              setMovingId(null);
              setBuildDrawerOpen((v) => !v);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold shadow-lg transition-colors whitespace-nowrap shrink-0 ${
              buildDrawerOpen
                ? 'bg-[#F4C462] text-[#151A22]'
                : 'bg-[#1F2631]/95 hover:bg-[#28313F] text-[#FFF8E7] border border-[#E5A93C]/40'
            }`}
          >
            <Hammer className="w-4 h-4" />
            <span>Construir</span>
          </button>
        </div>

        <button
          onClick={onGoToBattle}
          className="pointer-events-auto flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F4C462] text-[#151A22] font-bold text-sm shadow-xl transition-colors whitespace-nowrap shrink-0"
        >
          <Shield className="w-4 h-4" />
          <span>Atacar Fortaleza</span>
        </button>
      </div>
    </div>
  );
}
