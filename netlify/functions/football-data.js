/**
 * Netlify Function — Proxy seguro para datos de fútbol
 *
 * Endpoint: /.netlify/functions/football-data
 *
 * ── Recursos ─────────────────────────────────────────────────────────────────
 *
 *   ?resource=teams                       → 48 selecciones del Mundial 2026
 *   ?resource=groups                      → grupos A–L del Mundial 2026
 *   ?resource=matches                     → partidos WC 2022 (H2H histórico)
 *   ?resource=matches&tournament=2026     → partidos WC 2026 (resultados actuales)
 *   ?resource=team&id=ARG                 → un equipo por TLA
 *
 * ── Fuentes de datos ─────────────────────────────────────────────────────────
 *
 *   team_history.json  — stats históricas 2022-2026 para los equipos originales
 *   wc2026.json        — grupos A-L + resultados del Mundial 2026
 *   wc2022.json        — 64 partidos WC 2022 para análisis H2H histórico
 *
 * JAMÁS escribir la clave de API en este archivo ni en ningún archivo del repo.
 */

"use strict";

// ── Configuración del proveedor ───────────────────────────────────────────────
const PROVIDER_MODE = "tsdb";

const TSDB_BASE = "https://www.thesportsdb.com/api/v1/json";
const TSDB_DEMO = "123"; // Demo key — rate-limited. En prod usar THESPORTSDB_API_KEY.

const AF_BASE = "https://v3.football.api-sports.io"; // legacy
const FD_BASE = "https://api.football-data.org/v4";  // legacy

// ── Carga de datos locales ────────────────────────────────────────────────────
// IMPORTANTE: require() con ruta ESTÁTICA (sin path.join/__dirname dinámico)
// para que esbuild lo trace como dependencia en tiempo de build.

// Historial multi-competición (fuente principal de stats)
let TEAM_HISTORY = null;
try {
  TEAM_HISTORY = require("./data/team_history.json");
  console.info(`[football-data] team_history cargado: ${Object.keys(TEAM_HISTORY.teams ?? {}).length} equipos`);
} catch (err) {
  console.warn("[football-data] data/team_history.json no disponible:", err.message);
}

// WC 2022 (H2H histórico)
let WC2022 = null;
try {
  WC2022 = require("./data/wc2022.json");
  console.info(`[football-data] WC2022 cargado: ${WC2022.totalMatches} partidos`);
} catch (err) {
  console.warn("[football-data] data/wc2022.json no disponible:", err.message);
}

// WC 2026 (grupos + resultados en curso)
let WC2026 = null;
try {
  WC2026 = require("./data/wc2026.json");
  console.info(`[football-data] WC2026 cargado: ${Object.keys(WC2026.groups ?? {}).length} grupos, ${WC2026.matches?.length ?? 0} partidos`);
} catch (err) {
  console.warn("[football-data] data/wc2026.json no disponible:", err.message);
}

// ── Tablas estáticas — 48 participantes del Mundial 2026 ─────────────────────
// ELO estimado junio 2026. Actualizar periódicamente desde eloratings.net.

const ELO_TABLE = {
  // Group A
  MEX: 1720, KOR: 1680, ZAF: 1490, CZE: 1710,
  // Group B
  CAN: 1700, SUI: 1760, QAT: 1550, BIH: 1580,
  // Group C
  BRA: 1870, MAR: 1750, SCO: 1670, HAI: 1310,
  // Group D
  USA: 1700, AUS: 1640, PAR: 1640, TUR: 1690,
  // Group E
  GER: 1820, CIV: 1670, ECU: 1640, CUW: 1360,
  // Group F
  NED: 1790, JPN: 1750, SWE: 1680, TUN: 1600,
  // Group G
  BEL: 1770, IRN: 1650, EGY: 1580, NZL: 1400,
  // Group H
  ESP: 1870, URU: 1770, KSA: 1610, CPV: 1490,
  // Group I
  FRA: 1900, SEN: 1720, NOR: 1730, IRQ: 1560,
  // Group J
  ARG: 1950, AUT: 1740, ALG: 1610, JOR: 1540,
  // Group K
  POR: 1840, COL: 1760, UZB: 1580, COD: 1490,
  // Group L
  ENG: 1870, CRO: 1730, GHA: 1570, PAN: 1520,
};
const DEFAULT_ELO = 1550;

