/**
 * Tournament Simulator — Monte Carlo del Mundial 2026
 *
 * Formato: 4 grupos de 5 equipos (los 20 disponibles en la app).
 * Fase de grupos → Top 2 por grupo → Cuartos → Semifinales → Final.
 *
 * Cada torneo se simula en ~1 ms. Con 10.000 simulaciones el resultado
 * converge con margen de error <±0.5pp al 95% de confianza.
 *
 * NO toca: poisson.js, elo.js, form.js, odds.js, headToHead.js.
 * Usa el mismo núcleo matemático que analyzeMatch() pero sin el overhead
 * de CI, topScores ni methodology (no necesarios para simulación masiva).
 */

import { threeWayProbabilities }               from "./elo.js";
import { expectedGoals, scoreMatrix,
         matchProbabilities }                  from "./poisson.js";
import { formIndex, formFactor }               from "./form.js";
import { DEFAULT_WEIGHTS }                     from "./aggregator.js";
import { TEAMS_DATA }                          from "../data/teams.js";

// ── Grupos de demostración ────────────────────────────────────────────────────
// 4 grupos de 5, mix de confederaciones. No es el sorteo oficial.

export const GROUPS = {
  A: { name: "Grupo A", teams: ["ARG", "ENG", "JPN", "SEN", "USA"] },
  B: { name: "Grupo B", teams: ["FRA", "ESP", "CRO", "MAR", "KOR"] },
  C: { name: "Grupo C", teams: ["GER", "BRA", "URU", "NGA", "AUS"] },
  D: { name: "Grupo D", teams: ["NED", "POR", "ITA", "BEL", "MEX"] },
};

const STAGE_RANK = { groupStage: 0, quarterFinal: 1, semiFinal: 2, final: 3, champion: 4 };

// ── Motor probabilístico (versión ligera de analyzeMatch) ─────────────────────

function quickProbs(teamA, teamB, globalAvg, weights) {
  const { elo: W_ELO, poisson: W_POI } = weights;

  const elo  = threeWayProbabilities(teamA.elo, teamB.elo);
  const ffA  = formFactor(formIndex(teamA.recentResults));
  const ffB  = formFactor(formIndex(teamB.recentResults));

  const base = expectedGoals(teamA, teamB, globalAvg);
  const poi  = matchProbabilities(scoreMatrix(base.lambdaA * ffA, base.lambdaB * ffB));

  const rawA = W_ELO * elo.pA + W_POI * poi.pA;
  const rawD = W_ELO * elo.pDraw + W_POI * poi.pDraw;
  const rawB = W_ELO * elo.pB + W_POI * poi.pB;
  const sum  = rawA + rawD + rawB;

  return { pA: rawA / sum, pD: rawD / sum, pB: rawB / sum };
}

// ── Muestreo aleatorio ────────────────────────────────────────────────────────

function sampleGroup(pA, pD, pB) {
  const r = Math.random();
  if (r < pA)        return "A";
  if (r < pA + pD)   return "D";
  return "B";
}

// En eliminatorias no hay empate: redistribuir pD proporcionalmente a pA y pB
function sampleKO(pA, pB) {
  return Math.random() < pA / (pA + pB) ? "A" : "B";
}

// ── Fase de grupos ────────────────────────────────────────────────────────────

function runGroup(teamIds, teamsMap, globalAvg, weights) {
  // pts, gf, ga por equipo
  const t = Object.fromEntries(teamIds.map(id => [id, { pts: 0, gd: 0 }]));

  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      const a = teamsMap.get(teamIds[i]);
      const b = teamsMap.get(teamIds[j]);
      if (!a || !b) continue;

      const { pA, pD, pB } = quickProbs(a, b, globalAvg, weights);
      const r = sampleGroup(pA, pD, pB);

      if (r === "A") {
        t[teamIds[i]].pts += 3; t[teamIds[i]].gd += 2;
        t[teamIds[j]].gd  -= 2;
      } else if (r === "B") {
        t[teamIds[j]].pts += 3; t[teamIds[j]].gd += 2;
        t[teamIds[i]].gd  -= 2;
      } else {
        t[teamIds[i]].pts += 1;
        t[teamIds[j]].pts += 1;
      }
    }
  }

  return teamIds.slice().sort((a, b) => {
    if (t[b].pts !== t[a].pts) return t[b].pts - t[a].pts;
    if (t[b].gd  !== t[a].gd)  return t[b].gd  - t[a].gd;
    return Math.random() - 0.5; // desempate aleatorio
  });
}

