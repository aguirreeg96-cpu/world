/**
 * Data Provider — punto de acceso único a los datos de la aplicación
 *
 * ── Cambiar de mock a API real ───────────────────────────────────────────────
 *
 *   Cambiar DATA_SOURCE a "api" en este archivo.
 *   Las funciones de apiAdapter son async y tienen fallback automático al mock.
 *
 * ── Nota sobre calibrator.js ─────────────────────────────────────────────────
 *
 *   calibrator.js importa directamente desde teams.js y matches_mock.js.
 *   Esto es intencional: es una herramienta de backtesting con dataset fijo.
 *   No enrutar el calibrator a través del provider.
 */

import * as mockAdapter from "./adapters/mockAdapter.js";
import * as apiAdapter  from "./adapters/apiAdapter.js";

// ── Configuración ─────────────────────────────────────────────────────────────

/** Cambiar a "api" para usar el backend proxy con fallback automático al mock. */
export const DATA_SOURCE = "mock";

const adapter = DATA_SOURCE === "api" ? apiAdapter : mockAdapter;

// ── Interfaz pública — todas las funciones devuelven Promises ─────────────────
// Promise.resolve() envuelve los valores síncronos del mockAdapter para que
// el resto de la app use await de forma uniforme independientemente del adapter.

/**
 * Todos los equipos disponibles, ordenados por ELO descendente.
 * @returns {Promise<Array<TeamRecord>>}
 */
export const getTeams = () => Promise.resolve(adapter.getTeams());

/**
 * Un equipo por su ID ISO (ej: "ARG", "BRA", "FRA").
 * @param {string} id
 * @returns {Promise<TeamRecord | null>}
 */
export const getTeamById = (id) => Promise.resolve(adapter.getTeamById(id));

/**
 * Estadísticas modelables de un equipo (sin metadata de display).
 * @param {string} teamId
 * @returns {Promise<{ id, elo, avgGoalsFor, avgGoalsAgainst, recentResults, confederation } | null>}
 */
export const getTeamStats = (teamId) => Promise.resolve(adapter.getTeamStats(teamId));

/**
 * Partidos recientes de un equipo (home o away).
 * @param {string} teamId
 * @returns {Promise<Array<MatchRecord>>}
 */
export const getRecentMatches = (teamId) => Promise.resolve(adapter.getRecentMatches(teamId));

/**
 * Dataset histórico completo para backtesting y calibración.
 * @returns {Promise<Array<MatchRecord>>}
 */
export const getHistoricalMatches = () => Promise.resolve(adapter.getHistoricalMatches());

/**
 * Promedio global de goles (μ en el modelo Poisson).
 * @returns {Promise<number>}
 */
export const getGlobalAvgGoals = () => Promise.resolve(adapter.getGlobalAvgGoals());