const FLAG_MAP = {
  // Group A
  MEX: "🇲🇽", KOR: "🇰🇷", ZAF: "🇿🇦", CZE: "🇨🇿",
  // Group B
  CAN: "🇨🇦", SUI: "🇨🇭", QAT: "🇶🇦", BIH: "🇧🇦",
  // Group C
  BRA: "🇧🇷", MAR: "🇲🇦", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", HAI: "🇭🇹",
  // Group D
  USA: "🇺🇸", AUS: "🇦🇺", PAR: "🇵🇾", TUR: "🇹🇷",
  // Group E
  GER: "🇩🇪", CIV: "🇨🇮", ECU: "🇪🇨", CUW: "🇨🇼",
  // Group F
  NED: "🇳🇱", JPN: "🇯🇵", SWE: "🇸🇪", TUN: "🇹🇳",
  // Group G
  BEL: "🇧🇪", IRN: "🇮🇷", EGY: "🇪🇬", NZL: "🇳🇿",
  // Group H
  ESP: "🇪🇸", URU: "🇺🇾", KSA: "🇸🇦", CPV: "🇨🇻",
  // Group I
  FRA: "🇫🇷", SEN: "🇸🇳", NOR: "🇳🇴", IRQ: "🇮🇶",
  // Group J
  ARG: "🇦🇷", AUT: "🇦🇹", ALG: "🇩🇿", JOR: "🇯🇴",
  // Group K
  POR: "🇵🇹", COL: "🇨🇴", UZB: "🇺🇿", COD: "🇨🇩",
  // Group L
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", CRO: "🇭🇷", GHA: "🇬🇭", PAN: "🇵🇦",
};

const CONFEDERATION_BY_TLA = {
  ARG: "CONMEBOL", BRA: "CONMEBOL", URU: "CONMEBOL", ECU: "CONMEBOL",
  PAR: "CONMEBOL", COL: "CONMEBOL",
  FRA: "UEFA",     ENG: "UEFA",     ESP: "UEFA",     GER: "UEFA",
  POR: "UEFA",     NED: "UEFA",     BEL: "UEFA",     CRO: "UEFA",
  SUI: "UEFA",     SCO: "UEFA",     AUT: "UEFA",     SWE: "UEFA",
  CZE: "UEFA",     TUR: "UEFA",
  MAR: "CAF",      SEN: "CAF",      GHA: "CAF",      TUN: "CAF",
  CIV: "CAF",      EGY: "CAF",      ALG: "CAF",      ZAF: "CAF",
  COD: "CAF",      CPV: "CAF",
  MEX: "CONCACAF", USA: "CONCACAF", CAN: "CONCACAF", PAN: "CONCACAF",
  HAI: "CONCACAF", CUW: "CONCACAF",
  JPN: "AFC",      KOR: "AFC",      AUS: "AFC",      IRN: "AFC",
  QAT: "AFC",      KSA: "AFC",      IRQ: "AFC",      UZB: "AFC",
  JOR: "AFC",      NOR: "UEFA",     NZL: "OFC",
};

