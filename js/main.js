/**
 * App Entry Point
 *
 * Orden de inicialización:
 *   1. Calibración de pesos (grid search sobre datos históricos)
 *   2. Mostrar métricas del modelo en el banner
 *   3. Poblar dropdowns
 *   4. Conectar eventos UI
 */

import { getAllTeams, getTeamById }        from "./data/teams.js";
import { analyzeMatch, DEFAULT_WEIGHTS }   from "./models/aggregator.js";
import { calibrateWeights, runBacktest }   from "./models/calibrator.js";
import { strengthLabel }                   from "./models/elo.js";
import {
  renderTeamPreview,
  renderResults,
  renderModelMetrics,
  setupMethodologyToggle,
} from "./ui/dashboard.js";

// Exponer para uso en dashboard sin circular imports
window._eloUtils = { strengthLabel };

// ── Bootstrap ────────────────────────────────────────────────────────────────

(function init() {
  // 1. Calibración (síncrona — corre sobre datos en memoria, rápido)
  const calibration      = calibrateWeights();

  console.log("=== CALIBRATION ===");
  console.log(calibration);

  const bestWeights      = calibration[0].weights;
  const defaultMetrics   = runBacktest(DEFAULT_WEIGHTS);
  const calibratedMetrics = runBacktest(bestWeights);

  // Exponer métricas para el panel de transparencia
  window._modelState = { bestWeights, defaultMetrics, calibratedMetrics };

  // Mostrar métricas en el banner
  renderModelMetrics({ bestWeights, calibratedMetrics, defaultMetrics });

  // 2. UI
  const teams      = getAllTeams();
  const selectA    = document.getElementById("teamA");
  const selectB    = document.getElementById("teamB");
  const btnAnalyze = document.getElementById("btnAnalyze");

  populateSelects(teams, selectA, selectB);
  setupListeners(teams, selectA, selectB, btnAnalyze, bestWeights);
  setupMethodologyToggle();
})();

// ── Populate dropdowns ────────────────────────────────────────────────────────

function populateSelects(teams, selectA, selectB) {
  const html = teams
    .map(t => `<option value="${t.id}">${t.flag} ${t.name} (ELO ${t.elo})</option>`)
    .join("");
  const placeholder = `<option value="">— Seleccionar equipo —</option>`;
  [selectA, selectB].forEach(sel => { sel.innerHTML = placeholder + html; });
}

// ── Event Listeners ───────────────────────────────────────────────────────────

function setupListeners(teams, selectA, selectB, btn, weights) {
  selectA.addEventListener("change", () => {
    renderTeamPreview(getTeamById(selectA.value), "previewA");
    updateButton(selectA, selectB, btn);
    preventSameTeam(selectA, selectB);
  });

  selectB.addEventListener("change", () => {
    renderTeamPreview(getTeamById(selectB.value), "previewB");
    updateButton(selectA, selectB, btn);
    preventSameTeam(selectA, selectB);
  });

  btn.addEventListener("click", () => {
    const teamA = getTeamById(selectA.value);
    const teamB = getTeamById(selectB.value);
    if (!teamA || !teamB || teamA.id === teamB.id) return;

    btn.textContent = "Calculando…";
    btn.disabled    = true;

    setTimeout(() => {
      const result = analyzeMatch(teamA, teamB, weights);
      renderResults(teamA, teamB, result);
      btn.textContent = "Analizar Partido";
      btn.disabled    = false;
    }, 50);
  });
}

function updateButton(selectA, selectB, btn) {
  btn.disabled = !(selectA.value && selectB.value && selectA.value !== selectB.value);
}

function preventSameTeam(selectA, selectB) {
  if (selectA.value && selectA.value === selectB.value) {
    selectB.value = "";
    document.getElementById("previewB").innerHTML = "";
  }
}
