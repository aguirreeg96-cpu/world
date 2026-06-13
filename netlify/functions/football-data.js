/**
 * Netlify Function — Proxy seguro para football-data.org
 *
 * Endpoint: /.netlify/functions/football-data
 *
 * ── Recursos disponibles ─────────────────────────────────────────────────────
 *
 *   ?resource=teams           → lista de selecciones con stats computadas
 *   ?resource=matches         → partidos del Mundial 2022 (resultados reales)
 *   ?resource=team&id=ARG     → un equipo específico por TLA code
 *
 * ── Configuración de la API key ──────────────────────────────────────────────
 *
 *   1. Registrarse en https://www.football-data.org/client/register
 *      (plan gratuito: 10 req/min, acceso a todas las competiciones principales)
 *
 *   2. En Netlify UI:
 *      Site settings → Environment variables → Add variable
 *      Key:   FOOTBALL_DATA_API_KEY
 *      Value: tu_token_aqui
 *
 *   3. Para desarrollo local con Netlify CLI:
 *      Crear archivo .env en la raíz del proyecto (ya está en .gitignore):
 *        FOOTBALL_DATA_API_KEY=tu_token_aqui
 *      Luego correr:  netlify dev
 *
 *   JAMÁS escribir la key en este archivo ni en ningún archivo del repo.
 *
 * ── Fuente de datos ───────────────────────────────────────────────────────────
 *
 *   API: football-data.org v4
 *   Competición: FIFA World Cup (code: "WC")
 *   Temporada: 2022 (última edición completa disponible en plan gratuito)
 *
 *   Para actualizar a otra edición: cambiar WC_SEASON más abajo.
 *
 * ── Caché ─────────────────────────────────────────────────────────────────────
 *
 *   Las respuestas exitosas incluyen Cache-Control: s-maxage=3600
 *   para que el CDN de Netlify cachee durante 1 hora. Esto evita agotar
 *   la quota gratuita de 10 req/min en cada visita a la app.
 *
 * ── Node.js ───────────────────────────────────────────────────────────────────
 *
 *   Requiere Node.js 18+ (fetch nativo disponible). Netlify Functions usa
 *   Node 18 por defecto. Sin dependencias npm.
 */

"use strict";

const FD_BASE   = "https://api.football-data.org/v4";
const WC_CODE   = "WC";   // código de la competición en football-data.org
const WC_SEASON = "2022"; // temporada a consultar

// ── ELO estáticos ────────────────────────────────────────────────────────────
// ELO no está disponible en football-data.org. Estos valores se usan como
// fallback/semilla. Actualizar manualmente desde eloratings.net o clubelo.com.
// Los equipos no listados reciben DEFAULT_ELO.

const ELO_TABLE = {
  ARG: 1920, FRA: 1890, BRA: 1880, ENG: 1850, ESP: 1840,
  GER: 1820, POR: 1800, NED: 1790, BEL: 1780, URU: 1760,
  ITA: 1750, CRO: 1740, MEX: 1720, SEN: 1710, MAR: 1700,
  JPN: 1690, USA: 1660, KOR: 1650, NGA: 1630, AUS: 1620,
  QAT: 1580, ECU: 1640, SUI: 1730, WAL: 1680, DEN: 1760,
  TUN: 1600, CRC: 1610, POL: 1700, CMR: 1590, SRB: 1680,
  GHA: 1610, IRN: 1640,
};
const DEFAULT_ELO = 1600;

// Mapa de TLA (código 3 letras de football-data.org) a flag emoji
const FLAG_MAP = {
  ARG: "🇦🇷", FRA: "🇫🇷", BRA: "🇧🇷", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", ESP: "🇪🇸",
  GER: "🇩🇪", POR: "🇵🇹", NED: "🇳🇱", BEL: "🇧🇪", URU: "🇺🇾",
  ITA: "🇮🇹", CRO: "🇭🇷", MEX: "🇲🇽", SEN: "🇸🇳", MAR: "🇲🇦",
  JPN: "🇯🇵", USA: "🇺🇸", KOR: "🇰🇷", NGA: "🇳🇬", AUS: "🇦🇺",
  QAT: "🇶🇦", ECU: "🇪🇨", SUI: "🇨🇭", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", DEN: "🇩🇰",
  TUN: "🇹🇳", CRC: "🇨🇷", POL: "🇵🇱", CMR: "🇨🇲", SRB: "🇷🇸",
  GHA: "🇬🇭", IRN: "🇮🇷",
};

