/**
 * Suite de Validación Matemática — Mundial Stats
 *
 * Verifica invariantes matemáticos de todos los modelos del sistema.
 * No tiene dependencias del DOM. Ejecutar desde la consola del navegador:
 *
 *   import('/js/models/validation.js').then(m => m.runAllTests())
 *
 * O desde main.js durante desarrollo:
 *   import { runAllTests } from './models/validation.js';
 *   runAllTests();
 *
 * Devuelve { passed, failed, total, report[] } y loguea en consola.
 */

import {
  winProbability,
  drawProbability,
  threeWayProbabilities,
  ELO_DRAW_BASE,
  ELO_DRAW_DECAY,
} from "./elo.js";

import {
  scoreMatrix,
  scoreMatrixRaw,
  matchProbabilities,
  expectedGoalsFromMatrix,
  marginalDistributions,
  overUnder,
  bothTeamsScore,
  goalDistributionStats,
  MAX_GOALS,
  RHO,
} from "./poisson.js";

import { formIndex, formFactor } from "./form.js";
import { analyzeMatch, DEFAULT_WEIGHTS } from "./aggregator.js";
import { getTeamById } from "../data/teams.js";

// ── Framework mínimo de test ──────────────────────────────────────────────────

const TOL = 1e-6; // tolerancia para igualdad numérica

function near(a, b, tol = TOL) {
  return Math.abs(a - b) <= tol;
}

function between(x, lo, hi) {
  return x >= lo - TOL && x <= hi + TOL;
}

function assert(condition, message, actual = undefined) {
  return { pass: Boolean(condition), message, actual };
}

// ── Datos de prueba fijos ─────────────────────────────────────────────────────

const TEAM_STRONG = {
  id: "__test_strong__",
  elo: 1900, avgGoalsFor: 2.0, avgGoalsAgainst: 0.8,
  recentResults: ["W", "W", "W", "W", "W"],
};

const TEAM_WEAK = {
  id: "__test_weak__",
  elo: 1500, avgGoalsFor: 1.0, avgGoalsAgainst: 1.6,
  recentResults: ["L", "L", "L", "L", "L"],
};

const TEAM_EQUAL_A = {
  id: "__test_eqA__",
  elo: 1700, avgGoalsFor: 1.4, avgGoalsAgainst: 1.1,
  recentResults: ["W", "D", "L", "W", "D"],
};

const TEAM_EQUAL_B = {
  id: "__test_eqB__",
  elo: 1700, avgGoalsFor: 1.4, avgGoalsAgainst: 1.1,
  recentResults: ["W", "D", "L", "W", "D"],
};

// ── Tests ELO ────────────────────────────────────────────────────────────────

function testsELO() {
  const tests = [];

  // 1. Equipos iguales → P(A gana) = 0.5 exacto
  const p50 = winProbability(1700, 1700);
  tests.push(assert(
    near(p50, 0.5),
    "Equipos iguales → winProbability = 0.500",
    p50.toFixed(6),
  ));

  // 2. +400 pts → P ≈ 10/11 ≈ 0.9091
  const p400 = winProbability(2100, 1700);
  tests.push(assert(
    near(p400, 10 / 11, 0.0001),
    "+400 pts → winProbability ≈ 0.9091",
    p400.toFixed(4),
  ));

  // 3. La probabilidad está siempre en (0, 1)
  const pExtreme = winProbability(2200, 1300);
  tests.push(assert(
    pExtreme > 0 && pExtreme < 1,
    "winProbability siempre ∈ (0, 1) incluso para diferencias extremas",
    pExtreme.toFixed(4),
  ));

  // 4. drawProbability máxima para ΔR = 0
  const pDrawEqual   = drawProbability(1700, 1700);
  const pDrawUnequal = drawProbability(1900, 1700);
  tests.push(assert(
    near(pDrawEqual, ELO_DRAW_BASE) && pDrawEqual > pDrawUnequal,
    `drawProbability(ΔR=0) = D₀ = ${ELO_DRAW_BASE} y > P_draw(ΔR=200)`,
    `${pDrawEqual.toFixed(4)} > ${pDrawUnequal.toFixed(4)}`,
  ));

  // 5. P(empate) decrece monotónicamente con |ΔR|
  const pD0   = drawProbability(1700, 1700);
  const pD100 = drawProbability(1800, 1700);
  const pD200 = drawProbability(1900, 1700);
  const pD400 = drawProbability(2100, 1700);
  tests.push(assert(
    pD0 > pD100 && pD100 > pD200 && pD200 > pD400,
    "drawProbability monotónicamente decreciente con |ΔR|",
    `ΔR=0:${pD0.toFixed(3)} ΔR=100:${pD100.toFixed(3)} ΔR=200:${pD200.toFixed(3)} ΔR=400:${pD400.toFixed(3)}`,
  ));

  // 6. threeWayProbabilities suma a 1.0
  const tw = threeWayProbabilities(1900, 1700);
  const sum3 = tw.pA + tw.pDraw + tw.pB;
  tests.push(assert(
    near(sum3, 1.0),
    "threeWayProbabilities: pA + pDraw + pB = 1.000",
    `suma = ${sum3.toFixed(8)}`,
  ));

  // 7. threeWayProbabilities es simétrico: invertir teams invierte pA ↔ pB
  const twAB = threeWayProbabilities(1900, 1700);
  const twBA = threeWayProbabilities(1700, 1900);
  tests.push(assert(
    near(twAB.pA, twBA.pB) && near(twAB.pB, twBA.pA) && near(twAB.pDraw, twBA.pDraw),
    "Simetría ELO: invertir equipos intercambia pA ↔ pB, mantiene pDraw",
    `twAB.pA=${twAB.pA.toFixed(4)} ≈ twBA.pB=${twBA.pB.toFixed(4)}`,
  ));

  // 8. pA > pB cuando ratingA > ratingB
  tests.push(assert(
    tw.pA > tw.pB,
    "El equipo de mayor ELO tiene pA > pB",
    `pA=${tw.pA.toFixed(4)} > pB=${tw.pB.toFixed(4)}`,
  ));

  return tests;
}

