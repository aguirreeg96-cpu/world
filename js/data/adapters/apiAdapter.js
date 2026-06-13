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
 *   [Netlify Function]  → fetch("https://www.thesportsdb.com/api/v1/json/{key}/...",
 *                               con clave desde process.env.THESPORTSDB_API_KEY)
 *   [TheSportsDB API v1]
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
 * Dataset histórico completo para backtesting y Head to Head.
 *
 * Cadena de fallback:
 *   1. Proxy Netlify (resource=matches) — fuente principal
 *   2. Fetch directo de /js/data/worldcup_2022.json — asset estático siempre disponible
 *   3. mockAdapter — último recurso (datos ficticios, solo para dev sin red)
 *
 * IMPORTANTE: el mock tiene partidos inventados (ej: ARG vs FRA 0-0) pensados
 * para calibrar el modelo, NO para mostrar marcadores reales. Por eso el fallback
 * al asset estático es crítico antes de llegar al mock.
 */
export async function getHistoricalMatches() {
  // 1. Proxy Netlify
  try {
    const { matches } = await ensureMatches();
    console.info("[apiAdapter] getHistoricalMatches: proxy OK,", matches.length, "partidos");
    return matches;
  } catch (proxyErr) {
    console.warn("[apiAdapter] getHistoricalMatches proxy fallback →", proxyErr.message);
  }

  // 2. Asset estático (siempre disponible en Netlify, sin key, sin función)
  try {
    const wc = await fetch("/js/data/worldcup_2022.json").then(r => r.json());
    if (Array.isArray(wc.matches) && wc.matches.length > 0) {
      console.info("[apiAdapter] getHistoricalMatches: asset estático OK,", wc.matches.length, "partidos");
      return wc.matches;
    }
  } catch (staticErr) {
    console.warn("[apiAdapter] getHistoricalMatches asset estático fallback →", staticErr.message);
  }

  // 3. Mock — solo datos de demostración, marcadores NO reales
  console.warn("[apiAdapter] getHistoricalMatches: usando mock (datos ficticios)");
  return mockAdapter.getHistoricalMatches();
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
