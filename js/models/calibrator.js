/**
 * Calibrator — Backtesting y calibración del modelo híbrido ELO + Poisson
 *
 * ── Interfaz pública ──────────────────────────────────────────────────────────
 *
 *   brierScore(predicted, actual)  — Brier Score 3-way para un partido
 *   runBacktest(weights)           — Backtest completo sobre MATCHES_MOCK
 *   findBestWeights()              — Grid search → { elo, poisson, score }
 *   calibrateWeights()             — Compat. con main.js → array ordenado
 *
 * ── Grid search ───────────────────────────────────────────────────────────────
 *
 *   elo ∈ [0.2, 0.7]  paso 0.05  (11 puntos)
 *   poisson = 1 − elo
 *
 * ── Dataset ───────────────────────────────────────────────────────────────────
 *
 *   js/data/matches_mock.js — 20 partidos { home, away, goalsHome, goalsAway }
 *   IDs de equipo corresponden a los definidos en teams.js.
 */

import { analyzeMatch }  from "./aggregator.js";
import { getTeamById }   from "../data/teams.js";
import { MATCHES_MOCK }  from "../data/matches_mock.js";

// ── Constantes del grid search ────────────────────────────────────────────────

const GRID_MIN  = 0.20;
const GRID_MAX  = 0.70;
const GRID_STEP = 0.05;

// Brier Score del predictor uniforme (1/3 para cada resultado):
//   (1/3−1)² + (1/3−0)² + (1/3−0)² = 4/9 + 1/9 + 1/9 = 6/9 = 2/3
const BASELINE_BS = 2 / 3;

// ── Brier Score: partido individual ──────────────────────────────────────────

/**
 * Brier Score 3-way para un único partido.
 *
 * Fórmula: BS = (pA − rA)² + (pDraw − rD)² + (pB − rB)²
 *   donde rX ∈ {0,1} es el indicador del resultado real.
 *
 * Rango: [0, 2]. Menor es mejor.
 * Línea base (predictor uniforme 1/3): BS = 2/3 ≈ 0.667.
 *
 * @param {{ pA: number, pDraw: number, pB: number }} predicted
 * @param {"home"|"draw"|"away"} actual
 * @returns {number}
 */
export function brierScore(predicted, actual) {
  const { pA, pDraw, pB } = predicted;

  // Invariante: las probabilidades deben sumar 1
  const sum = pA + pDraw + pB;
  if (Math.abs(sum - 1.0) > 0.01) {
    throw new Error(`[calibrator] Probabilidades no suman 1 (Σ=${sum.toFixed(4)})`);
  }

  // One-hot del resultado real
  const rA    = actual === "home" ? 1 : 0;
  const rDraw = actual === "draw" ? 1 : 0;
  const rB    = actual === "away" ? 1 : 0;

  return (pA - rA) ** 2 + (pDraw - rDraw) ** 2 + (pB - rB) ** 2;
}

// ── Detección del resultado real ──────────────────────────────────────────────

/**
 * Convierte goles a outcome canónico.
 *
 * @param {{ goalsHome: number, goalsAway: number }} match
 * @returns {"home"|"draw"|"away"}
 */
function detectOutcome(match) {
  if (match.goalsHome > match.goalsAway) return "home";
  if (match.goalsHome < match.goalsAway) return "away";
  return "draw";
}

// ── Backtest completo ─────────────────────────────────────────────────────────

/**
 * Ejecuta el backtesting completo sobre MATCHES_MOCK con los pesos indicados.
 *
 * Para cada partido:
 *   1. Resuelve equipos por ID (home → teamA, away → teamB)
 *   2. Corre analyzeMatch(teamHome, teamAway, weights)
 *   3. Verifica que pA + pDraw + pB = 1
 *   4. Detecta el outcome real
 *   5. Calcula el Brier Score del partido
 *
 * Retorna campos compatibles con dashboard.js (brierScore, brierSkillScore,
 * baseline, distribution.n) más detalles por partido para depuración.
 *
 * @param {{ elo: number, poisson: number }} weights
 * @returns {{
 *   brierScore:      number,
 *   brierSkillScore: number,
 *   baseline:        number,
 *   distribution:    { n: number, home: number, draw: number, away: number },
 *   matchDetails:    Array<{
 *     home: string, away: string,
 *     goalsHome: number, goalsAway: number,
 *     outcome: string,
 *     predicted: { pA: number, pDraw: number, pB: number },
 *     brierScore: number,
 *   }>,
 * }}
 */
