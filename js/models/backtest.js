/**
 * Backtesting Module
 *
 * Evaluates model calibration by comparing predicted probabilities
 * against known historical outcomes.
 *
 * ── Metrics ─────────────────────────────────────────────────────────────────
 *
 * Brier Score (multi-class):
 *   BS = (1/N) × Σ [(p_A−r_A)² + (p_D−r_D)² + (p_B−r_B)²]
 *   Range: [0, 2] — lower is better
 *   Baseline (1/3, 1/3, 1/3): BS = 6/9 ≈ 0.667
 *   Perfect predictions: BS = 0
 *
 * Log Loss:
 *   LL = −(1/N) × Σ log(p_correct)
 *   Baseline: log(3) ≈ 1.099 — lower is better
 *
 * Brier Skill Score:
 *   BSS = 1 − BS_model / BS_baseline
 *   BSS = 0: model equals baseline  |  BSS = 1: perfect
 *   BSS < 0: model is WORSE than random guessing
 */

const EPS      = 1e-9;
const BS_BASE  = 6 / 9; // ≈ 0.6667 — uniform baseline

// ── Core Metrics ─────────────────────────────────────────────────────────────

/** Multi-class Brier Score */
export function brierScore(predictions) {
  if (!predictions.length) return null;
  const sum = predictions.reduce((acc, { pA, pDraw, pB, actual }) => {
    const [rA, rD, rB] = actual === "A" ? [1, 0, 0]
                       : actual === "D" ? [0, 1, 0]
                       :                  [0, 0, 1];
    return acc + (pA - rA) ** 2 + (pDraw - rD) ** 2 + (pB - rB) ** 2;
  }, 0);
  return sum / predictions.length;
}

/** Log Loss (cross-entropy) — requires p > 0 for the correct outcome */
export function logLoss(predictions) {
  if (!predictions.length) return null;
  const sum = predictions.reduce((acc, { pA, pDraw, pB, actual }) => {
    const p = actual === "A" ? pA : actual === "D" ? pDraw : pB;
    return acc + Math.log(Math.max(p, EPS));
  }, 0);
  return -sum / predictions.length;
}

/** Brier Skill Score relative to the naive 1/3 baseline */
export function brierSkillScore(bs) {
  return 1 - bs / BS_BASE;
}

/** Log Skill Score relative to the naive 1/3 baseline */
export function logSkillScore(ll) {
  return 1 - ll / Math.log(3);
}

// ── Result Analysis ───────────────────────────────────────────────────────────

/**
 * Build a flat predictions array from history + model function.
 * Safe: skips matches where a team is not found in the dataset.
 */
export function buildPredictions(history, analyzeMatchFn, getTeamFn) {
  const preds = [];
  for (const match of history) {
    const tA = getTeamFn(match.teamA);
    const tB = getTeamFn(match.teamB);
    if (!tA || !tB) continue;

    const r      = analyzeMatchFn(tA, tB);
    const actual = match.goalsA > match.goalsB ? "A"
                 : match.goalsA < match.goalsB ? "B"
                 : "D";
    preds.push({
      matchId: match.id,
      teamA: tA.name, teamB: tB.name,
      goalsA: match.goalsA, goalsB: match.goalsB,
      pA: r.probA, pDraw: r.probDraw, pB: r.probB,
      actual,
    });
  }
  return preds;
}

/**
 * Outcome frequency breakdown from predictions array.
 */
export function outcomeDistribution(predictions) {
  const n = predictions.length;
  return {
    aWins:  predictions.filter(p => p.actual === "A").length / n,
    draws:  predictions.filter(p => p.actual === "D").length / n,
    bWins:  predictions.filter(p => p.actual === "B").length / n,
    n,
  };
}

/**
 * Full metrics report for a given set of predictions.
 */
export function computeMetrics(predictions) {
  const bs  = brierScore(predictions);
  const ll  = logLoss(predictions);
  return {
    brierScore:      bs,
    logLoss:         ll,
    brierSkillScore: brierSkillScore(bs),
    logSkillScore:   logSkillScore(ll),
    baseline:        BS_BASE,
    distribution:    outcomeDistribution(predictions),
  };
}
