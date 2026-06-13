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
 *               = [e^(-λ_A) · λ_A^i / i!] · [e^(-λ_B) · λ_B^j / j!]
 *
 * ── Corrección Dixon-Coles ───────────────────────────────────────────────────
 *
 * El Poisson independiente subestima sistemáticamente empates 0-0 y 1-1.
 * La corrección τ se aplica solo para i+j ≤ 1 (basada en el parámetro ρ < 0):
 *
 *   τ(0,0) = 1 − λ_A·λ_B·ρ   → P(0-0) sube
 *   τ(1,0) = 1 + λ_B·ρ        → P(1-0) baja
 *   τ(0,1) = 1 + λ_A·ρ        → P(0-1) baja
 *   τ(1,1) = 1 − ρ             → P(1-1) sube
 *   τ(i,j) = 1  si i+j ≥ 2
 *
 * La matriz se renormaliza tras aplicar τ para garantizar Σ P[i][j] = 1.
 *
 * Ref: Dixon & Coles (1997), Applied Statistics 46(2), 265-280.
 */

export const MAX_GOALS = 8;   // truncación: cubre >99.9% de resultados reales
export const RHO       = -0.13; // correlación DC empírica (calibrada en datos históricos)

// ── Matemática interna ───────────────────────────────────────────────────────

/**
 * P(X = k) para Poisson(λ) en log-espacio (evita overflow para k grande).
 * log P = −λ + k·ln(λ) − ln(k!)
 */
function poissonPMF(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

<<<<<<< HEAD
/**
 * Factor de corrección Dixon-Coles para marcadores bajos.
 *
 * Con ρ < 0 (típicamente −0.13):
 *   τ(0,0) = 1 − λ_A·λ_B·ρ  > 1  → sube P(0-0) y P(1-1)
 *   τ(1,0) = 1 + λ_B·ρ       < 1  → baja P(1-0) y P(0-1)
 *   τ(1,1) = 1 − ρ           > 1
 *   τ(i,j) = 1  si i+j ≥ 2        → Poisson sin modificar
 *
 * Exportada para inspección y tests desde consola.
 *
 * @param {number} i golesA, @param {number} j golesB
 * @param {number} lambdaA, @param {number} lambdaB
 * @param {number} [rho]
 * @returns {number} factor multiplicativo ≥ 0
 */
=======
>>>>>>> df0a7eb (Export Dixon-Coles tau helper)
export function dixonColesTau(i, j, lambdaA, lambdaB, rho = RHO) {
  if (i === 0 && j === 0) return 1 - lambdaA * lambdaB * rho;
  if (i === 1 && j === 0) return 1 + lambdaB * rho;
  if (i === 0 && j === 1) return 1 + lambdaA * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
}

// ── Goles esperados ──────────────────────────────────────────────────────────

/**
 * λ de cada equipo como producto de índices de fuerza normalizados.
 *
 *   λ_A = (GF_A / μ) × (GC_B / μ) × μ
 *        = ataque_A × defensa_B_inversa × μ
 *
 * Al normalizar por μ (media global), los índices son adimensionales y
 * el modelo es invariante a la inflación de goles entre torneos/épocas.
 */
export function expectedGoals(teamA, teamB, globalAvg) {
  const atkA = teamA.avgGoalsFor     / globalAvg;
  const defA = teamA.avgGoalsAgainst / globalAvg; // <1 = defensa buena
  const atkB = teamB.avgGoalsFor     / globalAvg;
  const defB = teamB.avgGoalsAgainst / globalAvg;
  return {
    lambdaA: atkA * defB * globalAvg,
    lambdaB: atkB * defA * globalAvg,
  };
}

// ── Matrices de marcadores ───────────────────────────────────────────────────

/**
 * Matriz con corrección Dixon-Coles (producción).
 * P[i][j] = probabilidad del marcador i-j, renormalizada.
 *
 * @param {number} lambdaA  goles esperados del equipo A
 * @param {number} lambdaB  goles esperados del equipo B
 * @param {number} [rho]    parámetro de correlación DC (default RHO = −0.13)
 * @returns {number[][]}    matriz (MAX_GOALS+1)² con Σ P[i][j] = 1
 */
export function scoreMatrix(lambdaA, lambdaB, rho = RHO) {
  const matrix = [];
  let total = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    matrix[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      const raw = poissonPMF(lambdaA, i) * poissonPMF(lambdaB, j);
      // Math.max garantiza que τ negativo (rho muy positivo) no genere P < 0
      matrix[i][j] = Math.max(0, raw * dixonColesTau(i, j, lambdaA, lambdaB, rho));
      total += matrix[i][j];
    }
  }

  // Renormalización: necesaria porque τ redistribuye masa entre celdas bajas
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      matrix[i][j] /= total;

  // Validación: la renormalización no debe dejar error mayor a 1e-6
  let check = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      check += matrix[i][j];
  if (Math.abs(check - 1.0) > 1e-6)
    console.warn(`[poisson] scoreMatrix: Σ = ${check.toFixed(8)} (esperado 1.0)`);

  return matrix;
}

