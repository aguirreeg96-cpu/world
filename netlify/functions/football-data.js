/**
 * Netlify Function — Proxy seguro para TheSportsDB API v1
 *
 * Endpoint: /.netlify/functions/football-data
 *
 * ── Recursos ─────────────────────────────────────────────────────────────────
 *
 *   ?resource=teams          → 32 selecciones del WC 2022, enriched con TSDB
 *   ?resource=matches        → partidos del WC 2022 (requiere clave real)
 *   ?resource=team&id=ARG    → un equipo por TLA
 *
 * ── Proveedor activo: TheSportsDB v1 ─────────────────────────────────────────
 *
 *   API:       https://www.thesportsdb.com/api/v1/json
 *   Clave:     THESPORTSDB_API_KEY (env var en Netlify)
 *   Demo key:  "123" — funciona para pruebas, rate-limited, NO usar en prod.
 *              En producción conviene registrarse en thesportsdb.com/patreon.php
 *              para obtener una clave propia con límites más altos.
 *
 *   Registro:  https://www.thesportsdb.com/login.php
 *   Doc:       https://www.thesportsdb.com/api.php
 *
 *   JAMÁS escribir la clave en este archivo ni en ningún archivo del repo.
 *   Configurar en: Netlify UI → Site settings → Environment variables
 *
 * ── Qué provee TheSportsDB para cada equipo ──────────────────────────────────
 *
 *   ✅ recentResults  — últimos 5 partidos via eventslast5.php (forma actual)
 *   ✅ idTeam         — ID interno para lookups futuros
 *
 *   ❌ ELO ratings    → tabla estática ELO_TABLE  (eloratings.net)
 *   ❌ avgGoalsFor/Against → tabla estática WC_STATS_BY_TLA  (WC 2022 real)
 *   ❌ Confederación  → tabla estática CONFEDERATION_BY_TLA
 *   ❌ Flag emoji     → tabla estática FLAG_MAP
 *   ❌ Nombre español → tabla estática NAME_MAP
 *   ❌ WC 2022 matches completos → fallback mock (posiblemente paywalled en TSDB)
 *
 * ── Fallbacks ─────────────────────────────────────────────────────────────────
 *
 *   Sin clave configurada:    HTTP 200 + { fallback:true } → app usa mock
 *   Enriquecimiento falla (team): usa recentResults estáticos del equipo
 *   matches no disponibles:   HTTP 200 + { fallback:true } → app usa mock
 *   Error de infraestructura: HTTP 502 → apiAdapter.js cae a mockAdapter
 *
 * ── Node.js ───────────────────────────────────────────────────────────────────
 *
 *   Node 18+ (fetch nativo). Sin dependencias npm.
 */

"use strict";

// ── Configuración del proveedor ───────────────────────────────────────────────
// "tsdb"         → TheSportsDB v1  (activo)
// "api-football" → API-Football v3 via RapidAPI  (legacy)
// "fd"           → football-data.org  (legacy, WC restringido en plan gratis)

const PROVIDER_MODE = "tsdb";

const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json";
const TSDB_DEMO = "123"; // Demo key — rate-limited, no usar en producción

const AF_BASE   = "https://v3.football.api-sports.io"; // legacy
const FD_BASE   = "https://api.football-data.org/v4";  // legacy

// ── Tablas estáticas ──────────────────────────────────────────────────────────
// TSDB no provee ELO, flags, confederaciones ni nombres en español.
// Cubren los 32 participantes del WC 2022.

