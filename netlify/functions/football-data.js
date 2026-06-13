/**
 * Netlify Function — Proxy seguro para API-Football (v3 / api-sports.io)
 *
 * Endpoint: /.netlify/functions/football-data
 *
 * ── Recursos disponibles ─────────────────────────────────────────────────────
 *
 *   ?resource=teams           → lista de selecciones con stats computadas
 *   ?resource=matches         → partidos del Mundial 2022 (resultados reales)
 *   ?resource=team&id=ARG     → un equipo específico por TLA code
 *
 * ── Configuración ────────────────────────────────────────────────────────────
 *
 *   Proveedor activo: api-football.com (RapidAPI)
 *   Env var:          API_FOOTBALL_KEY
 *   Plan gratuito:    100 req/día · WC 2022 histórico incluido
 *
 *   1. Registrarse en https://rapidapi.com/api-sports/api/api-football
 *      Ir a "Subscribe" → plan Free (100 req/día, sin tarjeta)
 *
 *   2. Netlify UI:
 *      Site settings → Environment variables → Add variable
 *      Key:   API_FOOTBALL_KEY
 *      Value: tu_clave_rapidapi
 *
 *   3. Para desarrollo local con Netlify CLI:
 *      Archivo .env en raíz del proyecto (ya está en .gitignore):
 *        API_FOOTBALL_KEY=tu_clave_rapidapi
 *      Luego: netlify dev
 *
 *   JAMÁS escribir la clave en este archivo ni en ningún archivo del repo.
 *
 * ── Por qué NO usamos football-data.org ──────────────────────────────────────
 *
 *   El plan gratuito (Tier 1) no incluye torneos de selecciones nacionales.
 *   /competitions/WC/... devuelve HTTP 403.
 *   Requeriría Tier 2 (€20/mes). Ver historial de cambios para el código legacy.
 *
 * ── Qué provee API-Football para WC 2022 ─────────────────────────────────────
 *
 *   ✅ Fixtures con marcadores (league=1, season=2022) → 64 partidos
 *   ✅ Nombre y código (TLA) de cada selección
 *   ✅ Marcador a los 90 min separado del tiempo extra y penales
 *   ✅ Estado del partido (FT / AET / PEN)
 *
 *   ❌ ELO ratings              → tabla estática (ELO_TABLE, desde eloratings.net)
 *   ❌ Flag emoji               → tabla estática (FLAG_MAP)
 *   ❌ Confederación            → tabla estática (CONFEDERATION_BY_TLA)
 *   ❌ Nombre en español        → tabla estática (NAME_MAP)
 *
 * ── Caché ─────────────────────────────────────────────────────────────────────
 *
 *   s-maxage=3600 en CDN de Netlify. Los datos del WC 2022 son históricos y no
 *   cambian, así que la caché puede ser muy larga sin riesgo de stale.
 *
 * ── Node.js ───────────────────────────────────────────────────────────────────
 *
 *   Node 18+ (fetch nativo). Sin dependencias npm.
 */

"use strict";

// ── Configuración del proveedor ───────────────────────────────────────────────
// "api-football" → API-Football v3 (RapidAPI) — proveedor activo
// "fd"           → football-data.org (legacy, restringido en plan gratis para WC)

const PROVIDER_MODE = "api-football";

// ── API-Football (RapidAPI / api-sports.io) ───────────────────────────────────
const AF_BASE   = "https://v3.football.api-sports.io";
const AF_LEAGUE = "1";    // FIFA World Cup en API-Football v3
const AF_SEASON = "2022"; // WC Qatar 2022

// ── football-data.org (legacy — solo se usa si PROVIDER_MODE = "fd") ──────────
const FD_BASE   = "https://api.football-data.org/v4";
const WC_CODE   = "WC";
const WC_SEASON = "2022";

// ── Datos estáticos ───────────────────────────────────────────────────────────
// API-Football no provee ELO, flags, confederaciones ni nombres en español.
// Estas tablas cubren exactamente los 32 participantes del WC 2022.

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

