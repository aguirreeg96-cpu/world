/**
 * Poisson Distribution Engine
 *
 * Goals in football are discrete, independent, and relatively rare — ideal
 * for Poisson modelling. Given expected goals λ for each team, we build
 * a probability matrix over all plausible scorelines and sum them into
 * win / draw / loss totals.
 */

const MAX_GOALS = 8; // truncation: covers >99.9% of real-world scores

// ---------- core math ----------

/** P(X = k) for Poisson(λ) using log-space to avoid overflow */
function poissonPMF(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i); // subtract log(k!)
  return Math.exp(logP);
}

// ---------- expected goals ----------

/**
 * Calculate λ for each team using attack/defense strength indices
 * normalised against the global tournament average.
 *
 * λ_A = (attack_A / avg) × (defense_B / avg) × avg
 *      = attack_A × defense_B / avg
 */
export function expectedGoals(teamA, teamB, globalAvg) {
  const attackA  = teamA.avgGoalsFor     / globalAvg;
  const defenseA = teamA.avgGoalsAgainst / globalAvg; // lower = better
  const attackB  = teamB.avgGoalsFor     / globalAvg;
  const defenseB = teamB.avgGoalsAgainst / globalAvg;

  return {
    lambdaA: attackA * defenseB * globalAvg,
    lambdaB: attackB * defenseA * globalAvg,
  };
}

// ---------- score matrix ----------

/** P[i][j] = probability that A scores i goals and B scores j goals */
export function scoreMatrix(lambdaA, lambdaB) {
  const matrix = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    matrix[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      matrix[i][j] = poissonPMF(lambdaA, i) * poissonPMF(lambdaB, j);
    }
  }
  return matrix;
}

// ---------- aggregated probabilities ----------

export function matchProbabilities(matrix) {
  let pA = 0, pDraw = 0, pB = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      if      (i > j) pA    += matrix[i][j];
      else if (i === j) pDraw += matrix[i][j];
      else              pB    += matrix[i][j];
    }
  }
  const total = pA + pDraw + pB;
  return { pA: pA / total, pDraw: pDraw / total, pB: pB / total };
}

// ---------- top scorelines ----------

/** Returns the n most probable scorelines sorted descending by probability */
export function topScores(matrix, n = 12) {
  const list = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      list.push({ goalsA: i, goalsB: j, prob: matrix[i][j] });
    }
  }
  return list.sort((a, b) => b.prob - a.prob).slice(0, n);
}
