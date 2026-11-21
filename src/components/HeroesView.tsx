import { useMemo, useState } from 'react';
import {
  ArrowUpCircle,
  Check,
  Lock,
  Shield,
  Swords,
  Zap,
} from 'lucide-react';
import {
  HEROES_CATALOG,
  MAX_HERO_LEVEL,
  MAX_SKILL_LEVEL,
  SKILL_UNLOCK_LEVEL,
} from '../data/gameCatalog';
import { soundEngine } from '../engine/audio';
import {
  computeHeroSkillPower,
  computeHeroStats,
  computeHeroUpgradeCost,
  computeSkillUpgradeCost,
  getActiveSynergies,
  getCoreLevel,
  getCoreProgression,
  getEffectiveSkillLevel,
  getMaxSkillLevelForHero,
  isHeroSkillUnlocked,
} from '../engine/math';
import { FortressState } from '../types/game';
import { HeroPortrait } from './HeroPortrait';

interface HeroesViewProps {
  fortress: FortressState;
  onUpgradeHero: (heroId: string) => void;
  onUpgradeHeroSkill: (heroId: string) => void;
  onSelectTalent: (heroId: string, talentId: string) => void;
  onEquipRelic: (heroId: string, relicId: string) => void;
  onToggleSquadHero: (heroId: string) => void;
  onToggleDefenderHero: (heroId: string) => void;
}