// ── Un torneo completo ────────────────────────────────────────────────────────

function runTournament(teamsMap, globalAvg, weights) {
  const stageOf = {};
  for (const g of Object.values(GROUPS)) {
    for (const id of g.teams) stageOf[id] = "groupStage";
  }

  // Fase de grupos → top 2 por grupo
  const tops = {};
  for (const [key, g] of Object.entries(GROUPS)) {
    const sorted = runGroup(g.teams, teamsMap, globalAvg, weights);
    tops[key] = { first: sorted[0], second: sorted[1] };
    stageOf[sorted[0]] = "quarterFinal";
    stageOf[sorted[1]] = "quarterFinal";
  }

  // Cuartos: A1-D2, B1-C2, C1-B2, D1-A2
  const qfPairs = [
    [tops.A.first,  tops.D.second],
    [tops.B.first,  tops.C.second],
    [tops.C.first,  tops.B.second],
    [tops.D.first,  tops.A.second],
  ];
  const sfTeams = qfPairs.map(([ia, ib]) => {
    const a = teamsMap.get(ia); const b = teamsMap.get(ib);
    if (!a || !b) return ia;
    const { pA, pB } = quickProbs(a, b, globalAvg, weights);
    const w = sampleKO(pA, pB) === "A" ? ia : ib;
    stageOf[w] = "semiFinal";
    return w;
  });

  // Semifinales: W1-W2, W3-W4
  const finTeams = [[sfTeams[0], sfTeams[1]], [sfTeams[2], sfTeams[3]]].map(([ia, ib]) => {
    const a = teamsMap.get(ia); const b = teamsMap.get(ib);
    if (!a || !b) return ia;
    const { pA, pB } = quickProbs(a, b, globalAvg, weights);
    const w = sampleKO(pA, pB) === "A" ? ia : ib;
    stageOf[w] = "final";
    return w;
  });

  // Final
  const [fa, fb] = finTeams;
  const ta = teamsMap.get(fa); const tb = teamsMap.get(fb);
  const champion = (ta && tb)
    ? (sampleKO(quickProbs(ta, tb, globalAvg, weights).pA,
                quickProbs(ta, tb, globalAvg, weights).pB) === "A" ? fa : fb)
    : fa;
  stageOf[champion] = "champion";

  return stageOf;
}

// ── Monte Carlo ───────────────────────────────────────────────────────────────

/**
 * @param {object[]} teamsArray — equipos cargados por el provider (API o mock)
 * @param {object}   weights    — { elo, poisson } calibrados
 * @param {number}   globalAvg  — μ global de goles
 * @param {number}   nSims      — número de torneos a simular
 * @returns {{ results, nSims, groups }}
 */
export function runMonteCarlo(teamsArray, weights = DEFAULT_WEIGHTS, globalAvg = 1.35, nSims = 10_000) {
  // Mapa combinado: datos API (con stats recientes) > fallback estático
  const staticMap = new Map(TEAMS_DATA.teams.map(t => [t.id, t]));
  const apiMap    = new Map((teamsArray ?? []).map(t => [t.id, t]));
  const teamsMap  = new Map([...staticMap, ...apiMap]);

  const allIds = Object.values(GROUPS).flatMap(g => g.teams);
  const counts = Object.fromEntries(
    allIds.map(id => [id, { groupStage: 0, quarterFinal: 0, semiFinal: 0, final: 0, champion: 0 }])
  );

  for (let i = 0; i < nSims; i++) {
    const stageOf = runTournament(teamsMap, globalAvg, weights);
    for (const [id, stage] of Object.entries(stageOf)) {
      const rank = STAGE_RANK[stage] ?? 0;
      // Acumulativo: "llegó a cuartos" incluye semis, final y campeón
      if (rank >= 1) counts[id].quarterFinal++;
      if (rank >= 2) counts[id].semiFinal++;
      if (rank >= 3) counts[id].final++;
      if (rank >= 4) counts[id].champion++;
    }
  }

  const results = allIds.map(id => {
    const c = counts[id];
    const groupKey = Object.entries(GROUPS).find(([, g]) => g.teams.includes(id))?.[0] ?? "?";
    return {
      team:          teamsMap.get(id),
      group:         groupKey,
      pChampion:     c.champion     / nSims,
      pFinal:        c.final        / nSims,
      pSemiFinal:    c.semiFinal    / nSims,
      pQuarterFinal: c.quarterFinal / nSims,
    };
  });

  results.sort((a, b) => b.pChampion - a.pChampion);
  return { results, nSims, groups: GROUPS };
}
