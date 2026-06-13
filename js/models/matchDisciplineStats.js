/**
 * matchDisciplineStats.js — Estadísticas avanzadas por partido
 *
 * Calcula córners, faltas, tarjetas amarillas y probabilidad de roja
 * a partir de promedios estimados por equipo.
 *
 * ADVERTENCIA: todos los datos base son estimaciones por confederación/perfil.
 * No deben usarse como garantía de resultado ni consejo de apuesta.
 */

// ── Dataset embebido ──────────────────────────────────────────────────────────
// Mismo contenido que js/data/team_discipline_stats.json.
// Se embebe directamente para evitar fetch() en un módulo puro.

const DEFAULTS = {
  avgCornersFor: 4.8, avgCornersAgainst: 4.8,
  avgFoulsFor: 12.5, avgFoulsAgainst: 12.5,
  avgYellowCardsFor: 2.0, avgYellowCardsAgainst: 2.0,
  redCardsPerMatch: 0.05,
};

const DISCIPLINE = {
  ARG: { avgCornersFor: 5.1, avgCornersAgainst: 4.2, avgFoulsFor: 13.5, avgFoulsAgainst: 11.2, avgYellowCardsFor: 2.3, avgYellowCardsAgainst: 1.8, redCardsPerMatch: 0.07 },
  FRA: { avgCornersFor: 5.5, avgCornersAgainst: 4.0, avgFoulsFor: 11.0, avgFoulsAgainst: 12.8, avgYellowCardsFor: 1.6, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.04 },
  ESP: { avgCornersFor: 5.8, avgCornersAgainst: 3.8, avgFoulsFor: 10.5, avgFoulsAgainst: 14.0, avgYellowCardsFor: 1.5, avgYellowCardsAgainst: 2.3, redCardsPerMatch: 0.04 },
  ENG: { avgCornersFor: 5.7, avgCornersAgainst: 4.1, avgFoulsFor: 11.0, avgFoulsAgainst: 13.0, avgYellowCardsFor: 1.6, avgYellowCardsAgainst: 2.1, redCardsPerMatch: 0.04 },
  BRA: { avgCornersFor: 5.8, avgCornersAgainst: 4.0, avgFoulsFor: 12.5, avgFoulsAgainst: 12.5, avgYellowCardsFor: 1.8, avgYellowCardsAgainst: 2.1, redCardsPerMatch: 0.06 },
  POR: { avgCornersFor: 5.5, avgCornersAgainst: 4.2, avgFoulsFor: 11.5, avgFoulsAgainst: 12.5, avgYellowCardsFor: 1.8, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.04 },
  GER: { avgCornersFor: 5.8, avgCornersAgainst: 4.2, avgFoulsFor: 11.0, avgFoulsAgainst: 13.0, avgYellowCardsFor: 1.6, avgYellowCardsAgainst: 2.1, redCardsPerMatch: 0.04 },
  NED: { avgCornersFor: 5.6, avgCornersAgainst: 4.2, avgFoulsFor: 11.5, avgFoulsAgainst: 13.0, avgYellowCardsFor: 1.7, avgYellowCardsAgainst: 2.1, redCardsPerMatch: 0.04 },
  BEL: { avgCornersFor: 5.5, avgCornersAgainst: 4.3, avgFoulsFor: 11.5, avgFoulsAgainst: 12.8, avgYellowCardsFor: 1.7, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.04 },
  SUI: { avgCornersFor: 5.2, avgCornersAgainst: 4.5, avgFoulsFor: 11.5, avgFoulsAgainst: 12.5, avgYellowCardsFor: 1.7, avgYellowCardsAgainst: 2.1, redCardsPerMatch: 0.04 },
  CRO: { avgCornersFor: 5.2, avgCornersAgainst: 4.5, avgFoulsFor: 12.5, avgFoulsAgainst: 12.5, avgYellowCardsFor: 2.0, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.05 },
  AUT: { avgCornersFor: 5.3, avgCornersAgainst: 4.5, avgFoulsFor: 12.5, avgFoulsAgainst: 12.5, avgYellowCardsFor: 2.1, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.05 },
  SWE: { avgCornersFor: 5.2, avgCornersAgainst: 4.8, avgFoulsFor: 12.5, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.0, avgYellowCardsAgainst: 1.9, redCardsPerMatch: 0.05 },
  NOR: { avgCornersFor: 5.0, avgCornersAgainst: 5.0, avgFoulsFor: 12.5, avgFoulsAgainst: 12.5, avgYellowCardsFor: 2.0, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.05 },
  SCO: { avgCornersFor: 5.0, avgCornersAgainst: 5.0, avgFoulsFor: 13.5, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.2, avgYellowCardsAgainst: 1.9, redCardsPerMatch: 0.06 },
  CZE: { avgCornersFor: 4.9, avgCornersAgainst: 4.7, avgFoulsFor: 12.0, avgFoulsAgainst: 12.5, avgYellowCardsFor: 1.8, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.05 },
  TUR: { avgCornersFor: 5.0, avgCornersAgainst: 4.8, avgFoulsFor: 14.5, avgFoulsAgainst: 11.0, avgYellowCardsFor: 2.5, avgYellowCardsAgainst: 1.7, redCardsPerMatch: 0.08 },
  BIH: { avgCornersFor: 4.8, avgCornersAgainst: 5.2, avgFoulsFor: 14.0, avgFoulsAgainst: 11.5, avgYellowCardsFor: 2.4, avgYellowCardsAgainst: 1.8, redCardsPerMatch: 0.08 },
  URU: { avgCornersFor: 5.0, avgCornersAgainst: 4.8, avgFoulsFor: 15.0, avgFoulsAgainst: 11.0, avgYellowCardsFor: 2.6, avgYellowCardsAgainst: 1.7, redCardsPerMatch: 0.09 },
  COL: { avgCornersFor: 5.0, avgCornersAgainst: 4.8, avgFoulsFor: 13.0, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.1, avgYellowCardsAgainst: 1.9, redCardsPerMatch: 0.06 },
  ECU: { avgCornersFor: 4.6, avgCornersAgainst: 5.1, avgFoulsFor: 13.5, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.2, avgYellowCardsAgainst: 1.9, redCardsPerMatch: 0.07 },
  PAR: { avgCornersFor: 4.5, avgCornersAgainst: 5.0, avgFoulsFor: 14.0, avgFoulsAgainst: 11.5, avgYellowCardsFor: 2.3, avgYellowCardsAgainst: 1.8, redCardsPerMatch: 0.08 },
  MEX: { avgCornersFor: 5.2, avgCornersAgainst: 4.6, avgFoulsFor: 13.0, avgFoulsAgainst: 11.5, avgYellowCardsFor: 1.9, avgYellowCardsAgainst: 1.7, redCardsPerMatch: 0.06 },
  USA: { avgCornersFor: 5.2, avgCornersAgainst: 4.8, avgFoulsFor: 12.0, avgFoulsAgainst: 12.5, avgYellowCardsFor: 1.8, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.05 },
  CAN: { avgCornersFor: 5.0, avgCornersAgainst: 5.0, avgFoulsFor: 12.5, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.0, avgYellowCardsAgainst: 1.8, redCardsPerMatch: 0.05 },
  PAN: { avgCornersFor: 4.0, avgCornersAgainst: 5.5, avgFoulsFor: 14.0, avgFoulsAgainst: 11.5, avgYellowCardsFor: 2.4, avgYellowCardsAgainst: 1.7, redCardsPerMatch: 0.08 },
  CUW: { avgCornersFor: 3.5, avgCornersAgainst: 6.2, avgFoulsFor: 14.5, avgFoulsAgainst: 10.5, avgYellowCardsFor: 2.5, avgYellowCardsAgainst: 1.6, redCardsPerMatch: 0.08 },
  HAI: { avgCornersFor: 3.5, avgCornersAgainst: 6.0, avgFoulsFor: 14.0, avgFoulsAgainst: 10.5, avgYellowCardsFor: 2.4, avgYellowCardsAgainst: 1.6, redCardsPerMatch: 0.08 },
  JPN: { avgCornersFor: 5.0, avgCornersAgainst: 4.8, avgFoulsFor: 11.0, avgFoulsAgainst: 12.5, avgYellowCardsFor: 1.6, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.03 },
  KOR: { avgCornersFor: 4.8, avgCornersAgainst: 5.0, avgFoulsFor: 11.5, avgFoulsAgainst: 12.0, avgYellowCardsFor: 1.7, avgYellowCardsAgainst: 1.9, redCardsPerMatch: 0.04 },
  AUS: { avgCornersFor: 4.8, avgCornersAgainst: 5.2, avgFoulsFor: 13.0, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.0, avgYellowCardsAgainst: 1.9, redCardsPerMatch: 0.06 },
  IRN: { avgCornersFor: 4.0, avgCornersAgainst: 5.0, avgFoulsFor: 14.0, avgFoulsAgainst: 11.0, avgYellowCardsFor: 2.3, avgYellowCardsAgainst: 1.7, redCardsPerMatch: 0.07 },
  QAT: { avgCornersFor: 4.0, avgCornersAgainst: 5.8, avgFoulsFor: 13.0, avgFoulsAgainst: 11.0, avgYellowCardsFor: 2.1, avgYellowCardsAgainst: 1.7, redCardsPerMatch: 0.06 },
  KSA: { avgCornersFor: 4.2, avgCornersAgainst: 5.5, avgFoulsFor: 14.0, avgFoulsAgainst: 11.5, avgYellowCardsFor: 2.3, avgYellowCardsAgainst: 1.8, redCardsPerMatch: 0.07 },
  IRQ: { avgCornersFor: 4.2, avgCornersAgainst: 5.5, avgFoulsFor: 14.5, avgFoulsAgainst: 11.0, avgYellowCardsFor: 2.5, avgYellowCardsAgainst: 1.7, redCardsPerMatch: 0.08 },
  UZB: { avgCornersFor: 4.3, avgCornersAgainst: 5.3, avgFoulsFor: 13.5, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.2, avgYellowCardsAgainst: 1.9, redCardsPerMatch: 0.07 },
  JOR: { avgCornersFor: 4.0, avgCornersAgainst: 5.5, avgFoulsFor: 14.0, avgFoulsAgainst: 11.5, avgYellowCardsFor: 2.4, avgYellowCardsAgainst: 1.8, redCardsPerMatch: 0.07 },
  MAR: { avgCornersFor: 4.5, avgCornersAgainst: 4.0, avgFoulsFor: 12.5, avgFoulsAgainst: 13.0, avgYellowCardsFor: 1.9, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.05 },
  SEN: { avgCornersFor: 4.5, avgCornersAgainst: 5.0, avgFoulsFor: 13.5, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.2, avgYellowCardsAgainst: 1.9, redCardsPerMatch: 0.06 },
  GHA: { avgCornersFor: 4.3, avgCornersAgainst: 5.3, avgFoulsFor: 13.5, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.3, avgYellowCardsAgainst: 1.9, redCardsPerMatch: 0.07 },
  TUN: { avgCornersFor: 4.2, avgCornersAgainst: 5.2, avgFoulsFor: 13.5, avgFoulsAgainst: 11.5, avgYellowCardsFor: 2.2, avgYellowCardsAgainst: 1.8, redCardsPerMatch: 0.06 },
  CIV: { avgCornersFor: 4.5, avgCornersAgainst: 5.0, avgFoulsFor: 13.5, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.2, avgYellowCardsAgainst: 1.8, redCardsPerMatch: 0.06 },
  EGY: { avgCornersFor: 4.5, avgCornersAgainst: 4.8, avgFoulsFor: 12.5, avgFoulsAgainst: 12.5, avgYellowCardsFor: 2.0, avgYellowCardsAgainst: 2.0, redCardsPerMatch: 0.06 },
  ALG: { avgCornersFor: 4.3, avgCornersAgainst: 5.2, avgFoulsFor: 13.5, avgFoulsAgainst: 12.0, avgYellowCardsFor: 2.2, avgYellowCardsAgainst: 1.9, redCardsPerMatch: 0.07 },
  ZAF: { avgCornersFor: 4.0, avgCornersAgainst: 5.5, avgFoulsFor: 13.5, avgFoulsAgainst: 10.5, avgYellowCardsFor: 2.2, avgYellowCardsAgainst: 1.6, redCardsPerMatch: 0.07 },
  COD: { avgCornersFor: 4.2, avgCornersAgainst: 5.3, avgFoulsFor: 13.8, avgFoulsAgainst: 11.8, avgYellowCardsFor: 2.3, avgYellowCardsAgainst: 1.8, redCardsPerMatch: 0.07 },
  CPV: { avgCornersFor: 3.8, avgCornersAgainst: 5.8, avgFoulsFor: 14.0, avgFoulsAgainst: 10.5, avgYellowCardsFor: 2.4, avgYellowCardsAgainst: 1.7, redCardsPerMatch: 0.08 },
  NZL: { avgCornersFor: 3.8, avgCornersAgainst: 5.8, avgFoulsFor: 13.0, avgFoulsAgainst: 11.0, avgYellowCardsFor: 2.2, avgYellowCardsAgainst: 1.8, redCardsPerMatch: 0.06 },
};

