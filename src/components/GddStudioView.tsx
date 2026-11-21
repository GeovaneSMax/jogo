import { useMemo, useState } from 'react';
import {
  BookOpen,
  Calculator,
  Cpu,
  RotateCcw,
  Shield,
  Sliders,
  Swords,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  DEFAULT_BALANCE_CONFIG,
  HEROES_CATALOG,
  PROGRESSION_TABLE,
  STRUCTURES_CATALOG,
  SYNERGIES_CATALOG,
} from '../data/gameCatalog';
import { computeMitigatedDamage, simulateBalanceMatchup } from '../engine/math';
import { BalanceConfig, HeroClass, StructureType } from '../types/game';
import { HeroPortrait } from './HeroPortrait';

interface GddStudioViewProps {
  balanceConfig: BalanceConfig;
  onUpdateBalance: (next: BalanceConfig) => void;
  onSimulateOfflineJump: (hours: number) => void;
}

type GddSection =
  | 'overview'
  | 'heroes'
  | 'defenses'
  | 'progression'
  | 'math'
  | 'architecture'
  | 'simulator';

const NAV_ITEMS: Array<{ id: GddSection; label: string; icon: typeof BookOpen }> = [
  { id: 'overview', label: '01. Visão & Regras', icon: BookOpen },
  { id: 'heroes', label: '02. 2 Heróis & Sinergia', icon: Users },
  { id: 'defenses', label: '03. Defesas & Contras', icon: Shield },
  { id: 'progression', label: '04. Progressão & Custos', icon: TrendingUp },
  { id: 'math', label: '05. Matemática do Combate', icon: Calculator },
  { id: 'architecture', label: '06. Arquitetura & Fases', icon: Cpu },
  { id: 'simulator', label: '07. Estúdio de Balanceamento', icon: Sliders },
];

const HERO_CLASSES: Array<'TODAS' | HeroClass> = ['TODAS', 'TANQUE', 'ATIRADOR'];

const ACTIVE_DEFENSE_TYPES: StructureType[] = [
  'archer_tower',
  'cannon',
  'arcane_tower',
  'electric_tower',
  'ice_tower',
  'poison_tower',
];