// ── Tests Poisson ─────────────────────────────────────────────────────────────

function testsPoisson() {
  const tests = [];
  const lambdaA = 1.6, lambdaB = 1.1;
  const m  = scoreMatrix(lambdaA, lambdaB);
  const mr = scoreMatrixRaw(lambdaA, lambdaB);

  // 9. scoreMatrix (DC) suma a 1.0
  let sum = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      sum += m[i][j];
  tests.push(assert(
    near(sum, 1.0, 1e-9),
    "scoreMatrix (Dixon-Coles) suma a 1.0 (δ < 1e-9)",
    `suma = ${sum.toFixed(10)}`,
  ));

  // 10. scoreMatrixRaw suma a 1.0
  let sumR = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      sumR += mr[i][j];
  tests.push(assert(
    near(sumR, 1.0, 1e-9),
    "scoreMatrixRaw (Poisson puro) suma a 1.0 (δ < 1e-9)",
    `suma = ${sumR.toFixed(10)}`,
  ));

  // 11. Equipos iguales → P(A gana) = P(B gana) (simetría perfecta)
  const mSym = scoreMatrix(1.4, 1.4);
  const probsSym = matchProbabilities(mSym);
  tests.push(assert(
    near(probsSym.pA, probsSym.pB, 1e-9),
    "Equipos simétricos (λ_A = λ_B) → P(A gana) = P(B gana)",
    `pA=${probsSym.pA.toFixed(6)}, pB=${probsSym.pB.toFixed(6)}`,
  ));

  // 12. Dixon-Coles sube P(0-0) respecto al Poisson puro
  tests.push(assert(
    m[0][0] > mr[0][0],
    "Dixon-Coles: P(0-0)_DC > P(0-0)_raw — corrección boost empate vacío",
    `P(0-0)_DC=${m[0][0].toFixed(5)} > P(0-0)_raw=${mr[0][0].toFixed(5)}`,
  ));

  // 13. Dixon-Coles baja P(1-0) respecto al Poisson puro (ρ < 0)
  tests.push(assert(
    m[1][0] < mr[1][0],
    "Dixon-Coles: P(1-0)_DC < P(1-0)_raw — corrección reduce victoria mínima",
    `P(1-0)_DC=${m[1][0].toFixed(5)} < P(1-0)_raw=${mr[1][0].toFixed(5)}`,
  ));

  // 14. expectedGoalsFromMatrix ≈ λ input (error < 0.01 por truncación)
  const { expA, expB } = expectedGoalsFromMatrix(m);
  tests.push(assert(
    Math.abs(expA - lambdaA) < 0.01 && Math.abs(expB - lambdaB) < 0.01,
    `expectedGoalsFromMatrix ≈ (λ_A=${lambdaA}, λ_B=${lambdaB}) ± 0.01 (truncación)`,
    `recuperado=(${expA.toFixed(3)}, ${expB.toFixed(3)})`,
  ));

  // 15. Distribuciones marginales suman a 1.0 cada una
  const { A: margA, B: margB } = marginalDistributions(m);
  const sumMargA = margA.reduce((s, x) => s + x, 0);
  const sumMargB = margB.reduce((s, x) => s + x, 0);
  tests.push(assert(
    near(sumMargA, 1.0) && near(sumMargB, 1.0),
    "marginalDistributions: Σ_A = 1.0 y Σ_B = 1.0",
    `Σ_A=${sumMargA.toFixed(8)}, Σ_B=${sumMargB.toFixed(8)}`,
  ));

  // 16. overUnder(2.5): pOver + pUnder = 1.0
  const ou = overUnder(m, 2.5);
  tests.push(assert(
    near(ou.pOver + ou.pUnder, 1.0),
    "overUnder(2.5): pOver + pUnder = 1.000",
    `pOver=${ou.pOver.toFixed(4)}, pUnder=${ou.pUnder.toFixed(4)}`,
  ));

  // 17. bothTeamsScore ∈ [0, 1] y < 1 (no siempre ambos anotan)
  const bts = bothTeamsScore(m);
  tests.push(assert(
    bts >= 0 && bts <= 1,
    `bothTeamsScore ∈ [0, 1], valor razonable para λ=(${lambdaA}, ${lambdaB})`,
    bts.toFixed(4),
  ));

  // 18. goalDistributionStats: media > 0, varianza > 0, stddev ≈ sqrt(varianza)
  const gs = goalDistributionStats(m);
  tests.push(assert(
    gs.mean > 0 && gs.variance > 0 && near(gs.stddev, Math.sqrt(gs.variance)),
    "goalDistributionStats: media > 0, varianza > 0, stddev = sqrt(varianza)",
    `media=${gs.mean.toFixed(3)}, σ=${gs.stddev.toFixed(3)}`,
  ));

  // 19. Todos los valores de la matriz son ≥ 0 (no hay probabilidades negativas)
  let hasNegative = false;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      if (m[i][j] < 0) hasNegative = true;
  tests.push(assert(
    !hasNegative,
    "Todos los valores de scoreMatrix son ≥ 0 (Dixon-Coles no produce negativos)",
  ));

  return tests;
}

