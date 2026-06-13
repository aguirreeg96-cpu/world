/**
 * Mock Adapter — datos de demostración
 *
 * Delega en teams.js y matches_mock.js, que contienen los datos estáticos de
 * referencia. Este adaptador actúa como contrato de shape para los demás:
 * todos los adaptadores deben devolver datos con la misma estructura.
 *
 * No modificar este archivo cuando se conecte una API real.
 * Crear o completar apiAdapter.js en su lugar y cambiar DATA_SOURCE en provider.js.
 */

import { TEAMS_DATA, getAllTeams, getTeamById as _getById } from "../teams.js";
import { MATCHES_MOCK } from "../matches_mock.js";

/** Todos los equipos, ordenados por ELO descendente. */
export function getTeams() {
  return getAllTeams();
}

/**
 * Un equipo por su ID ISO (ej: "ARG", "BRA").
 * Devuelve null si no existe.
 */
export function getTeamById(id) {
  return _getById(id);
}

/**
 * Estadísticas modelables de un equipo (sin metadata de UI).
 * Este subconjunto es lo que consume el pipeline matemático.
 */
export function getTeamStats(teamId) {
  const team = _getById(teamId);
  if (!team) return null;
  return {
    id:              team.id,
    elo:             team.elo,
    avgGoalsFor:     team.avgGoalsFor,
    avgGoalsAgainst: team.avgGoalsAgainst,
    recentResults:   team.recentResults,
    confederation:   team.confederation,
  };
}

/**
 * Partidos recientes de un equipo (home o away) del dataset mock.
 * Útil para inspección, no para calibración (esa usa getHistoricalMatches).
 */
export function getRecentMatches(teamId) {
  return MATCHES_MOCK.filter(m => m.home === teamId || m.away === teamId);
}

/** Dataset histórico completo para backtesting y calibración. */
export function getHistoricalMatches() {
  return [...MATCHES_MOCK];
}

/** Promedio global de goles (μ en el modelo Poisson). */
export function getGlobalAvgGoals() {
  return TEAMS_DATA.globalAvgGoals;
}
