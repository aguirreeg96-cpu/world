/**
 * Model Aggregator — con manejo correcto del empate
 *
 * ── Problema del diseño anterior ────────────────────────────────────────────
 *
 * En la versión previa el empate se "tomaba prestado" del componente Poisson:
 *
 *   rawDraw = W_ELO × poisson.pDraw + W_POISSON × poisson.pDraw
 *           = poisson.pDraw × (W_ELO + W_POISSON)
 *           = poisson.pDraw                              ← ELO ignorado
 *
 * Con W_ELO = 0.9 y W_POISSON = 0.1, la probabilidad de empate seguía
 * siendo 100% Poisson. Esto viola la semántica de los pesos.
 *
 * ── Solución ─────────────────────────────────────────────────────────────────
 *
 * ELO ahora produce su propio triplete { pA, pDraw, pB } mediante el modelo
 * de empate gaussiano calibrado en elo.js. El blend es un promedio ponderado
 * genuino de dos distribuciones de probabilidad completas:
 *
 *   P_final(X) = W_ELO × P_ELO(X) + W_POISSON × P_Poisson_DC(X)
 *
 * Invariante: P(A) + P_draw + P(B) = 1.0 antes y después del blend.
 * La renormalización final es solo protección contra errores numéricos.
 *
 * ── Pesos y calibración ──────────────────────────────────────────────────────
 *
 * Los DEFAULT_WEIGHTS son un punto de partida. El módulo calibrator.js
 * realiza un grid search sobre datos históricos para encontrar los pesos
 * óptimos minimizando el Brier Score.
 */

import { winProbability, threeWayProbabilities }               from "./elo.js";
import { expectedGoals, scoreMatrix, matchProbabilities,
         topScores, overUnder, bothTeamsScore,
         goalDistributionStats, expectedGoalsFromMatrix }     from "./poisson.js";
import { formIndex, formFactor, formLabel, formDots }         from "./form.js";
import { TEAMS_DATA }                                         from "../data/teams.js";

export const DEFAULT_WEIGHTS = { elo: 0.45, poisson: 0.55 };
const N_SAMPLE = 20; // partidos asumidos para estimar promedios de goles

// ── Validación de pesos ──────────────────────────────────────────────────────

function normalizeWeights(weights) {
  const sum = (weights.elo ?? 0) + (weights.poisson ?? 0);
  if (sum <= 0) throw new Error("Los pesos deben ser positivos");
  if (Math.abs(sum - 1.0) > 1e-4) {
    console.warn(`[aggregator] Pesos no suman 1.0 (Σ=${sum.toFixed(4)}). Renormalizando.`);
    return { elo: weights.elo / sum, poisson: weights.poisson / sum };
  }
  return weights;
}

// ── Intervalo de confianza ───────────────────────────────────────────────────

/**
 * Propaga la incertidumbre de los λ estimados (±1σ = sqrt(λ/N))
 * a través del modelo Poisson y del blend final.
 *
 * Se evalúan 4 escenarios extremos de λ (las 4 esquinas del rectángulo ±1σ).
 * El CI del blend incluye tanto el componente Poisson (variable) como el
 * componente ELO (constante). El rango resultante es conservador por diseño.
 */
function computeCI(lambdaA, lambdaB, eloProbs, weights) {
  const seA = Math.sqrt(lambdaA / N_SAMPLE);
  const seB = Math.sqrt(lambdaB / N_SAMPLE);
  const { elo: W_ELO, poisson: W_POI } = weights;

  const scenarios = [
    [Math.max(0.05, lambdaA - seA), lambdaB + seB],
    [lambdaA + seA, Math.max(0.05, lambdaB - seB)],
    [Math.max(0.05, lambdaA - seA), Math.max(0.05, lambdaB - seB)],
    [lambdaA + seA, lambdaB + seB],
  ];

  const blended = scenarios.map(([la, lb]) => {
    const poi  = matchProbabilities(scoreMatrix(la, lb));
    const total = 1; // already normalized
    return {
      pA:    (W_ELO * eloProbs.pA    + W_POI * poi.pA),
      pDraw: (W_ELO * eloProbs.pDraw + W_POI * poi.pDraw),
      pB:    (W_ELO * eloProbs.pB    + W_POI * poi.pB),
    };
  });

  return {
    pA:    { low: Math.min(...blended.map(p => p.pA)),    high: Math.max(...blended.map(p => p.pA)) },
    pDraw: { low: Math.min(...blended.map(p => p.pDraw)), high: Math.max(...blended.map(p => p.pDraw)) },
    pB:    { low: Math.min(...blended.map(p => p.pB)),    high: Math.max(...blended.map(p => p.pB)) },
  };
}

