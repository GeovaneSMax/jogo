import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Coins,
  FastForward,
  Flag,
  Gem,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Star,
  Swords,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CAMPAIGN_TARGETS,
  GRID_SIZE,
  SKILL_UNLOCK_LEVEL,
  STRUCTURES_CATALOG,
} from '../data/gameCatalog';
import {
  createBattleState,
  deployHeroInBattle,
  isPerimeterCell,
  stepBattleSimulation,
  triggerHeroUltimate,
} from '../engine/battleEngine';
import {
  computeIsoViewport,
  drawBattleEffects,
  drawBattleHero,
  drawIsoStructure,
  drawSunlitArena,
  IsoViewport,
  screenToGrid,
} from '../engine/isoRenderer';
import {
  computeHeroStats,
  getActiveSynergies,
  getEffectiveSkillLevel,
  getHeroById,
  isHeroSkillUnlocked,
} from '../engine/math';
import { soundtrack } from '../engine/soundtrack';
import { useGameCamera } from '../hooks/useGameCamera';
import { BattleState, CampaignTarget, FortressState, PlayerResources } from '../types/game';
import { HeroPortrait } from './HeroPortrait';

interface BattleViewProps {
  fortress: FortressState;
  onBattleComplete: (targetId: string, stars: number, reward: PlayerResources) => void;
  onReturnToFortress: () => void;
}

