/**
 * ELO Rating Engine
 *
 * Assigns a numeric strength (rating) to each team based on historical results.
 * The difference between two ratings predicts win probability via a logistic curve.
 * Documented at: https://en.wikipedia.org/wiki/Elo_rating_system
 */

const SCALE = 400;          // logistic scale — standard chess/sports ELO
const HOME_BONUS = 65;      // points added for a true home team (not used at neutral venues)

/**
 * P(A wins) given ratings. advantage > 0 when A plays at home.
 * @returns {number} [0, 1]
 */
export function winProbability(ratingA, ratingB, advantage = 0) {
  const delta = ratingA + advantage - ratingB;
  return 1 / (1 + Math.pow(10, -delta / SCALE));
}

/**
 * Update both ratings after a result.
 * scoreA: 1 = win, 0.5 = draw, 0 = loss
 */
export function updateRatings(ratingA, ratingB, scoreA, kFactor = 40) {
  const pA = winProbability(ratingA, ratingB);
  const change = kFactor * (scoreA - pA);
  return { newA: ratingA + change, newB: ratingB - change };
}

/**
 * Human-readable label for the ELO gap between two teams.
 */
export function strengthLabel(delta) {
  const abs = Math.abs(delta);
  if (abs < 30)  return "Equipos muy parejos";
  if (abs < 80)  return "Ligera ventaja";
  if (abs < 150) return "Ventaja clara";
  if (abs < 250) return "Gran diferencia";
  return "Dominio absoluto";
}
