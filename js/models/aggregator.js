/**
 * Model Aggregator
 *
 * Combines ELO (long-term strength) and Poisson (goal distribution) into
 * a single set of final probabilities. Form is applied as a lambda modifier
 * inside Poisson, so both models already reflect recent momentum.
 *
 * Weights are a starting point — calibrate via backtesting on historical data.
 */

import { winProbability }                        from "./elo.js";
import { expectedGoals, scoreMatrix,
         matchProbabilities, topScores }         from "./poisson.js";
import { formIndex, formFactor, formLabel,
         formDots }                              from "./form.js";
import { TEAMS_DATA }                            from "../data/teams.js";

const W_ELO     = 0.45;
const W_POISSON = 0.55;

/**
 * Full analysis for a head-to-head on a neutral venue.
 * @param {object} teamA
 * @param {object} teamB
 * @returns {MatchResult}
 */
export function analyzeMatch(teamA, teamB) {
  const globalAvg = TEAMS_DATA.globalAvgGoals;

  // ── 1. Recent form ──────────────────────────────────────────────
  const fiA = formIndex(teamA.recentResults);
  const fiB = formIndex(teamB.recentResults);
  const ffA = formFactor(fiA);
  const ffB = formFactor(fiB);

  // ── 2. ELO win probability (neutral venue → no home bonus) ──────
  const pEloA = winProbability(teamA.elo, teamB.elo);
  const pEloB = 1 - pEloA;

  // ── 3. Poisson expected goals (base, then form-adjusted) ─────────
  const { lambdaA: baseLambdaA, lambdaB: baseLambdaB } =
    expectedGoals(teamA, teamB, globalAvg);

  const lambdaA = baseLambdaA * ffA;
  const lambdaB = baseLambdaB * ffB;

  // ── 4. Score matrix → Poisson probabilities ──────────────────────
  const matrix  = scoreMatrix(lambdaA, lambdaB);
  const poisson = matchProbabilities(matrix);

  // ── 5. ELO normalised to include draw (borrowed from Poisson) ────
  // ELO only produces P(win). We split the non-draw probability
  // proportionally and add Poisson's draw share.
  const drawShare    = poisson.pDraw;
  const eloA_nodraw  = pEloA * (1 - drawShare);
  const eloB_nodraw  = pEloB * (1 - drawShare);

  // ── 6. Weighted blend ────────────────────────────────────────────
  const rawA    = W_ELO * eloA_nodraw  + W_POISSON * poisson.pA;
  const rawDraw = W_ELO * drawShare    + W_POISSON * poisson.pDraw;
  const rawB    = W_ELO * eloB_nodraw  + W_POISSON * poisson.pB;

  // ── 7. Renormalise so the three sum to exactly 1.0 ───────────────
  const total = rawA + rawDraw + rawB;
  const probA    = rawA    / total;
  const probDraw = rawDraw / total;
  const probB    = rawB    / total;

  return {
    probA, probDraw, probB,
    lambdaA, lambdaB,
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
