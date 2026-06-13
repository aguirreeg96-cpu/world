/**
 * ELO Rating Engine — con modelo de empate propio
 *
 * El ELO clásico produce solo P(A gana) vía curva logística.
 * Para un partido de fútbol se necesita P(victoria / empate / derrota).
 *
 * Extensión de empate:
 *   Los empates son más frecuentes cuanto más igualados son los equipos.
 *   Modelamos P(empate | ΔR) con una gaussiana normalizada:
 *
 *       P_draw(ΔR) = D₀ · exp(−k · (ΔR / 400)²)
 *
 *   Donde D₀ = probabilidad base de empate para equipos iguales,
 *   y k controla cuán rápido decae con la diferencia de rating.
 *
 *   Calibración empírica (fútbol internacional, ~2010-2024):
 *     D₀ ≈ 0.285  → 28.5% de empates para ΔR = 0
 *     k  ≈ 2.00   → ΔR=200 → P_draw ≈ 17.3% | ΔR=400 → P_draw ≈ 3.8%
 *
 *   Luego, condicionado en "no empate":
 *     P(A gana) = winProbability(rA, rB) · (1 − P_draw)
 *     P(B gana) = (1 − winProbability(rA, rB)) · (1 − P_draw)
 *
 *   Invariante: P(A) + P_draw + P(B) = 1.0 siempre.
 */

const SCALE      = 400;    // escala logística estándar ELO
const HOME_BONUS = 65;     // bonus para el equipo local (no se usa en campo neutro)

export const ELO_DRAW_BASE  = 0.285;   // P(empate) cuando ΔR = 0
export const ELO_DRAW_DECAY = 2.00;    // factor de decaimiento k

// ── Win probability (2-way, sin empate) ──────────────────────────────────────

/**
 * P(A gana) en base 2 (victoria o derrota, sin empate).
 * advantage = HOME_BONUS para partido en casa de A, 0 en campo neutro.
 */
export function winProbability(ratingA, ratingB, advantage = 0) {
  const delta = ratingA + advantage - ratingB;
  return 1 / (1 + Math.pow(10, -delta / SCALE));
}

// ── Draw probability ──────────────────────────────────────────────────────────

/**
 * P(empate) modelada como función de la diferencia absoluta de ratings.
 * Monotónicamente decreciente con |ΔR|.
 *
 * Verificación:
 *   ΔR =   0 → P_draw = 0.285 (≈ tasa histórica para equipos igualados)
 *   ΔR = 100 → P_draw ≈ 0.249
 *   ΔR = 200 → P_draw ≈ 0.173
 *   ΔR = 400 → P_draw ≈ 0.038
 */
export function drawProbability(ratingA, ratingB) {
  const delta = ratingA - ratingB;
  return ELO_DRAW_BASE * Math.exp(-ELO_DRAW_DECAY * Math.pow(delta / SCALE, 2));
}

// ── Three-way prediction ──────────────────────────────────────────────────────

/**
 * Convierte ratings ELO en un triplete de probabilidades {pA, pDraw, pB}.
 *
 * El invariante P(A) + P_draw + P(B) = 1.0 se mantiene exactamente:
 *   P(A) + P(B) = (pWin_A + pWin_B) × (1 − P_draw) = 1 × (1 − P_draw)
 *   Suma total  = (1 − P_draw) + P_draw = 1.0  ✓
 */
export function threeWayProbabilities(ratingA, ratingB, advantage = 0) {
  const pW   = winProbability(ratingA, ratingB, advantage);
  const pD   = drawProbability(ratingA, ratingB);
  const rest = 1 - pD;
  return {
    pA:    pW       * rest,
    pDraw: pD,
    pB:    (1 - pW) * rest,
  };
}

// ── Rating update ─────────────────────────────────────────────────────────────

/**
 * Actualiza ambos ratings tras un resultado.
 * scoreA: 1 = victoria, 0.5 = empate, 0 = derrota.
 */
export function updateRatings(ratingA, ratingB, scoreA, kFactor = 40) {
  const pA     = winProbability(ratingA, ratingB);
  const change = kFactor * (scoreA - pA);
  return { newA: ratingA + change, newB: ratingB - change };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Etiqueta cualitativa para la diferencia de rating */
export function strengthLabel(delta) {
  const abs = Math.abs(delta);
  if (abs <  30) return "Equipos muy parejos";
  if (abs <  80) return "Ligera ventaja";
  if (abs < 150) return "Ventaja clara";
  if (abs < 250) return "Gran diferencia";
  return "Dominio absoluto";
}
