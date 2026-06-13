/**
 * Model Aggregator
 *
 * Pipeline completo: ELO + Forma reciente + Poisson Dixon-Coles → probabilidades finales.
 *
 * Pesos configurables (calibrables desde el módulo de calibración):
 *   w_elo     = contribución del motor ELO
 *   w_poisson = contribución del modelo Poisson
 *   w_elo + w_poisson = 1.0
 *
 * Intervalos de confianza (±1σ de los λ estimados):
 *   Los goles esperados se estiman desde promedios históricos de N partidos.
 *   La incertidumbre en λ se propaga a través del modelo Poisson para obtener
 *   rangos de probabilidad. El componente ELO es determinístico (sin CI).
 *   Supuesto: N = 20 partidos para cada promedio de goles.
 */

import { winProbability }                        from "./elo.js";
import { expectedGoals, scoreMatrix,
         matchProbabilities, topScores }         from "./poisson.js";
import { formIndex, formFactor, formLabel,
         formDots }                              from "./form.js";
import { TEAMS_DATA }                            from "../data/teams.js";

export const DEFAULT_WEIGHTS = { elo: 0.45, poisson: 0.55 };
const N_SAMPLE = 20; // partidos asumidos para la estimación de λ

// ── Intervalo de confianza ──────────────────────────────────────────────────

/**
 * Error estándar del estimador de media Poisson: σ = sqrt(λ/N)
 * Aplicamos ±1σ (≈68% CI de los λ) y propagamos a probabilidades finales.
 * Retorna los rangos [low, high] para cada resultado.
 */
function computeCI(lambdaA, lambdaB, weights) {
  const seA = Math.sqrt(lambdaA / N_SAMPLE);
  const seB = Math.sqrt(lambdaB / N_SAMPLE);

  // Cuatro escenarios extremos de ±1σ en λ
  const scenarios = [
    [Math.max(0.05, lambdaA - seA), lambdaB + seB], // peor para A
    [lambdaA + seA, Math.max(0.05, lambdaB - seB)], // mejor para A
    [Math.max(0.05, lambdaA - seA), Math.max(0.05, lambdaB - seB)],
    [lambdaA + seA, lambdaB + seB],
  ];

  const probs = scenarios.map(([la, lb]) => {
    const m = scoreMatrix(la, lb);
    const p = matchProbabilities(m);
    // Aplicar el mismo blend ELO/Poisson (ELO no varía)
    return p; // devolvemos solo el componente Poisson para el CI
  });

  return {
    pA:    { low: Math.min(...probs.map(p => p.pA)),    high: Math.max(...probs.map(p => p.pA)) },
    pDraw: { low: Math.min(...probs.map(p => p.pDraw)), high: Math.max(...probs.map(p => p.pDraw)) },
    pB:    { low: Math.min(...probs.map(p => p.pB)),    high: Math.max(...probs.map(p => p.pB)) },
  };
}

// ── Análisis principal ──────────────────────────────────────────────────────

/**
 * Análisis completo de un partido entre dos selecciones en campo neutral.
 *
 * @param {object} teamA
 * @param {object} teamB
 * @param {object} [weights] — { elo, poisson } opcionales para calibración
 * @returns {MatchResult}
 */
export function analyzeMatch(teamA, teamB, weights = DEFAULT_WEIGHTS) {
  const { elo: W_ELO, poisson: W_POISSON } = weights;
  const globalAvg = TEAMS_DATA.globalAvgGoals;

  // ── 1. Forma reciente ──────────────────────────────────────────────
  const fiA = formIndex(teamA.recentResults);
  const fiB = formIndex(teamB.recentResults);
  const ffA = formFactor(fiA);
  const ffB = formFactor(fiB);

  // ── 2. ELO (campo neutral → sin bonus) ─────────────────────────────
  const pEloA = winProbability(teamA.elo, teamB.elo);
  const pEloB = 1 - pEloA;

  // ── 3. λ base + ajuste por forma ───────────────────────────────────
  const { lambdaA: baseLambdaA, lambdaB: baseLambdaB } =
    expectedGoals(teamA, teamB, globalAvg);

  const lambdaA = baseLambdaA * ffA;
  const lambdaB = baseLambdaB * ffB;

  // ── 4. Poisson Dixon-Coles → probabilidades ─────────────────────────
  const matrix  = scoreMatrix(lambdaA, lambdaB);
  const poisson = matchProbabilities(matrix);

  // ── 5. Normalizar ELO para incluir empate ────────────────────────────
  // ELO puro no modela empates. Tomamos la proporción de empate de Poisson
  // y redistribuimos el resto entre victoria A y B en la misma ratio ELO.
  const drawShare   = poisson.pDraw;
  const eloA_nodraw = pEloA * (1 - drawShare);
  const eloB_nodraw = pEloB * (1 - drawShare);

  // ── 6. Blend ponderado ───────────────────────────────────────────────
  const rawA    = W_ELO * eloA_nodraw + W_POISSON * poisson.pA;
  const rawDraw = W_ELO * drawShare   + W_POISSON * poisson.pDraw;
  const rawB    = W_ELO * eloB_nodraw + W_POISSON * poisson.pB;

  // ── 7. Renormalización final ─────────────────────────────────────────
  const total    = rawA + rawDraw + rawB;
  const probA    = rawA    / total;
  const probDraw = rawDraw / total;
  const probB    = rawB    / total;

  // ── 8. Intervalos de confianza (±1σ sobre λ) ─────────────────────────
  const ci = computeCI(lambdaA, lambdaB, weights);

  return {
    probA, probDraw, probB,
    lambdaA, lambdaB,
    ci,
    formA: { index: fiA, factor: ffA, label: formLabel(fiA), dots: formDots(teamA.recentResults) },
    formB: { index: fiB, factor: ffB, label: formLabel(fiB), dots: formDots(teamB.recentResults) },
    elo: { ratingA: teamA.elo, ratingB: teamB.elo, pA: pEloA, pB: pEloB },
    poisson,
    topScores: topScores(matrix),
    breakdown: {
      weights: { elo: W_ELO, poisson: W_POISSON },
      eloComponent:     { pA: eloA_nodraw, pDraw: drawShare, pB: eloB_nodraw },
      poissonComponent: poisson,
      lambdaBase:       { a: baseLambdaA, b: baseLambdaB },
      lambdaAdjusted:   { a: lambdaA, b: lambdaB },
    },
  };
}