// ── Análisis principal ───────────────────────────────────────────────────────

/**
 * Análisis completo de un partido entre teamA y teamB en campo neutro.
 *
 * @param {object} teamA
 * @param {object} teamB
 * @param {object} [weights]  — { elo, poisson } opcionales para calibración
 * @returns {MatchResult}
 */
export function analyzeMatch(teamA, teamB, weights = DEFAULT_WEIGHTS) {
  const w        = normalizeWeights(weights);
  const W_ELO    = w.elo;
  const W_POI    = w.poisson;
  const globalAvg = TEAMS_DATA.globalAvgGoals;

  // ── 1. Forma reciente ───────────────────────────────────────────────
  const fiA = formIndex(teamA.recentResults);
  const fiB = formIndex(teamB.recentResults);
  const ffA = formFactor(fiA);
  const ffB = formFactor(fiB);

  // ── 2. ELO → triplete propio (pA, pDraw, pB) ───────────────────────
  //    threeWayProbabilities garantiza pA + pDraw + pB = 1.0
  const eloProbs = threeWayProbabilities(teamA.elo, teamB.elo);

  // ── 3. Poisson DC → goles esperados + matriz ────────────────────────
  const { lambdaA: baseLambdaA, lambdaB: baseLambdaB } =
    expectedGoals(teamA, teamB, globalAvg);

  const lambdaA  = baseLambdaA * ffA;
  const lambdaB  = baseLambdaB * ffB;
  const matrix   = scoreMatrix(lambdaA, lambdaB);
  const poisson  = matchProbabilities(matrix);

  // ── 4. Blend: promedio ponderado de dos distribuciones ──────────────
  //    Ambas distribuciones suman 1.0 → el blend también suma 1.0 exacto.
  const rawA    = W_ELO * eloProbs.pA    + W_POI * poisson.pA;
  const rawDraw = W_ELO * eloProbs.pDraw + W_POI * poisson.pDraw;
  const rawB    = W_ELO * eloProbs.pB    + W_POI * poisson.pB;

  // ── 5. Renormalización de seguridad (errores de punto flotante) ──────
  const total    = rawA + rawDraw + rawB;
  const probA    = rawA    / total;
  const probDraw = rawDraw / total;
  const probB    = rawB    / total;

  // ── 6. Estadísticas derivadas de la matriz ───────────────────────────
  const derivedStats = {
    overUnder25:      overUnder(matrix, 2.5),
    overUnder15:      overUnder(matrix, 1.5),
    bothTeamsScore:   bothTeamsScore(matrix),
    goalStats:        goalDistributionStats(matrix),
    goalsFromMatrix:  expectedGoalsFromMatrix(matrix),
  };

  // ── 7. Intervalo de confianza ────────────────────────────────────────
  const ci = computeCI(lambdaA, lambdaB, eloProbs, w);

  return {
    probA, probDraw, probB,
    lambdaA, lambdaB,
    ci,
    derivedStats,
    formA: { index: fiA, factor: ffA, label: formLabel(fiA), dots: formDots(teamA.recentResults) },
    formB: { index: fiB, factor: ffB, label: formLabel(fiB), dots: formDots(teamB.recentResults) },
    elo: {
      ratingA:  teamA.elo,
      ratingB:  teamB.elo,
      pWinA:    winProbability(teamA.elo, teamB.elo), // 2-way (para la fórmula logística)
      pA:       eloProbs.pA,                          // 3-way (Victoria A en blend)
      pDraw:    eloProbs.pDraw,                       // 3-way (Empate ELO)
      pB:       eloProbs.pB,                          // 3-way (Victoria B en blend)
    },
    poisson,
    topScores: topScores(matrix),
    breakdown: {
      weights:          w,
      eloComponent:     eloProbs,
      poissonComponent: poisson,
      lambdaBase:       { a: baseLambdaA, b: baseLambdaB },
      lambdaAdjusted:   { a: lambdaA, b: lambdaB },
    },
  };
}