// ── Tests Forma ───────────────────────────────────────────────────────────────

function testsForm() {
  const tests = [];

  // 20. Todo victorias → índice = 1.0 exacto (Σ w_i * 1.0 / Σ w_i = 1.0)
  const allW = Array(10).fill("W");
  tests.push(assert(
    near(formIndex(allW), 1.0),
    "Todas victorias → formIndex = 1.000 exacto",
    formIndex(allW).toFixed(6),
  ));

  // 21. Todo derrotas → índice = 0.0 exacto
  const allL = Array(10).fill("L");
  tests.push(assert(
    near(formIndex(allL), 0.0),
    "Todas derrotas → formIndex = 0.000 exacto",
    formIndex(allL).toFixed(6),
  ));

  // 22. formFactor(0.5) = 1.00 exacto (0.85 + 0.5 * 0.30 = 1.00)
  tests.push(assert(
    near(formFactor(0.5), 1.00),
    "formFactor(0.5) = 1.000 exacto — forma neutral no modifica λ",
    formFactor(0.5).toFixed(6),
  ));

  // 23. formFactor(1.0) = 1.15 exacto
  tests.push(assert(
    near(formFactor(1.0), 1.15),
    "formFactor(1.0) = 1.150 exacto — forma perfecta aumenta λ un 15%",
    formFactor(1.0).toFixed(6),
  ));

  // 24. formFactor(0.0) = 0.85 exacto
  tests.push(assert(
    near(formFactor(0.0), 0.85),
    "formFactor(0.0) = 0.850 exacto — forma terrible reduce λ un 15%",
    formFactor(0.0).toFixed(6),
  ));

  // 25. formIndex con resultados vacíos → 0.5 (neutral por defecto)
  tests.push(assert(
    near(formIndex([]), 0.5),
    "formIndex([]) = 0.500 — sin datos, neutral por defecto",
    formIndex([]).toFixed(6),
  ));

  return tests;
}

// ── Tests Agregador ───────────────────────────────────────────────────────────