// Confederación FIFA de cada selección (WC 2022)
const CONFEDERATION_BY_TLA = {
  ARG: "CONMEBOL", BRA: "CONMEBOL", URU: "CONMEBOL", ECU: "CONMEBOL",
  FRA: "UEFA",     ENG: "UEFA",     ESP: "UEFA",     GER: "UEFA",
  POR: "UEFA",     NED: "UEFA",     BEL: "UEFA",     CRO: "UEFA",
  SUI: "UEFA",     WAL: "UEFA",     DEN: "UEFA",     POL: "UEFA",
  SRB: "UEFA",
  MAR: "CAF",      SEN: "CAF",      GHA: "CAF",      CMR: "CAF",
  TUN: "CAF",
  MEX: "CONCACAF", USA: "CONCACAF", CRC: "CONCACAF",
  JPN: "AFC",      KOR: "AFC",      AUS: "AFC",      IRN: "AFC",
  QAT: "AFC",
};

// Nombre en español por TLA
const NAME_MAP = {
  ARG: "Argentina",       FRA: "Francia",        BRA: "Brasil",
  ENG: "Inglaterra",      ESP: "España",         GER: "Alemania",
  POR: "Portugal",        NED: "Países Bajos",   BEL: "Bélgica",
  URU: "Uruguay",         ITA: "Italia",         CRO: "Croacia",
  MEX: "México",          SEN: "Senegal",        MAR: "Marruecos",
  JPN: "Japón",           USA: "EE. UU.",        KOR: "Corea del Sur",
  AUS: "Australia",       QAT: "Catar",          ECU: "Ecuador",
  SUI: "Suiza",           WAL: "Gales",          DEN: "Dinamarca",
  TUN: "Túnez",           CRC: "Costa Rica",     POL: "Polonia",
  CMR: "Camerún",         SRB: "Serbia",         GHA: "Ghana",
  IRN: "Irán",            NGA: "Nigeria",
};

// ── Código de error para restricciones de plan ────────────────────────────────
const ERR_PLAN_RESTRICTION = "PLAN_RESTRICTION";

// ── Estados de partido terminado en API-Football ──────────────────────────────
// FT  = Full Time (90 min)
// AET = After Extra Time (90 min + prórroga)
// PEN = Penalty Shootout
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

// ── Helpers: API-Football ─────────────────────────────────────────────────────