const ELO_TABLE = {
  ARG: 1920, FRA: 1890, BRA: 1880, ENG: 1850, ESP: 1840,
  GER: 1820, POR: 1800, NED: 1790, BEL: 1780, URU: 1760,
  DEN: 1760, ITA: 1750, CRO: 1740, SUI: 1730, MEX: 1720,
  SEN: 1710, MAR: 1700, POL: 1700, JPN: 1690, SRB: 1680,
  WAL: 1680, USA: 1660, KOR: 1650, ECU: 1640, IRN: 1640,
  AUS: 1620, NGA: 1630, GHA: 1610, CRC: 1610, TUN: 1600,
  CMR: 1590, QAT: 1580,
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

const CONFEDERATION_BY_TLA = {
  ARG: "CONMEBOL", BRA: "CONMEBOL", URU: "CONMEBOL", ECU: "CONMEBOL",
  FRA: "UEFA",     ENG: "UEFA",     ESP: "UEFA",     GER: "UEFA",
  POR: "UEFA",     NED: "UEFA",     BEL: "UEFA",     CRO: "UEFA",
  SUI: "UEFA",     WAL: "UEFA",     DEN: "UEFA",     POL: "UEFA",
  SRB: "UEFA",     ITA: "UEFA",
  MAR: "CAF",      SEN: "CAF",      GHA: "CAF",      CMR: "CAF",
  TUN: "CAF",      NGA: "CAF",
  MEX: "CONCACAF", USA: "CONCACAF", CRC: "CONCACAF",
  JPN: "AFC",      KOR: "AFC",      AUS: "AFC",      IRN: "AFC",
  QAT: "AFC",
};

const NAME_MAP = {
  ARG: "Argentina",     FRA: "Francia",        BRA: "Brasil",
  ENG: "Inglaterra",    ESP: "España",         GER: "Alemania",
  POR: "Portugal",      NED: "Países Bajos",   BEL: "Bélgica",
  URU: "Uruguay",       ITA: "Italia",         CRO: "Croacia",
  MEX: "México",        SEN: "Senegal",        MAR: "Marruecos",
  JPN: "Japón",         USA: "EE. UU.",        KOR: "Corea del Sur",
  AUS: "Australia",     QAT: "Catar",          ECU: "Ecuador",
  SUI: "Suiza",         WAL: "Gales",          DEN: "Dinamarca",
  TUN: "Túnez",         CRC: "Costa Rica",     POL: "Polonia",
  CMR: "Camerún",       SRB: "Serbia",         GHA: "Ghana",
  IRN: "Irán",          NGA: "Nigeria",
};

// Estadísticas base por equipo.
// Primeros 20: de teams.js (mock histórico).
// Últimos 12: estimados por ELO para los participantes del WC 2022 no incluidos en mock.
const WC_STATS_BY_TLA = {
  ARG: { avgGoalsFor: 2.10, avgGoalsAgainst: 0.85, recentResults: ["W","W","D","W","W","W","D","W"] },
  FRA: { avgGoalsFor: 1.95, avgGoalsAgainst: 0.90, recentResults: ["W","D","W","W","L","W","W","D"] },
  BRA: { avgGoalsFor: 2.20, avgGoalsAgainst: 0.80, recentResults: ["W","W","W","D","W","L","W","W"] },
  ENG: { avgGoalsFor: 1.85, avgGoalsAgainst: 0.95, recentResults: ["W","W","W","W","D","W","D","W"] },
  ESP: { avgGoalsFor: 2.00, avgGoalsAgainst: 0.85, recentResults: ["D","W","W","W","W","D","W","W"] },
  GER: { avgGoalsFor: 1.90, avgGoalsAgainst: 1.00, recentResults: ["W","D","L","W","W","W","D","W"] },
  POR: { avgGoalsFor: 2.05, avgGoalsAgainst: 1.05, recentResults: ["W","W","W","D","W","W","L","W"] },
  NED: { avgGoalsFor: 1.80, avgGoalsAgainst: 1.00, recentResults: ["W","W","D","W","L","W","W","W"] },
  BEL: { avgGoalsFor: 1.75, avgGoalsAgainst: 1.10, recentResults: ["D","W","W","D","W","W","L","W"] },
  URU: { avgGoalsFor: 1.60, avgGoalsAgainst: 1.00, recentResults: ["W","D","W","L","W","W","D","W"] },
  ITA: { avgGoalsFor: 1.55, avgGoalsAgainst: 0.90, recentResults: ["D","W","D","W","W","D","W","L"] },
  CRO: { avgGoalsFor: 1.65, avgGoalsAgainst: 1.05, recentResults: ["W","D","W","W","D","L","W","W"] },
  MEX: { avgGoalsFor: 1.60, avgGoalsAgainst: 1.15, recentResults: ["W","W","D","L","W","D","W","D"] },
  SEN: { avgGoalsFor: 1.55, avgGoalsAgainst: 1.10, recentResults: ["W","W","D","W","L","D","W","W"] },
  MAR: { avgGoalsFor: 1.40, avgGoalsAgainst: 0.95, recentResults: ["D","W","W","D","W","W","D","W"] },
  JPN: { avgGoalsFor: 1.70, avgGoalsAgainst: 1.10, recentResults: ["W","W","L","W","W","D","W","D"] },
  KOR: { avgGoalsFor: 1.50, avgGoalsAgainst: 1.20, recentResults: ["W","D","W","L","W","D","W","L"] },
  USA: { avgGoalsFor: 1.55, avgGoalsAgainst: 1.20, recentResults: ["W","D","W","W","D","L","W","D"] },
  AUS: { avgGoalsFor: 1.40, avgGoalsAgainst: 1.30, recentResults: ["D","W","L","W","D","W","W","D"] },
  NGA: { avgGoalsFor: 1.55, avgGoalsAgainst: 1.25, recentResults: ["W","D","W","L","D","W","W","D"] },
  // WC 2022 — estimados por ELO (no estaban en el mock original)
  DEN: { avgGoalsFor: 1.55, avgGoalsAgainst: 1.10, recentResults: [] },
  SUI: { avgGoalsFor: 1.45, avgGoalsAgainst: 1.15, recentResults: [] },
  POL: { avgGoalsFor: 1.35, avgGoalsAgainst: 1.25, recentResults: [] },
  SRB: { avgGoalsFor: 1.35, avgGoalsAgainst: 1.25, recentResults: [] },
  WAL: { avgGoalsFor: 1.30, avgGoalsAgainst: 1.25, recentResults: [] },
  ECU: { avgGoalsFor: 1.25, avgGoalsAgainst: 1.30, recentResults: [] },
  IRN: { avgGoalsFor: 1.20, avgGoalsAgainst: 1.35, recentResults: [] },
  GHA: { avgGoalsFor: 1.20, avgGoalsAgainst: 1.40, recentResults: [] },
  CRC: { avgGoalsFor: 1.15, avgGoalsAgainst: 1.45, recentResults: [] },
  TUN: { avgGoalsFor: 1.15, avgGoalsAgainst: 1.40, recentResults: [] },
  CMR: { avgGoalsFor: 1.10, avgGoalsAgainst: 1.45, recentResults: [] },
  QAT: { avgGoalsFor: 1.00, avgGoalsAgainst: 1.55, recentResults: [] },
};

// Lista ordenada de equipos: los 20 del mock + 12 adicionales del WC 2022
const WC_2022_TEAMS = [
  { tla: "ARG", nameEn: "Argentina"    },
  { tla: "FRA", nameEn: "France"       },
  { tla: "BRA", nameEn: "Brazil"       },
  { tla: "ENG", nameEn: "England"      },
  { tla: "ESP", nameEn: "Spain"        },
  { tla: "GER", nameEn: "Germany"      },
  { tla: "POR", nameEn: "Portugal"     },
  { tla: "NED", nameEn: "Netherlands"  },
  { tla: "BEL", nameEn: "Belgium"      },
  { tla: "URU", nameEn: "Uruguay"      },
  { tla: "DEN", nameEn: "Denmark"      },
  { tla: "ITA", nameEn: "Italy"        },
  { tla: "CRO", nameEn: "Croatia"      },
  { tla: "SUI", nameEn: "Switzerland"  },
  { tla: "MEX", nameEn: "Mexico"       },
  { tla: "SEN", nameEn: "Senegal"      },
  { tla: "MAR", nameEn: "Morocco"      },
  { tla: "POL", nameEn: "Poland"       },
  { tla: "JPN", nameEn: "Japan"        },
  { tla: "SRB", nameEn: "Serbia"       },
  { tla: "WAL", nameEn: "Wales"        },
  { tla: "USA", nameEn: "USA"          },
  { tla: "KOR", nameEn: "South Korea"  },
  { tla: "ECU", nameEn: "Ecuador"      },
  { tla: "IRN", nameEn: "Iran"         },
  { tla: "AUS", nameEn: "Australia"    },
  { tla: "NGA", nameEn: "Nigeria"      },
  { tla: "GHA", nameEn: "Ghana"        },
  { tla: "CRC", nameEn: "Costa Rica"   },
  { tla: "TUN", nameEn: "Tunisia"      },
  { tla: "CMR", nameEn: "Cameroon"     },
  { tla: "QAT", nameEn: "Qatar"        },
];

// Mapa de nombre en inglés (como aparece en TSDB) → TLA
// Usado para normalizar equipos en los partidos de la temporada
const TLA_BY_TSDB_NAME = {
  "Argentina": "ARG",       "France": "FRA",        "Brazil": "BRA",
  "England": "ENG",         "Spain": "ESP",          "Germany": "GER",
  "Portugal": "POR",        "Netherlands": "NED",    "Belgium": "BEL",
  "Uruguay": "URU",         "Italy": "ITA",          "Croatia": "CRO",
  "Mexico": "MEX",          "Senegal": "SEN",        "Morocco": "MAR",
  "Japan": "JPN",           "USA": "USA",            "South Korea": "KOR",
  "Australia": "AUS",       "Qatar": "QAT",          "Ecuador": "ECU",
  "Switzerland": "SUI",     "Wales": "WAL",          "Denmark": "DEN",
  "Tunisia": "TUN",         "Costa Rica": "CRC",     "Poland": "POL",
  "Cameroon": "CMR",        "Serbia": "SRB",         "Ghana": "GHA",
  "IR Iran": "IRN",         "Iran": "IRN",           "Nigeria": "NGA",
  "Korea Republic": "KOR",  "United States": "USA",  "Ivory Coast": "CIV",
};

// WC 2022: 172 goles en 64 partidos → 1.34 por equipo por partido
const WC_GLOBAL_AVG_GOALS = 1.34;

const ERR_PLAN_RESTRICTION = "PLAN_RESTRICTION";

// ── Helpers: TheSportsDB ──────────────────────────────────────────────────────

async function tsdbFetch(path, apiKey) {
  const url        = `${TSDB_BASE}/${apiKey}/${path}`;
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`TSDB HTTP ${res.status}: ${text.slice(0, 100)}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Entre los resultados de searchteams.php, elige la selección nacional.
 * Las selecciones tienen strLeague = "International" (o FIFA/World Cup).
 * Evita seleccionar clubs con nombre similar (ej: "France B", clubes franceses).
 */
function findNationalTeam(teams) {
  if (!teams?.length) return null;
  const soccer = teams.filter(t => t.strSport === "Soccer");
  if (!soccer.length) return null;
  return (
    soccer.find(t =>
      t.strLeague?.toLowerCase().includes("international") ||
      t.strLeague?.toLowerCase().includes("world cup") ||
      t.strLeague?.toLowerCase().includes("fifa")
    ) ?? soccer[0]
  );
}

/**
 * Convierte los últimos N eventos de TSDB en un array de resultados ["W","D","L"].
 * Compara por idTeam para evitar problemas con variantes de nombre.
 * Devuelve más reciente primero.
 */
function computeResultsFromEvents(idTeam, events) {
  return (events ?? [])
    .filter(ev =>
      ev.intHomeScore !== null &&
      ev.intAwayScore !== null &&
      ev.intHomeScore !== "" &&
      ev.intAwayScore !== ""
    )
    .sort((a, b) => new Date(b.dateEvent ?? 0) - new Date(a.dateEvent ?? 0))
    .slice(0, 8)
    .map(ev => {
      const homeScore = parseInt(ev.intHomeScore, 10);
      const awayScore = parseInt(ev.intAwayScore, 10);
      if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) return null;
      const isHome   = ev.idHomeTeam === idTeam;
      const scored   = isHome ? homeScore : awayScore;
      const conceded = isHome ? awayScore : homeScore;
      if (scored > conceded) return "W";
      if (scored < conceded) return "L";
      return "D";
    })
    .filter(Boolean);
}

/**
 * Enriquece un equipo:
 *   1. searchteams.php → obtiene idTeam
 *   2. eventslast5.php → obtiene forma reciente
 * Lanza si no encuentra el equipo o si hay error de red.
 */
async function enrichTeamTsdb(nameEn, apiKey) {
  const searchJson = await tsdbFetch(
    `searchteams.php?t=${encodeURIComponent(nameEn)}`,
    apiKey
  );
  const team = findNationalTeam(searchJson.teams);
  if (!team?.idTeam) throw new Error(`TSDB: equipo no encontrado para "${nameEn}"`);

  const eventsJson = await tsdbFetch(`eventslast5.php?id=${team.idTeam}`, apiKey);
  const recentResults = computeResultsFromEvents(team.idTeam, eventsJson.results);

  return { idTeam: team.idTeam, recentResults };
}

async function handleTeamsTsdb(apiKey) {
  // Enriquecimiento paralelo — allSettled para que un fallo no cancele los demás
  const settled = await Promise.allSettled(
    WC_2022_TEAMS.map(t => enrichTeamTsdb(t.nameEn, apiKey))
  );

  let enrichCount = 0;
  const enrichMap = {};
  WC_2022_TEAMS.forEach((t, i) => {
    const r = settled[i];
    if (r.status === "fulfilled" && r.value?.recentResults?.length > 0) {
      enrichMap[t.tla] = r.value;
      enrichCount++;
    }
  });

  console.info(`[football-data] TSDB enriched ${enrichCount}/${WC_2022_TEAMS.length} teams`);

  const teams = WC_2022_TEAMS.map(t => {
    const base     = WC_STATS_BY_TLA[t.tla] ?? { avgGoalsFor: 1.4, avgGoalsAgainst: 1.1, recentResults: [] };
    const enriched = enrichMap[t.tla];
    return {
      id:              t.tla,
      name:            NAME_MAP[t.tla]             ?? t.nameEn,
      flag:            FLAG_MAP[t.tla]             ?? "🏳",
      confederation:   CONFEDERATION_BY_TLA[t.tla] ?? "?",
      elo:             ELO_TABLE[t.tla]            ?? DEFAULT_ELO,
      avgGoalsFor:     base.avgGoalsFor,
      avgGoalsAgainst: base.avgGoalsAgainst,
      recentResults:   enriched?.recentResults ?? base.recentResults,
    };
  }).sort((a, b) => b.elo - a.elo);

  return {
    teams,
    globalAvgGoals: WC_GLOBAL_AVG_GOALS,
    _meta: {
      enrichedCount: enrichCount,
      totalTeams:    WC_2022_TEAMS.length,
      source:        enrichCount > 0 ? "tsdb_enriched" : "static_only",
    },
  };
}

async function handleMatchesTsdb(apiKey) {
  // TheSportsDB puede no tener el historial completo del WC 2022 en plan gratis.
  // Intentamos: all_leagues.php → buscar FIFA World Cup → eventsseason.php.
  // Si cualquier paso falla → señalar fallback para que el frontend use el mock.
  try {
    const leaguesJson = await tsdbFetch("all_leagues.php?s=Soccer&c=International", apiKey);
    const wcLeague    = (leaguesJson.leagues ?? []).find(l =>
      l.strLeague?.includes("FIFA World Cup") ||
      l.strLeague?.toLowerCase().includes("world cup")
    );
    if (!wcLeague?.idLeague) {
      throw new Error("TSDB: liga FIFA World Cup no encontrada en all_leagues");
    }

    const seasonJson = await tsdbFetch(
      `eventsseason.php?id=${wcLeague.idLeague}&s=2022`,
      apiKey
    );
    const events = seasonJson.events ?? [];
    if (events.length === 0) {
      throw new Error(`TSDB: eventsseason devolvió 0 eventos para WC 2022 (league ${wcLeague.idLeague})`);
    }

    const matches = events
      .filter(ev => ev.intHomeScore !== null && ev.intHomeScore !== "")
      .map(ev => ({
        home:      TLA_BY_TSDB_NAME[ev.strHomeTeam],
        away:      TLA_BY_TSDB_NAME[ev.strAwayTeam],
        goalsHome: parseInt(ev.intHomeScore, 10),
        goalsAway: parseInt(ev.intAwayScore, 10),
      }))
      .filter(m => m.home && m.away && !Number.isNaN(m.goalsHome));

    if (matches.length < 10) {
      throw new Error(`TSDB: solo ${matches.length} partidos normalizables — insuficiente`);
    }

    return { matches };

  } catch (err) {
    console.warn("[football-data] TSDB matches no disponibles →", err.message);
    return {
      fallback: true,
      reason:   "tsdb_matches_unavailable",
      message:  err.message,
      hint:     "TheSportsDB puede requerir clave de pago para el historial completo del WC 2022. El frontend usará el dataset mock.",
    };
  }
}

// ── Helpers: API-Football (legacy) ────────────────────────────────────────────

async function afFetch(path, apiKey) {
  const res = await fetch(`${AF_BASE}${path}`, {
    headers: {
      "x-rapidapi-key":  apiKey,
      "x-rapidapi-host": "v3.football.api-sports.io",
    },
  });
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`API-Football ${res.status}: clave inválida o plan restringido`);
    err.code  = ERR_PLAN_RESTRICTION;
    throw err;
  }
  if (!res.ok) throw new Error(`API-Football ${res.status}`);
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length > 0) {
    const detail = Object.values(json.errors).join("; ");
    if (/limit|quota|rate/i.test(detail)) {
      const err = new Error(`API-Football quota: ${detail}`);
      err.code  = ERR_PLAN_RESTRICTION;
      throw err;
    }
    throw new Error(`API-Football error: ${detail}`);
  }
  return json;
}

const AF_LEAGUE = "1", AF_SEASON = "2022";
const FINISHED_AF = new Set(["FT", "AET", "PEN"]);

function afTeamToTla(team) {
  if (team?.code?.length === 3) return team.code;
  return TLA_BY_TSDB_NAME[team?.name] ?? team?.name?.slice(0, 3)?.toUpperCase();
}

async function handleTeamsAf(apiKey) {
  const data     = await afFetch(`/fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}`, apiKey);
  const fixtures = data.response ?? [];
  const normalizedMatches = [];
  const teamSet  = new Map();

  for (const f of fixtures) {
    if (!FINISHED_AF.has(f.fixture?.status?.short)) continue;
    const homeTla = afTeamToTla(f.teams?.home);
    const awayTla = afTeamToTla(f.teams?.away);
    if (!homeTla || !awayTla) continue;
    normalizedMatches.push({ homeTeam: homeTla, awayTeam: awayTla,
      scoreHome: f.score?.fulltime?.home ?? 0, scoreAway: f.score?.fulltime?.away ?? 0 });
    if (!teamSet.has(homeTla)) teamSet.set(homeTla, f.teams.home);
    if (!teamSet.has(awayTla)) teamSet.set(awayTla, f.teams.away);
  }

  const totalGoals    = normalizedMatches.reduce((a, m) => a + m.scoreHome + m.scoreAway, 0);
  const globalAvgGoals = normalizedMatches.length
    ? parseFloat((totalGoals / normalizedMatches.length).toFixed(3))
    : WC_GLOBAL_AVG_GOALS;

  const teams = [...teamSet.keys()].map(tla => {
    const played = normalizedMatches.filter(m => m.homeTeam === tla || m.awayTeam === tla);
    let gf = 0, ga = 0; const results = [];
    for (const m of played) {
      const isHome = m.homeTeam === tla;
      const s = isHome ? m.scoreHome : m.scoreAway;
      const c = isHome ? m.scoreAway : m.scoreHome;
      gf += s; ga += c;
      results.push(s > c ? "W" : s < c ? "L" : "D");
    }
    const base = WC_STATS_BY_TLA[tla] ?? {};
    return {
      id:              tla,
      name:            NAME_MAP[tla]             ?? tla,
      flag:            FLAG_MAP[tla]             ?? "🏳",
      confederation:   CONFEDERATION_BY_TLA[tla] ?? "?",
      elo:             ELO_TABLE[tla]            ?? DEFAULT_ELO,
      avgGoalsFor:     played.length ? parseFloat((gf / played.length).toFixed(2)) : (base.avgGoalsFor ?? 1.4),
      avgGoalsAgainst: played.length ? parseFloat((ga / played.length).toFixed(2)) : (base.avgGoalsAgainst ?? 1.1),
      recentResults:   results.slice(-8).reverse(),
    };
  }).sort((a, b) => b.elo - a.elo);

  return { teams, globalAvgGoals };
}

async function handleMatchesAf(apiKey) {
  const data     = await afFetch(`/fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}`, apiKey);
  const fixtures = data.response ?? [];
  const matches  = fixtures
    .filter(f => FINISHED_AF.has(f.fixture?.status?.short))
    .map(f => ({
      home:      afTeamToTla(f.teams?.home),
      away:      afTeamToTla(f.teams?.away),
      goalsHome: f.score?.fulltime?.home ?? 0,
      goalsAway: f.score?.fulltime?.away ?? 0,
    }))
    .filter(m => m.home && m.away);
  return { matches };
}

// ── Helpers: football-data.org (legacy) ──────────────────────────────────────

async function fdFetch(path, apiKey) {
  const res = await fetch(`${FD_BASE}${path}`, { headers: { "X-Auth-Token": apiKey } });
  if (res.status === 403) {
    const err = new Error("football-data.org 403: WC restringido en plan gratuito (requiere Tier 2+)");
    err.code  = ERR_PLAN_RESTRICTION;
    throw err;
  }
  if (!res.ok) throw new Error(`FD API ${res.status}`);
  return res.json();
}

async function handleTeamsFd(apiKey) {
  const [teamsData, matchesData] = await Promise.all([
    fdFetch("/competitions/WC/teams?season=2022", apiKey),
    fdFetch("/competitions/WC/matches?season=2022&status=FINISHED", apiKey),
  ]);
  const matches = matchesData.matches ?? [];
  let total = 0;
  const teams = (teamsData.teams ?? []).map(t => {
    const tla    = t.tla ?? t.shortName?.toUpperCase().slice(0, 3);
    const played = matches.filter(m => m.homeTeam?.tla === tla || m.awayTeam?.tla === tla);
    let gf = 0, ga = 0; const results = [];
    for (const m of played) {
      const isHome = m.homeTeam?.tla === tla;
      const s = isHome ? m.score.fullTime.home : m.score.fullTime.away;
      const c = isHome ? m.score.fullTime.away : m.score.fullTime.home;
      gf += s; ga += c; total += s + c;
      results.push(s > c ? "W" : s < c ? "L" : "D");
    }
    const base = WC_STATS_BY_TLA[tla] ?? {};
    return {
      id: tla, name: NAME_MAP[tla] ?? t.shortName ?? t.name,
      flag: FLAG_MAP[tla] ?? "🏳", confederation: CONFEDERATION_BY_TLA[tla] ?? "?",
      elo: ELO_TABLE[tla] ?? DEFAULT_ELO,
      avgGoalsFor:     played.length ? parseFloat((gf / played.length).toFixed(2)) : (base.avgGoalsFor ?? 1.4),
      avgGoalsAgainst: played.length ? parseFloat((ga / played.length).toFixed(2)) : (base.avgGoalsAgainst ?? 1.1),
      recentResults:   results.slice(-8).reverse(),
    };
  }).sort((a, b) => b.elo - a.elo);
  const globalAvgGoals = matches.length ? parseFloat((total / matches.length).toFixed(3)) : WC_GLOBAL_AVG_GOALS;
  return { teams, globalAvgGoals };
}

async function handleMatchesFd(apiKey) {
  const data    = await fdFetch("/competitions/WC/matches?season=2022&status=FINISHED", apiKey);
  const matches = (data.matches ?? [])
    .filter(m => m.score?.fullTime?.home !== null)
    .map(m => ({ home: m.homeTeam?.tla, away: m.awayTeam?.tla,
      goalsHome: m.score?.fullTime?.home ?? 0, goalsAway: m.score?.fullTime?.away ?? 0 }))
    .filter(m => m.home && m.away);
  return { matches };
}

// ── Dispatchers ───────────────────────────────────────────────────────────────

async function handleTeams(apiKey) {
  if (PROVIDER_MODE === "tsdb")         return handleTeamsTsdb(apiKey);
  if (PROVIDER_MODE === "api-football") return handleTeamsAf(apiKey);
  return handleTeamsFd(apiKey);
}

async function handleMatches(apiKey) {
  if (PROVIDER_MODE === "tsdb")         return handleMatchesTsdb(apiKey);
  if (PROVIDER_MODE === "api-football") return handleMatchesAf(apiKey);
  return handleMatchesFd(apiKey);
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
      body: JSON.stringify({ error: "invalid_resource",
        message: `resource debe ser uno de: ${ALLOWED.join(", ")}` }),
    };
  }

  // Seleccionar env var y demo key según el proveedor activo
  const ENV_VAR  = { tsdb: "THESPORTSDB_API_KEY", "api-football": "API_FOOTBALL_KEY", fd: "FOOTBALL_DATA_API_KEY" };
  const DEMO_KEY = { tsdb: TSDB_DEMO };
  const envVar   = ENV_VAR[PROVIDER_MODE] ?? "THESPORTSDB_API_KEY";
  const apiKey   = process.env[envVar] ?? DEMO_KEY[PROVIDER_MODE];

  if (!apiKey) {
    console.info(`[football-data] ${envVar} no configurada → fallback al mock`);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({
        fallback: true, reason: "no_api_key",
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
      if (!id) return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
        body: JSON.stringify({ error: "missing_param", message: "Falta ?id=TLA" }),
      };
      data = await handleTeam(apiKey, id);
    }

    // El handler puede señalar fallback explícitamente (ej: handleMatchesTsdb)
    if (data?.fallback) {
      console.info("[football-data] handler señaló fallback →", data.reason);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
        body: JSON.stringify(data),
      };
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
          fallback: true, reason: "plan_restriction", message: err.message,
          hint: "Verificar clave y plan. El frontend usará fallback mock.",
        }),
      };
    }
    console.error("[football-data] upstream_error →", err.message);
    return {
      statusCode: 502,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({ error: "upstream_error", message: err.message,
        hint: "El frontend usará fallback mock automáticamente" }),
    };
  }
};
