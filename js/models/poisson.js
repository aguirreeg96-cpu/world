/**
 * Poisson Distribution Engine — con corrección Dixon-Coles
 *
 * El modelo Poisson estándar subestima empates (0-0, 1-1) y sobreestima
 * resultados ajustados (1-0, 0-1). Dixon y Coles (1997) propusieron un
 * factor de corrección τ aplicado SOLO a marcadores de suma ≤ 1:
 *
 *   τ(0,0) = 1 − λ_A · λ_B · ρ   → sube P(0-0)
 *   τ(1,0) = 1 + λ_B · ρ          → baja P(1-0)
 *   τ(0,1) = 1 + λ_A · ρ          → baja P(0-1)
 *   τ(1,1) = 1 − ρ                 → sube P(1-1)
 *   τ(i,j) = 1  para todo i+j ≥ 2
 *
 * Con ρ = −0.13 (empírico en fútbol internacional):
 *   - 0-0 aumenta ≈ +13% · λ_A · λ_B
 *   - 1-1 aumenta ≈ +13%
 *   - 1-0 / 0-1 se reducen ligeramente
 *
 * Ref: Dixon & Coles (1997) "Modelling Association Football Scores"
 *      Applied Statistics 46(2), 265-280.
 */

const MAX_GOALS = 8;

/** Correlation parameter: empíricamente negativo en fútbol internacional */
export const RHO = -0.13;

// ── Matemática base ──────────────────────────────────────────────────────────

/**
 * P(X = k) para Poisson(λ) usando log-espacio para evitar overflow.
 * Log(k!) se calcula iterativamente (seguro para k ≤ MAX_GOALS).
 */
function poissonPMF(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/**
 * Factor de corrección Dixon-Coles τ para el marcador (i, j).
 * Para i+j ≥ 2, τ = 1 (sin corrección).
 */
function dixonColesTau(i, j, lambdaA, lambdaB, rho = RHO) {
  if (i === 0 && j === 0) return 1 - lambdaA * lambdaB * rho;
  if (i === 1 && j === 0) return 1 + lambdaB * rho;
  if (i === 0 && j === 1) return 1 + lambdaA * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

// ── Goles esperados ──────────────────────────────────────────────────────────

/**
 * λ por equipo usando índices de fuerza normalizados por la media global.
 *
 *   λ_A = (GF_A/avg) × (GC_B/avg) × avg
 *
 * Al dividir por avg y volver a multiplicar, el producto de índices es
 * independiente de la unidad — solo importa la relación relativa entre equipos.
 */
export function expectedGoals(teamA, teamB, globalAvg) {
  const attackA  = teamA.avgGoalsFor     / globalAvg;
  const defenseA = teamA.avgGoalsAgainst / globalAvg;
  const attackB  = teamB.avgGoalsFor     / globalAvg;
  const defenseB = teamB.avgGoalsAgainst / globalAvg;

  return {
    lambdaA: attackA * defenseB * globalAvg,
    lambdaB: attackB * defenseA * globalAvg,
  };
}

// ── Matriz de marcadores ─────────────────────────────────────────────────────

/**
 * P[i][j] = probabilidad de que A anote i goles y B anote j goles.
 * Se aplica corrección Dixon-Coles y se renormaliza para que sume 1.
 */
export function scoreMatrix(lambdaA, lambdaB) {
  const matrix = [];
  let total = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    matrix[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      const raw = poissonPMF(lambdaA, i) * poissonPMF(lambdaB, j);
      const tau = dixonColesTau(i, j, lambdaA, lambdaB);
      matrix[i][j] = Math.max(0, raw * tau); // nunca negativo
      total += matrix[i][j];
    }
  }

  // Renormalizar: la corrección τ rompe la suma exacta a 1
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      matrix[i][j] /= total;
    }
  }

  return matrix;
}

// ── Probabilidades agregadas ─────────────────────────────────────────────────

/** Suma la matriz en victoria A / empate / victoria B (ya normalizadas) */
export function matchProbabilities(matrix) {
  let pA = 0, pDraw = 0, pB = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      if      (i > j)  pA    += matrix[i][j];
      else if (i === j) pDraw += matrix[i][j];
      else              pB    += matrix[i][j];
    }
  }
  // La suma debería ser ≈1 ya; renormalizamos por seguridad numérica
  const t = pA + pDraw + pB;
  return { pA: pA / t, pDraw: pDraw / t, pB: pB / t };
}

// ── Marcadores top ───────────────────────────────────────────────────────────

/** Devuelve los n marcadores más probables, ordenados descendentemente */
export function topScores(matrix, n = 12) {
  const list = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      list.push({ goalsA: i, goalsB: j, prob: matrix[i][j] });
    }
  }
  return list.sort((a, b) => b.prob - a.prob).slice(0, n);
}
