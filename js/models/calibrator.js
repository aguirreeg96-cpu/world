/**
 * Weight Calibrator
 *
 * Finds the ELO/Poisson blend that minimises Brier Score on the
 * historical match dataset via exhaustive grid search.
 *
 * This is the simplest form of model calibration — a single free parameter
 * (w_elo). In production, additional parameters (ELO scale, Poisson α, ρ)
 * could also be calibrated using cross-validation.
 */

import { HISTORY }                     from "../data/history.js";
import { getTeamById }                 from "../data/teams.js";
import { analyzeMatch }                from "./aggregator.js";
import { buildPredictions, computeMetrics } from "./backtest.js";

const GRID_MIN  = 0.10;
const GRID_MAX  = 0.90;
const GRID_STEP = 0.05;

/**
 * Run grid search over w_elo ∈ [0.10, 0.90] step 0.05.
 * Returns all candidates sorted by Brier Score (ascending).
 *
 * @returns {{ weights: {elo, poisson}, brierScore: number }[]}
 */
export function calibrateWeights() {
  const candidates = [];

  for (
    let w = GRID_MIN;
    w <= GRID_MAX + 1e-9;
    w = Math.round((w + GRID_STEP) * 1000) / 1000
  ) {
    const weights = { elo: w, poisson: Math.round((1 - w) * 1000) / 1000 };
    const preds   = buildPredictions(
      HISTORY,
      (tA, tB) => analyzeMatch(tA, tB, weights),
      getTeamById,
    );
    candidates.push({ weights, brierScore: computeMetrics(preds).brierScore });
  }

  return candidates.sort((a, b) => a.brierScore - b.brierScore);
}

/**
 * Run full backtest with provided weights and return rich metrics.
 */
export function runBacktest(weights) {
  const preds = buildPredictions(
    HISTORY,
    (tA, tB) => analyzeMatch(tA, tB, weights),
    getTeamById,
  );
  return computeMetrics(preds);
}
