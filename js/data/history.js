/**
 * Historical Match Dataset — DATOS DE DEMOSTRACIÓN
 * 36 partidos ficticios entre las selecciones del dataset.
 * Usados exclusivamente para calibración y backtesting del modelo.
 *
 * Distribución: ~58% victoria equipo A · ~28% empate · ~14% victoria equipo B
 * (Refleja que "equipo A" suele ser el de mayor ELO en este dataset)
 */

export const HISTORY = [

  // ── Gran diferencia de ELO (ΔR > 150) — favorito gana casi siempre ──────
  { id:  1, teamA: "ARG", teamB: "MEX", goalsA: 2, goalsB: 0 }, // ARG +200 ✓
  { id:  2, teamA: "BRA", teamB: "KOR", goalsA: 3, goalsB: 0 }, // BRA +230 ✓
  { id:  3, teamA: "FRA", teamB: "AUS", goalsA: 2, goalsB: 1 }, // FRA +270 ✓
  { id:  4, teamA: "ESP", teamB: "NGA", goalsA: 2, goalsB: 1 }, // ESP +210 ✓
  { id:  5, teamA: "ARG", teamB: "JPN", goalsA: 0, goalsB: 0 }, // Draw  (ARG+230 — sorpresa)
  { id:  6, teamA: "ARG", teamB: "URU", goalsA: 3, goalsB: 0 }, // ARG +160 ✓
  { id:  7, teamA: "FRA", teamB: "ITA", goalsA: 1, goalsB: 0 }, // FRA +140 ✓
  { id:  8, teamA: "ENG", teamB: "ITA", goalsA: 2, goalsB: 0 }, // ENG +100 ✓

  // ── Diferencia media (ΔR 60–150) — favorito gana, con excepciones ────────
  { id:  9, teamA: "BRA", teamB: "URU", goalsA: 1, goalsB: 2 }, // URU sorpresa (+120 BRA)
  { id: 10, teamA: "GER", teamB: "CRO", goalsA: 2, goalsB: 1 }, // GER +80 ✓
  { id: 11, teamA: "ARG", teamB: "GER", goalsA: 1, goalsB: 0 }, // ARG +100 ✓
  { id: 12, teamA: "FRA", teamB: "BEL", goalsA: 2, goalsB: 0 }, // FRA +110 ✓
  { id: 13, teamA: "NED", teamB: "MEX", goalsA: 1, goalsB: 1 }, // Draw (NED +70)
  { id: 14, teamA: "ESP", teamB: "URU", goalsA: 1, goalsB: 0 }, // ESP +80 ✓
  { id: 15, teamA: "BRA", teamB: "POR", goalsA: 0, goalsB: 1 }, // POR sorpresa (+80 BRA)
  { id: 16, teamA: "ENG", teamB: "AUS", goalsA: 2, goalsB: 0 }, // ENG +230 ✓

  // ── Muy equilibrados (ΔR < 60) — alta incertidumbre ──────────────────────
  { id: 17, teamA: "ARG", teamB: "FRA", goalsA: 0, goalsB: 0 }, // Draw (ARG +30)
  { id: 18, teamA: "BRA", teamB: "ESP", goalsA: 2, goalsB: 1 }, // BRA +40 ✓
  { id: 19, teamA: "ENG", teamB: "GER", goalsA: 1, goalsB: 1 }, // Draw (ENG +30)
  { id: 20, teamA: "POR", teamB: "NED", goalsA: 2, goalsB: 1 }, // POR +10 ✓
  { id: 21, teamA: "NED", teamB: "BEL", goalsA: 1, goalsB: 2 }, // BEL sorpresa (NED +10)
  { id: 22, teamA: "ITA", teamB: "CRO", goalsA: 1, goalsB: 1 }, // Draw (ITA +10)
  { id: 23, teamA: "FRA", teamB: "BRA", goalsA: 1, goalsB: 2 }, // BRA sorpresa (FRA +10)
  { id: 24, teamA: "GER", teamB: "ESP", goalsA: 2, goalsB: 0 }, // GER sorpresa (GER -20)
  { id: 25, teamA: "URU", teamB: "BEL", goalsA: 0, goalsB: 0 }, // Draw (URU -20)
  { id: 26, teamA: "SEN", teamB: "MAR", goalsA: 1, goalsB: 0 }, // SEN +10 ✓
  { id: 27, teamA: "JPN", teamB: "KOR", goalsA: 1, goalsB: 0 }, // JPN +40 ✓
  { id: 28, teamA: "USA", teamB: "NGA", goalsA: 2, goalsB: 1 }, // USA +30 ✓
  { id: 29, teamA: "MEX", teamB: "SEN", goalsA: 1, goalsB: 1 }, // Draw (MEX +10)
  { id: 30, teamA: "BEL", teamB: "KOR", goalsA: 1, goalsB: 0 }, // BEL +130 ✓
  { id: 31, teamA: "POR", teamB: "MEX", goalsA: 2, goalsB: 0 }, // POR +80 ✓
  { id: 32, teamA: "ESP", teamB: "CRO", goalsA: 0, goalsB: 0 }, // Draw (ESP +100 — shock)
  { id: 33, teamA: "ARG", teamB: "ITA", goalsA: 1, goalsB: 1 }, // Draw (ARG +170 — shock)
  { id: 34, teamA: "ENG", teamB: "POR", goalsA: 1, goalsB: 1 }, // Draw (ENG +50)
  { id: 35, teamA: "URU", teamB: "SEN", goalsA: 2, goalsB: 1 }, // URU +50 ✓
  { id: 36, teamA: "MAR", teamB: "JPN", goalsA: 0, goalsB: 1 }, // JPN sorpresa (MAR +10)
];
