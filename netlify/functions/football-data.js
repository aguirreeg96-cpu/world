/**
 * Netlify Function — Proxy seguro para datos de fútbol
 *
 * Endpoint: /.netlify/functions/football-data
 *
 * ── Recursos ─────────────────────────────────────────────────────────────────
 *
 *   ?resource=teams          → 32 selecciones del WC 2022 enriquecidas
 *   ?resource=matches        → 64 partidos reales del WC 2022 (OpenFootball)
 *   ?resource=team&id=ARG    → un equipo por TLA
 *
 * ── Fuentes de datos ─────────────────────────────────────────────────────────
 *
 *   Partidos históricos (WC 2022):
 *     js/data/worldcup_2022.json   ← OpenFootball, datos abiertos, sin key
 *     Source: https://github.com/openfootball/worldcup.json
 *     64 partidos · 32 selecciones · marcadores reales a 90 min
 *
 *   Forma reciente (enriquecimiento opcional):
 *     TheSportsDB API v1   ← eventslast5.php por equipo, key opcional
 *     Env var: THESPORTSDB_API_KEY
 *     Demo key "123" si no hay var configurada (rate-limited, solo dev)
 *
 * ── Qué provee cada fuente ────────────────────────────────────────────────────
 *
 *   OpenFootball (local, sin API):
 *     ✅ avgGoalsFor / avgGoalsAgainst  (WC 2022 reales, los 32 equipos)
 *     ✅ recentResults WC 2022          (fallback si TSDB falla)
 *     ✅ globalAvgGoals = 1.312         (168 goles / 64 partidos / 2 = 1.312)
 *     ✅ resource=matches               (los 64 partidos del torneo)
 *
 *   TheSportsDB (enriquecimiento):
 *     ✅ recentResults actuales         (últimos 5 partidos, más relevantes que WC 2022)
 *
 *   Tablas estáticas (en este archivo):
 *     • ELO_TABLE          → eloratings.net (actualizar manualmente)
 *     • FLAG_MAP           → emojis de bandera
 *     • CONFEDERATION_MAP  → confederación FIFA
 *     • NAME_MAP           → nombres en español
 *
 * ── Cómo configurar ──────────────────────────────────────────────────────────
 *
 *   Para forma reciente real (recomendado para producción):
 *     Netlify UI → Site settings → Environment variables
 *     THESPORTSDB_API_KEY = <clave de thesportsdb.com/login.php>
 *     Sin clave: usa key demo "123" (rate-limited) o recentResults del WC 2022
 *
 *   JAMÁS escribir la clave en este archivo ni en ningún archivo del repo.
 *
 * ── Modos legacy ─────────────────────────────────────────────────────────────
 *
 *   PROVIDER_MODE = "api-football" → API-Football v3 (RapidAPI, key: API_FOOTBALL_KEY)
 *   PROVIDER_MODE = "fd"           → football-data.org (WC restringido en plan gratis)
 *
 * ── Node.js ───────────────────────────────────────────────────────────────────
 *
 *   Node 18+ (fetch nativo). Sin dependencias npm.
 */

"use strict";

const path = require("path");

// ── Configuración del proveedor ───────────────────────────────────────────────
const PROVIDER_MODE = "tsdb";

const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json";
const TSDB_DEMO = "123"; // Demo key — rate-limited. En prod usar THESPORTSDB_API_KEY.

const AF_BASE = "https://v3.football.api-sports.io"; // legacy
const FD_BASE = "https://api.football-data.org/v4";  // legacy

// ── Carga de datos locales (OpenFootball WC 2022) ─────────────────────────────
// worldcup_2022.json está en js/data/ y se incluye en el deploy estático.
// require() lo traza como dependencia y lo incluye en el bundle de la función.

let WC2022 = null;
try {
  WC2022 = require(path.join(__dirname, "../../js/data/worldcup_2022.json"));
  console.info(`[football-data] WC2022 cargado: ${WC2022.totalMatches} partidos, ${Object.keys(WC2022.teamStats).length} equipos`);
} catch (err) {
  console.warn("[football-data] worldcup_2022.json no disponible:", err.message);
}

// ── Tablas estáticas ──────────────────────────────────────────────────────────
// Cubren exactamente los 32 participantes del WC 2022.
// ITA y NGA no participaron; CAN y KSA sí.