export function GddStudioView({
  balanceConfig,
  onUpdateBalance,
  onSimulateOfflineJump,
}: GddStudioViewProps) {
  const [section, setSection] = useState<GddSection>('overview');
  const [classFilter, setClassFilter] = useState<'TODAS' | HeroClass>('TODAS');

  // Simulator state
  const [simHeroIds, setSimHeroIds] = useState<string[]>(['aegor', 'sylva']);
  const [simHeroLevel, setSimHeroLevel] = useState<number>(3);
  const [simTowerLevel, setSimTowerLevel] = useState<number>(3);
  const [simDefenses, setSimDefenses] = useState<StructureType[]>([
    'archer_tower',
    'cannon',
    'arcane_tower',
    'electric_tower',
    'ice_tower',
  ]);

  const filteredHeroes = useMemo(() => {
    if (classFilter === 'TODAS') return HEROES_CATALOG;
    return HEROES_CATALOG.filter((h) => h.heroClass === classFilter);
  }, [classFilter]);

  const simResult = useMemo(
    () =>
      simulateBalanceMatchup({
        heroIds: simHeroIds,
        heroLevel: simHeroLevel,
        defenses: simDefenses.map((type) => ({ type, level: simTowerLevel })),
        balance: balanceConfig,
      }),
    [simHeroIds, simHeroLevel, simDefenses, simTowerLevel, balanceConfig]
  );

  const toggleSimHero = (id: string) => {
    setSimHeroIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  const addSimDefense = (type: StructureType) => {
    if (simDefenses.length >= 10) return;
    setSimDefenses((prev) => [...prev, type]);
  };

  const removeSimDefense = (idx: number) => {
    setSimDefenses((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#F8F5EE] text-[#1C2026]">
      {/* Left Navigation Sidebar */}
      <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-[#1C2026]/10 bg-[#EFE9DC] p-4 overflow-x-auto md:overflow-y-auto">
        <div className="hidden md:block pb-3 mb-3 border-b border-[#1C2026]/10">
          <div className="text-xs font-medium text-[#7C5A21]">Documento Oficial</div>
          <h2 className="font-display text-lg font-bold text-[#1C2026] mt-0.5">
            GDD & Balanceamento
          </h2>
          <p className="text-xs text-[#525866] mt-1">
            Especificação consolidada da Primeira Entrega + ajuste vivo de parâmetros.
          </p>
        </div>

        <nav className="flex md:flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#1C2026] text-[#F8F5EE]'
                    : 'text-[#3F4652] hover:bg-[#1C2026]/8 hover:text-[#1C2026]'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="hidden md:block mt-6 pt-4 border-t border-[#1C2026]/10 space-y-2">
          <div className="text-xs font-semibold text-[#1C2026]">Teste de Economia Offline</div>
          <p className="text-[11px] text-[#525866] leading-relaxed">
            Avance o relógio local para validar a coleta de retorno offline com teto de {balanceConfig.offlineCapHours}h.
          </p>
          <button
            onClick={() => onSimulateOfflineJump(2)}
            className="w-full px-3 py-2 rounded-lg bg-[#D99B26] hover:bg-[#C0861A] text-white text-xs font-semibold transition-colors"
          >
            Simular +2h Offline
          </button>
        </div>
      </aside>

      {/* Main Content Reading Area */}
      <main className="flex-1 overflow-y-auto px-6 py-8 md:px-10">
        <div className="max-w-5xl mx-auto space-y-8">
          {/* ===================== 01. OVERVIEW & RULES ===================== */}
          {section === 'overview' && (
            <>
              <header className="space-y-2 pb-5 border-b border-[#1C2026]/10">
                <div className="text-xs font-semibold text-[#8C621B]">
                  Game Design Document Consolidado · Android Landscape · Free-to-Play Justo
                </div>
                <h1 className="font-display text-3xl font-bold text-[#1C2026]">
                  Heroes Clash — Identidade, Loop e Regras Inegociáveis
                </h1>
                <p className="text-sm text-[#424854] leading-relaxed max-w-3xl">
                  Heroes Clash é um jogo de estratégia isométrico 2D e progressão incremental onde{' '}
                  <strong>não existem tropas descartáveis</strong>. Cada unidade ofensiva e cada guarda defensivo é um herói colecionável com identidade, IA modular, sinergias e habilidade suprema ativada no segundo decisivo.
                </p>
              </header>

              <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-[#1C2026]/10 rounded-xl p-5 space-y-3">
                  <h3 className="font-display text-base font-bold text-[#1C2026]">
                    Loop Principal de 10 Etapas
                  </h3>
                  <ol className="space-y-1.5 text-xs text-[#374151] list-decimal list-inside leading-relaxed">
                    <li>Coletar Ouro, Cristais e Essência produzidos na fortaleza (online e offline).</li>
                    <li>Investir recursos em novas estruturas, muralhas, armadilhas e melhorias.</li>
                    <li>Evoluir heróis individualmente (nível, talentos, relíquias e ascensão).</li>
                    <li>Montar esquadrão (2 → 5 vagas) buscando sinergias entre classes.</li>
                    <li>Buscar fortalezas adversárias dentro da faixa justa de matchmaking.</li>
                    <li>Inspecionar alcances, contra-jogadas e heróis defensores no mapa.</li>
                    <li>Definir pontos de entrada e disparar Habilidades Supremas manualmente.</li>
                    <li>Receber recompensas proporcionais às estrelas (1–3) e destruição.</li>
                    <li>Reforçar a fortaleza e salvar até 3 layouts defensivos alternativos.</li>
                    <li>Subir ligas (Bronze → Lendário), participar de Clãs e Temporadas de 30 dias.</li>
                  </ol>
                </div>

                <div className="bg-white border border-[#1C2026]/10 rounded-xl p-5 space-y-3">
                  <h3 className="font-display text-base font-bold text-[#1C2026]">
                    Retenção Respeitosa e Monetização Ética
                  </h3>
                  <ul className="space-y-2 text-xs text-[#374151] leading-relaxed">
                    <li>
                      <strong>Zero Pay-to-Win:</strong> Raridade não cria abismo estatístico — heróis Comuns (Aegor, Elowen) permanecem essenciais em composições endgame.
                    </li>
                    <li>
                      <strong>Sem duplicatas obrigatórias:</strong> Heróis evoluem com Essência obtida jogando, em missões e na Fonte de Essência.
                    </li>
                    <li>
                      <strong>Cosméticos & Conveniência:</strong> Skins, decorações de fortaleza, molduras de liga e Passe de Temporada com trilha gratuita robusta.
                    </li>
                    <li>
                      <strong>Respeito ao tempo:</strong> Produção offline de até 8h, recompensas de retorno e ausência total de anúncios forçados entre batalhas.
                    </li>
                  </ul>
                </div>
              </section>

              <section className="bg-[#EFE9DC] border border-[#1C2026]/10 rounded-xl p-5 space-y-3">
                <h3 className="font-display text-base font-bold text-[#1C2026]">
                  12 Regras Inegociáveis do Projeto
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-xs text-[#2B303A]">
                  <div>01. Não existem tropas convencionais nem exércitos descartáveis.</div>
                  <div>02. Nenhum modo (incluindo Guerras de Clã) adiciona soldados genéricos.</div>
                  <div>03. Todo combate gira em torno de heróis únicos e estruturas defensivas.</div>
                  <div>04. Cada herói possui IA distinta, papel claro e contra-jogadas reais.</div>
                  <div>05. Liberdade total para construir, mover e salvar layouts da fortaleza.</div>
                  <div>06. Estratégia e sinergia superam poder bruto ou gasto financeiro.</div>
                  <div>07. Arquitetura otimizada para Android em modo paisagem (landscape).</div>
                  <div>08. Interface limpa, intuitiva e de leitura instantânea em combate.</div>
                  <div>09. Código modular e tabela centralizada de balanceamento.</div>
                  <div>10. Sistemas entregues de forma funcional, nunca telas estáticas vazias.</div>
                  <div>11. Zero simulação enganosa de multiplayer online na Fase 1.</div>
                  <div>12. Validação autoritativa no servidor antes do lançamento multiplayer.</div>
                </div>
              </section>
            </>
          )}

          {/* ===================== 02. 12 HEROES & SYNERGIES ===================== */}
          {section === 'heroes' && (
            <>
              <header className="space-y-3 pb-4 border-b border-[#1C2026]/10">
                <h1 className="font-display text-3xl font-bold text-[#1C2026]">
                  Os 2 Heróis Iniciais e Sinergia
                </h1>
                <p className="text-sm text-[#424854]">
                  Foco total no núcleo tático clássico: 1 Tanque com muita vida para trancar dano (Aegor) e 1 Arquearia de vida baixa com altíssimo dano em alvo único (Sylva).
                </p>

                {/* Functional Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#EFE9DC] rounded-lg w-fit">
                  {HERO_CLASSES.map((cls) => (
                    <button
                      key={cls}
                      onClick={() => setClassFilter(cls)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        classFilter === cls
                          ? 'bg-[#1C2026] text-white'
                          : 'text-[#424854] hover:text-[#1C2026]'
                      }`}
                    >
                      {cls}
                    </button>
                  ))}
                </div>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredHeroes.map((hero) => (
                  <article
                    key={hero.id}
                    className="bg-white border border-[#1C2026]/10 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex items-start gap-3.5">
                      <HeroPortrait hero={hero} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="font-display text-base font-bold text-[#1C2026]">
                            {hero.name} — {hero.title}
                          </h3>
                          <span className="text-[11px] font-mono font-semibold text-[#8C621B] shrink-0">
                            {hero.playableInPhase1 ? 'Jogável Fase 1' : 'Catálogo / Simulador'}
                          </span>
                        </div>
                        <div className="text-xs text-[#525866] mt-0.5">
                          {hero.heroClass} · {hero.rarity} · Dano{' '}
                          {hero.damageType === 'magico' ? 'Mágico' : 'Físico'}
                        </div>
                        <p className="text-xs text-[#424854] mt-1.5 leading-relaxed">
                          {hero.lore}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-2 bg-[#F8F5EE] rounded-lg p-2.5 text-center font-mono text-xs tabular-nums">
                      <div>
                        <div className="text-[10px] text-[#64748B]">HP</div>
                        <div className="font-semibold">{hero.baseStats.hp}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#64748B]">ATK</div>
                        <div className="font-semibold">{hero.baseStats.attack}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#64748B]">DEF</div>
                        <div className="font-semibold">{hero.baseStats.defense}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#64748B]">VEL</div>
                        <div className="font-semibold">{hero.baseStats.moveSpeed}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[#64748B]">ALC</div>
                        <div className="font-semibold">{hero.baseStats.range}</div>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-[#374151]">
                      <div>
                        <strong>Passiva ({hero.passive.name}):</strong> {hero.passive.description}
                      </div>
                      <div>
                        <strong>Suprema ({hero.ultimate.name}):</strong> {hero.ultimate.description}
                      </div>
                      <div className="text-[#525866]">
                        <strong>IA:</strong> {hero.aiBehaviorSummary}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#1C2026]/8 flex flex-wrap justify-between gap-2 text-[11px]">
                      <span className="text-emerald-700">
                        <strong>Vantagem:</strong> {hero.strongAgainst}
                      </span>
                      <span className="text-red-700">
                        <strong>Fraqueza:</strong> {hero.weakAgainst}
                      </span>
                    </div>
                  </article>
                ))}
              </div>

              <section className="bg-white border border-[#1C2026]/10 rounded-xl p-5 space-y-3">
                <h3 className="font-display text-lg font-bold text-[#1C2026]">
                  Matriz de Sinergias Estratégicas
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SYNERGIES_CATALOG.map((syn) => (
                    <div
                      key={syn.id}
                      className="p-3.5 rounded-lg bg-[#F8F5EE] border border-[#1C2026]/8 space-y-1"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-xs text-[#1C2026]">{syn.name}</span>
                        <span className="font-mono text-[11px] text-emerald-700 font-semibold">
                          {syn.effectLabel}
                        </span>
                      </div>
                      <p className="text-xs text-[#525866]">{syn.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* ===================== 03. DEFENSES & COUNTERS ===================== */}
          {section === 'defenses' && (
            <>
              <header className="space-y-2 pb-4 border-b border-[#1C2026]/10">
                <h1 className="font-display text-3xl font-bold text-[#1C2026]">
                  Estruturas Defensivas e Interações Estratégicas
                </h1>
                <p className="text-sm text-[#424854]">
                  A defesa é metade do jogo: cada torre pune uma classe específica e cria escolhas reais de posicionamento na grade 12×12, complementada por Heróis Defensores offline.
                </p>
              </header>

              <div className="overflow-x-auto bg-white border border-[#1C2026]/10 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#EFE9DC] text-[#374151] font-semibold">
                    <tr>
                      <th className="px-4 py-3">Estrutura</th>
                      <th className="px-3 py-3 text-right">HP Base</th>
                      <th className="px-3 py-3 text-right">Dano</th>
                      <th className="px-3 py-3 text-right">Cadência</th>
                      <th className="px-3 py-3 text-right">Alcance</th>
                      <th className="px-4 py-3">Mecânica / Contra-Jogada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C2026]/8">
                    {Object.values(STRUCTURES_CATALOG).map((st) => (
                      <tr key={st.type} className="hover:bg-[#F8F5EE]/70">
                        <td className="px-4 py-3 font-semibold text-[#1C2026]">
                          <div>{st.name}</div>
                          <div className="text-[11px] font-normal text-[#64748B]">
                            Custo base: {st.baseCost.gold} O
                            {st.baseCost.crystals > 0 ? ` · ${st.baseCost.crystals} C` : ''}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">{st.baseHp}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {st.damage > 0 ? st.damage : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {st.attackSpeed > 0 ? `${st.attackSpeed.toFixed(2)}/s` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {st.range > 0 ? st.range.toFixed(1) : '—'}
                        </td>
                        <td className="px-4 py-3 text-[#374151]">
                          <div>{st.specialEffect ?? st.description}</div>
                          {st.strongAgainst && (
                            <div className="text-[11px] text-[#64748B] mt-0.5">
                              Forte vs: {st.strongAgainst} · Fraca vs: {st.weakAgainst}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ===================== 04. PROGRESSION & COSTS ===================== */}
          {section === 'progression' && (
            <>
              <header className="space-y-2 pb-4 border-b border-[#1C2026]/10">
                <h1 className="font-display text-3xl font-bold text-[#1C2026]">
                  Tabela de Progressão, Custos e Economia Idle
                </h1>
                <p className="text-sm text-[#424854]">
                  Escala controlada de 10 níveis do Núcleo da Fortaleza com desbloqueio gradual dos espaços de heróis (2 → 3 → 4 → 5) e tempos de evolução calibrados para evitar paredes de espera abusivas.
                </p>
              </header>

              <div className="overflow-x-auto bg-white border border-[#1C2026]/10 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#EFE9DC] text-[#374151] font-semibold">
                    <tr>
                      <th className="px-4 py-3">Núcleo</th>
                      <th className="px-3 py-3 text-right">Heróis Ataque</th>
                      <th className="px-3 py-3 text-right">Defensores</th>
                      <th className="px-3 py-3 text-right">Máx Defesas</th>
                      <th className="px-3 py-3 text-right">Custo Ouro</th>
                      <th className="px-3 py-3 text-right">Custo Cristais</th>
                      <th className="px-3 py-3 text-right">Tempo</th>
                      <th className="px-4 py-3">Desbloqueios</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C2026]/8">
                    {PROGRESSION_TABLE.map((row) => (
                      <tr key={row.coreLevel} className="hover:bg-[#F8F5EE]/70">
                        <td className="px-4 py-3 font-mono font-bold">Nv.{row.coreLevel}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          {row.heroSlots}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {row.defenderSlots}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {row.maxActiveDefenses}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {row.upgradeGold.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {row.upgradeCrystals.toLocaleString('pt-BR')}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">
                          {row.upgradeTimeLabel}
                        </td>
                        <td className="px-4 py-3 text-[#374151]">{row.unlockHighlight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-[#1C2026]/10 rounded-xl p-4 space-y-1.5">
                  <h3 className="font-semibold text-sm text-[#8C621B]">Ouro</h3>
                  <p className="text-xs text-[#424854] leading-relaxed">
                    Produzido na Mina de Ouro (48/min base, +45% por nível) e saques. Financia construções, muralhas e melhorias estruturais.
                  </p>
                </div>
                <div className="bg-white border border-[#1C2026]/10 rounded-xl p-4 space-y-1.5">
                  <h3 className="font-semibold text-sm text-sky-700">Cristais</h3>
                  <p className="text-xs text-[#424854] leading-relaxed">
                    Extraídos na Mina de Cristais (24/min base). Alimenta torres arcanas/elétricas, upgrades do Núcleo e forja de relíquias.
                  </p>
                </div>
                <div className="bg-white border border-[#1C2026]/10 rounded-xl p-4 space-y-1.5">
                  <h3 className="font-semibold text-sm text-emerald-700">Essência</h3>
                  <p className="text-xs text-[#424854] leading-relaxed">
                    Condensada na Fonte de Essência (22/min base) e vitórias. Recurso dedicado à evolução de nível dos heróis sem gacha de cópias.
                  </p>
                </div>
              </section>
            </>
          )}

          {/* ===================== 05. COMBAT MATH ===================== */}
          {section === 'math' && (
            <>
              <header className="space-y-2 pb-4 border-b border-[#1C2026]/10">
                <h1 className="font-display text-3xl font-bold text-[#1C2026]">
                  Funcionamento Matemático do Combate
                </h1>
                <p className="text-sm text-[#424854]">
                  Fórmulas determinísticas e assintóticas garantem equilíbrio de longo prazo e permitem validação idêntica no cliente Unity e no servidor autoritativo.
                </p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="bg-white border border-[#1C2026]/10 rounded-xl p-5 space-y-3">
                  <h3 className="font-display text-base font-bold">1. Mitigação de Defesa</h3>
                  <pre className="bg-[#1C2026] text-[#F4C462] font-mono text-xs p-3.5 rounded-lg overflow-x-auto">
{`DanoEfetivo = round(
  DanoBruto * MultTático * (K / (K + DefesaEfetiva))
)
// Padrão atual: K = ${balanceConfig.defenseMitigationK}`}
                  </pre>
                  <p className="text-xs text-[#424854] leading-relaxed">
                    Com <code>K = {balanceConfig.defenseMitigationK}</code>, cada ponto de defesa oferece retorno linear em Vida Efetiva (+1% EHP por ponto), impedindo imunidade absoluta ou explosões de dano.
                  </p>
                  <div className="text-xs font-mono tabular-nums bg-[#F8F5EE] p-3 rounded-lg space-y-1">
                    <div>
                      Exemplo (100 Dano Bruto vs 0 DEF):{' '}
                      <strong>{computeMitigatedDamage(100, 0, 1, balanceConfig)}</strong>
                    </div>
                    <div>
                      Exemplo (100 Dano Bruto vs 50 DEF):{' '}
                      <strong>{computeMitigatedDamage(100, 50, 1, balanceConfig)}</strong>
                    </div>
                    <div>
                      Exemplo (Canhão 112 vs Aegor 62 DEF, x{balanceConfig.cannonVsTankMultiplier}):{' '}
                      <strong>
                        {computeMitigatedDamage(
                          112,
                          62,
                          balanceConfig.cannonVsTankMultiplier,
                          balanceConfig
                        )}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-[#1C2026]/10 rounded-xl p-5 space-y-3">
                  <h3 className="font-display text-base font-bold">
                    2. Economia de Energia & Supremas
                  </h3>
                  <pre className="bg-[#1C2026] text-[#38BDF8] font-mono text-xs p-3.5 rounded-lg overflow-x-auto">
{`EnergiaInicial = 25 / 100
PorAtaque      = +${balanceConfig.energyPerAttack} * MultSinergiaTalento
PorDanoSofrido = +${balanceConfig.energyPerHitTaken}
TorreElétrica  = -12 Energia por disparo`}
                  </pre>
                  <p className="text-xs text-[#424854] leading-relaxed">
                    Ao atingir 100 de Energia, o jogador ativa manualmente a Suprema (clique ou teclas <code>1–5</code>). O timing exato — como disparar a Barreira de Aegor antes de um disparo da Torre Arcana ou a Tempestade de Zarek antes da entrada de Kael — decide batalhas de poder equivalente.
                  </p>
                </div>

                <div className="bg-white border border-[#1C2026]/10 rounded-xl p-5 space-y-3">
                  <h3 className="font-display text-base font-bold">
                    3. Condições de Estrelas e Saque
                  </h3>
                  <ul className="space-y-1.5 text-xs text-[#374151]">
                    <li>
                      <strong>1 Estrela (Vitória):</strong> Destruir ≥50% das estruturas contabilizáveis OU destruir o Núcleo da Fortaleza.
                    </li>
                    <li>
                      <strong>2 Estrelas:</strong> Destruir ≥50% das estruturas E destruir o Núcleo da Fortaleza.
                    </li>
                    <li>
                      <strong>3 Estrelas (Vitória Total):</strong> 100% de destruição (muralhas e armadilhas não bloqueiam 100%).
                    </li>
                    <li>
                      <strong>Limite de Tempo:</strong> 90 segundos por ataque, com passo fixo determinístico.
                    </li>
                  </ul>
                </div>

                <div className="bg-white border border-[#1C2026]/10 rounded-xl p-5 space-y-3">
                  <h3 className="font-display text-base font-bold">4. Fórmula de Produção Offline</h3>
                  <pre className="bg-[#1C2026] text-[#4ADE80] font-mono text-xs p-3.5 rounded-lg overflow-x-auto">
{`MinutosEfetivos = min(DeltaMinutos, ${balanceConfig.offlineCapHours} * 60)
RecursoGerado   = min(
  CapacidadeArmazem - EstoqueAtual,
  floor(TaxaPorMinuto * MinutosEfetivos)
)`}
                  </pre>
                  <p className="text-xs text-[#424854] leading-relaxed">
                    O relógio é validado contra retrocessos e limitado ao teto configurável ({balanceConfig.offlineCapHours}h), incentivando retornos confortáveis sem exigir login compulsivo.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* ===================== 06. ARCHITECTURE & ROADMAP ===================== */}
          {section === 'architecture' && (
            <>
              <header className="space-y-2 pb-4 border-b border-[#1C2026]/10">
                <h1 className="font-display text-3xl font-bold text-[#1C2026]">
                  Arquitetura Técnica (Unity C# + Backend Autoritativo) e Roadmap
                </h1>
                <p className="text-sm text-[#424854]">
                  Separação estrita entre simulação determinística, apresentação isométrica e autoridade de servidor — impedindo manipulação de resultados no cliente Android.
                </p>
              </header>

              <pre className="bg-[#1C2026] text-[#E2E8F0] font-mono text-xs p-5 rounded-xl overflow-x-auto leading-relaxed">
{`┌─────────────────────────────────────────────────────────────────────────────┐
│                    CLIENTE MOBILE (UNITY C# · ANDROID)                      │
│  [UI Landscape] ──► [View Isométrica 2D] ──► [Input Buffer: Entradas + Ults]│
│                                                       │                     │
│                                   Compartilha núcleo determinístico (C#)    │
│                                                       ▼                     │
│                      [Núcleo Puro de Combate + IA Modular por Classe]       │
└───────────────────────────────────────┬─────────────────────────────────────┘
                                        │ Envia apenas: Seed + Comandos + Ticks
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   BACKEND AUTORITATIVO (MULTIPLAYER ASSÍNCRONO)             │
│  [API Gateway / Auth] ──► [Validador de Replay Determinístico (Headless)]   │
│  [Matchmaking por Poder]  [Economia & Anti-Duplicação]  [Ranking & Clãs]    │
│  [Configuração Remota de Balanceamento (JSON Versionado)]                   │
└─────────────────────────────────────────────────────────────────────────────┘`}
              </pre>

              <section className="space-y-3">
                <h3 className="font-display text-lg font-bold text-[#1C2026]">
                  Roadmap em 5 Fases (Escopo MVP → Produto Comercial)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {[
                    {
                      phase: 'Fase 1 — MVP',
                      status: 'Entregue neste protótipo',
                      items: 'Fortaleza 12×12, produção idle/offline, 6 heróis, 6 defesas, IA modular, supremas manuais e 5 desafios.',
                    },
                    {
                      phase: 'Fase 2 — Progressão',
                      status: 'Próxima etapa',
                      items: '12 heróis jogáveis, árvore de talentos expandida, forja de relíquias, ascensão e missões diárias.',
                    },
                    {
                      phase: 'Fase 3 — Multiplayer',
                      status: 'Backend autoritativo',
                      items: 'Contas em nuvem, ataques assíncronos reais, validação de replay no servidor, escudo pós-ataque e ranking.',
                    },
                    {
                      phase: 'Fase 4 — Competição',
                      status: 'Comunidade',
                      items: 'Ligas (Bronze → Lendário), temporadas de 30 dias, Clãs, Guerras entre Clãs (só heróis) e chefes.',
                    },
                    {
                      phase: 'Fase 5 — Comercial',
                      status: 'Google Play',
                      items: 'Skins cosméticas, Passe de Temporada justo, telemetria de balanceamento, notificações e otimização Android.',
                    },
                  ].map((p, idx) => (
                    <div
                      key={p.phase}
                      className={`p-4 rounded-xl border space-y-1.5 ${
                        idx === 0
                          ? 'bg-[#1C2026] text-[#F8F5EE] border-[#D99B26]'
                          : 'bg-white text-[#1C2026] border-[#1C2026]/10'
                      }`}
                    >
                      <div className="font-display text-xs font-bold">{p.phase}</div>
                      <div
                        className={`text-[11px] font-mono ${
                          idx === 0 ? 'text-[#F4C462]' : 'text-[#8C621B]'
                        }`}
                      >
                        {p.status}
                      </div>
                      <p
                        className={`text-xs leading-relaxed ${
                          idx === 0 ? 'text-slate-300' : 'text-[#424854]'
                        }`}
                      >
                        {p.items}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* ===================== 07. BALANCE STUDIO & SIMULATOR ===================== */}
          {section === 'simulator' && (
            <>
              <header className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-[#1C2026]/10">
                <div>
                  <h1 className="font-display text-3xl font-bold text-[#1C2026]">
                    Estúdio de Balanceamento Centralizado
                  </h1>
                  <p className="text-sm text-[#424854] mt-1">
                    Qualquer ajuste feito nos controles abaixo atualiza em tempo real tanto o simulador matemático quanto o protótipo jogável.
                  </p>
                </div>
                <button
                  onClick={() => onUpdateBalance({ ...DEFAULT_BALANCE_CONFIG })}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#EFE9DC] hover:bg-[#E4DAC7] text-xs font-semibold text-[#1C2026] border border-[#1C2026]/12 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restaurar Padrão</span>
                </button>
              </header>

              {/* Centralized Tunable Parameters */}
              <section className="bg-white border border-[#1C2026]/10 rounded-xl p-5 space-y-4">
                <h3 className="font-display text-base font-bold">
                  Tabela Central de Variáveis (Afeta o Jogo ao Vivo)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {[
                    {
                      key: 'defenseMitigationK' as const,
                      label: 'Constante de Mitigação (K)',
                      min: 50,
                      max: 200,
                      step: 5,
                      fmt: (v: number) => `${v}`,
                    },
                    {
                      key: 'cannonVsTankMultiplier' as const,
                      label: 'Bônus Canhão vs Tanque',
                      min: 1.0,
                      max: 2.0,
                      step: 0.05,
                      fmt: (v: number) => `x${v.toFixed(2)}`,
                    },
                    {
                      key: 'iceSlowFactor' as const,
                      label: 'Velocidade sob Torre de Gelo',
                      min: 0.4,
                      max: 0.9,
                      step: 0.05,
                      fmt: (v: number) => `${Math.round(v * 100)}%`,
                    },
                    {
                      key: 'heroDamageMultiplier' as const,
                      label: 'Multiplicador Global de Heróis',
                      min: 0.6,
                      max: 1.6,
                      step: 0.05,
                      fmt: (v: number) => `x${v.toFixed(2)}`,
                    },
                    {
                      key: 'defenseDamageMultiplier' as const,
                      label: 'Multiplicador Global de Defesas',
                      min: 0.6,
                      max: 1.6,
                      step: 0.05,
                      fmt: (v: number) => `x${v.toFixed(2)}`,
                    },
                    {
                      key: 'resourceProdMultiplier' as const,
                      label: 'Taxa Global de Produção Idle',
                      min: 0.5,
                      max: 3.0,
                      step: 0.25,
                      fmt: (v: number) => `x${v.toFixed(2)}`,
                    },
                  ].map((ctrl) => (
                    <label key={ctrl.key} className="block space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#374151]">{ctrl.label}</span>
                        <span className="font-mono font-bold text-[#8C621B] tabular-nums">
                          {ctrl.fmt(balanceConfig[ctrl.key])}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={ctrl.min}
                        max={ctrl.max}
                        step={ctrl.step}
                        value={balanceConfig[ctrl.key]}
                        onChange={(e) =>
                          onUpdateBalance({
                            ...balanceConfig,
                            [ctrl.key]: Number(e.target.value),
                          })
                        }
                        className="w-full accent-[#D99B26] cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </section>

              {/* Interactive Matchup Simulator */}
              <section className="bg-white border border-[#1C2026]/10 rounded-xl p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-display text-base font-bold flex items-center gap-2">
                      <Swords className="w-4 h-4 text-[#8C621B]" />
                      <span>Simulador de Composição (Tanque + Arquearia vs Defesas)</span>
                    </h3>
                    <p className="text-xs text-[#525866] mt-0.5">
                      Teste Aegor e Sylva contra qualquer combinação de até 10 estruturas defensivas.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
                    <label className="flex items-center gap-2">
                      <span>Nv. Heróis:</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={simHeroLevel}
                        onChange={(e) => setSimHeroLevel(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                        className="w-14 px-2 py-1 rounded border border-[#1C2026]/20 bg-[#F8F5EE] text-center"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span>Nv. Torres:</span>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={simTowerLevel}
                        onChange={(e) => setSimTowerLevel(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                        className="w-14 px-2 py-1 rounded border border-[#1C2026]/20 bg-[#F8F5EE] text-center"
                      />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* Hero Picker (all 12) */}
                  <div className="lg:col-span-6 space-y-2">
                    <div className="text-xs font-semibold text-[#374151]">
                      Selecione Heróis ({simHeroIds.length}/2)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {HEROES_CATALOG.map((h) => {
                        const active = simHeroIds.includes(h.id);
                        return (
                          <button
                            key={h.id}
                            onClick={() => toggleSimHero(h.id)}
                            className={`px-2.5 py-2 rounded-lg border text-left text-xs transition-colors ${
                              active
                                ? 'bg-[#1C2026] text-white border-[#1C2026]'
                                : 'bg-[#F8F5EE] text-[#1C2026] border-[#1C2026]/12 hover:border-[#1C2026]/35'
                            }`}
                          >
                            <div className="font-semibold truncate">{h.name}</div>
                            <div
                              className={`text-[10px] ${
                                active ? 'text-[#F4C462]' : 'text-[#64748B]'
                              }`}
                            >
                              {h.heroClass}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Defense Matrix Picker */}
                  <div className="lg:col-span-6 space-y-2">
                    <div className="text-xs font-semibold text-[#374151]">
                      Adicionar Defesas ({simDefenses.length}/10)
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ACTIVE_DEFENSE_TYPES.map((type) => (
                        <button
                          key={type}
                          onClick={() => addSimDefense(type)}
                          className="px-2.5 py-1.5 rounded-md bg-[#EFE9DC] hover:bg-[#E4DAC7] text-xs font-medium text-[#1C2026] border border-[#1C2026]/10 whitespace-nowrap shrink-0"
                        >
                          + {STRUCTURES_CATALOG[type].shortName}
                        </button>
                      ))}
                    </div>

                    <div className="bg-[#F8F5EE] rounded-lg p-3 min-h-[84px] border border-[#1C2026]/10 flex flex-wrap gap-2 content-start">
                      {simDefenses.length === 0 ? (
                        <span className="text-xs text-[#64748B]">
                          Clique nos botões acima para montar a defesa simulada.
                        </span>
                      ) : (
                        simDefenses.map((type, idx) => (
                          <button
                            key={`${type}_${idx}`}
                            onClick={() => removeSimDefense(idx)}
                            title="Clique para remover"
                            className="px-2.5 py-1 rounded bg-white border border-[#1C2026]/15 text-xs font-medium text-[#1C2026] hover:border-red-500 hover:text-red-700"
                          >
                            {STRUCTURES_CATALOG[type].shortName} ×
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Live Simulation Result */}
                <div className="bg-[#1C2026] text-[#F8F5EE] rounded-xl p-5 grid grid-cols-2 md:grid-cols-5 gap-4 items-center">
                  <div>
                    <div className="text-[11px] text-slate-400">Resultado Previsto</div>
                    <div
                      className={`font-display text-lg font-bold mt-0.5 ${
                        simResult.winOutcome === 'Vitória' ? 'text-[#4ADE80]' : 'text-red-400'
                      }`}
                    >
                      {simResult.winOutcome}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Duração Estimada</div>
                    <div className="font-mono text-base font-semibold tabular-nums mt-0.5">
                      {simResult.estimatedSeconds}s
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">DPS Efetivo Heróis</div>
                    <div className="font-mono text-base font-semibold text-[#F4C462] tabular-nums mt-0.5">
                      {simResult.teamEffectiveDps}/s
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">DPS Efetivo Defesas</div>
                    <div className="font-mono text-base font-semibold text-[#38BDF8] tabular-nums mt-0.5">
                      {simResult.defenseEffectiveDps}/s
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Sobreviventes / Destr.</div>
                    <div className="font-mono text-base font-semibold tabular-nums mt-0.5">
                      {simResult.survivingHeroes}/{simResult.totalHeroes} ·{' '}
                      {simResult.destructionEstimatePct}%
                    </div>
                  </div>

                  <div className="col-span-2 md:col-span-5 pt-3 border-t border-white/10 text-xs text-slate-300 space-y-1">
                    {simResult.tacticalNotes.map((note, idx) => (
                      <div key={idx}>• {note}</div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