export function BattleView({
  fortress,
  onBattleComplete,
  onReturnToFortress,
}: BattleViewProps) {
  const [battle, setBattle] = useState<BattleState | null>(null);
  const battleRef = useRef<BattleState | null>(null);
  const rewardClaimedRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const vpRef = useRef<IsoViewport>(computeIsoViewport(1200, 700));
  const [hoverCell, setHoverCell] = useState<{ gx: number; gy: number } | null>(null);
  const [inspectedStructureId, setInspectedStructureId] = useState<string | null>(null);

  const {
    camera,
    cameraRef,
    zoomPercent,
    zoomIn,
    zoomOut,
    resetCamera,
    suppressNextClickRef,
  } = useGameCamera(containerRef, battle !== null);

  // Switch adaptive Stone Age soundtrack into war drums mode during live battles
  useEffect(() => {
    soundtrack.setMode(battle !== null ? 'battle' : 'fortress');
    return () => {
      soundtrack.setMode('fortress');
    };
  }, [battle !== null]);

  const activeSynergies = useMemo(
    () => getActiveSynergies(fortress.attackSquadIds),
    [fortress.attackSquadIds]
  );

  const squadPower = useMemo(() => {
    return fortress.attackSquadIds.reduce((sum, id) => {
      const h = getHeroById(id);
      if (!h) return sum;
      return (
        sum +
        computeHeroStats(
          h,
          fortress.heroProgress[id],
          activeSynergies,
          fortress.balanceConfig
        ).powerScore
      );
    }, 0);
  }, [fortress, activeSynergies]);

  const myFortressDefenseTarget = useMemo<CampaignTarget>(() => {
    const readyStructures = fortress.structures.filter(
      (s) => s.constructionState !== 'building'
    );
    const altars = readyStructures.filter(
      (s) => s.type === 'hero_altar' && Boolean(s.assignedHeroId)
    );
    const defenders = Array.from(
      new Set(
        altars
          .map((a) => a.assignedHeroId!)
          .concat(altars.length === 0 ? fortress.defenderHeroIds : [])
      )
    );
    const avgDefLevel =
      defenders.length > 0
        ? Math.round(
            defenders.reduce(
              (acc, id) => acc + (fortress.heroProgress[id]?.level ?? 1),
              0
            ) / defenders.length
          )
        : 1;
    return {
      id: 'my_fortress_defense',
      name: `Simular Ataque: ${fortress.fortressName}`,
      subtitle: 'Teste a defesa da sua própria vila com seus Altares e Heróis Guardiões',
      difficulty: 'Treino',
      recommendedPower: squadPower,
      defenderHeroIds: defenders,
      defenderLevel: avgDefLevel,
      reward: { gold: 0, crystals: 0, essence: 0 },
      tacticalHint:
        'Seus heróis patrulham o círculo dos seus Altares e avançam para defender a vila assim que invasores se aproximam ou atacam o Altar.',
      structures: readyStructures.map((s) => ({ ...s })),
    };
  }, [fortress, squadPower]);

  const startTargetBattle = (target: CampaignTarget) => {
    rewardClaimedRef.current = false;
    setInspectedStructureId(null);
    const fresh = createBattleState(
      target,
      fortress.attackSquadIds,
      fortress.heroProgress,
      fortress.balanceConfig
    );
    battleRef.current = fresh;
    setBattle(fresh);
  };

  // Keyboard shortcuts 1-5 for manual ultimate triggers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const current = battleRef.current;
      if (!current || current.phase !== 'RUNNING') return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < fortress.attackSquadIds.length) {
        const heroId = fortress.attackSquadIds[idx];
        const instance = current.heroes.find(
          (h) => h.team === 'attacker' && h.heroId === heroId && h.alive
        );
        if (instance && instance.skillLevel > 0 && instance.energy >= instance.maxEnergy) {
          const updated = triggerHeroUltimate(current, instance.instanceId, fortress.balanceConfig);
          battleRef.current = updated;
          setBattle({ ...updated });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fortress.attackSquadIds, fortress.balanceConfig]);

  // Fixed-rate simulation + Canvas render loop
  useEffect(() => {
    if (!battle) return;
    let rafId = 0;
    let lastTime = performance.now();
    let uiSyncAccum = 0;

    const frame = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      let state = battleRef.current;
      if (state && state.phase === 'RUNNING') {
        state = stepBattleSimulation(state, dt, fortress.attackSquadIds, fortress.balanceConfig);
        battleRef.current = state;

        if ((state.phase === 'VICTORY' || state.phase === 'DEFEAT') && !rewardClaimedRef.current) {
          rewardClaimedRef.current = true;
          if (state.target && state.rewardEarned) {
            onBattleComplete(state.target.id, state.starsEarned, state.rewardEarned);
          }
          setBattle({ ...state });
        } else {
          uiSyncAccum += dt;
          if (uiSyncAccum >= 0.1) {
            uiSyncAccum = 0;
            setBattle({ ...state });
          }
        }
      }

      // Render Canvas
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container && state) {
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

          const hasUndeployed = state.deployedHeroIds.length < fortress.attackSquadIds.length;
          const inspected = state.structures.find(
            (s) => !s.destroyed && (s.id === inspectedStructureId || (hoverCell && s.gridX === hoverCell.gx && s.gridY === hoverCell.gy))
          );

          drawSunlitArena(ctx, vp, {
            highlightPerimeter:
              (state.phase === 'PREP' || state.phase === 'RUNNING') &&
              hasUndeployed &&
              Boolean(state.pendingDeployHeroId),
            hoverCell,
            rangeOverlay:
              inspected && inspected.range > 0
                ? {
                    gx: inspected.gridX,
                    gy: inspected.gridY,
                    range: inspected.range,
                    color: STRUCTURES_CATALOG[inspected.type].color,
                  }
                : null,
            timeSec,
          });

          // 1. Render destroyed buildings first as ground ruins beneath walking heroes
          for (const s of state.structures) {
            if (s.destroyed) {
              drawIsoStructure(ctx, s, vp, { timeSec, isBattle: true });
            }
          }

          // 2. Depth-sort standing structures & live heroes back-to-front
          type DrawItem = { depth: number; draw: () => void };
          const items: DrawItem[] = [];

          for (const s of state.structures) {
            if (!s.destroyed) {
              items.push({
                depth: s.gridX + s.gridY + 0.4,
                draw: () => drawIsoStructure(ctx, s, vp, { timeSec, isBattle: true }),
              });
            }
          }
          for (const h of state.heroes) {
            if (h.alive) {
              items.push({
                depth: h.x + h.y,
                draw: () => drawBattleHero(ctx, h, vp, timeSec),
              });
            }
          }

          items.sort((a, b) => a.depth - b.depth);
          for (const it of items) it.draw();

          drawBattleEffects(
            ctx,
            state.projectiles,
            state.particles,
            state.vfx,
            state.floatingTexts,
            vp
          );
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [battle !== null, fortress.attackSquadIds, fortress.balanceConfig, hoverCell, inspectedStructureId, onBattleComplete]);

  const getPointerCell = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { gx, gy } = screenToGrid(e.clientX - rect.left, e.clientY - rect.top, vpRef.current);
    if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) return null;
    return { gx, gy };
  };

  const handleArenaClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (suppressNextClickRef.current) return;
    const current = battleRef.current;
    if (!current) return;
    const cell = getPointerCell(e);
    if (!cell) return;

    if ((current.phase === 'PREP' || current.phase === 'RUNNING') && current.pendingDeployHeroId && isPerimeterCell(cell.gx, cell.gy)) {
      const updated = deployHeroInBattle(
        current,
        current.pendingDeployHeroId,
        cell.gx,
        cell.gy,
        fortress.attackSquadIds,
        fortress.heroProgress,
        fortress.balanceConfig
      );
      battleRef.current = updated;
      setBattle({ ...updated });
      return;
    }

    const struct = current.structures.find(
      (s) => !s.destroyed && s.gridX === cell.gx && s.gridY === cell.gy
    );
    setInspectedStructureId(struct ? struct.id : null);
  };

  const handleQuickDeployAll = () => {
    let current = battleRef.current;
    if (!current) return;
    const entrySpots = [
      { gx: 1, gy: 10 },
      { gx: 1, gy: 13 },
      { gx: 6, gy: 18 },
      { gx: 1, gy: 6 },
      { gx: 10, gy: 18 },
    ];
    let spotIdx = 0;
    for (const heroId of fortress.attackSquadIds) {
      if (!current.deployedHeroIds.includes(heroId)) {
        const spot = entrySpots[spotIdx % entrySpots.length];
        spotIdx += 1;
        current = deployHeroInBattle(
          current,
          heroId,
          spot.gx,
          spot.gy,
          fortress.attackSquadIds,
          fortress.heroProgress,
          fortress.balanceConfig
        );
      }
    }
    battleRef.current = current;
    setBattle({ ...current });
  };

  // ===================== TARGET SELECTION SCREEN =====================
  if (!battle) {
    return (
      <div className="flex-1 overflow-y-auto bg-[#151A22] px-6 py-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <div className="text-xs text-[#F4C462] font-medium">
                Campanha Tática — Fase 1 (Desafios Locais)
              </div>
              <h2 className="font-display text-2xl font-bold text-[#FFF8E7] mt-0.5">
                Escolha a Fortaleza Adversária
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Analise as defesas, verifique o poder recomendado e planeje seus pontos de entrada. Sem tropas comuns: cada decisão depende dos seus heróis e do momento exato das Habilidades Supremas.
              </p>
            </div>
            <div className="text-right font-mono text-xs tabular-nums">
              <div className="text-slate-400">Seu Esquadrão Atual</div>
              <div className="text-base font-semibold text-[#FFF8E7]">
                {fortress.attackSquadIds.length} Heróis · Poder {squadPower}
              </div>
            </div>
          </div>

          {/* Own Fortress Defense Simulation Banner */}
          <div className="bg-[#1F2631] border border-[#38BDF8]/35 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#38BDF8]">
                <Shield className="w-4 h-4" />
                <span>Simulação de Defesa da Sua Vila</span>
              </div>
              <div className="text-sm font-display font-bold text-[#FFF8E7]">
                {fortress.fortressName} ·{' '}
                {fortress.structures.filter((s) => s.type === 'hero_altar').length} Altar(es) de
                Herói
              </div>
              <p className="text-xs text-slate-400">
                Veja seus heróis patrulhando seus Altares e defendendo a vila contra um ataque real (os Altares também podem ser destruídos pelos atacantes).
              </p>
            </div>
            <button
              disabled={fortress.attackSquadIds.length === 0}
              onClick={() => startTargetBattle(myFortressDefenseTarget)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#38BDF8] hover:bg-[#7DD3FC] text-[#082F49] font-bold text-xs transition-colors whitespace-nowrap shrink-0"
            >
              <Shield className="w-4 h-4" />
              <span>Testar Defesa da Minha Vila</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {CAMPAIGN_TARGETS.map((target) => {
              const earnedStars = fortress.campaignStars[target.id] ?? 0;
              const defenseCounts: Record<string, number> = {};
              target.structures.forEach((s) => {
                if (STRUCTURES_CATALOG[s.type].category === 'defense') {
                  const name = STRUCTURES_CATALOG[s.type].shortName;
                  defenseCounts[name] = (defenseCounts[name] ?? 0) + 1;
                }
              });

              return (
                <div
                  key={target.id}
                  className="bg-[#1F2631] border border-white/10 hover:border-[#E5A93C]/50 rounded-xl p-5 flex flex-col justify-between transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#F4C462] font-semibold">
                        {target.difficulty} · Poder rec. {target.recommendedPower}
                      </span>
                      <div className="flex items-center gap-0.5" aria-label={`${earnedStars} de 3 estrelas`}>
                        {[1, 2, 3].map((n) => (
                          <Star
                            key={n}
                            className={`w-3.5 h-3.5 ${
                              n <= earnedStars
                                ? 'text-[#FACC15] fill-[#FACC15]'
                                : 'text-slate-600'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <h3 className="font-display text-lg font-bold text-[#FFF8E7] mt-1.5">
                      {target.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">{target.subtitle}</p>

                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2 text-xs">
                      <div className="text-slate-300">
                        <span className="text-slate-500">Defesas: </span>
                        {Object.entries(defenseCounts)
                          .map(([k, v]) => `${v}× ${k}`)
                          .join(' · ')}
                      </div>
                      <div className="text-slate-300">
                        <span className="text-slate-500">Heróis Defensores: </span>
                        {target.defenderHeroIds.length > 0
                          ? target.defenderHeroIds
                              .map((id) => `${getHeroById(id)?.name} (Nv.${target.defenderLevel})`)
                              .join(', ')
                          : 'Nenhum'}
                      </div>
                      <div className="text-[#FDE68A]/90 bg-[#151A22] rounded p-2.5 text-[11px] leading-relaxed">
                        Dica tática: {target.tacticalHint}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                      <span className="flex items-center gap-1 text-[#F4C462]">
                        <Coins className="w-3.5 h-3.5" />
                        {target.reward.gold}
                      </span>
                      <span className="flex items-center gap-1 text-[#38BDF8]">
                        <Gem className="w-3.5 h-3.5" />
                        {target.reward.crystals}
                      </span>
                      <span className="flex items-center gap-1 text-[#4ADE80]">
                        <Sparkles className="w-3.5 h-3.5" />
                        {target.reward.essence}
                      </span>
                    </div>

                    <button
                      disabled={fortress.attackSquadIds.length === 0}
                      onClick={() => startTargetBattle(target)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E5A93C] hover:bg-[#F4C462] text-[#151A22] font-bold text-xs transition-colors whitespace-nowrap shrink-0"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      <span>Preparar Ataque</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ===================== LIVE BATTLE / PREP ARENA =====================
  const undeployedCount = fortress.attackSquadIds.length - battle.deployedHeroIds.length;
  const attackerInstances = battle.heroes.filter((h) => h.team === 'attacker');

  return (
    <div className="relative flex-1 w-full h-full overflow-hidden select-none">
      {/* Isometric Battle Canvas (zoom/pan isolated to game arena only) */}
      <div ref={containerRef} className="absolute inset-0 touch-none">
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => setHoverCell(getPointerCell(e))}
          onMouseLeave={() => setHoverCell(null)}
          onClick={handleArenaClick}
          className={`w-full h-full block ${
            undeployedCount > 0 && battle.pendingDeployHeroId
              ? 'cursor-crosshair'
              : 'cursor-grab active:cursor-grabbing'
          }`}
        />
      </div>

      {/* Top Battle HUD Strip */}
      <div className="absolute top-3 left-4 right-4 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <div className="pointer-events-auto bg-[#151A22]/90 backdrop-blur-md border border-[#E5A93C]/30 rounded-lg px-4 py-2 flex items-center gap-4 shadow-lg">
          <div>
            <div className="font-display text-xs font-bold text-[#FFF8E7]">
              {battle.target?.name}
            </div>
            <div className="flex items-center gap-2 text-xs font-mono tabular-nums mt-0.5">
              <span className="text-[#F4C462]">{battle.destructionPct}% destruído</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span className="flex items-center gap-0.5">
                {[1, 2, 3].map((n) => (
                  <Star
                    key={n}
                    className={`w-3.5 h-3.5 ${
                      n <= battle.starsEarned ? 'text-[#FACC15] fill-[#FACC15]' : 'text-slate-600'
                    }`}
                  />
                ))}
              </span>
            </div>
          </div>

          <div className="h-7 w-px bg-white/10" />

          <div className="font-mono text-base font-bold text-white tabular-nums">
            {Math.ceil(battle.timeRemaining)}s
          </div>
        </div>

        {/* Speed, Pause & Retreat Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          {battle.phase === 'PREP' && (
            <button
              onClick={handleQuickDeployAll}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#E5A93C] hover:bg-[#F4C462] text-[#151A22] font-bold text-xs shadow-lg whitespace-nowrap shrink-0"
            >
              <Swords className="w-3.5 h-3.5" />
              <span>Entrar com Todos</span>
            </button>
          )}
          {(battle.phase === 'RUNNING' || battle.phase === 'PAUSED') && (
            <>
              <button
                onClick={() => {
                  const cur = battleRef.current;
                  if (!cur) return;
                  cur.speedMultiplier = cur.speedMultiplier === 1 ? 2 : 1;
                  setBattle({ ...cur });
                }}
                className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-mono font-semibold whitespace-nowrap shrink-0 ${
                  battle.speedMultiplier === 2
                    ? 'bg-[#E5A93C] text-[#151A22] border-[#E5A93C]'
                    : 'bg-[#151A22]/90 text-white border-white/15'
                }`}
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>{battle.speedMultiplier}x</span>
              </button>
              <button
                onClick={() => {
                  const cur = battleRef.current;
                  if (!cur) return;
                  cur.phase = cur.phase === 'RUNNING' ? 'PAUSED' : 'RUNNING';
                  setBattle({ ...cur });
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#151A22]/90 border border-white/15 text-xs font-medium text-white whitespace-nowrap shrink-0"
              >
                {battle.phase === 'RUNNING' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <span>{battle.phase === 'RUNNING' ? 'Pausar' : 'Retomar'}</span>
              </button>
            </>
          )}
          <button
            onClick={() => {
              battleRef.current = null;
              setBattle(null);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#151A22]/90 hover:bg-red-950/80 border border-white/15 text-xs font-medium text-slate-200 whitespace-nowrap shrink-0"
          >
            <Flag className="w-3.5 h-3.5 text-red-400" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      {/* Prep / Deployment Guidance Banner */}
      {(battle.phase === 'PREP' || (battle.phase === 'RUNNING' && undeployedCount > 0)) && (
        <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 bg-[#151A22]/92 border border-[#E5A93C]/45 text-[#FFF8E7] text-xs px-4 py-2 rounded-lg shadow-xl text-center">
          {battle.pendingDeployHeroId ? (
            <span>
              Clique na grama externa dourada para lançar{' '}
              <strong className="text-[#F4C462]">
                {getHeroById(battle.pendingDeployHeroId)?.name}
              </strong>{' '}
              contra a vila (arraste para mover a câmera ou use o zoom).
            </span>
          ) : (
            <span>Selecione um herói abaixo para posicioná-lo no gramado externo.</span>
          )}
        </div>
      )}

      {/* Game-Only Battle Camera Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-[#151A22]/88 backdrop-blur-md border border-white/15 rounded-lg p-1 shadow-lg">
        <button
          onClick={zoomOut}
          className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          title="Afastar zoom da arena (-)"
          aria-label="Afastar zoom da arena"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={resetCamera}
          className="px-1.5 py-1 rounded text-[11px] font-mono tabular-nums text-[#F4C462] hover:bg-white/10 transition-colors min-w-[44px]"
          title="Centralizar arena (100%)"
        >
          {zoomPercent}%
        </button>
        <button
          onClick={zoomIn}
          className="p-1.5 rounded text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          title="Ampliar zoom da arena (+)"
          aria-label="Ampliar zoom da arena"
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

      {/* Bottom Hero Command & Manual Ultimate Dock */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-[96vw] flex items-end gap-2.5 overflow-x-auto pb-1 px-2">
        {fortress.attackSquadIds.map((heroId, idx) => {
          const entry = getHeroById(heroId);
          if (!entry) return null;
          const prog = fortress.heroProgress[heroId];
          const heroLevel = prog?.level ?? 1;
          const skillUnlocked = isHeroSkillUnlocked(heroLevel);
          const skillLevel = getEffectiveSkillLevel(prog);
          const isDeployed = battle.deployedHeroIds.includes(heroId);
          const instance = attackerInstances.find((h) => h.heroId === heroId);
          const isSelectedForDeploy = battle.pendingDeployHeroId === heroId && !isDeployed;
          const ultReady = Boolean(
            skillUnlocked && instance && instance.alive && instance.energy >= instance.maxEnergy
          );
          const hpPct = instance ? Math.max(0, Math.round((instance.hp / instance.maxHp) * 100)) : 100;
          const enPct =
            skillUnlocked && instance
              ? Math.min(100, Math.round((instance.energy / instance.maxEnergy) * 100))
              : 0;

          return (
            <button
              key={heroId}
              onClick={() => {
                const cur = battleRef.current;
                if (!cur) return;
                if (!isDeployed) {
                  cur.pendingDeployHeroId = heroId;
                  setBattle({ ...cur });
                } else if (instance && ultReady && cur.phase === 'RUNNING') {
                  const updated = triggerHeroUltimate(cur, instance.instanceId, fortress.balanceConfig);
                  battleRef.current = updated;
                  setBattle({ ...updated });
                }
              }}
              className={`relative flex flex-col w-44 p-2.5 rounded-xl border text-left transition-all shrink-0 backdrop-blur-md ${
                instance && !instance.alive
                  ? 'bg-[#151A22]/75 border-white/10 opacity-50 grayscale'
                  : ultReady
                  ? 'bg-[#2A2416]/95 border-[#FACC15] shadow-[0_0_24px_rgba(250,204,21,0.38)] -translate-y-1'
                  : isSelectedForDeploy
                  ? 'bg-[#1F2631]/95 border-[#E5A93C] -translate-y-0.5'
                  : 'bg-[#151A22]/90 border-white/15 hover:border-white/30'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <HeroPortrait hero={entry} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-display text-xs font-bold text-white truncate">
                      {entry.name}{' '}
                      <span className="font-mono text-[10px] text-[#F4C462]">N{heroLevel}</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">[{idx + 1}]</span>
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {!isDeployed
                      ? 'Aguardando entrada'
                      : !instance?.alive
                      ? 'Derrotado'
                      : !skillUnlocked
                      ? `Hab. libera no Nv.${SKILL_UNLOCK_LEVEL}`
                      : ultReady
                      ? `Hab. Nv.${skillLevel} Pronta!`
                      : `Hab. Nv.${skillLevel} · ${entry.ultimate.name}`}
                  </div>
                </div>
              </div>

              {/* HP & Energy bars */}
              <div className="mt-2 space-y-1">
                <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#22C55E] transition-all duration-150"
                    style={{ width: `${hpPct}%` }}
                  />
                </div>
                {skillUnlocked ? (
                  <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${
                        ultReady ? 'bg-[#FACC15]' : 'bg-[#38BDF8]'
                      }`}
                      style={{ width: `${enPct}%` }}
                    />
                  </div>
                ) : (
                  <div className="text-[9.5px] font-mono text-slate-500">
                    Habilidade bloqueada (Nv.{heroLevel}/{SKILL_UNLOCK_LEVEL})
                  </div>
                )}
              </div>

              {ultReady && (
                <div className="mt-1.5 flex items-center justify-center gap-1 text-[11px] font-bold text-[#FACC15]">
                  <Zap className="w-3 h-3" />
                  <span>Ativar Hab. Nv.{skillLevel}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Victory / Defeat Result Modal */}
      {(battle.phase === 'VICTORY' || battle.phase === 'DEFEAT') && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-30">
          <div className="w-full max-w-xl bg-[#1F2631] border border-[#E5A93C]/45 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                {[1, 2, 3].map((n) => (
                  <Star
                    key={n}
                    className={`w-8 h-8 ${
                      n <= battle.starsEarned
                        ? 'text-[#FACC15] fill-[#FACC15]'
                        : 'text-slate-600'
                    }`}
                  />
                ))}
              </div>
              <h2 className="font-display text-3xl font-bold text-[#FFF8E7]">
                {battle.phase === 'VICTORY' ? 'Vitória Estratégica' : 'Ataque Contido'}
              </h2>
              <p className="text-xs text-slate-300 mt-1 font-mono tabular-nums">
                Destruição: {battle.destructionPct}% · Núcleo:{' '}
                {battle.coreDestroyed ? 'Destruído' : 'Intacto'} · Tempo restante:{' '}
                {Math.ceil(battle.timeRemaining)}s
              </p>
            </div>

            {/* Loot Earned */}
            {battle.rewardEarned && (
              <div className="bg-[#151A22] border border-white/10 rounded-xl p-4 flex items-center justify-around font-mono text-sm tabular-nums">
                <div className="flex items-center gap-2 text-[#F4C462]">
                  <Coins className="w-4 h-4" />
                  <span>+{battle.rewardEarned.gold} Ouro</span>
                </div>
                <div className="flex items-center gap-2 text-[#38BDF8]">
                  <Gem className="w-4 h-4" />
                  <span>+{battle.rewardEarned.crystals} Cristais</span>
                </div>
                <div className="flex items-center gap-2 text-[#4ADE80]">
                  <Sparkles className="w-4 h-4" />
                  <span>+{battle.rewardEarned.essence} Essência</span>
                </div>
              </div>
            )}

            {/* Per-Hero Telemetry Breakdown */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              <div className="text-xs font-semibold text-slate-400">
                Desempenho dos Heróis
              </div>
              {attackerInstances.map((h) => {
                const entry = getHeroById(h.heroId);
                if (!entry) return null;
                return (
                  <div
                    key={h.instanceId}
                    className="flex items-center justify-between gap-3 bg-[#151A22] px-3 py-2 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <HeroPortrait hero={entry} size="sm" />
                      <div>
                        <div className="font-semibold text-white">{entry.name}</div>
                        <div className="text-[11px] text-slate-400">
                          {h.alive ? 'Sobreviveu' : 'Derrotado'} · {h.stats.ultimatesCast} Suprema(s)
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 font-mono tabular-nums text-[11px]">
                      <span className="text-[#F4C462]">Dano: {h.stats.damageDealt}</span>
                      <span className="text-[#38BDF8]">Absorv.: {h.stats.damageTaken}</span>
                      {h.stats.healingDone > 0 && (
                        <span className="text-[#4ADE80]">Cura: {h.stats.healingDone}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <button
                onClick={onReturnToFortress}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Voltar à Fortaleza</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    battleRef.current = null;
                    setBattle(null);
                  }}
                  className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                >
                  Outro Alvo
                </button>
                {battle.target && (
                  <button
                    onClick={() => startTargetBattle(battle.target!)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#E5A93C] hover:bg-[#F4C462] text-[#151A22] text-xs font-bold whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Jogar Novamente</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