const ELO_TABLE = {
  ARG: 1920, FRA: 1890, BRA: 1880, ENG: 1850, ESP: 1840,
  GER: 1820, POR: 1800, NED: 1790, BEL: 1780, URU: 1760,
  DEN: 1760, CRO: 1740, SUI: 1730, MEX: 1720, SEN: 1710,
  MAR: 1700, POL: 1700, JPN: 1690, SRB: 1680, WAL: 1680,
  USA: 1660, CAN: 1650, KOR: 1650, ECU: 1640, IRN: 1640,
  KSA: 1630, AUS: 1620, GHA: 1610, CRC: 1610, TUN: 1600,
  CMR: 1590, QAT: 1580,
};
const DEFAULT_ELO = 1600;

const FLAG_MAP = {
  ARG: "🇦🇷", FRA: "🇫🇷", BRA: "🇧🇷", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", ESP: "🇪🇸",
  GER: "🇩🇪", POR: "🇵🇹", NED: "🇳🇱", BEL: "🇧🇪", URU: "🇺🇾",
  DEN: "🇩🇰", CRO: "🇭🇷", SUI: "🇨🇭", MEX: "🇲🇽", SEN: "🇸🇳",
  MAR: "🇲🇦", POL: "🇵🇱", JPN: "🇯🇵", SRB: "🇷🇸", WAL: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
  USA: "🇺🇸", CAN: "🇨🇦", KOR: "🇰🇷", ECU: "🇪🇨", IRN: "🇮🇷",
  KSA: "🇸🇦", AUS: "🇦🇺", GHA: "🇬🇭", CRC: "🇨🇷", TUN: "🇹🇳",
  CMR: "🇨🇲", QAT: "🇶🇦",
};

const CONFEDERATION_BY_TLA = {
  ARG: "CONMEBOL", BRA: "CONMEBOL", URU: "CONMEBOL", ECU: "CONMEBOL",
  FRA: "UEFA",     ENG: "UEFA",     ESP: "UEFA",     GER: "UEFA",
  POR: "UEFA",     NED: "UEFA",     BEL: "UEFA",     CRO: "UEFA",
  SUI: "UEFA",     WAL: "UEFA",     DEN: "UEFA",     POL: "UEFA",
  SRB: "UEFA",
  MAR: "CAF",      SEN: "CAF",      GHA: "CAF",      CMR: "CAF",
  TUN: "CAF",
  MEX: "CONCACAF", USA: "CONCACAF", CRC: "CONCACAF", CAN: "CONCACAF",
  JPN: "AFC",      KOR: "AFC",      AUS: "AFC",      IRN: "AFC",
  QAT: "AFC",      KSA: "AFC",
};

const NAME_MAP = {
  ARG: "Argentina",       FRA: "Francia",        BRA: "Brasil",
  ENG: "Inglaterra",      ESP: "España",         GER: "Alemania",
  POR: "Portugal",        NED: "Países Bajos",   BEL: "Bélgica",
  URU: "Uruguay",         DEN: "Dinamarca",      CRO: "Croacia",
  SUI: "Suiza",           MEX: "México",         SEN: "Senegal",
  MAR: "Marruecos",       POL: "Polonia",        JPN: "Japón",
  SRB: "Serbia",          WAL: "Gales",          USA: "EE. UU.",
  CAN: "Canadá",          KOR: "Corea del Sur",  ECU: "Ecuador",
  IRN: "Irán",            KSA: "Arabia Saudita", AUS: "Australia",
  GHA: "Ghana",           CRC: "Costa Rica",     TUN: "Túnez",
  CMR: "Camerún",         QAT: "Catar",
};

// Equipos del WC 2022 (32 participantes reales), con nombre en inglés para TSDB search
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
  { tla: "CAN", nameEn: "Canada"       },
  { tla: "KOR", nameEn: "South Korea"  },
  { tla: "ECU", nameEn: "Ecuador"      },
  { tla: "IRN", nameEn: "Iran"         },
  { tla: "KSA", nameEn: "Saudi Arabia" },
  { tla: "AUS", nameEn: "Australia"    },
  { tla: "GHA", nameEn: "Ghana"        },
  { tla: "CRC", nameEn: "Costa Rica"   },
  { tla: "TUN", nameEn: "Tunisia"      },
  { tla: "CMR", nameEn: "Cameroon"     },
  { tla: "QAT", nameEn: "Qatar"        },
];