// Mapa de nombre de área (continente/confederación) en football-data.org
// a la abreviatura usada por el modelo
const CONF_MAP = {
  "South America":  "CONMEBOL",
  "Europe":         "UEFA",
  "Africa":         "CAF",
  "North/C. America": "CONCACAF",
  "Asia":           "AFC",
  "Oceania":        "OFC",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fdFetch(path, apiKey) {
  const url = `${FD_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "X-Auth-Token": apiKey },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FD API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Calcula promedios de goles y forma reciente de un equipo desde
 * la lista completa de partidos del torneo.
 */
function computeTeamStats(tla, matches) {
  const teamMatches = matches.filter(
    m => m.homeTeam?.tla === tla || m.awayTeam?.tla === tla
  );

  if (teamMatches.length === 0) {
    return { avgGoalsFor: 1.4, avgGoalsAgainst: 1.1, recentResults: [] };
  }

  let goalsFor = 0;
  let goalsAgainst = 0;
  const results = [];

  for (const m of teamMatches) {
    const isHome  = m.homeTeam?.tla === tla;
    const scored  = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const conceded = isHome ? m.score.fullTime.away : m.score.fullTime.home;

    goalsFor     += scored;
    goalsAgainst += conceded;

    if (scored > conceded)  results.push("W");
    else if (scored < conceded) results.push("L");
    else                    results.push("D");
  }

  return {
    avgGoalsFor:     parseFloat((goalsFor     / teamMatches.length).toFixed(2)),
    avgGoalsAgainst: parseFloat((goalsAgainst / teamMatches.length).toFixed(2)),
    recentResults:   results.slice(-8).reverse(), // últimos 8, más reciente primero
  };
}

/** Normaliza un partido de FD.org al formato interno de la app. */
function normalizeMatch(raw) {
  return {
    home:      raw.homeTeam?.tla,
    away:      raw.awayTeam?.tla,
    goalsHome: raw.score?.fullTime?.home ?? 0,
    goalsAway: raw.score?.fullTime?.away ?? 0,
  };
}

// ── Handlers de recursos ──────────────────────────────────────────────────────

async function handleTeams(apiKey) {
  // Obtener lista de equipos del torneo
  const teamsData   = await fdFetch(`/competitions/${WC_CODE}/teams?season=${WC_SEASON}`, apiKey);
  // Obtener partidos terminados para calcular estadísticas de goles
  const matchesData = await fdFetch(`/competitions/${WC_CODE}/matches?season=${WC_SEASON}&status=FINISHED`, apiKey);
  const matches     = matchesData.matches ?? [];

  const globalAvgGoals = (() => {
    let total = 0;
    let count = 0;
    for (const m of matches) {
      total += (m.score?.fullTime?.home ?? 0) + (m.score?.fullTime?.away ?? 0);
      count++;
    }
    return count > 0 ? parseFloat((total / count).toFixed(3)) : 1.35;
  })();

  const teams = (teamsData.teams ?? []).map(t => {
    const tla   = t.tla ?? t.shortName?.toUpperCase().slice(0, 3);
    const stats = computeTeamStats(tla, matches);
    return {
      id:              tla,
      name:            t.shortName ?? t.name,
      flag:            FLAG_MAP[tla]  ?? "🏳",
      confederation:   CONF_MAP[t.area?.name] ?? t.area?.name ?? "?",
      elo:             ELO_TABLE[tla] ?? DEFAULT_ELO,
      avgGoalsFor:     stats.avgGoalsFor,
      avgGoalsAgainst: stats.avgGoalsAgainst,
      recentResults:   stats.recentResults,
    };
  }).sort((a, b) => b.elo - a.elo);

  return { teams, globalAvgGoals };
}

async function handleMatches(apiKey) {
  const data = await fdFetch(
    `/competitions/${WC_CODE}/matches?season=${WC_SEASON}&status=FINISHED`,
    apiKey
  );
  const matches = (data.matches ?? [])
    .filter(m => m.score?.fullTime?.home !== null && m.score?.fullTime?.away !== null)
    .map(normalizeMatch)
    .filter(m => m.home && m.away);

  return { matches };
}

async function handleTeam(apiKey, id) {
  const { teams } = await handleTeams(apiKey);
  const team = teams.find(t => t.id === id);
  if (!team) throw new Error(`Equipo no encontrado: ${id}`);
  return team;
}

// ── Handler principal de la Netlify Function ──────────────────────────────────

exports.handler = async function (event) {
  // Solo GET
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  // CORS para desarrollo local con netlify dev
  const corsHeaders = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const params   = event.queryStringParameters ?? {};
  const resource = params.resource;

  // Validar resource contra whitelist
  const ALLOWED = ["teams", "matches", "team"];
  if (!resource || !ALLOWED.includes(resource)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({
        error:   "invalid_resource",
        message: `resource debe ser uno de: ${ALLOWED.join(", ")}`,
      }),
    };
  }

  // Verificar presencia de la API key
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    // Señal explícita al frontend para usar fallback mock
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({
        fallback: true,
        reason:   "FOOTBALL_DATA_API_KEY no está configurada",
        hint:     "Configurar la variable de entorno en Netlify UI → Site settings → Environment variables",
      }),
    };
  }

  // Despachar al handler del recurso
  try {
    let data;

    if (resource === "teams") {
      data = await handleTeams(apiKey);
    } else if (resource === "matches") {
      data = await handleMatches(apiKey);
    } else if (resource === "team") {
      const id = (params.id ?? "").toUpperCase().slice(0, 3);
      if (!id) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
          body: JSON.stringify({ error: "missing_param", message: "Falta ?id=TLA" }),
        };
      }
      data = await handleTeam(apiKey, id);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type":  "application/json",
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
        ...corsHeaders,
      },
      body: JSON.stringify(data),
    };

  } catch (err) {
    console.error("[football-data]", err.message);
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({
        error:   "upstream_error",
        message: err.message,
        hint:    "El frontend usará fallback mock automáticamente",
      }),
    };
  }
};
