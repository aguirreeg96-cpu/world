/**
 * Simulation UI — renderiza los resultados del Monte Carlo
 * Sin efectos secundarios fuera del DOM de #simulationResults.
 */

const $   = id => document.getElementById(id);
const pct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;

function barHTML(prob, cls) {
  const w = Math.max(2, Math.round(prob * 100));
  return `<div class="sim-bar-wrap">
    <div class="sim-bar sim-bar--${cls}" style="width:${w}%"></div>
    <span class="sim-bar-label">${pct(prob)}</span>
  </div>`;
}

function groupLegendHTML(groups, results) {
  return Object.entries(groups).map(([key, g]) => {
    const flags = g.teams.map(id => {
      const r = results.find(r => r.team?.id === id);
      return r?.team?.flag ?? id;
    }).join("&thinsp;");
    return `<div class="sim-group-chip">
      <span class="sim-group-key">${g.name}</span>
      <span class="sim-group-flags">${flags}</span>
    </div>`;
  }).join("");
}

export function renderSimulationResults({ results, nSims, groups }) {
  const container = $("simulationResults");
  if (!container) return;

  const medal = i => ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;

  const rows = results.map((r, i) => {
    const t = r.team;
    if (!t) return "";
    return `
      <tr class="sim-row ${i < 3 ? "sim-row--top" : ""}">
        <td class="sim-td sim-td--rank">${medal(i)}</td>
        <td class="sim-td sim-td--team">
          <span class="sim-flag">${t.flag}</span>
          <span class="sim-name">${t.name}</span>
          <span class="sim-gtag">Gr.${r.group}</span>
        </td>
        <td class="sim-td sim-td--main">${barHTML(r.pChampion, "champion")}</td>
        <td class="sim-td sim-td--sec">${pct(r.pFinal)}</td>
        <td class="sim-td sim-td--sec">${pct(r.pSemiFinal)}</td>
        <td class="sim-td sim-td--sec">${pct(r.pQuarterFinal)}</td>
      </tr>`;
  }).join("");

  container.innerHTML = `
    <div class="sim-legend">${groupLegendHTML(groups, results)}</div>
    <div class="sim-table-wrap">
      <table class="sim-table">
        <thead>
          <tr class="sim-thead-row">
            <th class="sim-th sim-th--rank">#</th>
            <th class="sim-th sim-th--team">Selección</th>
            <th class="sim-th sim-th--main">🏆 Campeón</th>
            <th class="sim-th sim-th--sec">Final</th>
            <th class="sim-th sim-th--sec">Semi</th>
            <th class="sim-th sim-th--sec">Cuartos</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="sim-sample">${nSims.toLocaleString("es-AR")} torneos simulados · ELO + Poisson Dixon-Coles + Forma</p>`;

  container.style.display = "block";
}