// Mapa nombre inglés → TLA para normalizar nombres de TSDB en partidos de temporada
const TLA_BY_TSDB_NAME = {
  "Argentina": "ARG",       "France": "FRA",       "Brazil": "BRA",
  "England": "ENG",         "Spain": "ESP",         "Germany": "GER",
  "Portugal": "POR",        "Netherlands": "NED",   "Belgium": "BEL",
  "Uruguay": "URU",         "Denmark": "DEN",       "Croatia": "CRO",
  "Switzerland": "SUI",     "Mexico": "MEX",        "Senegal": "SEN",
  "Morocco": "MAR",         "Poland": "POL",        "Japan": "JPN",
  "Serbia": "SRB",          "Wales": "WAL",         "USA": "USA",
  "Canada": "CAN",          "South Korea": "KOR",   "Ecuador": "ECU",
  "Iran": "IRN",            "IR Iran": "IRN",       "Saudi Arabia": "KSA",
  "Australia": "AUS",       "Ghana": "GHA",         "Costa Rica": "CRC",
  "Tunisia": "TUN",         "Cameroon": "CMR",      "Qatar": "QAT",
  "Korea Republic": "KOR",  "United States": "USA",
};

// Stats fallback por si worldcup_2022.json no se puede cargar
// Valores reales calculados desde OpenFootball WC 2022 (168 goles, 64 partidos)
const WC_STATS_FALLBACK = {
  ARG: { avgGoalsFor: 2.00, avgGoalsAgainst: 1.00, recentResults: ["L","W","W","W","D","W","D"] },
  AUS: { avgGoalsFor: 1.00, avgGoalsAgainst: 1.50, recentResults: ["L","W","W","L"] },
  BEL: { avgGoalsFor: 0.33, avgGoalsAgainst: 0.67, recentResults: ["W","L","D"] },
  BRA: { avgGoalsFor: 1.40, avgGoalsAgainst: 0.40, recentResults: ["W","W","L","W","D"] },
  CAN: { avgGoalsFor: 0.67, avgGoalsAgainst: 2.33, recentResults: ["L","L","L"] },
  CMR: { avgGoalsFor: 1.33, avgGoalsAgainst: 1.33, recentResults: ["L","D","W"] },
  CRC: { avgGoalsFor: 1.00, avgGoalsAgainst: 3.67, recentResults: ["L","W","L"] },
  CRO: { avgGoalsFor: 1.00, avgGoalsAgainst: 0.86, recentResults: ["D","W","D","D","D","L","W"] },
  DEN: { avgGoalsFor: 0.33, avgGoalsAgainst: 1.00, recentResults: ["D","L","L"] },
  ECU: { avgGoalsFor: 1.33, avgGoalsAgainst: 1.00, recentResults: ["W","D","L"] },
  ENG: { avgGoalsFor: 2.60, avgGoalsAgainst: 0.80, recentResults: ["W","D","W","W","L"] },
  ESP: { avgGoalsFor: 2.25, avgGoalsAgainst: 0.75, recentResults: ["W","D","L","D"] },
  FRA: { avgGoalsFor: 2.14, avgGoalsAgainst: 1.00, recentResults: ["W","W","L","W","W","W","D"] },
  GER: { avgGoalsFor: 2.00, avgGoalsAgainst: 1.67, recentResults: ["L","D","W"] },
  GHA: { avgGoalsFor: 1.67, avgGoalsAgainst: 2.33, recentResults: ["L","W","L"] },
  IRN: { avgGoalsFor: 1.33, avgGoalsAgainst: 2.33, recentResults: ["L","W","L"] },
  JPN: { avgGoalsFor: 1.25, avgGoalsAgainst: 1.00, recentResults: ["W","L","W","D"] },
  KOR: { avgGoalsFor: 1.25, avgGoalsAgainst: 2.00, recentResults: ["D","L","W","L"] },
  KSA: { avgGoalsFor: 1.00, avgGoalsAgainst: 1.67, recentResults: ["W","L","L"] },
  MAR: { avgGoalsFor: 0.86, avgGoalsAgainst: 0.71, recentResults: ["D","W","W","D","W","L","L"] },
  MEX: { avgGoalsFor: 0.67, avgGoalsAgainst: 1.00, recentResults: ["D","L","W"] },
  NED: { avgGoalsFor: 2.00, avgGoalsAgainst: 0.80, recentResults: ["W","D","W","W","D"] },
  POL: { avgGoalsFor: 0.75, avgGoalsAgainst: 1.25, recentResults: ["D","W","L","L"] },
  POR: { avgGoalsFor: 2.40, avgGoalsAgainst: 1.20, recentResults: ["W","W","L","W","L"] },
  QAT: { avgGoalsFor: 0.33, avgGoalsAgainst: 2.33, recentResults: ["L","L","L"] },
  SEN: { avgGoalsFor: 1.25, avgGoalsAgainst: 1.75, recentResults: ["L","W","W","L"] },
  SRB: { avgGoalsFor: 1.67, avgGoalsAgainst: 2.67, recentResults: ["L","D","L"] },
  SUI: { avgGoalsFor: 1.25, avgGoalsAgainst: 2.25, recentResults: ["W","L","W","L"] },
  TUN: { avgGoalsFor: 0.33, avgGoalsAgainst: 0.33, recentResults: ["D","L","W"] },
  URU: { avgGoalsFor: 0.67, avgGoalsAgainst: 0.67, recentResults: ["D","L","W"] },
  USA: { avgGoalsFor: 0.75, avgGoalsAgainst: 1.00, recentResults: ["D","D","W","L"] },
  WAL: { avgGoalsFor: 0.33, avgGoalsAgainst: 2.00, recentResults: ["D","L","L"] },
};