function testsAggregator() {
  const tests = [];

  // 26. Probabilidades finales suman a 1.0
  const result = analyzeMatch(TEAM_STRONG, TEAM_WEAK);
  const sumFinal = result.probA + result.probDraw + result.probB;
  tests.push(assert(
    near(sumFinal, 1.0),
    "Probabilidades finales: pA + pDraw + pB = 1.000",
    `suma = ${sumFinal.toFixed(8)}`,
  ));

  // 27. El equipo más fuerte tiene mayor probabilidad de victoria
  tests.push(assert(
    result.probA > result.probB,
    "El equipo más fuerte (mayor ELO + mejor forma) tiene probA > probB",
    `pA=${result.probA.toFixed(4)}, pB=${result.probB.toFixed(4)}`,
  ));

  // 28. Partido simétrico → pA ≈ pB
  const rSym = analyzeMatch(TEAM_EQUAL_A, TEAM_EQUAL_B);
  tests.push(assert(
    near(rSym.probA, rSym.probB, 1e-8),
    "Partido perfectamente simétrico (mismos stats) → pA = pB",
    `pA=${rSym.probA.toFixed(6)}, pB=${rSym.probB.toFixed(6)}`,
  ));

  // 29. Pesos (1, 0) → resultado ELO puro (pA, pDraw, pB exactamente)
  const rEloOnly = analyzeMatch(TEAM_STRONG, TEAM_WEAK, { elo: 1.0, poisson: 0.0 });
  const eloRef   = threeWayProbabilities(TEAM_STRONG.elo, TEAM_WEAK.elo);
  tests.push(assert(
    near(rEloOnly.probA, eloRef.pA, 1e-6) &&
    near(rEloOnly.probDraw, eloRef.pDraw, 1e-6) &&
    near(rEloOnly.probB, eloRef.pB, 1e-6),
    "Pesos (1, 0): resultado idéntico al ELO three-way puro",
    `probDraw_agg=${rEloOnly.probDraw.toFixed(4)}, pDraw_elo=${eloRef.pDraw.toFixed(4)}`,
  ));

  // 30. Pesos (0, 1) → resultado Poisson puro
  const rPoisOnly = analyzeMatch(TEAM_STRONG, TEAM_WEAK, { elo: 0.0, poisson: 1.0 });
  const { probA: pA_poi, probDraw: pD_poi, probB: pB_poi } = rPoisOnly;
  const sumPoi = pA_poi + pD_poi + pB_poi;
  tests.push(assert(
    near(sumPoi, 1.0) &&
    near(pA_poi, rPoisOnly.poisson.pA) &&
    near(pD_poi, rPoisOnly.poisson.pDraw),
    "Pesos (0, 1): resultado idéntico al Poisson DC puro",
    `pDraw_final=${pD_poi.toFixed(4)}, pDraw_poisson=${rPoisOnly.poisson.pDraw.toFixed(4)}`,
  ));

  // 31. CI: pA.low ≤ probA ≤ pA.high para los tres resultados
  const ciOK = (
    result.ci.pA.low    <= result.probA    + TOL &&
    result.ci.pA.high   >= result.probA    - TOL &&
    result.ci.pDraw.low <= result.probDraw + TOL &&
    result.ci.pDraw.high >= result.probDraw - TOL &&
    result.ci.pB.low    <= result.probB    + TOL &&
    result.ci.pB.high   >= result.probB    - TOL
  );
  tests.push(assert(
    ciOK,
    "CI: low ≤ central ≤ high para los tres resultados",
    `pA ∈ [${result.ci.pA.low.toFixed(3)}, ${result.ci.pA.high.toFixed(3)}] central=${result.probA.toFixed(3)}`,
  ));

  // 32. Normalización robusta: pesos que no suman 1 son corregidos
  let warned = false;
  const origWarn = console.warn;
  console.warn = () => { warned = true; };
  const rBadWeights = analyzeMatch(TEAM_EQUAL_A, TEAM_EQUAL_B, { elo: 0.6, poisson: 0.8 });
  console.warn = origWarn;
  const sumBad = rBadWeights.probA + rBadWeights.probDraw + rBadWeights.probB;
  tests.push(assert(
    warned && near(sumBad, 1.0),
    "Pesos incorrectos: se emite console.warn y resultado sigue sumando 1.0",
    `warned=${warned}, suma=${sumBad.toFixed(8)}`,
  ));

  // 33. derivedStats contiene todos los campos esperados
  const fields = ["overUnder25", "overUnder15", "bothTeamsScore", "goalStats", "goalsFromMatrix"];
  const allFields = fields.every(f => result.derivedStats[f] !== undefined);
  tests.push(assert(
    allFields,
    "derivedStats contiene: overUnder25, overUnder15, bothTeamsScore, goalStats, goalsFromMatrix",
  ));

  return tests;
}

// ── Runner principal ──────────────────────────────────────────────────────────

