/**
 * App Entry Point
 * Wires the UI dropdowns → analysis engine → dashboard renderer.
 */

import { getAllTeams, getTeamById } from "./data/teams.js";
import { analyzeMatch }             from "./models/aggregator.js";
import { strengthLabel }            from "./models/elo.js";
import {
  renderTeamPreview,
  renderResults,
  setupMethodologyToggle,
} from "./ui/dashboard.js";

// Expose strengthLabel so dashboard can use it without circular imports
window._eloUtils = { strengthLabel };

// ── bootstrap ─────────────────────────────────────────────────────────────────

(function init() {
  const teams   = getAllTeams();
  const selectA = document.getElementById("teamA");
  const selectB = document.getElementById("teamB");
  const btnAnalyze = document.getElementById("btnAnalyze");

  populateSelects(teams, selectA, selectB);
  setupListeners(teams, selectA, selectB, btnAnalyze);
  setupMethodologyToggle();
})();

// ── populate dropdowns ────────────────────────────────────────────────────────

function populateSelects(teams, selectA, selectB) {
  const optionHTML = teams
    .map(t => `<option value="${t.id}">${t.flag} ${t.name} (ELO ${t.elo})</option>`)
    .join("");

  [selectA, selectB].forEach(sel => {
    sel.innerHTML = `<option value="">— Seleccionar equipo —</option>` + optionHTML;
  });
}

// ── event listeners ───────────────────────────────────────────────────────────

function setupListeners(teams, selectA, selectB, btn) {
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
    btn.disabled = true;

    // Defer to let UI repaint before computation
    setTimeout(() => {
      const result = analyzeMatch(teamA, teamB);
      renderResults(teamA, teamB, result);
      btn.textContent = "Analizar Partido";
      btn.disabled = false;
    }, 50);
  });
}

function updateButton(selectA, selectB, btn) {
  const valid = selectA.value && selectB.value && selectA.value !== selectB.value;
  btn.disabled = !valid;
}

function preventSameTeam(selectA, selectB) {
  if (selectA.value && selectA.value === selectB.value) {
    selectB.value = "";
    document.getElementById("previewB").innerHTML = "";
  }
}
