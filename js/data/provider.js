/**
 * Data Provider — punto de acceso único a los datos de la aplicación
 *
 * ── Uso normal (el resto de la app solo importa desde aquí) ──────────────────
 *
 *   import { getTeams, getTeamById } from "../data/provider.js";
 *   const teams = getTeams();
 *
 * ── Cambiar de mock a API real ───────────────────────────────────────────────
 *
 *   1. Implementar el backend proxy con la API key en variables de entorno.
 *      (ver apiAdapter.js para la arquitectura recomendada)
 *   2. Cambiar DATA_SOURCE a "api" en este archivo.
 *   3. Descomentar el import de apiAdapter.
 *   4. Las funciones del apiAdapter son async → main.js necesitará await.
 *      Convertir la función init() en async function init() y usar await al
 *      llamar getTeams() y getTeamById().
 *
 * ── Nota sobre calibrator.js ─────────────────────────────────────────────────
 *
 *   calibrator.js importa directamente desde teams.js y matches_mock.js.
 *   Esto es intencional: es una herramienta de backtesting que usa un
 *   dataset de entrenamiento fijo. Para calibrar con datos reales, crear
 *   un nuevo archivo de matches y actualizar el import en calibrator.js.
 *   No enrutar el calibrator a través del provider.
 */

import * as mockAdapter from "./adapters/mockAdapter.js";

// Descomentar cuando el backend esté listo:
// import * as apiAdapter from "./adapters/apiAdapter.js";

// ── Configuración ─────────────────────────────────────────────────────────────

/** Fuente de datos activa. Cambiar a "api" para usar el backend proxy. */
export const DATA_SOURCE = "mock";

// Selección del adaptador — cambiar la línea de abajo al activar la API:
const adapter = mockAdapter;
// const adapter = DATA_SOURCE === "api" ? apiAdapter : mockAdapter;

// ── Interfaz pública ──────────────────────────────────────────────────────────

/**
 * Todos los equipos disponibles, ordenados por ELO descendente.
 * @returns {Array<TeamRecord>}
 */
export const getTeams = () => adapter.getTeams();

/**
 * Un equipo por su ID ISO (ej: "ARG", "BRA", "FRA").
 * @param {string} id
 * @returns {TeamRecord | null}
 */
export const getTeamById = (id) => adapter.getTeamById(id);

/**
 * Estadísticas modelables de un equipo (sin metadata de display).
 * @param {string} teamId
 * @returns {{ id, elo, avgGoalsFor, avgGoalsAgainst, recentResults, confederation } | null}
 */
export const getTeamStats = (teamId) => adapter.getTeamStats(teamId);

/**
 * Partidos recientes de un equipo (home o away).
 * @param {string} teamId
 * @returns {Array<MatchRecord>}
 */
export const getRecentMatches = (teamId) => adapter.getRecentMatches(teamId);

/**
 * Dataset histórico completo para backtesting y calibración.
 * @returns {Array<MatchRecord>}
 */
export const getHistoricalMatches = () => adapter.getHistoricalMatches();

/**
 * Promedio global de goles (μ en el modelo Poisson).
 * @returns {number}
 */
export const getGlobalAvgGoals = () => adapter.getGlobalAvgGoals();
