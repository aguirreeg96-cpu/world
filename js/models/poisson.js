/**
 * Poisson Distribution Engine — completo con Dixon-Coles y estadísticas derivadas
 *
 * ── Modelo base ──────────────────────────────────────────────────────────────
 *
 * Los goles son eventos discretos, independientes y relativamente raros →
 * distribución Poisson. Dado λ_A y λ_B (goles esperados por equipo), la
 * probabilidad de cualquier marcador (i, j) es:
 *
 *   P(A=i, B=j) = P(A=i; λ_A) · P(B=j; λ_B)
 *
 * ── Corrección Dixon-Coles ───────────────────────────────────────────────────
 *
 * El Poisson independiente subestima sistemáticamente empates 0-0 y 1-1.
 * La corrección τ se aplica solo a marcadores bajos:
 *
 *   τ(0,0) = 1 − λ_A·λ_B·ρ
 *   τ(1,0) = 1 + λ_B·ρ
 *   τ(0,1) = 1 + λ_A·ρ
 *   τ(1,1) = 1 − ρ
 *   τ(i,j) = 1  para el resto
 *
 * La matriz se renormaliza tras aplicar τ para garantizar Σ P[i][j] = 1.
 */

export const MAX_GOALS = 8;
export const RHO = -0.13;

// ── Matemática interna ───────────────────────────────────────────────────────

function poissonPMF(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;

  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) {
    logP -= Math.log(i);
  }

  return Math.exp(logP);
}

/**
 * Factor de corrección Dixon-Coles para marcadores bajos.
 */
export function dixonColesTau(i, j, lambdaA, lambdaB, rho = RHO) {
  if (i === 0 && j === 0) return 1 - lambdaA * lambdaB * rho;
  if (i === 1 && j === 0) return 1 + lambdaB * rho;
  if (i === 0 && j === 1) return 1 + lambdaA * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

// ── Goles esperados ──────────────────────────────────────────────────────────

export function expectedGoals(teamA, teamB, globalAvg) {
  const atkA = teamA.avgGoalsFor / globalAvg;
  const defA = teamA.avgGoalsAgainst / globalAvg;
  const atkB = teamB.avgGoalsFor / globalAvg;
  const defB = teamB.avgGoalsAgainst / globalAvg;

  return {
    lambdaA: atkA * defB * globalAvg,
    lambdaB: atkB * defA * globalAvg,
  };
}

// ── Matrices de marcadores ───────────────────────────────────────────────────

export function scoreMatrix(lambdaA, lambdaB, rho = RHO) {
  const matrix = [];
  let total = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    matrix[i] = [];

    for (let j = 0; j <= MAX_GOALS; j++) {
      const raw = poissonPMF(lambdaA, i) * poissonPMF(lambdaB, j);
      const adjusted = raw * dixonColesTau(i, j, lambdaA, lambdaB, rho);

      matrix[i][j] = Math.max(0, adjusted);
      total += matrix[i][j];
    }
  }

  if (total <= 0) {
    throw new Error("[poisson] scoreMatrix: total probability is zero");
  }

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      matrix[i][j] /= total;
    }
  }

  let check = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      check += matrix[i][j];
    }
  }

  if (Math.abs(check - 1.0) > 1e-6) {
    console.warn(`[poisson] scoreMatrix: Σ = ${check.toFixed(8)} (esperado 1.0)`);
  }

  return matrix;
}

export function scoreMatrixRaw(lambdaA, lambdaB) {
  const matrix = [];
  let total = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    matrix[i] = [];

    for (let j = 0; j <= MAX_GOALS; j++) {
      matrix[i][j] = poissonPMF(lambdaA, i) * poissonPMF(lambdaB, j);
      total += matrix[i][j];
    }
  }

  if (total <= 0) {
    throw new Error("[poisson] scoreMatrixRaw: total probability is zero");
  }

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      matrix[i][j] /= total;
    }
  }

  return matrix;
}

// ── Probabilidades de resultado ──────────────────────────────────────────────

export function matchProbabilities(matrix) {
  let pA = 0;
  let pDraw = 0;
  let pB = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (i > j) {
        pA += matrix[i][j];
      } else if (i === j) {
        pDraw += matrix[i][j];
      } else {
        pB += matrix[i][j];
      }
    }
  }

  const total = pA + pDraw + pB;

  if (total <= 0) {
    throw new Error("[poisson] matchProbabilities: total probability is zero");
  }

  if (Math.abs(total - 1.0) > 1e-4) {
    console.warn(`[poisson] matchProbabilities: Σ = ${total.toFixed(6)} (esperado ≈ 1.0)`);
  }

  return {
    pA: pA / total,
    pDraw: pDraw / total,
    pB: pB / total,
  };
}

// ── Estadísticas derivadas de la matriz ──────────────────────────────────────

export function expectedGoalsFromMatrix(matrix) {
  let expA = 0;
  let expB = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      expA += i * matrix[i][j];
      expB += j * matrix[i][j];
    }
  }

  return { expA, expB };
}

export function marginalDistributions(matrix) {
  const A = new Array(MAX_GOALS + 1).fill(0);
  const B = new Array(MAX_GOALS + 1).fill(0);

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      A[i] += matrix[i][j];
      B[j] += matrix[i][j];
    }
  }

  return { A, B };
}

export function overUnder(matrix, threshold = 2.5) {
  let pOver = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      if (i + j > threshold) {
        pOver += matrix[i][j];
      }
    }
  }

  return {
    pOver,
    pUnder: 1 - pOver,
    threshold,
  };
}

export function bothTeamsScore(matrix) {
  let p = 0;

  for (let i = 1; i <= MAX_GOALS; i++) {
    for (let j = 1; j <= MAX_GOALS; j++) {
      p += matrix[i][j];
    }
  }

  return p;
}

export function goalDistributionStats(matrix) {
  let mean = 0;
  let variance = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      mean += (i + j) * matrix[i][j];
    }
  }

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      variance += Math.pow((i + j) - mean, 2) * matrix[i][j];
    }
  }

  return {
    mean,
    variance,
    stddev: Math.sqrt(variance),
  };
}

// ── Marcadores destacados ────────────────────────────────────────────────────

export function topScores(matrix, n = 12) {
  const list = [];

  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      list.push({
        goalsA: i,
        goalsB: j,
        prob: matrix[i][j],
      });
    }
  }

  return list.sort((a, b) => b.prob - a.prob).slice(0, n);
}
