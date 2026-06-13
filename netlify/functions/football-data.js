/**
 * Netlify Function — Proxy seguro para datos de fútbol
 *
 * Endpoint: /.netlify/functions/football-data
 *
 * ── Recursos disponibles ─────────────────────────────────────────────────────
 *
 *   ?resource=teams           → lista de selecciones con stats computadas
 *   ?resource=matches         → partidos del Mundial 2022 (resultados reales)
 *   ?resource=team&id=ARG     → un equipo específico por TLA code
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ⚠  RESTRICCIÓN DEL PLAN GRATUITO DE football-data.org
 * ════════════════════════════════════════════════════════════════════════════
 *
 * El plan gratuito (Tier 1) NO incluye torneos de selecciones nacionales.
 * El endpoint /competitions/WC/... devuelve HTTP 403:
 *   "The resource you are looking for is restricted and apparently
 *    not within your permissions."
 *
 * ── Competiciones DISPONIBLES en plan gratuito (Tier 1) ─────────────────────
 *
 *   PL  - Premier League        BL1 - Bundesliga
 *   SA  - Serie A               PD  - Primera División
 *   FL1 - Ligue 1               ELC - Championship
 *   CL  - UEFA Champions League
 *
 * ── Competiciones RESTRINGIDAS (Tier 2+, de pago) ───────────────────────────
 *
 *   WC  - FIFA World Cup  ← este proxy usa este código → 403 en plan gratis
 *   WCQ - Eliminatorias del Mundial
 *   EC  - European Championship
 *
 * ── Alternativas gratuitas para Mundial / selecciones nacionales ─────────────
 *
 *   1. api-football.com (v3 via RapidAPI)  ← RECOMENDADA
 *      Plan Free: 100 req/día. WC 2022 histórico completo.
 *      Endpoint: GET https://v3.football.api-sports.io/fixtures?league=1&season=2022
 *      Headers:  x-rapidapi-key: TU_KEY
 *                x-rapidapi-host: v3.football.api-sports.io
 *      Registro: https://rapidapi.com/api-sports/api/api-football
 *      Cambiar env var: API_FOOTBALL_KEY (+ actualizar PROVIDER_MODE a "api-football")
 *
 *   2. thesportsdb.com
 *      Free sin key o con key gratuita. Copa del Mundo histórica disponible.
 *      Doc: https://www.thesportsdb.com/api.php
 *
 *   3. Datos estáticos (opción offline, sin API key)
 *      El mock actual (teams.js + matches_mock.js) ya cubre 20 selecciones con
 *      datos del WC 2022. Suficiente para el modelo estadístico educativo.
 *      Cambiar DATA_SOURCE a "mock" en provider.js para usar esta opción.
 *
 * ── Cómo cambiar de proveedor ────────────────────────────────────────────────
 *
 *   1. Cambiar PROVIDER_MODE más abajo ("fd" | "api-football")
 *   2. Configurar la env var correspondiente en Netlify UI
 *   3. El resto de la app (apiAdapter.js, provider.js, main.js) no cambia
 *
 * ── Configuración de API key ─────────────────────────────────────────────────
 *
 *   football-data.org:  FOOTBALL_DATA_API_KEY  (solo útil con plan Tier 2+)
 *   api-football.com:   API_FOOTBALL_KEY       (plan free: 100 req/día)
 *
 *   Netlify UI: Site settings → Environment variables → Add variable
 *   Local dev:  Archivo .env en raíz del proyecto (ya está en .gitignore)
 *
 *   JAMÁS escribir claves en este archivo ni en ningún archivo del repo.
 *
 * ── Caché ─────────────────────────────────────────────────────────────────────
 *
 *   Las respuestas exitosas incluyen Cache-Control: s-maxage=3600
 *   para que el CDN de Netlify cachee durante 1 hora.
 *
 * ── Node.js ───────────────────────────────────────────────────────────────────
 *
 *   Requiere Node.js 18+ (fetch nativo disponible). Sin dependencias npm.
 */

"use strict";

// ── Configuración del proveedor ───────────────────────────────────────────────
// Cambiar a "api-football" y configurar API_FOOTBALL_KEY para usar
// api-football.com (cubre Mundial en plan gratuito).

