/**
 * Head to Head — enfrentamientos directos entre dos selecciones.
 *
 * Función pura: opera únicamente sobre los datos que recibe.
 * Sin side effects, sin fetch.
 *
 * @param {string} teamAId
 * @param {string} teamBId
 * @param {Array<{ home, away, goalsHome, goalsAway, date?, stage? }>} matches
 * @returns {{
 *   found: boolean,
 *   count: number,
 *   winsA: number,
 *   draws: number,
 *   winsB: number,
 *   goalsA: number,
 *   goalsB: number,
 *   lastEncounters: Array<{ date, stage, goalsA, goalsB, winner }>
 * }}
 */
export function computeHeadToHead(teamAId, teamBId, matches) {
  const h2h = (matches ?? []).filter(m =>
    (m.home === teamAId && m.away === teamBId) ||
    (m.home === teamBId && m.away === teamAId)
  );

  if (h2h.length === 0) {
    return { found: false, count: 0, winsA: 0, draws: 0, winsB: 0, goalsA: 0, goalsB: 0, lastEncounters: [] };
  }

  let winsA = 0, draws = 0, winsB = 0, goalsA = 0, goalsB = 0;

  const encounters = h2h.map(m => {
    const aIsHome = m.home === teamAId;
    const gA = aIsHome ? m.goalsHome : m.goalsAway;
    const gB = aIsHome ? m.goalsAway : m.goalsHome;
    goalsA += gA;
    goalsB += gB;
    let winner;
    if      (gA > gB) { winsA++; winner = "A"; }
    else if (gA < gB) { winsB++; winner = "B"; }
    else              { draws++;  winner = "D"; }
    return {
      date:   m.date  ?? null,
      stage:  m.stage ?? null,
      goalsA: gA,
      goalsB: gB,
      winner,
    };
  });

  // Más reciente primero (sin fecha va al final)
  encounters.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  return {
    found: true,
    count: h2h.length,
    winsA,
    draws,
    winsB,
    goalsA,
    goalsB,
    lastEncounters: encounters.slice(0, 5),
  };
}