export function HeroesView({
  fortress,
  onUpgradeHero,
  onUpgradeHeroSkill,
  onSelectTalent,
  onEquipRelic,
  onToggleSquadHero,
  onToggleDefenderHero,
}: HeroesViewProps) {
  const playableHeroes = useMemo(
    () => HEROES_CATALOG.filter((h) => h.playableInPhase1),
    []
  );
  const [selectedHeroId, setSelectedHeroId] = useState<string>(playableHeroes[0].id);

  const coreLevel = getCoreLevel(fortress.structures);
  const coreProg = getCoreProgression(coreLevel);
  const activeSynergies = useMemo(
    () => getActiveSynergies(fortress.attackSquadIds),
    [fortress.attackSquadIds]
  );

  const selectedHero =
    playableHeroes.find((h) => h.id === selectedHeroId) ?? playableHeroes[0];
  const selectedProgress = fortress.heroProgress[selectedHero.id];
  const selectedLevel = selectedProgress?.level ?? 1;
  const selectedSkillUnlocked = isHeroSkillUnlocked(selectedLevel);
  const selectedSkillLevel = getEffectiveSkillLevel(selectedProgress);
  const maxSkillForHero = getMaxSkillLevelForHero(selectedLevel);
  const selectedSkillPower = computeHeroSkillPower(
    selectedHero.id,
    Math.max(1, selectedSkillLevel)
  );
  const nextSkillPower = computeHeroSkillPower(
    selectedHero.id,
    Math.min(MAX_SKILL_LEVEL, Math.max(1, selectedSkillLevel) + 1)
  );
  const skillUpgradeCost = computeSkillUpgradeCost(Math.max(1, selectedSkillLevel));
  const canUpgradeSkill =
    selectedSkillUnlocked &&
    selectedSkillLevel < maxSkillForHero &&
    fortress.resources.essence >= skillUpgradeCost.essence &&
    fortress.resources.crystals >= skillUpgradeCost.crystals;

  const selectedStats = computeHeroStats(
    selectedHero,
    selectedProgress,
    fortress.attackSquadIds.includes(selectedHero.id) ? activeSynergies : [],
    fortress.balanceConfig
  );
  const upgradeCost = computeHeroUpgradeCost(selectedLevel);
  const canUpgradeHero =
    selectedLevel < MAX_HERO_LEVEL &&
    fortress.resources.essence >= upgradeCost.essence &&
    fortress.resources.gold >= upgradeCost.gold;

  const squadTotalPower = useMemo(() => {
    return fortress.attackSquadIds.reduce((sum, id) => {
      const h = playableHeroes.find((x) => x.id === id);
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
  }, [fortress, playableHeroes, activeSynergies]);

  return (
    <div className="flex-1 overflow-y-auto bg-[#151A22] px-6 py-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Squad & Synergies Header Bar */}
        <section className="bg-[#1F2631] border border-[#E5A93C]/25 rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-[#FFF8E7]">
                Esquadrão de Heróis e Sinergias
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Sem tropas descartáveis — combine classes complementares para ativar bônus táticos em toda a equipe.
              </p>
            </div>
            <div className="flex items-center gap-6 font-mono text-xs tabular-nums">
              <div>
                <span className="text-slate-400">Vagas de Ataque: </span>
                <strong className="text-[#F4C462]">
                  {fortress.attackSquadIds.length}/{coreProg.heroSlots}
                </strong>
              </div>
              <div>
                <span className="text-slate-400">Defensores da Base: </span>
                <strong className="text-[#38BDF8]">
                  {fortress.defenderHeroIds.length}/{coreProg.defenderSlots}
                </strong>
              </div>
              <div>
                <span className="text-slate-400">Poder do Esquadrão: </span>
                <strong className="text-[#FFF8E7]">{squadTotalPower}</strong>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            {/* Active Squad Slots */}
            <div className="lg:col-span-6 flex items-center gap-3 flex-wrap">
              {Array.from({ length: coreProg.heroSlots }).map((_, idx) => {
                const heroId = fortress.attackSquadIds[idx];
                const hero = playableHeroes.find((h) => h.id === heroId);
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border min-w-[140px] ${
                      hero
                        ? 'bg-[#151A22] border-[#E5A93C]/45'
                        : 'bg-[#151A22]/50 border-dashed border-white/15'
                    }`}
                  >
                    {hero ? (
                      <>
                        <HeroPortrait hero={hero} size="sm" />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">
                            {hero.name}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                            {hero.heroClass} · Nv.{fortress.heroProgress[hero.id]?.level ?? 1}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-slate-500 py-1.5">
                        Espaço {idx + 1} Livre
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Active Synergies Readout */}
            <div className="lg:col-span-6 bg-[#151A22] border border-white/10 rounded-lg p-3">
              <div className="text-xs font-semibold text-[#F4C462] mb-1.5 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                <span>Sinergias Ativas ({activeSynergies.length})</span>
              </div>
              {activeSynergies.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Mantenha Aegor (Tanque) e Sylva (Arquearia) juntos no esquadrão para ativar a sinergia Escudo e Flecha.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {activeSynergies.map((syn) => (
                    <div key={syn.id} className="text-xs flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-white">{syn.name}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-[#4ADE80] font-mono tabular-nums">
                        {syn.effectLabel}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Main 2-Column Roster & Hero Detail */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: 6 Playable Heroes Grid */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {playableHeroes.map((hero) => {
              const prog = fortress.heroProgress[hero.id];
              const inSquad = fortress.attackSquadIds.includes(hero.id);
              const isDefender = fortress.defenderHeroIds.includes(hero.id);
              const isSelected = hero.id === selectedHero.id;
              const stats = computeHeroStats(
                hero,
                prog,
                inSquad ? activeSynergies : [],
                fortress.balanceConfig
              );

              return (
                <button
                  key={hero.id}
                  onClick={() => setSelectedHeroId(hero.id)}
                  className={`text-left p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-[#28313F] border-[#E5A93C] shadow-lg'
                      : 'bg-[#1F2631] border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <HeroPortrait hero={hero} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="font-display text-sm font-bold text-[#FFF8E7] truncate">
                          {hero.name}
                        </span>
                        <span className="font-mono text-xs text-[#F4C462] tabular-nums shrink-0">
                          Nv.{prog?.level ?? 1}/{MAX_HERO_LEVEL}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {hero.heroClass} ·{' '}
                        {isHeroSkillUnlocked(prog?.level ?? 1)
                          ? `Hab. Nv.${getEffectiveSkillLevel(prog)}`
                          : `Hab. no Nv.${SKILL_UNLOCK_LEVEL}`}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono text-slate-300 tabular-nums">
                        <span>HP {stats.hp}</span>
                        <span aria-hidden="true">·</span>
                        <span>ATK {stats.attack}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px]">
                    <span className={inSquad ? 'text-[#4ADE80] font-semibold' : 'text-slate-500'}>
                      {inSquad ? 'No Esquadrão' : 'Reserva'}
                    </span>
                    <span className={isDefender ? 'text-[#38BDF8] font-semibold' : 'text-slate-500'}>
                      {isDefender ? 'Guardião de Altar' : 'Sem Guarda'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Selected Hero Deep Management */}
          <div className="lg:col-span-7 bg-[#1F2631] border border-white/10 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <HeroPortrait hero={selectedHero} size="lg" />
                <div>
                  <div className="text-xs text-[#F4C462] font-medium">
                    {selectedHero.heroClass} · {selectedHero.rarity} · Dano{' '}
                    {selectedHero.damageType === 'magico' ? 'Mágico' : 'Físico'}
                  </div>
                  <h3 className="font-display text-2xl font-bold text-[#FFF8E7] mt-0.5">
                    {selectedHero.name} — {selectedHero.title}
                  </h3>
                  <p className="text-xs text-slate-300 mt-1.5 max-w-xl leading-relaxed">
                    {selectedHero.lore}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons: Squad / Defender / Level Up */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-white/10">
              <button
                onClick={() => onToggleSquadHero(selectedHero.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  fortress.attackSquadIds.includes(selectedHero.id)
                    ? 'bg-[#22C55E] text-[#052E16]'
                    : 'bg-white/10 hover:bg-white/15 text-white'
                }`}
              >
                <Swords className="w-3.5 h-3.5" />
                <span>
                  {fortress.attackSquadIds.includes(selectedHero.id)
                    ? 'Remover do Esquadrão'
                    : 'Adicionar ao Esquadrão'}
                </span>
              </button>

              <button
                onClick={() => onToggleDefenderHero(selectedHero.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  fortress.defenderHeroIds.includes(selectedHero.id)
                    ? 'bg-[#38BDF8] text-[#082F49]'
                    : 'bg-white/10 hover:bg-white/15 text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>
                  {fortress.defenderHeroIds.includes(selectedHero.id)
                    ? 'Retirar da Defesa'
                    : 'Designar Defensor'}
                </span>
              </button>

              <button
                disabled={!canUpgradeHero}
                onClick={() => {
                  onUpgradeHero(selectedHero.id);
                  soundEngine.playUpgrade();
                }}
                className={`ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  canUpgradeHero
                    ? 'bg-[#E5A93C] hover:bg-[#F4C462] text-[#151A22]'
                    : 'bg-white/10 text-slate-400 cursor-not-allowed'
                }`}
              >
                <ArrowUpCircle className="w-4 h-4" />
                {selectedLevel >= MAX_HERO_LEVEL ? (
                  <span>Nível Máximo ({MAX_HERO_LEVEL})</span>
                ) : (
                  <span className="flex items-center gap-2 font-mono tabular-nums">
                    Subir para Nv.{selectedLevel + 1} · {upgradeCost.essence} E ·{' '}
                    {upgradeCost.gold} O
                  </span>
                )}
              </button>
            </div>

            {/* Hero Level Progress (1 to 100) + Per-Level Growth Preview */}
            <div className="bg-[#151A22] rounded-lg px-3.5 py-2.5 border border-white/8 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-mono font-semibold text-[#F4C462] tabular-nums">
                  Nível do Herói: {selectedLevel} / {MAX_HERO_LEVEL}
                </span>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  Ganho por nível: +{selectedHero.growthPerLevel.hp} Vida · +
                  {selectedHero.growthPerLevel.attack} ATQ · +{selectedHero.growthPerLevel.defense} DEF
                </span>
              </div>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#E5A93C] transition-all duration-200"
                  style={{ width: `${Math.min(100, (selectedLevel / MAX_HERO_LEVEL) * 100)}%` }}
                />
              </div>
            </div>

            {/* Attributes Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 bg-[#151A22] rounded-lg p-3.5 border border-white/8">
              <div>
                <div className="text-[11px] text-slate-400">Vida</div>
                <div className="font-mono text-sm font-semibold text-white tabular-nums mt-0.5">
                  {selectedStats.hp}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Ataque</div>
                <div className="font-mono text-sm font-semibold text-[#F4C462] tabular-nums mt-0.5">
                  {selectedStats.attack}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Defesa</div>
                <div className="font-mono text-sm font-semibold text-[#38BDF8] tabular-nums mt-0.5">
                  {selectedStats.defense}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Velocidade</div>
                <div className="font-mono text-sm font-semibold text-white tabular-nums mt-0.5">
                  {selectedStats.moveSpeed.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Alcance</div>
                <div className="font-mono text-sm font-semibold text-white tabular-nums mt-0.5">
                  {selectedStats.range.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Poder</div>
                <div className="font-mono text-sm font-semibold text-[#4ADE80] tabular-nums mt-0.5">
                  {selectedStats.powerScore}
                </div>
              </div>
            </div>

            {/* Unique Hero Skill (Unlocks at Lv.5, Upgradeable Skill Level 1..20) */}
            <div
              className={`p-4 rounded-lg border ${
                selectedSkillUnlocked
                  ? 'bg-[#151A22] border-[#E5A93C]/40'
                  : 'bg-[#151A22]/75 border-white/10'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {selectedSkillUnlocked ? (
                    <Zap className="w-4 h-4 text-[#F4C462]" />
                  ) : (
                    <Lock className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="text-xs font-bold text-[#FFF8E7]">
                    Habilidade Única · {selectedHero.ultimate.name}
                  </span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-[#F4C462]">
                  {selectedSkillUnlocked
                    ? `Nível da Habilidade ${selectedSkillLevel} / ${MAX_SKILL_LEVEL} · ${selectedHero.ultimate.energyCost} Energia`
                    : `Bloqueada · Libera no Nível ${SKILL_UNLOCK_LEVEL} (${selectedLevel}/${SKILL_UNLOCK_LEVEL})`}
                </span>
              </div>

              {!selectedSkillUnlocked ? (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Evolua {selectedHero.name} até o{' '}
                    <strong className="text-[#F4C462]">Nível {SKILL_UNLOCK_LEVEL}</strong> para
                    desbloquear esta habilidade em batalha e liberar melhorias de Nível de Habilidade.
                  </p>
                  <div className="text-[11px] text-slate-500">
                    Prévia (Nv.1): {selectedSkillPower.summary}
                  </div>
                </div>
              ) : (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="text-xs text-slate-200 leading-relaxed">
                      {selectedSkillPower.summary}
                    </p>
                    {selectedSkillLevel < MAX_SKILL_LEVEL && (
                      <div className="text-[11px] text-slate-400">
                        Próximo nível (Hab. Nv.{selectedSkillLevel + 1}): {nextSkillPower.summary}
                      </div>
                    )}
                  </div>

                  <button
                    disabled={!canUpgradeSkill}
                    onClick={() => {
                      onUpgradeHeroSkill(selectedHero.id);
                      soundEngine.playUpgrade();
                    }}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      canUpgradeSkill
                        ? 'bg-[#38BDF8] hover:bg-[#7DD3FC] text-[#082F49]'
                        : 'bg-white/10 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                    {selectedSkillLevel >= MAX_SKILL_LEVEL ? (
                      <span>Habilidade Máxima</span>
                    ) : selectedSkillLevel >= maxSkillForHero ? (
                      <span>Suba Herói p/ Nv.{selectedSkillLevel + 1}</span>
                    ) : (
                      <span className="font-mono tabular-nums">
                        Hab. Nv.{selectedSkillLevel + 1} · {skillUpgradeCost.essence} E ·{' '}
                        {skillUpgradeCost.crystals} C
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Talent Specialization & Relics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs font-semibold text-[#FFF8E7] mb-2">
                  Especialização de Talento
                </div>
                <div className="space-y-2">
                  {selectedHero.talents.map((talent) => {
                    const active = selectedProgress?.selectedTalentId === talent.id;
                    return (
                      <button
                        key={talent.id}
                        onClick={() => onSelectTalent(selectedHero.id, talent.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          active
                            ? 'bg-[#E5A93C]/12 border-[#E5A93C]/65'
                            : 'bg-[#151A22] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-white">
                          <span>{talent.name}</span>
                          {active && <Check className="w-3.5 h-3.5 text-[#F4C462]" />}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{talent.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-[#FFF8E7] mb-2">
                  Equipamento / Relíquia Ativa
                </div>
                <div className="space-y-2">
                  {selectedHero.relics.map((relic) => {
                    const active = selectedProgress?.equippedRelicId === relic.id;
                    return (
                      <button
                        key={relic.id}
                        onClick={() => onEquipRelic(selectedHero.id, relic.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          active
                            ? 'bg-[#38BDF8]/12 border-[#38BDF8]/65'
                            : 'bg-[#151A22] border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-white">
                          <span>
                            {relic.name}{' '}
                            <span className="text-slate-400 font-normal">· {relic.slot}</span>
                          </span>
                          {active && <Check className="w-3.5 h-3.5 text-[#38BDF8]" />}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{relic.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* AI & Counter Info */}
            <div className="pt-3 border-t border-white/10 text-xs text-slate-400 space-y-1">
              <div>
                <strong className="text-slate-200">Comportamento de IA:</strong>{' '}
                {selectedHero.aiBehaviorSummary}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  <strong className="text-[#4ADE80]">Forte contra:</strong> {selectedHero.strongAgainst}
                </span>
                <span>
                  <strong className="text-red-400">Vulnerável a:</strong> {selectedHero.weakAgainst}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