const PROVIDER_MODE = "fd"; // "fd" | "api-football"

// ── football-data.org ─────────────────────────────────────────────────────────
const FD_BASE   = "https://api.football-data.org/v4";
const WC_CODE   = "WC";
const WC_SEASON = "2022";

// ── api-football.com (RapidAPI) ───────────────────────────────────────────────
const AF_BASE    = "https://v3.football.api-sports.io";
const AF_LEAGUE  = "1";    // ID del torneo FIFA World Cup en api-football
const AF_SEASON  = "2022";

// ── ELO estáticos ────────────────────────────────────────────────────────────
// ELO no está disponible en ninguna de las APIs. Actualizar manualmente
// desde eloratings.net o clubelo.com.

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

const FLAG_MAP = {
  ARG: "🇦🇷", FRA: "🇫🇷", BRA: "🇧🇷", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", ESP: "🇪🇸",
  GER: "🇩🇪", POR: "🇵🇹", NED: "🇳🇱", BEL: "🇧🇪", URU: "🇺🇾",
  ITA: "🇮🇹", CRO: "🇭🇷", MEX: "🇲🇽", SEN: "🇸🇳", MAR: "🇲🇦",
  JPN: "🇯🇵", USA: "🇺🇸", KOR: "🇰🇷", NGA: "🇳🇬", AUS: "🇦🇺",
  QAT: "🇶🇦", ECU: "🇪🇨", SUI: "🇨🇭", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", DEN: "🇩🇰",
  TUN: "🇹🇳", CRC: "🇨🇷", POL: "🇵🇱", CMR: "🇨🇲", SRB: "🇷🇸",
  GHA: "🇬🇭", IRN: "🇮🇷",
};

// Mapa de TLA a nombre canónico (para normalizar entre proveedores)
const NAME_MAP = {
  ARG: "Argentina",  FRA: "Francia",   BRA: "Brasil",   ENG: "Inglaterra",
  ESP: "España",     GER: "Alemania",  POR: "Portugal", NED: "Países Bajos",
  BEL: "Bélgica",   URU: "Uruguay",   ITA: "Italia",   CRO: "Croacia",
  MEX: "México",    SEN: "Senegal",   MAR: "Marruecos",JPN: "Japón",
  USA: "EE. UU.",   KOR: "Corea del Sur", NGA: "Nigeria", AUS: "Australia",
  QAT: "Catar",     ECU: "Ecuador",   SUI: "Suiza",    WAL: "Gales",
  DEN: "Dinamarca", TUN: "Túnez",     CRC: "Costa Rica", POL: "Polonia",
  CMR: "Camerún",   SRB: "Serbia",    GHA: "Ghana",    IRN: "Irán",
};

const CONF_MAP = {
  "South America":    "CONMEBOL",
  "Europe":           "UEFA",
  "Africa":           "CAF",
  "North/C. America": "CONCACAF",
  "Asia":             "AFC",
  "Oceania":          "OFC",
};

// ── Código de error para restricciones de plan ────────────────────────────────
const ERR_PLAN_RESTRICTION = "PLAN_RESTRICTION";

// ── Helpers: football-data.org ────────────────────────────────────────────────

