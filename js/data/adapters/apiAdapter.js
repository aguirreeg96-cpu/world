/**
 * API Adapter — stub para datos reales desde un backend proxy
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠  POR QUÉ NO HAY CLAVES API AQUÍ — LEER ANTES DE MODIFICAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Las claves de API nunca deben aparecer en código frontend porque:
 *
 *   1. Cualquier usuario puede ver el código fuente con DevTools → Network
 *      o simplemente haciendo "Ver código fuente".
 *   2. Los bundlers no ofuscan strings suficientemente para proteger claves.
 *   3. Si el key termina en un repositorio público (GitHub, etc.), bots de
 *      scraping lo detectan en minutos y agotan tu quota.
 *
 * ── Arquitectura recomendada ─────────────────────────────────────────────────
 *
 *   [Browser]  → fetch("/api/teams")       → sin key, mismo dominio
 *   [Backend]  → fetch("https://api.football-data.org/v4/teams",
 *                       { "X-Auth-Token": process.env.FD_API_KEY })
 *   [API externa]
 *
 * El backend lee la key desde una variable de entorno (nunca del código).
 * Opciones de backend sin servidor:
 *
 *   • Vercel Edge Functions — /api/teams.js, FD_API_KEY en el dashboard de Vercel
 *   • Netlify Functions    — /.netlify/functions/teams, variable en Netlify UI
 *   • Cloudflare Workers   — wrangler secret put FD_API_KEY
 *   • Express propio       — require('dotenv').config() + process.env.FD_API_KEY
 *
 * ── APIs de fútbol disponibles ───────────────────────────────────────────────
 *
 *   football-data.org (recomendada)
 *     Plan gratuito: 10 req/min, acceso a selecciones nacionales e histórico.
 *     Doc: https://www.football-data.org/documentation/quickstart
 *
 *   api-football (RapidAPI)
 *     Plan freemium, mayor cobertura de ligas.
 *     Doc: https://www.api-football.com/documentation-v3
 *
 *   clubelo.com / eloratings.net
 *     Ratings ELO públicos y gratuitos sin autenticación (solo lectura).
 *     Pueden complementar datos de goles de otra fuente.
 *
 * ── Normalización ────────────────────────────────────────────────────────────
 *
 * Cada API devuelve estructuras distintas. Este adaptador transforma la
 * respuesta al shape interno que consume el pipeline matemático:
 *
 *   {
 *     id:              string,   // ISO 3166-1 alpha-3 ("ARG", "BRA"...)
 *     name:            string,
 *     flag:            string,   // emoji unicode
 *     confederation:   string,   // "UEFA" | "CONMEBOL" | "CAF" | ...
 *     elo:             number,
 *     avgGoalsFor:     number,
 *     avgGoalsAgainst: number,
 *     recentResults:   string[], // ["W", "D", "L"] más reciente primero
 *   }
 */

// URL base de TU backend proxy — no apuntar nunca a la API externa directamente
const PROXY_BASE = "/api"; // ajustar al path real del backend (ej: "https://tu-app.vercel.app/api")

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchJSON(path) {
  const res = await fetch(`${PROXY_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`[apiAdapter] HTTP ${res.status} en ${PROXY_BASE}${path}`);
  }
  return res.json();
}

/**
 * Normaliza un equipo de football-data.org al shape interno.
 * Adaptar según la estructura real de la API que elijas.
 */
function normalizeTeam(raw) {
  return {
    id:              raw.tla   ?? raw.id,             // "ARG" (three-letter abbreviation)
    name:            raw.name,
    flag:            raw.flag  ?? "🏳",               // football-data.org no siempre incluye emoji
    confederation:   raw.area?.name ?? "?",
    elo:             raw.elo   ?? 1700,                // calcular desde histórico si la API no lo da
    avgGoalsFor:     raw.stats?.avgGoalsFor     ?? 1.5,
    avgGoalsAgainst: raw.stats?.avgGoalsAgainst ?? 1.1,
    recentResults:   raw.recentResults          ?? [],
  };
}

/**
 * Normaliza un partido de la API al formato interno.
 * Resultado de football-data.org: { homeTeam: { tla }, awayTeam: { tla }, score: { fullTime: { home, away } } }
 */
function normalizeMatch(raw) {
  return {
    home:      raw.homeTeam?.tla ?? raw.home,
    away:      raw.awayTeam?.tla ?? raw.away,
    goalsHome: raw.score?.fullTime?.home ?? raw.goalsHome ?? 0,
    goalsAway: raw.score?.fullTime?.away ?? raw.goalsAway ?? 0,
  };
}

// ── Funciones públicas ────────────────────────────────────────────────────────

/**
 * Todos los equipos disponibles, ordenados por ELO descendente.
 * Requiere endpoint: GET /api/teams → { teams: [...] }
 */
export async function getTeams() {
  const data = await fetchJSON("/teams");
  return data.teams.map(normalizeTeam).sort((a, b) => b.elo - a.elo);
}

/**
 * Un equipo por su ID.
 * Requiere endpoint: GET /api/teams/:id → { ...teamData }
 */
export async function getTeamById(id) {
  const data = await fetchJSON(`/teams/${encodeURIComponent(id)}`);
  return normalizeTeam(data);
}

/**
 * Estadísticas modelables de un equipo.
 * Requiere endpoint: GET /api/teams/:id/stats → { elo, avgGoalsFor, ... }
 */
export async function getTeamStats(teamId) {
  const data = await fetchJSON(`/teams/${encodeURIComponent(teamId)}/stats`);
  return {
    id:              teamId,
    elo:             data.elo,
    avgGoalsFor:     data.avgGoalsFor,
    avgGoalsAgainst: data.avgGoalsAgainst,
    recentResults:   data.recentResults ?? [],
    confederation:   data.confederation ?? "?",
  };
}

/**
 * Últimos partidos de un equipo.
 * Requiere endpoint: GET /api/teams/:id/matches?limit=8 → { matches: [...] }
 */
export async function getRecentMatches(teamId) {
  const data = await fetchJSON(`/teams/${encodeURIComponent(teamId)}/matches?limit=8`);
  return data.matches.map(normalizeMatch);
}

/**
 * Dataset histórico para backtesting.
 * Requiere endpoint: GET /api/matches/historical → { matches: [...] }
 *
 * NOTA: Para que el calibrator.js use datos reales, habría que pasarle
 * este dataset explícitamente o crear un calibrator async. Ver documentación
 * en calibrator.js.
 */
export async function getHistoricalMatches() {
  const data = await fetchJSON("/matches/historical");
  return data.matches.map(normalizeMatch);
}

/**
 * Promedio global de goles para normalizar λ en el modelo Poisson.
 * Requiere endpoint: GET /api/stats/global → { avgGoalsPerMatch: number }
 */
export async function getGlobalAvgGoals() {
  const data = await fetchJSON("/stats/global");
  return data.avgGoalsPerMatch ?? 1.35;
}
