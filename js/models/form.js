/**
 * Recent Form Index
 *
 * Applies exponential decay to the last N results so that recent matches
 * carry more weight than older ones. The output is a factor that adjusts
 * Poisson's expected-goals estimate up or down.
 */

const ALPHA = 0.85; // decay per step — tune between 0.75 (fast decay) and 0.95 (slow)

const RESULT_VALUE = { W: 1.0, D: 0.5, L: 0.0 };

/**
 * Weighted form index in [0, 1].
 * @param {string[]} results — ordered most-recent first, e.g. ['W','W','D','L']
 */
export function formIndex(results) {
  if (!results?.length) return 0.5;
  let num = 0, den = 0;
  results.forEach((r, i) => {
    const w = Math.pow(ALPHA, i);
    num += w * (RESULT_VALUE[r] ?? 0.5);
    den += w;
  });
  return num / den;
}

/**
 * Converts form index → lambda multiplier.
 * Form = 0.5 (neutral) → ×1.00
 * Form = 1.0 (perfect) → ×1.15  (+15%)
 * Form = 0.0 (terrible) → ×0.85 (−15%)
 */
export function formFactor(index) {
  return 0.85 + index * 0.30;
}

/** Human label for form index */
export function formLabel(index) {
  if (index >= 0.85) return "Excelente";
  if (index >= 0.65) return "Buena";
  if (index >= 0.45) return "Regular";
  if (index >= 0.25) return "Mala";
  return "Muy mala";
}

/** Map result codes to display objects for UI dots */
export function formDots(results) {
  return results.map(r => ({
    code: r,
    label: r === "W" ? "V" : r === "D" ? "E" : "D",
  }));
}