// ── Poisson helpers ───────────────────────────────────────────────────────────

function poissonPMF(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logp = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logp -= Math.log(i);
  return Math.exp(logp);
}

function poissonCDF(upTo, lambda) {
  let sum = 0;
  for (let i = 0; i <= Math.floor(upTo); i++) sum += poissonPMF(i, lambda);
  return Math.min(1, sum);
}

function overProb(line, lambda) {
  return Math.max(0, 1 - poissonCDF(Math.floor(line), lambda));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Calcula estadísticas avanzadas para un partido teamA vs teamB.
 *
 * Fórmula: expected(stat, side) = (teamSide.statFor + teamOpponent.statAgainst) / 2
 *
 * @param {string} idA — TLA del equipo A
 * @param {string} idB — TLA del equipo B
 * @returns {DisciplineResult}
 */
export function analyzeDiscipline(idA, idB) {
  const a = DISCIPLINE[idA] ?? DEFAULTS;
  const b = DISCIPLINE[idB] ?? DEFAULTS;
  const dataQuality = (DISCIPLINE[idA] && DISCIPLINE[idB]) ? "estimated" : "insufficient";

  // Córners esperados
  const cornersA     = (a.avgCornersFor + b.avgCornersAgainst) / 2;
  const cornersB     = (b.avgCornersFor + a.avgCornersAgainst) / 2;
  const cornersTotal = cornersA + cornersB;

  // Faltas esperadas
  const foulsA     = (a.avgFoulsFor + b.avgFoulsAgainst) / 2;
  const foulsB     = (b.avgFoulsFor + a.avgFoulsAgainst) / 2;
  const foulsTotal = foulsA + foulsB;

  // Amarillas esperadas
  const yellowsA     = (a.avgYellowCardsFor + b.avgYellowCardsAgainst) / 2;
  const yellowsB     = (b.avgYellowCardsFor + a.avgYellowCardsAgainst) / 2;
  const yellowsTotal = yellowsA + yellowsB;

  // Probabilidad de tarjeta roja: 1 − P(sin roja de A) × P(sin roja de B)
  // Modelo Poisson: P(sin roja) ≈ e^(−redCardsPerMatch)
  const redCardProb = 1 - Math.exp(-(a.redCardsPerMatch + b.redCardsPerMatch));

  // Over/Under córners (Poisson con λ = cornersTotal)
  const over85  = overProb(8.5,  cornersTotal);
  const over95  = overProb(9.5,  cornersTotal);
  const over105 = overProb(10.5, cornersTotal);

  return {
    corners: {
      expectedA: cornersA,
      expectedB: cornersB,
      expectedTotal: cornersTotal,
      over85,
      over95,
      over105,
    },
    fouls: {
      expectedA: foulsA,
      expectedB: foulsB,
      expectedTotal: foulsTotal,
    },
    yellowCards: {
      expectedA: yellowsA,
      expectedB: yellowsB,
      expectedTotal: yellowsTotal,
    },
    redCardProbability: redCardProb,
    dataQuality,
  };
}
