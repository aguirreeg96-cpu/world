/**
 * Odds Converter — cuotas decimales → probabilidades implícitas
 *
 * ── Fórmulas ─────────────────────────────────────────────────────────────────
 *
 *   Probabilidad implícita bruta:
 *     p_i = 1 / cuota_i
 *
 *   Overround (margen de la casa):
 *     OR = Σ p_i − 1    (cuanto mayor, más retiene la casa)
 *
 *   Probabilidad implícita normalizada (sin margen, comparación justa):
 *     p_norm_i = p_i / Σ p_j
 *
 *   Diferencia estadística (puntos porcentuales, modelo vs mercado):
 *     diff_i = p_modelo_i − p_norm_i
 *
 * ── Aviso ─────────────────────────────────────────────────────────────────────
 *
 * Este módulo es exclusivamente educativo. La diferencia estadística entre el
 * modelo y el mercado NO implica valor esperado real, ventaja garantizada ni
 * recomendación de ningún tipo.
 */

/**
 * Probabilidad implícita bruta de una cuota decimal.
 *
 * @param {number} odd cuota decimal > 1.0
 * @returns {number} probabilidad en (0, 1)
 */
export function impliedProbability(odd) {
  if (!Number.isFinite(odd) || odd <= 1.0) {
    throw new Error(`[odds] Cuota inválida: ${odd}. Debe ser un número finito > 1.0`);
  }
  return 1 / odd;
}

/**
 * Análisis completo: tres cuotas decimales vs probabilidades del modelo.
 *
 * @param {{ probA: number, probDraw: number, probB: number }} modelProbs
 * @param {number} oddsA    cuota victoria equipo A  (> 1.0)
 * @param {number} oddsDraw cuota empate             (> 1.0)
 * @param {number} oddsB    cuota victoria equipo B  (> 1.0)
 * @returns {{
 *   odds:       { A, draw, B },
 *   implied:    { A, draw, B },
 *   overround:  number,
 *   normalized: { A, draw, B },
 *   edge:       { A, draw, B },
 * }}
 */
export function analyzeOdds(modelProbs, oddsA, oddsDraw, oddsB) {
  const ipA    = impliedProbability(oddsA);
  const ipDraw = impliedProbability(oddsDraw);
  const ipB    = impliedProbability(oddsB);

  const sumImplied = ipA + ipDraw + ipB;
  const overround  = sumImplied - 1.0;

  // Normalizacion: elimina el margen para una comparacion justa con el modelo
  const normA    = ipA    / sumImplied;
  const normDraw = ipDraw / sumImplied;
  const normB    = ipB    / sumImplied;

  return {
    odds:       { A: oddsA,  draw: oddsDraw, B: oddsB    },
    implied:    { A: ipA,    draw: ipDraw,   B: ipB      },
    overround,
    normalized: { A: normA,  draw: normDraw, B: normB    },
    edge: {
      A:    modelProbs.probA    - normA,
      draw: modelProbs.probDraw - normDraw,
      B:    modelProbs.probB    - normB,
    },
  };
}
