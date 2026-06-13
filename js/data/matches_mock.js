/**
 * Dataset de partidos históricos — formato estándar para backtesting
 *
 * Cada entrada representa un partido disputado en campo neutro o en sede
 * de torneo. Los IDs de equipo corresponden a los definidos en teams.js.
 *
 * Formato:
 *   home       {string}  ID del equipo "local" (primer equipo analizado)
 *   away       {string}  ID del equipo "visitante" (segundo equipo)
 *   goalsHome  {number}  Goles anotados por home
 *   goalsAway  {number}  Goles anotados por away
 *
 * Para reemplazar con datos reales:
 *   - Exportar el mismo formato desde un parser CSV (ver futuras versiones)
 *   - O desde una API externa (football-data.org, etc.)
 *   - El calibrator.js consume este módulo directamente: solo cambiar
 *     MATCHES_MOCK para recalibrar el modelo con datos reales.
 *
 * Distribución de este dataset (20 partidos):
 *   Victoria home : 11/20 = 55%
 *   Empate        :  5/20 = 25%
 *   Victoria away :  4/20 = 20%
 */

export const MATCHES_MOCK = [

  // ── Alta diferencia de ELO (ΔR > 150) ────────────────────────────────────
  // El favorito gana con alta probabilidad — casos "fáciles" para el modelo

  { home: "ARG", away: "MEX", goalsHome: 3, goalsAway: 1 }, // ARG +200 → victoria ✓
  { home: "BRA", away: "KOR", goalsHome: 2, goalsAway: 0 }, // BRA +230 → victoria ✓
  { home: "FRA", away: "AUS", goalsHome: 2, goalsAway: 0 }, // FRA +270 → victoria ✓
  { home: "ESP", away: "NGA", goalsHome: 2, goalsAway: 1 }, // ESP +210 → victoria ✓
  { home: "ENG", away: "AUS", goalsHome: 2, goalsAway: 0 }, // ENG +230 → victoria ✓

  // ── Diferencia media de ELO (ΔR 60–150) ──────────────────────────────────
  // El modelo debe capturar tanto victorias del favorito como sorpresas

  { home: "ARG", away: "GER", goalsHome: 1, goalsAway: 0 }, // ARG +100 → victoria ✓
  { home: "FRA", away: "BEL", goalsHome: 2, goalsAway: 0 }, // FRA +110 → victoria ✓
  { home: "BRA", away: "POR", goalsHome: 0, goalsAway: 1 }, // BRA +80  → SORPRESA away ✗
  { home: "ESP", away: "URU", goalsHome: 1, goalsAway: 0 }, // ESP +80  → victoria ✓
  { home: "ENG", away: "ITA", goalsHome: 2, goalsAway: 0 }, // ENG +100 → victoria ✓

  // ── Muy equilibrados (ΔR < 60) ───────────────────────────────────────────
  // Alta incertidumbre — empates y sorpresas son esperables

  { home: "ARG", away: "FRA", goalsHome: 0, goalsAway: 0 }, // ΔR=+30  → empate
  { home: "BRA", away: "ESP", goalsHome: 2, goalsAway: 1 }, // ΔR=+40  → victoria ✓
  { home: "ENG", away: "GER", goalsHome: 1, goalsAway: 1 }, // ΔR=+30  → empate
  { home: "POR", away: "NED", goalsHome: 2, goalsAway: 1 }, // ΔR=+10  → victoria ✓
  { home: "NED", away: "BEL", goalsHome: 1, goalsAway: 2 }, // ΔR=+10  → SORPRESA away ✗
  { home: "ITA", away: "CRO", goalsHome: 1, goalsAway: 1 }, // ΔR=+10  → empate
  { home: "FRA", away: "BRA", goalsHome: 1, goalsAway: 2 }, // ΔR=+10  → SORPRESA away ✗
  { home: "SEN", away: "MAR", goalsHome: 1, goalsAway: 0 }, // ΔR=+10  → victoria ✓
  { home: "JPN", away: "KOR", goalsHome: 1, goalsAway: 0 }, // ΔR=+40  → victoria ✓
  { home: "GER", away: "ESP", goalsHome: 0, goalsAway: 0 }, // ΔR=-20  → empate (GER subperforma)

];