export function runBacktest(weights) {
  const dist = { home: 0, draw: 0, away: 0 };
  let totalBS = 0;
  const matchDetails = [];

  for (const match of MATCHES_MOCK) {
    const teamHome = getTeamById(match.home);
    const teamAway = getTeamById(match.away);

    if (!teamHome) throw new Error(`[calibrator] Equipo no encontrado: "${match.home}"`);
    if (!teamAway) throw new Error(`[calibrator] Equipo no encontrado: "${match.away}"`);

    // teamHome → teamA (primer argumento), teamAway → teamB
    const result = analyzeMatch(teamHome, teamAway, weights);

    // Verificación de invariante: pA + pDraw + pB = 1
    const probSum = result.probA + result.probDraw + result.probB;
    if (Math.abs(probSum - 1.0) > 1e-3) {
      console.warn(
        `[calibrator] Probabilidades no suman 1 en ${match.home}-${match.away}: Σ=${probSum.toFixed(4)}`
      );
    }

    const outcome   = detectOutcome(match);
    dist[outcome]++;

    const predicted = { pA: result.probA, pDraw: result.probDraw, pB: result.probB };
    const bs        = brierScore(predicted, outcome);
    totalBS        += bs;

    matchDetails.push({
      home: match.home,
      away: match.away,
      goalsHome: match.goalsHome,
      goalsAway: match.goalsAway,
      outcome,
      predicted,
      brierScore: bs,
    });
  }

  const n      = MATCHES_MOCK.length;
  const meanBS = totalBS / n;
  // Brier Skill Score: 1 = perfecto, 0 = igual al baseline, <0 = peor que baseline
  const bss    = 1 - meanBS / BASELINE_BS;

  return {
    brierScore:      meanBS,
    brierSkillScore: bss,
    baseline:        BASELINE_BS,
    distribution:    { n, ...dist },
    matchDetails,
  };
}

// ── Grid search ───────────────────────────────────────────────────────────────

/**
 * Busca los pesos que minimizan el Brier Score mediante grid search exhaustivo.
 *
 * Grid: elo ∈ [0.2, 0.7] paso 0.05 → 11 combinaciones.
 * Determinista y reproducible: siempre opera sobre MATCHES_MOCK.
 *
 * @returns {{ elo: number, poisson: number, score: number }}
 */
export function findBestWeights() {
  let best = null;

  for (
    let w = GRID_MIN;
    w <= GRID_MAX + 1e-9;
    w = Math.round((w + GRID_STEP) * 1000) / 1000
  ) {
    const elo     = w;
    const poisson = Math.round((1 - w) * 1000) / 1000;
    const { brierScore: score } = runBacktest({ elo, poisson });

    if (best === null || score < best.score) {
      best = { elo, poisson, score };
    }
  }

  return best;
}

// ── Compatibilidad con main.js ────────────────────────────────────────────────

/**
 * Grid search completo que devuelve TODOS los candidatos ordenados por
 * Brier Score ascendente.
 *
 * Formato: calibration[0].weights — acceso esperado en main.js.
 *
 * @returns {{ weights: { elo: number, poisson: number }, brierScore: number }[]}
 */
export function calibrateWeights() {
  const candidates = [];

  for (
    let w = GRID_MIN;
    w <= GRID_MAX + 1e-9;
    w = Math.round((w + GRID_STEP) * 1000) / 1000
  ) {
    const weights = { elo: w, poisson: Math.round((1 - w) * 1000) / 1000 };
    const { brierScore: score } = runBacktest(weights);
    candidates.push({ weights, brierScore: score });
  }

  return candidates.sort((a, b) => a.brierScore - b.brierScore);
}