async function afFetch(path, apiKey) {
  const url = `${AF_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "x-rapidapi-key":  apiKey,
      "x-rapidapi-host": "v3.football.api-sports.io",
    },
  });

  if (res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => "");
    const err  = new Error(`API-Football ${res.status}: clave inválida o plan restringido. ${text.slice(0, 120)}`);
    err.code   = ERR_PLAN_RESTRICTION;
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API-Football ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json();

  // API-Football devuelve errores semánticos dentro del cuerpo con HTTP 200
  // Ej: { errors: { requests: "You have reached the request limit..." } }
  if (json.errors && Object.keys(json.errors).length > 0) {
    const detail = Object.values(json.errors).join("; ");
    if (/limit|quota|rate/i.test(detail)) {
      const err  = new Error(`API-Football quota/rate limit: ${detail}`);
      err.code   = ERR_PLAN_RESTRICTION;
      throw err;
    }
    throw new Error(`API-Football error: ${detail}`);
  }

  return json;
}

/**
 * Convierte la estructura de equipo de API-Football a TLA FIFA.
 * API-Football provee `team.code` ("ARG", "FRA"…) como campo nativo.
 * El mapa de nombres cubre casos donde el código pueda estar vacío.
 */
function afTeamToTla(team) {
  if (!team) return undefined;
  // team.code es el código FIFA de 3 letras en la mayoría de selecciones
  if (team.code && team.code.length === 3) return team.code;
  // Fallback por nombre en inglés
  const BY_NAME = {
    "Argentina": "ARG", "France": "FRA",      "Brazil": "BRA",
    "England": "ENG",   "Spain": "ESP",        "Germany": "GER",
    "Portugal": "POR",  "Netherlands": "NED",  "Belgium": "BEL",
    "Uruguay": "URU",   "Italy": "ITA",        "Croatia": "CRO",
    "Mexico": "MEX",    "Senegal": "SEN",      "Morocco": "MAR",
    "Japan": "JPN",     "USA": "USA",          "South Korea": "KOR",
    "Australia": "AUS", "Qatar": "QAT",        "Ecuador": "ECU",
    "Switzerland": "SUI","Wales": "WAL",        "Denmark": "DEN",
    "Tunisia": "TUN",   "Costa Rica": "CRC",   "Poland": "POL",
    "Cameroon": "CMR",  "Serbia": "SRB",       "Ghana": "GHA",
    "IR Iran": "IRN",   "Iran": "IRN",         "Nigeria": "NGA",
    "Korea Republic": "KOR",
  };
  return BY_NAME[team.name] ?? team.name?.slice(0, 3)?.toUpperCase();
}

/**
 * Para el modelo estadístico usamos el marcador a 90 minutos (score.fulltime),
 * no el marcador final incluyendo prórroga (goals). Esto es más correcto para
 * calcular promedios de goles y Dixon-Coles: la prórroga es ruido en un modelo
 * de liga corta como el Mundial.
 */
function afMatchScore(fixture) {
  return {
    home: fixture.score?.fulltime?.home ?? fixture.goals?.home ?? 0,
    away: fixture.score?.fulltime?.away ?? fixture.goals?.away ?? 0,
  };
}

// ── Cómputo de estadísticas por equipo ────────────────────────────────────────

function computeTeamStats(tla, normalizedMatches) {
  const played = normalizedMatches.filter(
    m => m.homeTeam === tla || m.awayTeam === tla
  );

  if (played.length === 0) {
    return { avgGoalsFor: 1.4, avgGoalsAgainst: 1.1, recentResults: [] };
  }

  let goalsFor = 0, goalsAgainst = 0;
  const results = [];

  for (const m of played) {
    const isHome   = m.homeTeam === tla;
    const scored   = isHome ? m.scoreHome : m.scoreAway;
    const conceded = isHome ? m.scoreAway : m.scoreHome;

    goalsFor     += scored;
    goalsAgainst += conceded;

    if (scored > conceded)      results.push("W");
    else if (scored < conceded) results.push("L");
    else                        results.push("D");
  }

  return {
    avgGoalsFor:     parseFloat((goalsFor     / played.length).toFixed(2)),
    avgGoalsAgainst: parseFloat((goalsAgainst / played.length).toFixed(2)),
    recentResults:   results.slice(-8).reverse(), // últimos 8, más reciente primero
  };
}

// ── Handler: API-Football ─────────────────────────────────────────────────────

async function handleTeamsAf(apiKey) {
  const data     = await afFetch(`/fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}`, apiKey);
  const fixtures = data.response ?? [];

  // Normalizar a estructura interna para reutilizar computeTeamStats
  const normalizedMatches = [];
  const teamSet = new Map(); // tla → { name, tla }

  for (const f of fixtures) {
    if (!FINISHED_STATUSES.has(f.fixture?.status?.short)) continue;

    const homeTla = afTeamToTla(f.teams?.home);
    const awayTla = afTeamToTla(f.teams?.away);
    if (!homeTla || !awayTla) continue;

    const score = afMatchScore(f);
    normalizedMatches.push({
      homeTeam:  homeTla,
      awayTeam:  awayTla,
      scoreHome: score.home,
      scoreAway: score.away,
    });

    if (!teamSet.has(homeTla)) teamSet.set(homeTla, f.teams.home);
    if (!teamSet.has(awayTla)) teamSet.set(awayTla, f.teams.away);
  }

  // globalAvgGoals: media de goles por partido (a 90 min)
  const totalGoals = normalizedMatches.reduce(
    (acc, m) => acc + m.scoreHome + m.scoreAway, 0
  );
  const globalAvgGoals = normalizedMatches.length > 0
    ? parseFloat((totalGoals / normalizedMatches.length).toFixed(3))
    : 1.35;

  const teams = [...teamSet.keys()].map(tla => {
    const stats = computeTeamStats(tla, normalizedMatches);
    return {
      id:              tla,
      name:            NAME_MAP[tla]             ?? teamSet.get(tla)?.name ?? tla,
      flag:            FLAG_MAP[tla]             ?? "🏳",
      confederation:   CONFEDERATION_BY_TLA[tla] ?? "?",
      elo:             ELO_TABLE[tla]            ?? DEFAULT_ELO,
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
    .filter(f => FINISHED_STATUSES.has(f.fixture?.status?.short))
    .map(f => {
      const score = afMatchScore(f);
      return {
        home:      afTeamToTla(f.teams?.home),
        away:      afTeamToTla(f.teams?.away),
        goalsHome: score.home,
        goalsAway: score.away,
      };
    })
    .filter(m => m.home && m.away);

  return { matches };
}

// ── Helpers: football-data.org (legacy) ──────────────────────────────────────
// Solo se usa si PROVIDER_MODE = "fd". WC requiere Tier 2+ en ese proveedor.

async function fdFetch(path, apiKey) {
  const url = `${FD_BASE}${path}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": apiKey } });

  if (res.status === 403) {
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

function computeTeamStatsFd(tla, matches) {
  const played = matches.filter(
    m => m.homeTeam?.tla === tla || m.awayTeam?.tla === tla
  );
  if (played.length === 0) {
    return { avgGoalsFor: 1.4, avgGoalsAgainst: 1.1, recentResults: [] };
  }
  let goalsFor = 0, goalsAgainst = 0;
  const results = [];
  for (const m of played) {
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
    avgGoalsFor:     parseFloat((goalsFor     / played.length).toFixed(2)),
    avgGoalsAgainst: parseFloat((goalsAgainst / played.length).toFixed(2)),
    recentResults:   results.slice(-8).reverse(),
  };
}

async function handleTeamsFd(apiKey) {
  const teamsData   = await fdFetch(`/competitions/${WC_CODE}/teams?season=${WC_SEASON}`, apiKey);
  const matchesData = await fdFetch(`/competitions/${WC_CODE}/matches?season=${WC_SEASON}&status=FINISHED`, apiKey);
  const matches     = matchesData.matches ?? [];

  let total = 0, count = 0;
  for (const m of matches) {
    total += (m.score?.fullTime?.home ?? 0) + (m.score?.fullTime?.away ?? 0);
    count++;
  }
  const globalAvgGoals = count > 0 ? parseFloat((total / count).toFixed(3)) : 1.35;

  const CONF_MAP = {
    "South America":    "CONMEBOL",
    "Europe":           "UEFA",
    "Africa":           "CAF",
    "North/C. America": "CONCACAF",
    "Asia":             "AFC",
    "Oceania":          "OFC",
  };

  const teams = (teamsData.teams ?? []).map(t => {
    const tla   = t.tla ?? t.shortName?.toUpperCase().slice(0, 3);
    const stats = computeTeamStatsFd(tla, matches);
    return {
      id:              tla,
      name:            NAME_MAP[tla] ?? t.shortName ?? t.name,
      flag:            FLAG_MAP[tla] ?? "🏳",
      confederation:   CONFEDERATION_BY_TLA[tla] ?? CONF_MAP[t.area?.name] ?? "?",
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
    .map(m => ({
      home:      m.homeTeam?.tla,
      away:      m.awayTeam?.tla,
      goalsHome: m.score?.fullTime?.home ?? 0,
      goalsAway: m.score?.fullTime?.away ?? 0,
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

// ── Handler principal ─────────────────────────────────────────────────────────

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

  const envVar = PROVIDER_MODE === "api-football" ? "API_FOOTBALL_KEY" : "FOOTBALL_DATA_API_KEY";
  const apiKey = process.env[envVar];

  if (!apiKey) {
    console.info(`[football-data] ${envVar} no configurada → fallback al mock`);
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
    if (err.code === ERR_PLAN_RESTRICTION) {
      console.warn("[football-data] plan_restriction →", err.message);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
        body: JSON.stringify({
          fallback: true,
          reason:   "plan_restriction",
          message:  err.message,
          hint:     PROVIDER_MODE === "api-football"
            ? "Verificar que API_FOOTBALL_KEY sea válida y que el plan cubra el endpoint."
            : "El plan gratuito de football-data.org no incluye el Mundial. Usar PROVIDER_MODE='api-football'.",
        }),
      };
    }

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