// globalAvgGoals WC 2022: 168 goles / 64 partidos = 2.625/partido = 1.312/equipo/partido
const WC_GLOBAL_AVG_GOALS = (WC2022?.globalAvgGoals) ?? 1.312;

const ERR_PLAN_RESTRICTION = "PLAN_RESTRICTION";

// ── Helpers: datos locales (OpenFootball) ─────────────────────────────────────

/**
 * Devuelve stats de WC 2022 para un equipo.
 * Prioridad: JSON local → WC_STATS_FALLBACK → defaults.
 */
function getWC2022Stats(tla) {
  return (
    WC2022?.teamStats?.[tla] ??
    WC_STATS_FALLBACK[tla] ??
    { avgGoalsFor: 1.30, avgGoalsAgainst: 1.30, recentResults: [] }
  );
}

// ── Helpers: TheSportsDB ──────────────────────────────────────────────────────

async function tsdbFetch(path_, apiKey) {
  const url        = `${TSDB_BASE}/${apiKey}/${path_}`;
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
 * Convierte eventslast5 de TSDB en array ["W","D","L"] más reciente primero.
 * Usa idTeam para distinguir local/visitante (robusto ante variantes de nombre).
 */
function computeResultsFromEvents(idTeam, events) {
  return (events ?? [])
    .filter(ev => ev.intHomeScore !== null && ev.intHomeScore !== "")
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

async function enrichTeamTsdb(nameEn, apiKey) {
  const searchJson = await tsdbFetch(
    `searchteams.php?t=${encodeURIComponent(nameEn)}`,
    apiKey
  );
  const team = findNationalTeam(searchJson.teams);
  if (!team?.idTeam) throw new Error(`TSDB: equipo no encontrado: "${nameEn}"`);

  const eventsJson = await tsdbFetch(`eventslast5.php?id=${team.idTeam}`, apiKey);
  const recentResults = computeResultsFromEvents(team.idTeam, eventsJson.results);

  return { idTeam: team.idTeam, recentResults };
}

// ── Handler: TheSportsDB teams ────────────────────────────────────────────────

async function handleTeamsTsdb(apiKey) {
  // Enriquecer forma reciente en paralelo — allSettled para fallos individuales
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

  console.info(`[football-data] TSDB recentResults enriched: ${enrichCount}/${WC_2022_TEAMS.length}`);
  console.info(`[football-data] avgGoals source: ${WC2022 ? "worldcup_2022.json" : "WC_STATS_FALLBACK"}`);

  const teams = WC_2022_TEAMS.map(t => {
    const wc     = getWC2022Stats(t.tla);
    const tsdb   = enrichMap[t.tla];
    return {
      id:              t.tla,
      name:            NAME_MAP[t.tla]             ?? t.nameEn,
      flag:            FLAG_MAP[t.tla]             ?? "🏳",
      confederation:   CONFEDERATION_BY_TLA[t.tla] ?? "?",
      elo:             ELO_TABLE[t.tla]            ?? DEFAULT_ELO,
      avgGoalsFor:     wc.avgGoalsFor,    // WC 2022 real
      avgGoalsAgainst: wc.avgGoalsAgainst, // WC 2022 real
      // Forma reciente: TSDB (actual) > WC 2022 (histórico) > vacío
      recentResults:   tsdb?.recentResults ?? wc.recentResults,
    };
  }).sort((a, b) => b.elo - a.elo);

  return {
    teams,
    globalAvgGoals: WC_GLOBAL_AVG_GOALS,
    _meta: {
      statsSource:   WC2022 ? "worldcup_2022.json" : "static_fallback",
      tsdbEnriched:  enrichCount,
      totalTeams:    WC_2022_TEAMS.length,
    },
  };
}

// ── Handler: partidos ─────────────────────────────────────────────────────────

async function handleMatchesTsdb(_apiKey) {
  // Prioridad: datos locales de OpenFootball (sin API call, sin key)
  if (WC2022?.matches?.length > 0) {
    const matches = WC2022.matches.map(m => ({
      home:      m.home,
      away:      m.away,
      goalsHome: m.goalsHome,
      goalsAway: m.goalsAway,
    }));
    return { matches };
  }

  // Sin datos locales — señalar fallback al frontend
  console.warn("[football-data] worldcup_2022.json no disponible para resource=matches");
  return {
    fallback: true,
    reason:   "no_local_match_data",
    message:  "worldcup_2022.json no encontrado en el bundle de la función",
    hint:     "Verificar que js/data/worldcup_2022.json esté en el repositorio y se haga deploy.",
  };
}

// ── Helpers: API-Football (legacy) ────────────────────────────────────────────

async function afFetch(path_, apiKey) {
  const res = await fetch(`${AF_BASE}${path_}`, {
    headers: { "x-rapidapi-key": apiKey, "x-rapidapi-host": "v3.football.api-sports.io" },
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
  const nm       = [];
  const teamSet  = new Map();
  for (const f of fixtures) {
    if (!FINISHED_AF.has(f.fixture?.status?.short)) continue;
    const ht = afTeamToTla(f.teams?.home), at = afTeamToTla(f.teams?.away);
    if (!ht || !at) continue;
    nm.push({ homeTeam: ht, awayTeam: at, scoreHome: f.score?.fulltime?.home ?? 0, scoreAway: f.score?.fulltime?.away ?? 0 });
    if (!teamSet.has(ht)) teamSet.set(ht, f.teams.home);
    if (!teamSet.has(at)) teamSet.set(at, f.teams.away);
  }
  const totalGoals = nm.reduce((a, m) => a + m.scoreHome + m.scoreAway, 0);
  const globalAvgGoals = nm.length ? parseFloat((totalGoals / nm.length).toFixed(3)) : WC_GLOBAL_AVG_GOALS;
  const teams = [...teamSet.keys()].map(tla => {
    const played = nm.filter(m => m.homeTeam === tla || m.awayTeam === tla);
    let gf = 0, ga = 0; const results = [];
    for (const m of played) {
      const ih = m.homeTeam === tla;
      const s = ih ? m.scoreHome : m.scoreAway, c = ih ? m.scoreAway : m.scoreHome;
      gf += s; ga += c;
      results.push(s > c ? "W" : s < c ? "L" : "D");
    }
    return {
      id: tla, name: NAME_MAP[tla] ?? tla, flag: FLAG_MAP[tla] ?? "🏳",
      confederation: CONFEDERATION_BY_TLA[tla] ?? "?", elo: ELO_TABLE[tla] ?? DEFAULT_ELO,
      avgGoalsFor:     played.length ? parseFloat((gf / played.length).toFixed(2)) : 1.40,
      avgGoalsAgainst: played.length ? parseFloat((ga / played.length).toFixed(2)) : 1.30,
      recentResults:   results.slice(-8).reverse(),
    };
  }).sort((a, b) => b.elo - a.elo);
  return { teams, globalAvgGoals };
}

async function handleMatchesAf(apiKey) {
  const data     = await afFetch(`/fixtures?league=${AF_LEAGUE}&season=${AF_SEASON}`, apiKey);
  const matches  = (data.response ?? [])
    .filter(f => FINISHED_AF.has(f.fixture?.status?.short))
    .map(f => ({ home: afTeamToTla(f.teams?.home), away: afTeamToTla(f.teams?.away),
      goalsHome: f.score?.fulltime?.home ?? 0, goalsAway: f.score?.fulltime?.away ?? 0 }))
    .filter(m => m.home && m.away);
  return { matches };
}

// ── Helpers: football-data.org (legacy) ──────────────────────────────────────

async function fdFetch(path_, apiKey) {
  const res = await fetch(`${FD_BASE}${path_}`, { headers: { "X-Auth-Token": apiKey } });
  if (res.status === 403) {
    const err = new Error("football-data.org 403: WC restringido en plan gratuito");
    err.code  = ERR_PLAN_RESTRICTION;
    throw err;
  }
  if (!res.ok) throw new Error(`FD API ${res.status}`);
  return res.json();
}

async function handleTeamsFd(apiKey) {
  const [td, md] = await Promise.all([
    fdFetch("/competitions/WC/teams?season=2022", apiKey),
    fdFetch("/competitions/WC/matches?season=2022&status=FINISHED", apiKey),
  ]);
  const matches = md.matches ?? [];
  let total = 0;
  const teams = (td.teams ?? []).map(t => {
    const tla    = t.tla ?? t.shortName?.toUpperCase().slice(0, 3);
    const played = matches.filter(m => m.homeTeam?.tla === tla || m.awayTeam?.tla === tla);
    let gf = 0, ga = 0; const results = [];
    for (const m of played) {
      const ih = m.homeTeam?.tla === tla;
      const s = ih ? m.score.fullTime.home : m.score.fullTime.away;
      const c = ih ? m.score.fullTime.away : m.score.fullTime.home;
      gf += s; ga += c; total += s + c;
      results.push(s > c ? "W" : s < c ? "L" : "D");
    }
    return {
      id: tla, name: NAME_MAP[tla] ?? t.shortName ?? t.name, flag: FLAG_MAP[tla] ?? "🏳",
      confederation: CONFEDERATION_BY_TLA[tla] ?? "?", elo: ELO_TABLE[tla] ?? DEFAULT_ELO,
      avgGoalsFor:     played.length ? parseFloat((gf / played.length).toFixed(2)) : 1.40,
      avgGoalsAgainst: played.length ? parseFloat((ga / played.length).toFixed(2)) : 1.30,
      recentResults:   results.slice(-8).reverse(),
    };
  }).sort((a, b) => b.elo - a.elo);
  const globalAvgGoals = matches.length ? parseFloat((total / matches.length).toFixed(3)) : WC_GLOBAL_AVG_GOALS;
  return { teams, globalAvgGoals };
}

async function handleMatchesFd(apiKey) {
  const data   = await fdFetch("/competitions/WC/matches?season=2022&status=FINISHED", apiKey);
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

  const ENV_VAR = { tsdb: "THESPORTSDB_API_KEY", "api-football": "API_FOOTBALL_KEY", fd: "FOOTBALL_DATA_API_KEY" };
  const DEMO    = { tsdb: TSDB_DEMO };
  const envVar  = ENV_VAR[PROVIDER_MODE] ?? "THESPORTSDB_API_KEY";
  const apiKey  = process.env[envVar] ?? DEMO[PROVIDER_MODE];

  if (!apiKey) {
    console.info(`[football-data] ${envVar} no configurada → fallback al mock`);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({ fallback: true, reason: "no_api_key",
        message: `${envVar} no está configurada`,
        hint:    "Configurar en Netlify UI → Site settings → Environment variables" }),
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

    // Handler señaló fallback explícito (ej: sin datos locales)
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
        body: JSON.stringify({ fallback: true, reason: "plan_restriction",
          message: err.message, hint: "Verificar clave y plan. El frontend usará fallback mock." }),
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