/**
 * Matriz Poisson sin corrección (para comparación en validación).
 * Útil para cuantificar el efecto de Dixon-Coles.
 */
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
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      matrix[i][j] /= total;
  return matrix;
}

// ── Probabilidades de resultado ──────────────────────────────────────────────

/**
 * Suma la matriz en tres resultados mutuamente excluyentes y exhaustivos.
 * Renormalización de seguridad: garantiza suma exacta = 1.0.
 */
export function matchProbabilities(matrix) {
  let pA = 0, pDraw = 0, pB = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      if      (i > j)  pA    += matrix[i][j];
      else if (i === j) pDraw += matrix[i][j];
      else              pB    += matrix[i][j];
    }
  }
  const t = pA + pDraw + pB;

  // Validación: la suma de celdas de la matriz debe ser ≈ 1 antes de dividir
  if (Math.abs(t - 1.0) > 1e-4)
    console.warn(`[poisson] matchProbabilities: Σ celdas = ${t.toFixed(6)} (esperado ≈1.0)`);

  return { pA: pA / t, pDraw: pDraw / t, pB: pB / t };
}

// ── Estadísticas derivadas de la matriz ─────────────────────────────────────

/**
 * Goles esperados recuperados desde la matriz.
 * Deben aproximar λ_A y λ_B (diferencia < 0.01 por truncación en MAX_GOALS).
 */
export function expectedGoalsFromMatrix(matrix) {
  let expA = 0, expB = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      expA += i * matrix[i][j];
      expB += j * matrix[i][j];
    }
  }
  return { expA, expB };
}

/**
 * Distribuciones marginales de goles por equipo.
 * margA[k] = P(A anota exactamente k goles), independiente de B.
 */
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

/**
 * P(total de goles > threshold) — mercado de Over/Under.
 * threshold = 2.5 es el más común en fútbol.
 */
export function overUnder(matrix, threshold = 2.5) {
  let pOver = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      if (i + j > threshold) pOver += matrix[i][j];
  return { pOver, pUnder: 1 - pOver, threshold };
}

/**
 * P(ambos equipos anotan al menos 1 gol).
 * Equivalente a P(A≥1) × P(B≥1) en Poisson independiente,
 * pero calculado exactamente desde la matriz conjunta.
 */
export function bothTeamsScore(matrix) {
  let p = 0;
  for (let i = 1; i <= MAX_GOALS; i++)
    for (let j = 1; j <= MAX_GOALS; j++)
      p += matrix[i][j];
  return p;
}

/**
 * Media, varianza y desviación estándar del total de goles.
 * Útil para entender la dispersión del marcador esperado.
 */
export function goalDistributionStats(matrix) {
  let mean = 0, variance = 0;
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      mean += (i + j) * matrix[i][j];

  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      variance += Math.pow((i + j) - mean, 2) * matrix[i][j];

  return { mean, variance, stddev: Math.sqrt(variance) };
}

// ── Marcadores destacados ────────────────────────────────────────────────────

/** Top n marcadores ordenados por probabilidad descendente */
export function topScores(matrix, n = 12) {
  const list = [];
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++)
      list.push({ goalsA: i, goalsB: j, prob: matrix[i][j] });
  return list.sort((a, b) => b.prob - a.prob).slice(0, n);
}