export function runAllTests() {
  const sections = [
    { name: "ELO",       fn: testsELO,        icon: "⚡" },
    { name: "POISSON",   fn: testsPoisson,     icon: "📊" },
    { name: "FORMA",     fn: testsForm,        icon: "📈" },
    { name: "AGREGADOR", fn: testsAggregator,  icon: "🔀" },
  ];

  let totalPassed = 0, totalFailed = 0;
  const allResults = [];

  console.group("════════════ VALIDACIÓN MATEMÁTICA — Mundial Stats ════════════");

  for (const { name, fn, icon } of sections) {
    const tests = fn();
    const passed = tests.filter(t => t.pass).length;
    const failed = tests.length - passed;
    totalPassed += passed;
    totalFailed += failed;

    console.group(`${icon} [${name}] — ${passed}/${tests.length} ✓`);
    for (const t of tests) {
      const symbol = t.pass ? "✓" : "✗";
      const style  = t.pass ? "color: #3fb950" : "color: #f85149; font-weight: bold";
      const suffix = t.actual !== undefined ? `  →  ${t.actual}` : "";
      console.log(`%c  ${symbol} ${t.message}${suffix}`, style);
    }
    console.groupEnd();

    allResults.push(...tests.map(t => ({ ...t, section: name })));
  }

  const total  = totalPassed + totalFailed;
  const status = totalFailed === 0 ? "✅ TODAS LAS PRUEBAS PASARON" : `❌ ${totalFailed} PRUEBA(S) FALLARON`;
  console.log(`\n${status} — ${totalPassed}/${total}`);
  console.groupEnd();

  return {
    passed:  totalPassed,
    failed:  totalFailed,
    total,
    success: totalFailed === 0,
    results: allResults,
  };
}

/**
 * Comparación cuantitativa entre el viejo manejo de empate y el nuevo.
 * Muestra exactamente cuánto diferían las probabilidades de empate.
 *
 * Para reproducir el problema resuelto en este commit:
 *   import('/js/models/validation.js').then(m => m.compareDrawHandling())
 */
export function compareDrawHandling() {
  const rA = { elo: 1900, avgGoalsFor: 2.0, avgGoalsAgainst: 0.9, recentResults: ["W","W","D"] };
  const rB = { elo: 1700, avgGoalsFor: 1.4, avgGoalsAgainst: 1.2, recentResults: ["L","W","D"] };

  const w = DEFAULT_WEIGHTS;

  // Nuevo (correcto): ELO aporta su propio P_draw
  const eloProbs  = threeWayProbabilities(rA.elo, rB.elo);
  const newResult = analyzeMatch(rA, rB, w);

  // Simulación del viejo comportamiento: drawShare 100% de Poisson
  const oldDraw = newResult.poisson.pDraw; // el draw que usaba antes el ELO

  console.group("📐 Comparación: manejo del empate — viejo vs nuevo");
  console.log("Diferencia de rating: ΔR =", rA.elo - rB.elo, "pts");
  console.log("");
  console.log("─── VIEJO (drawShare prestado de Poisson) ───────────────");
  console.log(`  P_draw_ELO_viejo  =  Poisson.pDraw = ${oldDraw.toFixed(4)}`);
  console.log(`  P_draw_final = ${w.elo}×${oldDraw.toFixed(4)} + ${w.poisson}×${oldDraw.toFixed(4)} = ${oldDraw.toFixed(4)} (¡ELO ignorado!)`);
  console.log("");
  console.log("─── NUEVO (ELO con modelo gaussiano de empate) ──────────");
  console.log(`  P_draw_ELO_nuevo  =  D₀·exp(−k·(ΔR/400)²) = ${eloProbs.pDraw.toFixed(4)}`);
  console.log(`  P_draw_Poisson    =  ${newResult.poisson.pDraw.toFixed(4)}`);
  console.log(`  P_draw_final = ${w.elo}×${eloProbs.pDraw.toFixed(4)} + ${w.poisson}×${newResult.poisson.pDraw.toFixed(4)} = ${newResult.probDraw.toFixed(4)}`);
  console.log("");
  console.log("─── Diferencia ─────────────────────────────────────────");
  console.log(`  ΔP_draw = ${Math.abs(newResult.probDraw - oldDraw).toFixed(4)} (${((Math.abs(newResult.probDraw - oldDraw) / oldDraw) * 100).toFixed(1)}%)`);
  console.groupEnd();

  return {
    old: { draw: oldDraw },
    new: { draw: newResult.probDraw, eloDraw: eloProbs.pDraw, poissonDraw: newResult.poisson.pDraw },
    diff: Math.abs(newResult.probDraw - oldDraw),
  };
}