async function fdFetch(path, apiKey) {
  const url = `${FD_BASE}${path}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": apiKey } });

  if (res.status === 403) {
    // Plan restriction — no es un error de red, es una limitación de plan.
    // Tratarlo como señal de fallback, no como fallo catastrófico.
    const text = await res.text().catch(() => "");
    const err  = new Error(`football-data.org 403: endpoint restringido en plan actual. ${text.slice(0, 120)}`);
    err.code   = ERR_PLAN_RESTRICTION;
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FD API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

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
    const isHome   = m.homeTeam?.tla === tla;
    const scored   = isHome ? m.score.fullTime.home : m.score.fullTime.away;
    const conceded = isHome ? m.score.fullTime.away : m.score.fullTime.home;

    goalsFor     += scored;
    goalsAgainst += conceded;

    if (scored > conceded)      results.push("W");
    else if (scored < conceded) results.push("L");
    else                        results.push("D");
  }

  return {
    avgGoalsFor:     parseFloat((goalsFor     / teamMatches.length).toFixed(2)),
    avgGoalsAgainst: parseFloat((goalsAgainst / teamMatches.length).toFixed(2)),
    recentResults:   results.slice(-8).reverse(),
  };
}

function normalizeFdMatch(raw) {
  return {
    home:      raw.homeTeam?.tla,
    away:      raw.awayTeam?.tla,
    goalsHome: raw.score?.fullTime?.home ?? 0,
    goalsAway: raw.score?.fullTime?.away ?? 0,
  };
}

async function handleTeamsFd(apiKey) {
  const teamsData   = await fdFetch(`/competitions/${WC_CODE}/teams?season=${WC_SEASON}`, apiKey);
  const matchesData = await fdFetch(`/competitions/${WC_CODE}/matches?season=${WC_SEASON}&status=FINISHED`, apiKey);
  const matches     = matchesData.matches ?? [];

  const globalAvgGoals = (() => {
    let total = 0, count = 0;
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
      name:            NAME_MAP[tla] ?? t.shortName ?? t.name,
      flag:            FLAG_MAP[tla] ?? "🏳",
      confederation:   CONF_MAP[t.area?.name] ?? t.area?.name ?? "?",
      elo:             ELO_TABLE[tla] ?? DEFAULT_ELO,
      avgGoalsFor:     stats.avgGoalsFor,
      avgGoalsAgainst: stats.avgGoalsAgainst,
      recentResults:   stats.recentResults,
    };
  }).sort((a, b) => b.elo - a.elo);

  return { teams, globalAvgGoals };
}

async function handleMatchesFd(apiKey) {
  const data = await fdFetch(
    `/competitions/${WC_CODE}/matches?season=${WC_SEASON}&status=FINISHED`,
    apiKey
  );
  const matches = (data.matches ?? [])
    .filter(m => m.score?.fullTime?.home !== null && m.score?.fullTime?.away !== null)
    .map(normalizeFdMatch)
    .filter(m => m.home && m.away);

  return { matches };
}

// ── Helpers: api-football.com (RapidAPI) ─────────────────────────────────────

async function afFetch(path, apiKey) {
  const url = `${AF_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "x-rapidapi-key":  apiKey,
      "x-rapidapi-host": "v3.football.api-sports.io",
    },
  });

  if (res.status === 403 || res.status === 401) {
    const text = await res.text().catch(() => "");
    const err  = new Error(`api-football.com ${res.status}: clave inválida o plan restringido. ${text.slice(0, 120)}`);
    err.code   = ERR_PLAN_RESTRICTION;
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`api-football ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// TLA propio de api-football → TLA estándar FIFA (3 letras)
// api-football usa códigos propios que no siempre coinciden con FIFA
const AF_TLA_MAP = {
  "Argentina": "ARG", "France": "FRA", "Brazil": "BRA", "England": "ENG",
  "Spain": "ESP", "Germany": "GER", "Portugal": "POR", "Netherlands": "NED",
  "Belgium": "BEL", "Uruguay": "URU", "Italy": "ITA", "Croatia": "CRO",
  "Mexico": "MEX", "Senegal": "SEN", "Morocco": "MAR", "Japan": "JPN",
  "USA": "USA", "South Korea": "KOR", "Nigeria": "NGA", "Australia": "AUS",
  "Qatar": "QAT", "Ecuador": "ECU", "Switzerland": "SUI", "Wales": "WAL",
  "Denmark": "DEN", "Tunisia": "TUN", "Costa Rica": "CRC", "Poland": "POL",
  "Cameroon": "CMR", "Serbia": "SRB", "Ghana": "GHA", "Iran": "IRN",
};

function afTeamToTla(team) {
  return AF_TLA_MAP[team?.name] ?? team?.code ?? team?.name?.slice(0, 3)?.toUpperCase();
}

async function handleTeamsAf(apiKey) {
  const data    = await afFetch(`/fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}`, apiKey);
  const fixtures = data.response ?? [];

  // Extraer equipos únicos y sus partidos terminados
  const teamMap  = new Map();
  const matchesForStats = [];

  for (const f of fixtures) {
    if (f.fixture?.status?.short !== "FT") continue;

    const homeTla = afTeamToTla(f.teams?.home);
    const awayTla = afTeamToTla(f.teams?.away);
    if (!homeTla || !awayTla) continue;

    teamMap.set(homeTla, f.teams.home);
    teamMap.set(awayTla, f.teams.away);

    matchesForStats.push({
      homeTeam: { tla: homeTla },
      awayTeam: { tla: awayTla },
      score: {
        fullTime: {
          home: f.goals?.home ?? 0,
          away: f.goals?.away ?? 0,
        },
      },
    });
  }

  let totalGoals = 0;
  for (const m of matchesForStats) {
    totalGoals += m.score.fullTime.home + m.score.fullTime.away;
  }
  const globalAvgGoals = matchesForStats.length > 0
    ? parseFloat((totalGoals / matchesForStats.length).toFixed(3))
    : 1.35;

  const teams = [...teamMap.keys()].map(tla => {
    const stats = computeTeamStats(tla, matchesForStats);
    return {
      id:              tla,
      name:            NAME_MAP[tla] ?? tla,
      flag:            FLAG_MAP[tla] ?? "🏳",
      confederation:   "?",
      elo:             ELO_TABLE[tla] ?? DEFAULT_ELO,
      avgGoalsFor:     stats.avgGoalsFor,
      avgGoalsAgainst: stats.avgGoalsAgainst,
      recentResults:   stats.recentResults,
    };
  }).sort((a, b) => b.elo - a.elo);

  return { teams, globalAvgGoals };
}

async function handleMatchesAf(apiKey) {
  const data     = await afFetch(`/fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}`, apiKey);
  const fixtures = data.response ?? [];

  const matches = fixtures
    .filter(f => f.fixture?.status?.short === "FT")
    .map(f => ({
      home:      afTeamToTla(f.teams?.home),
      away:      afTeamToTla(f.teams?.away),
      goalsHome: f.goals?.home ?? 0,
      goalsAway: f.goals?.away ?? 0,
    }))
    .filter(m => m.home && m.away);

  return { matches };
}

// ── Dispatchers por recurso ───────────────────────────────────────────────────

async function handleTeams(apiKey) {
  return PROVIDER_MODE === "api-football"
    ? handleTeamsAf(apiKey)
    : handleTeamsFd(apiKey);
}

async function handleMatches(apiKey) {
  return PROVIDER_MODE === "api-football"
    ? handleMatchesAf(apiKey)
    : handleMatchesFd(apiKey);
}

async function handleTeam(apiKey, id) {
  const { teams } = await handleTeams(apiKey);
  const team = teams.find(t => t.id === id);
  if (!team) throw new Error(`Equipo no encontrado: ${id}`);
  return team;
}

// ── Handler principal de la Netlify Function ──────────────────────────────────

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  const corsHeaders = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "GET",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const params   = event.queryStringParameters ?? {};
  const resource = params.resource;

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

  // Seleccionar la env var según el proveedor activo
  const apiKey = PROVIDER_MODE === "api-football"
    ? process.env.API_FOOTBALL_KEY
    : process.env.FOOTBALL_DATA_API_KEY;

  if (!apiKey) {
    const envVar = PROVIDER_MODE === "api-football" ? "API_FOOTBALL_KEY" : "FOOTBALL_DATA_API_KEY";
    console.info(`[football-data] ${envVar} no configurada → señalando fallback al frontend`);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({
        fallback: true,
        reason:   "no_api_key",
        message:  `${envVar} no está configurada`,
        hint:     "Configurar en Netlify UI → Site settings → Environment variables",
      }),
    };
  }

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
    // Restricción de plan → fallback limpio (no es un error de infra, es un límite esperado)
    if (err.code === ERR_PLAN_RESTRICTION) {
      console.warn("[football-data] plan_restriction →", err.message);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
        body: JSON.stringify({
          fallback: true,
          reason:   "plan_restriction",
          message:  err.message,
          hint:     PROVIDER_MODE === "fd"
            ? "El plan gratuito de football-data.org no incluye el Mundial (WC). Cambiar PROVIDER_MODE a 'api-football' y configurar API_FOOTBALL_KEY (RapidAPI, plan free 100 req/día)."
            : "Verificar que la clave API_FOOTBALL_KEY sea válida y que el plan cubra el endpoint solicitado.",
        }),
      };
    }

    // Error de infraestructura genuino
    console.error("[football-data] upstream_error →", err.message);
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