const NAME_MAP = {
  // Group A
  MEX: "México",           KOR: "Corea del Sur",  ZAF: "Sudáfrica",     CZE: "Chequia",
  // Group B
  CAN: "Canadá",           SUI: "Suiza",          QAT: "Catar",         BIH: "Bosnia-Herzegovina",
  // Group C
  BRA: "Brasil",           MAR: "Marruecos",      SCO: "Escocia",       HAI: "Haití",
  // Group D
  USA: "EE. UU.",          AUS: "Australia",      PAR: "Paraguay",      TUR: "Turquía",
  // Group E
  GER: "Alemania",         CIV: "Costa de Marfil",ECU: "Ecuador",       CUW: "Curazao",
  // Group F
  NED: "Países Bajos",     JPN: "Japón",          SWE: "Suecia",        TUN: "Túnez",
  // Group G
  BEL: "Bélgica",          IRN: "Irán",           EGY: "Egipto",        NZL: "Nueva Zelanda",
  // Group H
  ESP: "España",           URU: "Uruguay",        KSA: "Arabia Saudita",CPV: "Cabo Verde",
  // Group I
  FRA: "Francia",          SEN: "Senegal",        NOR: "Noruega",       IRQ: "Irak",
  // Group J
  ARG: "Argentina",        AUT: "Austria",        ALG: "Argelia",       JOR: "Jordania",
  // Group K
  POR: "Portugal",         COL: "Colombia",       UZB: "Uzbekistán",    COD: "R. D. Congo",
  // Group L
  ENG: "Inglaterra",       CRO: "Croacia",        GHA: "Ghana",         PAN: "Panamá",
};

