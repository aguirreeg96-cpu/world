/**
 * API Adapter — consume el proxy serverless en /.netlify/functions/football-data
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠  SEGURIDAD — LEER ANTES DE MODIFICAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * La clave de la API NUNCA debe aparecer en código frontend. Este adaptador
 * llama únicamente al proxy serverless propio (mismo dominio). El proxy es
 * quien guarda y usa la clave en una variable de entorno del servidor.
 *
 *   [Browser]  → fetch("/.netlify/functions/football-data?resource=teams")
 *   [Netlify Function]  → fetch("https://api.football-data.org/v4/...",
 *                               { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY })
 *   [football-data.org]
 *
 * ── Fallback automático ───────────────────────────────────────────────────────
 *
 * Si el proxy devuelve { fallback: true } (clave no configurada) o si la
 * petición falla por cualquier motivo de red, este adaptador cae
 * silenciosamente al mockAdapter. La app sigue funcionando en demo mode.
 *
 * ── Endpoints del proxy ───────────────────────────────────────────────────────
 *
 *   GET /.netlify/functions/football-data?resource=teams
 *       → { teams: [...], globalAvgGoals: number }
 *
 *   GET /.netlify/functions/football-data?resource=matches
 *       → { matches: [{ home, away, goalsHome, goalsAway }] }
 *
 *   GET /.netlify/functions/football-data?resource=team&id=ARG
 *       → { id, name, flag, confederation, elo, avgGoalsFor, avgGoalsAgainst, recentResults }
 */

import * as mockAdapter from "./mockAdapter.js";

const PROXY_BASE = "/.netlify/functions/football-data";

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function fetchProxy(resource, params = {}) {
  const qs = new URLSearchParams({ resource, ...params }).toString();
  const res = await fetch(`${PROXY_BASE}?${qs}`);
  if (!res.ok) {
    throw new Error(`[apiAdapter] HTTP ${res.status} para resource=${resource}`);
  }
  const data = await res.json();
  if (data.fallback) {
    throw new Error(`[apiAdapter] fallback=true: ${data.reason ?? "sin clave API"}`);
  }
  return data;
}

// ── Cache de sesión ───────────────────────────────────────────────────────────
// Se rellena en la primera llamada a getTeams() para evitar llamadas duplicadas.

let _teamsCache = null;      // { teams: [...], globalAvgGoals: number } | null
let _matchesCache = null;    // { matches: [...] } | null

async function ensureTeams() {
  if (_teamsCache) return _teamsCache;
  _teamsCache = await fetchProxy("teams");
  return _teamsCache;
}

async function ensureMatches() {
  if (_matchesCache) return _matchesCache;
  _matchesCache = await fetchProxy("matches");
  return _matchesCache;
}

// ── Funciones públicas ────────────────────────────────────────────────────────

/**
 * Todos los equipos disponibles, ordenados por ELO descendente.
 * Con fallback automático al mockAdapter si el proxy no está disponible.
 */
export async function getTeams() {
  try {
    const { teams } = await ensureTeams();
    return teams;
  } catch (err) {
    console.warn("[apiAdapter] getTeams fallback →", err.message);
    return mockAdapter.getTeams();
  }
}

/**
 * Un equipo por su ID ISO (ej: "ARG").
 * Primero busca en la caché de equipos; si no está, cae al mock.
 */
export async function getTeamById(id) {
  try {
    const { teams } = await ensureTeams();
    return teams.find(t => t.id === id) ?? null;
  } catch (err) {
    console.warn("[apiAdapter] getTeamById fallback →", err.message);
    return mockAdapter.getTeamById(id);
  }
}

/**
 * Estadísticas modelables de un equipo (sin metadata de display).
 */
export async function getTeamStats(teamId) {
  try {
    const { teams } = await ensureTeams();
    const t = teams.find(t => t.id === teamId);
    if (!t) return null;
    return {
      id:              t.id,
      elo:             t.elo,
      avgGoalsFor:     t.avgGoalsFor,
      avgGoalsAgainst: t.avgGoalsAgainst,
      recentResults:   t.recentResults,
      confederation:   t.confederation,
    };
  } catch (err) {
    console.warn("[apiAdapter] getTeamStats fallback →", err.message);
    return mockAdapter.getTeamStats(teamId);
  }
}

/**
 * Partidos del torneo donde participó el equipo.
 */
export async function getRecentMatches(teamId) {
  try {
    const { matches } = await ensureMatches();
    return matches.filter(m => m.home === teamId || m.away === teamId);
  } catch (err) {
    console.warn("[apiAdapter] getRecentMatches fallback →", err.message);
    return mockAdapter.getRecentMatches(teamId);
  }
}

/**
 * Dataset histórico completo para backtesting.
 */
export async function getHistoricalMatches() {
  try {
    const { matches } = await ensureMatches();
    return matches;
  } catch (err) {
    console.warn("[apiAdapter] getHistoricalMatches fallback →", err.message);
    return mockAdapter.getHistoricalMatches();
  }
}

/**
 * Promedio global de goles (μ en el modelo Poisson).
 */
export async function getGlobalAvgGoals() {
  try {
    const { globalAvgGoals } = await ensureTeams();
    return globalAvgGoals ?? 1.35;
  } catch (err) {
    console.warn("[apiAdapter] getGlobalAvgGoals fallback →", err.message);
    return mockAdapter.getGlobalAvgGoals();
  }
}