// Los 48 participantes del Mundial 2026, con nombre en inglés para TSDB
const APP_TEAMS = [
  { tla: "ARG", nameEn: "Argentina"       }, { tla: "FRA", nameEn: "France"          },
  { tla: "ESP", nameEn: "Spain"           }, { tla: "ENG", nameEn: "England"         },
  { tla: "BRA", nameEn: "Brazil"          }, { tla: "POR", nameEn: "Portugal"        },
  { tla: "GER", nameEn: "Germany"         }, { tla: "NED", nameEn: "Netherlands"     },
  { tla: "URU", nameEn: "Uruguay"         }, { tla: "BEL", nameEn: "Belgium"         },
  { tla: "SUI", nameEn: "Switzerland"     }, { tla: "COL", nameEn: "Colombia"        },
  { tla: "MAR", nameEn: "Morocco"         }, { tla: "JPN", nameEn: "Japan"           },
  { tla: "NOR", nameEn: "Norway"          }, { tla: "AUT", nameEn: "Austria"         },
  { tla: "CRO", nameEn: "Croatia"         }, { tla: "SEN", nameEn: "Senegal"         },
  { tla: "MEX", nameEn: "Mexico"          }, { tla: "USA", nameEn: "USA"             },
  { tla: "CAN", nameEn: "Canada"          }, { tla: "CZE", nameEn: "Czech Republic"  },
  { tla: "SWE", nameEn: "Sweden"          }, { tla: "TUR", nameEn: "Turkey"          },
  { tla: "SCO", nameEn: "Scotland"        }, { tla: "CIV", nameEn: "Ivory Coast"     },
  { tla: "KOR", nameEn: "South Korea"     }, { tla: "AUS", nameEn: "Australia"       },
  { tla: "ECU", nameEn: "Ecuador"         }, { tla: "IRN", nameEn: "Iran"            },
  { tla: "PAR", nameEn: "Paraguay"        }, { tla: "ALG", nameEn: "Algeria"         },
  { tla: "UZB", nameEn: "Uzbekistan"      }, { tla: "KSA", nameEn: "Saudi Arabia"    },
  { tla: "GHA", nameEn: "Ghana"           }, { tla: "TUN", nameEn: "Tunisia"         },
  { tla: "IRQ", nameEn: "Iraq"            }, { tla: "QAT", nameEn: "Qatar"           },
  { tla: "BIH", nameEn: "Bosnia"          }, { tla: "EGY", nameEn: "Egypt"           },
  { tla: "ZAF", nameEn: "South Africa"    }, { tla: "JOR", nameEn: "Jordan"          },
  { tla: "COD", nameEn: "DR Congo"        }, { tla: "CPV", nameEn: "Cape Verde"      },
  { tla: "PAN", nameEn: "Panama"          }, { tla: "NZL", nameEn: "New Zealand"     },
  { tla: "CUW", nameEn: "Curacao"         }, { tla: "HAI", nameEn: "Haiti"           },
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

const WC_GLOBAL_AVG_GOALS = (WC2022?.globalAvgGoals) ?? 1.312;
const ERR_PLAN_RESTRICTION = "PLAN_RESTRICTION";

// ── Stats estáticas para equipos no cubiertos por team_history.json ───────────
// Estimadas a partir de rendimiento en clasificatorias 2023-2026 y torneos recientes.

const WC2026_STATS = {
  // Group A
  ZAF: { avgGoalsFor: 1.1, avgGoalsAgainst: 1.0, recentResults: ["W","D","L","W","W","D","W","L","D","W"],  wins:  9, draws: 4, losses:  7 },
  CZE: { avgGoalsFor: 1.7, avgGoalsAgainst: 1.2, recentResults: ["L","W","D","W","W","D","W","D","W","W"],  wins: 11, draws: 5, losses:  4 },
  // Group B
  CAN: { avgGoalsFor: 1.9, avgGoalsAgainst: 1.1, recentResults: ["D","W","D","W","W","W","D","W","W","D"],  wins: 12, draws: 5, losses:  3 },
  QAT: { avgGoalsFor: 0.9, avgGoalsAgainst: 1.5, recentResults: ["L","W","L","D","L","W","L","D","L","D"],  wins:  5, draws: 5, losses: 10 },
  BIH: { avgGoalsFor: 1.4, avgGoalsAgainst: 1.3, recentResults: ["D","L","W","D","W","L","D","W","D","W"],  wins:  8, draws: 6, losses:  6 },
  SUI: { avgGoalsFor: 1.7, avgGoalsAgainst: 0.9, recentResults: ["W","W","D","W","W","D","W","L","W","D"],  wins: 13, draws: 4, losses:  3 },
  // Group C
  SCO: { avgGoalsFor: 1.6, avgGoalsAgainst: 1.2, recentResults: ["W","D","W","D","W","W","L","D","W","W"],  wins: 11, draws: 5, losses:  4 },
  HAI: { avgGoalsFor: 0.7, avgGoalsAgainst: 1.9, recentResults: ["L","L","D","L","W","L","L","D","L","W"],  wins:  3, draws: 4, losses: 13 },
  // Group D
  PAR: { avgGoalsFor: 1.3, avgGoalsAgainst: 1.4, recentResults: ["L","D","W","L","D","W","D","W","L","D"],  wins:  7, draws: 6, losses:  7 },
  TUR: { avgGoalsFor: 1.8, avgGoalsAgainst: 1.1, recentResults: ["W","W","D","W","L","W","D","W","W","D"],  wins: 12, draws: 4, losses:  4 },
  // Group E
  CUW: { avgGoalsFor: 1.0, avgGoalsAgainst: 1.6, recentResults: ["W","L","D","L","W","L","D","L","W","L"],  wins:  5, draws: 4, losses: 11 },
  CIV: { avgGoalsFor: 1.7, avgGoalsAgainst: 1.0, recentResults: ["W","W","D","W","W","L","D","W","W","D"],  wins: 13, draws: 4, losses:  3 },
  ECU: { avgGoalsFor: 1.6, avgGoalsAgainst: 1.2, recentResults: ["W","D","W","W","L","D","W","D","W","D"],  wins: 11, draws: 5, losses:  4 },
  // Group F
  TUN: { avgGoalsFor: 1.2, avgGoalsAgainst: 1.1, recentResults: ["D","W","L","D","W","D","W","L","D","W"],  wins:  8, draws: 7, losses:  5 },
  SWE: { avgGoalsFor: 1.8, avgGoalsAgainst: 1.0, recentResults: ["W","W","D","W","D","W","L","W","D","W"],  wins: 13, draws: 4, losses:  3 },
  // Group G
  EGY: { avgGoalsFor: 1.3, avgGoalsAgainst: 0.9, recentResults: ["W","D","W","D","L","W","D","W","W","D"],  wins: 10, draws: 6, losses:  4 },
  NZL: { avgGoalsFor: 0.9, avgGoalsAgainst: 1.7, recentResults: ["D","L","W","D","L","L","W","D","L","D"],  wins:  4, draws: 5, losses: 11 },
  // Group H
  CPV: { avgGoalsFor: 1.2, avgGoalsAgainst: 1.0, recentResults: ["W","D","W","D","D","W","L","W","D","W"],  wins: 10, draws: 6, losses:  4 },
  KSA: { avgGoalsFor: 1.4, avgGoalsAgainst: 1.4, recentResults: ["D","W","L","W","D","L","W","D","W","L"],  wins:  8, draws: 5, losses:  7 },
  // Group I
  NOR: { avgGoalsFor: 2.3, avgGoalsAgainst: 1.0, recentResults: ["W","W","W","D","W","L","W","W","D","W"],  wins: 14, draws: 3, losses:  3 },
  IRQ: { avgGoalsFor: 1.4, avgGoalsAgainst: 1.2, recentResults: ["W","D","W","L","D","W","W","L","D","W"],  wins: 10, draws: 5, losses:  5 },
  // Group J
  ALG: { avgGoalsFor: 1.5, avgGoalsAgainst: 1.0, recentResults: ["W","D","W","D","W","L","W","D","W","D"],  wins: 11, draws: 6, losses:  3 },
  AUT: { avgGoalsFor: 2.1, avgGoalsAgainst: 1.1, recentResults: ["W","W","D","W","W","D","L","W","W","D"],  wins: 13, draws: 4, losses:  3 },
  JOR: { avgGoalsFor: 1.3, avgGoalsAgainst: 1.3, recentResults: ["W","D","L","W","D","L","W","D","D","W"],  wins:  9, draws: 6, losses:  5 },
  // Group K
  COL: { avgGoalsFor: 1.9, avgGoalsAgainst: 0.8, recentResults: ["W","W","D","W","W","D","W","D","W","W"],  wins: 14, draws: 4, losses:  2 },
  UZB: { avgGoalsFor: 1.6, avgGoalsAgainst: 1.1, recentResults: ["W","W","D","W","D","L","W","W","D","W"],  wins: 12, draws: 5, losses:  3 },
  COD: { avgGoalsFor: 1.1, avgGoalsAgainst: 1.2, recentResults: ["W","L","D","W","D","W","L","D","W","L"],  wins:  8, draws: 5, losses:  7 },
  // Group L
  GHA: { avgGoalsFor: 1.4, avgGoalsAgainst: 1.3, recentResults: ["W","D","W","L","D","W","D","W","L","W"],  wins: 10, draws: 5, losses:  5 },
  PAN: { avgGoalsFor: 1.2, avgGoalsAgainst: 1.2, recentResults: ["W","D","W","W","L","D","W","L","D","W"],  wins: 10, draws: 5, losses:  5 },
};

// ── Helpers: datos locales ────────────────────────────────────────────────────

/**
 * Stats históricas para un equipo.
 * Prioridad: team_history.json → WC2026_STATS → defaults genéricos.
 */
function getHistoryStats(tla) {
  const h = TEAM_HISTORY?.teams?.[tla];
  if (h) return {
    avgGoalsFor: h.avgGoalsFor, avgGoalsAgainst: h.avgGoalsAgainst,
    recentResults: h.recentResults ?? [], wins: h.wins ?? 0, draws: h.draws ?? 0, losses: h.losses ?? 0,
  };
  const s = WC2026_STATS[tla];
  if (s) return s;
  return { avgGoalsFor: 1.35, avgGoalsAgainst: 1.35, recentResults: [], wins: 0, draws: 0, losses: 0 };
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
    APP_TEAMS.map(t => enrichTeamTsdb(t.nameEn, apiKey))
  );

  let enrichCount = 0;
  const enrichMap = {};
  APP_TEAMS.forEach((t, i) => {
    const r = settled[i];
    if (r.status === "fulfilled" && r.value?.recentResults?.length > 0) {
      enrichMap[t.tla] = r.value;
      enrichCount++;
    }
  });

  const statsSource = TEAM_HISTORY ? "team_history.json" : "static_defaults";
  console.info(`[football-data] stats source: ${statsSource}`);
  console.info(`[football-data] TSDB recentResults enriched: ${enrichCount}/${APP_TEAMS.length}`);

  const teams = APP_TEAMS.map(t => {
    const hist = getHistoryStats(t.tla);
    const tsdb = enrichMap[t.tla];
    return {
      id:              t.tla,
      name:            NAME_MAP[t.tla]             ?? t.nameEn,
      flag:            FLAG_MAP[t.tla]             ?? "🏳",
      confederation:   CONFEDERATION_BY_TLA[t.tla] ?? "?",
      elo:             ELO_TABLE[t.tla]            ?? DEFAULT_ELO,
      avgGoalsFor:     hist.avgGoalsFor,
      avgGoalsAgainst: hist.avgGoalsAgainst,
      // Forma reciente: TSDB (más actual) > team_history.json > vacío
      recentResults:   tsdb?.recentResults ?? hist.recentResults,
      wins:            hist.wins,
      draws:           hist.draws,
      losses:          hist.losses,
    };
  }).sort((a, b) => b.elo - a.elo);

  return {
    teams,
    globalAvgGoals: WC_GLOBAL_AVG_GOALS,
    _meta: {
      statsSource,
      tsdbEnriched:  enrichCount,
      totalTeams:    APP_TEAMS.length,
      historyWindow: TEAM_HISTORY?.window ?? "n/a",
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
      date:      m.date  ?? null,
      stage:     m.stage ?? null,
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

// ── Handler: grupos WC 2026 ───────────────────────────────────────────────────

function handleGroups() {
  if (!WC2026?.groups) {
    return { fallback: true, reason: "no_wc2026_data", message: "wc2026.json no disponible" };
  }
  return {
    groups:     WC2026.groups,
    tournament: WC2026.tournament,
    season:     WC2026.season,
  };
}

// ── Handler: partidos WC 2026 ─────────────────────────────────────────────────

function handleMatches2026() {
  if (!WC2026?.matches) {
    return { fallback: true, reason: "no_wc2026_data", message: "wc2026.json no disponible" };
  }
  const finished = WC2026.matches.filter(m => m.status === "finished");
  return {
    matches:    finished.map(m => ({
      home:      m.home, away:      m.away,
      goalsHome: m.goalsHome, goalsAway: m.goalsAway,
      date:      m.date, stage:     m.stage, group:     m.group,
    })),
    allMatches: WC2026.matches, // incluye "scheduled"
    tournament: WC2026.tournament,
    season:     WC2026.season,
  };
}

// ── Dispatchers ───────────────────────────────────────────────────────────────

async function handleTeams(apiKey) {
  if (PROVIDER_MODE === "tsdb")         return handleTeamsTsdb(apiKey);
  if (PROVIDER_MODE === "api-football") return handleTeamsAf(apiKey);
  return handleTeamsFd(apiKey);
}

async function handleMatches(apiKey, tournament) {
  if (tournament === "2026") return handleMatches2026();
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

  const ALLOWED = ["teams", "matches", "groups", "team"];
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
    } else if (resource === "groups") {
      data = handleGroups();
    } else if (resource === "matches") {
      data = await handleMatches(apiKey, params.tournament);
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
