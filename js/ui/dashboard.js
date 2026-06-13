/**
 * Dashboard Renderer
 * Toda mutación del DOM ocurre aquí — los modelos permanecen puros.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

const pct  = n => `${(n * 100).toFixed(1)}%`;
const fmt2 = n => n.toFixed(2);
const fmt3 = n => n.toFixed(3);
const $    = id => document.getElementById(id);

function animateBar(element, targetPct, delay = 0) {
  element.style.width = "0%";
  setTimeout(() => {
    element.style.transition = "width 0.8s cubic-bezier(0.4,0,0.2,1)";
    element.style.width = targetPct;
  }, delay);
}

// ── Team Preview ──────────────────────────────────────────────────────────────

export function renderTeamPreview(team, containerId) {
  const container = $(containerId);
  if (!team) { container.innerHTML = ""; return; }

  const hasWDL   = team.wins  !== undefined;
  const hasGoals = team.avgGoalsFor !== undefined;
  const hasForm  = Array.isArray(team.recentResults) && team.recentResults.length > 0;

  const wdlHTML = hasWDL ? `
    <div class="tps-wdl">
      <span class="tps-w">V <strong>${team.wins}</strong></span>
      <span class="tps-d">E <strong>${team.draws}</strong></span>
      <span class="tps-l">D <strong>${team.losses}</strong></span>
      <span class="tps-games">(${team.wins + team.draws + team.losses} partidos)</span>
    </div>` : "";

  const goalsHTML = hasGoals ? `
    <div class="tps-goals">
      ⚽ <strong>${team.avgGoalsFor.toFixed(2)}</strong> / ${team.avgGoalsAgainst.toFixed(2)} en contra
    </div>` : "";

  const formHTML = hasForm ? `
    <div class="tps-form">${rawResultDotsHTML(team.recentResults)}</div>` : "";

  const statsHTML = (hasWDL || hasGoals || hasForm) ? `
    <div class="team-preview-stats">
      ${wdlHTML}${goalsHTML}${formHTML}
    </div>` : "";

  container.innerHTML = `
    <div class="team-preview-card">
      <div class="team-preview-top">
        <span class="team-preview-flag">${team.flag}</span>
        <div class="team-preview-info">
          <span class="team-preview-name">${team.name}</span>
          <span class="team-preview-conf">${team.confederation}</span>
        </div>
        <div class="team-preview-elo">ELO <strong>${team.elo}</strong></div>
      </div>
      ${statsHTML}
    </div>`;
}

function rawResultDotsHTML(results) {
  const MAP = { W: { code: "W", label: "V" }, D: { code: "D", label: "E" }, L: { code: "L", label: "D" } };
  return results.slice(0, 10).map(r => {
    const d = MAP[r] ?? { code: "D", label: "?" };
    return `<span class="dot dot--${d.code}" title="${r}">${d.label}</span>`;
  }).join("");
}

// ── Model Metrics Banner ──────────────────────────────────────────────────────

export function renderModelMetrics({ bestWeights, calibratedMetrics, defaultMetrics }) {
  const banner = $("metricsBanner");
  if (!banner) return;

  const bss       = calibratedMetrics.brierSkillScore;
  const bssClass  = bss > 0.15 ? "metric--good" : bss > 0 ? "metric--ok" : "metric--bad";
  const improved  = calibratedMetrics.brierScore < defaultMetrics.brierScore;

  banner.style.display = "block";
  $("metricBS").innerHTML  = `<span>${fmt3(calibratedMetrics.brierScore)}</span>
    <small>línea base ${fmt3(calibratedMetrics.baseline)}</small>`;
  $("metricBSS").innerHTML = `<span class="${bssClass}">${(bss * 100).toFixed(1)}%</span>
    <small>mejora vs baseline</small>`;
  $("metricWeights").innerHTML = `<span>ELO ${pct(bestWeights.elo)} / Poisson ${pct(bestWeights.poisson)}</span>
    <small>${improved ? "calibrados" : "por defecto"}</small>`;
  $("metricN").innerHTML = `<span>${calibratedMetrics.distribution.n}</span>
    <small>partidos históricos</small>`;
}

// ── Main Results Render ───────────────────────────────────────────────────────

export function renderResults(teamA, teamB, result, h2h = null) {
  renderMatchHeader(teamA, teamB);
  renderProbabilities(teamA, teamB, result);
  renderHeadToHead(teamA, teamB, h2h);
  renderGoals(teamA, teamB, result);
  renderElo(teamA, teamB, result);
  renderForm(teamA, teamB, result);
  renderScoreGrid(teamA, teamB, result.topScores);
  renderMethodology(teamA, teamB, result);

  $("resultsSection").style.display = "block";
  $("resultsSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── Match Header ──────────────────────────────────────────────────────────────

function renderMatchHeader(teamA, teamB) {
  $("matchTitle").innerHTML = `
    <div class="match-team-name"><span>${teamA.flag}</span> ${teamA.name}</div>
    <span class="match-vs">VS</span>
    <div class="match-team-name"><span>${teamB.flag}</span> ${teamB.name}</div>`;
  $("matchDate").textContent = new Date().toLocaleDateString("es-AR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Probability Cards ─────────────────────────────────────────────────────────

function renderProbabilities(teamA, teamB, { probA, probDraw, probB, ci }) {
  const dominant = probA > probB ? "A" : probB > probA ? "B" : null;
  renderProbCard("A",    teamA, probA,    ci.pA,    dominant === "A");
  renderProbCard("Draw", null,  probDraw, ci.pDraw, false);
  renderProbCard("B",    teamB, probB,    ci.pB,    dominant === "B");
}

function renderProbCard(side, team, prob, ciRange, isDominant) {
  const key   = side === "Draw" ? "Draw" : side;
  const label = side === "Draw" ? "Empate" : team.name;
  const flag  = side === "Draw" ? "🤝"    : team.flag;

  $("prob" + key).classList.toggle("prob-card--dominant", isDominant);
  $("label" + key).innerHTML = `<span class="prob-flag">${flag}</span> ${label}`;
  $("value" + key).textContent = pct(prob);

  const ciEl = $("ci" + key);
  if (ciEl && ciRange) {
    ciEl.textContent = `±1σ: ${pct(ciRange.low)} – ${pct(ciRange.high)}`;
  }

  const bar = $("bar" + key);
  animateBar(bar, pct(prob), key === "A" ? 100 : key === "Draw" ? 200 : 300);
}

// ── Expected Goals ────────────────────────────────────────────────────────────

function renderGoals(teamA, teamB, { lambdaA, lambdaB }) {
  const max  = Math.max(lambdaA, lambdaB, 0.01);
  const barA = Math.round((lambdaA / max) * 100);
  const barB = Math.round((lambdaB / max) * 100);

  $("goalsComparison").innerHTML = `
    <div class="compare-row">
      <span class="compare-label">${teamA.flag} ${teamA.name}</span>
      <div class="compare-track">
        <div class="compare-fill compare-fill--a" style="width:0%" data-target="${barA}%"></div>
      </div>
      <span class="compare-value">${fmt2(lambdaA)}</span>
    </div>
    <div class="compare-row">
      <span class="compare-label">${teamB.flag} ${teamB.name}</span>
      <div class="compare-track">
        <div class="compare-fill compare-fill--b" style="width:0%" data-target="${barB}%"></div>
      </div>
      <span class="compare-value">${fmt2(lambdaB)}</span>
    </div>`;
  animateFills();
}

// ── ELO Comparison ────────────────────────────────────────────────────────────

function renderElo(teamA, teamB, { elo }) {
  const min   = Math.min(elo.ratingA, elo.ratingB) - 50;
  const span  = Math.max(elo.ratingA, elo.ratingB) + 50 - min;
  const barA  = Math.round(((elo.ratingA - min) / span) * 100);
  const barB  = Math.round(((elo.ratingB - min) / span) * 100);
  const delta = elo.ratingA - elo.ratingB;

  $("eloComparison").innerHTML = `
    <div class="compare-row">
      <span class="compare-label">${teamA.flag} ${teamA.name}</span>
      <div class="compare-track">
        <div class="compare-fill compare-fill--a" style="width:0%" data-target="${barA}%"></div>
      </div>
      <span class="compare-value">${elo.ratingA}</span>
    </div>
    <div class="compare-row">
      <span class="compare-label">${teamB.flag} ${teamB.name}</span>
      <div class="compare-track">
        <div class="compare-fill compare-fill--b" style="width:0%" data-target="${barB}%"></div>
      </div>
      <span class="compare-value">${elo.ratingB}</span>
    </div>
    <div class="compare-note">
      Δ: <strong>${delta > 0 ? "+" : ""}${delta} pts</strong>
    </div>`;
  animateFills();
}

// ── Form Comparison ───────────────────────────────────────────────────────────

function renderForm(teamA, teamB, { formA, formB }) {
  $("formComparison").innerHTML = `
    <div class="form-row">
      <span class="form-team-name">${teamA.flag} ${teamA.name}</span>
      <div class="form-dots">${dotsHTML(formA.dots)}</div>
      <span class="form-label form-label--${cssFormClass(formA.label)}">${formA.label}</span>
    </div>
    <div class="form-row">
      <span class="form-team-name">${teamB.flag} ${teamB.name}</span>
      <div class="form-dots">${dotsHTML(formB.dots)}</div>
      <span class="form-label form-label--${cssFormClass(formB.label)}">${formB.label}</span>
    </div>`;
}

function dotsHTML(dots) {
  return dots.map(d => `<span class="dot dot--${d.code}">${d.label}</span>`).join("");
}

function cssFormClass(label) {
  return label.toLowerCase().replace(/\s+/g, "-").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ── Head to Head ─────────────────────────────────────────────────────────────

function renderHeadToHead(teamA, teamB, h2h) {
  const card    = $("headToHeadCard");
  const content = $("headToHeadContent");
  if (!card || !content) return;

  card.style.display = "block";

  if (!h2h || !h2h.found) {
    content.innerHTML = `
      <div class="h2h-empty">
        <p>No hay enfrentamientos directos disponibles en la base actual</p>
        <p class="h2h-empty-note">Base: 64 partidos del Mundial 2022 · Los dos equipos no coincidieron en ese torneo</p>
      </div>`;
    return;
  }

  // Encuentros: tabla principal (lo más importante — marcadores reales)
  const encountersHTML = h2h.lastEncounters.map(e => {
    const scoreCls = e.winner === "A" ? "h2h-score--a"
                   : e.winner === "B" ? "h2h-score--b"
                   :                    "h2h-score--d";
    const dateStr = e.date
      ? new Date(e.date + "T00:00:00Z").toLocaleDateString("es-AR",
          { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
      : "–";
    const stageStr = e.stage
      ? e.stage.charAt(0).toUpperCase() + e.stage.slice(1)
      : "";
    return `
      <div class="h2h-enc-row">
        <div class="h2h-enc-meta">
          <span class="h2h-enc-date">${dateStr}</span>
          ${stageStr ? `<span class="h2h-enc-stage">${stageStr}</span>` : ""}
        </div>
        <div class="h2h-enc-scoreline">
          <span class="h2h-enc-team">${teamA.flag} ${teamA.name}</span>
          <span class="h2h-enc-result ${scoreCls}">${e.goalsA} – ${e.goalsB}</span>
          <span class="h2h-enc-team h2h-enc-team--right">${teamB.flag} ${teamB.name}</span>
        </div>
      </div>`;
  }).join("");

  // Resumen W/D/L como badges compactos (no números gigantes que confunden con marcador)
  const pctA = Math.round((h2h.winsA / h2h.count) * 100);
  const pctD = Math.round((h2h.draws  / h2h.count) * 100);
  const pctB = Math.round((h2h.winsB  / h2h.count) * 100);

  content.innerHTML = `
    <div class="h2h-summary-bar">
      <span class="h2h-sum-label">Historial · ${h2h.count} partido${h2h.count !== 1 ? "s" : ""}</span>
      <div class="h2h-sum-badges">
        <span class="h2h-badge h2h-badge--a">${teamA.flag} ${h2h.winsA} victorias (${pctA}%)</span>
        <span class="h2h-badge h2h-badge--d">${h2h.draws} empates (${pctD}%)</span>
        <span class="h2h-badge h2h-badge--b">${h2h.winsB} victorias ${teamB.flag} (${pctB}%)</span>
      </div>
    </div>
    <div class="h2h-enc-list">
      ${encountersHTML}
    </div>`;
}

// ── Score Grid ────────────────────────────────────────────────────────────────

function renderScoreGrid(teamA, teamB, scores) {
  const maxP = scores[0]?.prob || 0.01;
  $("scoresGrid").innerHTML = scores.map(s => {
    const intensity = Math.round((s.prob / maxP) * 100);
    const cls = s.goalsA > s.goalsB ? "score--a"
              : s.goalsA < s.goalsB ? "score--b"
              : "score--draw";
    return `<div class="score-cell ${cls}" style="--intensity:${intensity}%">
      <span class="score-cell__scoreline">${s.goalsA}–${s.goalsB}</span>
      <span class="score-cell__prob">${pct(s.prob)}</span>
    </div>`;
  }).join("");
}

// ── Methodology Panel ─────────────────────────────────────────────────────────

export function setupMethodologyToggle() {
  $("methodologyToggle").addEventListener("click", () => {
    const body = $("methodologyBody");
    const icon = $("methodologyToggle").querySelector(".toggle-icon");
    const open = body.style.display === "none";
    body.style.display = open ? "block" : "none";
    icon.textContent   = open ? "▲" : "▼";
  });
}

function renderMethodology(teamA, teamB, result) {
  const { breakdown, lambdaA, lambdaB, probA, probDraw, probB, ci } = result;
  const state = window._modelState || {};

  $("methodologyContent").innerHTML = `

    <div class="meth-section">
      <h4 class="meth-title">1 — Motor ELO (peso: ${pct(breakdown.weights.elo)})</h4>
      <p>Diferencia de rating: <code>${teamA.elo} − ${teamB.elo} = ${teamA.elo - teamB.elo} pts</code></p>
      <p>P(${teamA.name} gana — base 2) = 1 / (1 + 10<sup>−Δ/400</sup>) = <strong>${pct(result.elo.pWinA)}</strong></p>
      <p>Modelo de empate: P_draw = D₀·exp(−k·(ΔR/400)²) = <strong>${pct(result.elo.pDraw)}</strong> (D₀=${(0.285).toFixed(3)}, k=2.0)</p>
      <p>Triplete ELO 3-way: Victoria A = ${pct(result.elo.pA)} · Empate = ${pct(result.elo.pDraw)} · Victoria B = ${pct(result.elo.pB)}</p>
      <p class="meth-note">A diferencia de versiones anteriores, el ELO ahora produce su propio P(empate) mediante un modelo gaussiano calibrado (mayor P_draw cuando los equipos son más igualados). El empate ya no se "toma prestado" de Poisson.</p>
    </div>

    <div class="meth-section">
      <h4 class="meth-title">2 — Corrección Dixon-Coles sobre Poisson (peso: ${pct(breakdown.weights.poisson)})</h4>
      <p>Goles esperados base: λ<sub>A</sub> = ${fmt2(breakdown.lambdaBase.a)}, λ<sub>B</sub> = ${fmt2(breakdown.lambdaBase.b)}</p>
      <p>Ajuste por forma: ×${fmt2(result.formA.factor)} (${teamA.name}) · ×${fmt2(result.formB.factor)} (${teamB.name})</p>
      <p>λ ajustados: <strong>λ<sub>A</sub> = ${fmt2(lambdaA)}, λ<sub>B</sub> = ${fmt2(lambdaB)}</strong></p>
      <p>La corrección <strong>Dixon-Coles (ρ = −0.13)</strong> ajusta los marcadores 0-0, 1-0, 0-1, 1-1 para evitar la subestimación de empates propia del Poisson estándar. La matriz de marcadores se renormaliza tras aplicar τ.</p>
      <p>Poisson DC → Victoria A <strong>${pct(result.poisson.pA)}</strong>, Empate <strong>${pct(result.poisson.pDraw)}</strong>, Victoria B <strong>${pct(result.poisson.pB)}</strong></p>
    </div>

    <div class="meth-section">
      <h4 class="meth-title">3 — Intervalo de Confianza (±1σ sobre λ)</h4>
      <p>Supuesto: los promedios de goles se estiman desde N ≈ 20 partidos. El error estándar de la media Poisson es σ = √(λ/N). Se propaga a través del modelo completo.</p>
      <div class="meth-table">
        <div class="meth-row meth-row--header"><span>Resultado</span><span>−1σ</span><span>Central</span><span>+1σ</span></div>
        <div class="meth-row"><span>Victoria ${teamA.name}</span><span>${pct(ci.pA.low)}</span><span><strong>${pct(probA)}</strong></span><span>${pct(ci.pA.high)}</span></div>
        <div class="meth-row"><span>Empate</span><span>${pct(ci.pDraw.low)}</span><span><strong>${pct(probDraw)}</strong></span><span>${pct(ci.pDraw.high)}</span></div>
        <div class="meth-row"><span>Victoria ${teamB.name}</span><span>${pct(ci.pB.low)}</span><span><strong>${pct(probB)}</strong></span><span>${pct(ci.pB.high)}</span></div>
      </div>
      <p class="meth-note">El CI refleja solo la incertidumbre en λ (Poisson). El componente ELO es determinístico. En un modelo completo también debería capturarse la incertidumbre en los ratings ELO.</p>
    </div>

    <div class="meth-section">
      <h4 class="meth-title">4 — Blend final y calibración</h4>
      <div class="meth-table">
        <div class="meth-row meth-row--header">
          <span>Resultado</span>
          <span>ELO (×${fmt2(breakdown.weights.elo)})</span>
          <span>Poisson DC (×${fmt2(breakdown.weights.poisson)})</span>
          <span>Final</span>
        </div>
        <div class="meth-row">
          <span>Victoria ${teamA.name}</span>
          <span>${pct(breakdown.eloComponent.pA)}</span>
          <span>${pct(breakdown.poissonComponent.pA)}</span>
          <span><strong>${pct(probA)}</strong></span>
        </div>
        <div class="meth-row">
          <span>Empate</span>
          <span>${pct(breakdown.eloComponent.pDraw)}</span>
          <span>${pct(breakdown.poissonComponent.pDraw)}</span>
          <span><strong>${pct(probDraw)}</strong></span>
        </div>
        <div class="meth-row">
          <span>Victoria ${teamB.name}</span>
          <span>${pct(breakdown.eloComponent.pB)}</span>
          <span>${pct(breakdown.poissonComponent.pB)}</span>
          <span><strong>${pct(probB)}</strong></span>
        </div>
      </div>
      ${state.calibratedMetrics ? `
      <p style="margin-top:10px">
        Pesos calibrados por grid search sobre ${state.calibratedMetrics.distribution.n} partidos históricos.
        Brier Score del modelo: <strong>${fmt3(state.calibratedMetrics.brierScore)}</strong>
        vs baseline uniforme: <strong>${fmt3(state.calibratedMetrics.baseline)}</strong>
        (BSS = ${(state.calibratedMetrics.brierSkillScore * 100).toFixed(1)}% de mejora).
      </p>` : ""}
    </div>

    <div class="meth-section meth-section--disclaimer">
      <p><strong>⚠ Limitaciones:</strong> los datos son de demostración, no se incluyen bajas por lesión ni contexto táctico, el model no actualiza ratings ELO en tiempo real, y la muestra histórica es pequeña. <strong>Este análisis no predice resultados ni debe usarse para apuestas.</strong></p>
    </div>`;
}

// ── Odds Comparator ───────────────────────────────────────────────────────────

/**
 * Muestra la tarjeta del comparador de cuotas y actualiza las etiquetas
 * con los nombres de los equipos del partido actual. Resetea el estado.
 */
export function showOddsComparator(teamA, teamB) {
  $("oddsLabelA").textContent   = `Victoria ${teamA.name}`;
  $("oddsLabelB").textContent   = `Victoria ${teamB.name}`;
  $("oddsInputA").value         = "";
  $("oddsInputDraw").value      = "";
  $("oddsInputB").value         = "";
  $("oddsResult").style.display = "none";
  $("btnCompare").disabled      = true;
  $("oddsCard").style.display   = "block";
}

/**
 * Renderiza la tabla de comparación cuotas vs modelo.
 *
 * @param {object} teamA
 * @param {object} teamB
 * @param {{ probA, probDraw, probB }} modelProbs  — probabilidades del modelo
 * @param {object} analysis  — resultado de analyzeOdds()
 */
export function renderOddsComparison(teamA, teamB, modelProbs, analysis) {
  const pp   = n => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}pp`;
  const pct1 = n => `${(n * 100).toFixed(1)}%`;

  const edgeCls   = e => e > 0.03 ? "positive" : e < -0.03 ? "negative" : "neutral";
  const edgeLabel = e =>
    e > 0.03   ? "Diferencia estadística positiva"
    : e < -0.03 ? "Sin ventaja estadística del modelo"
    :             "Diferencia estadística marginal";

  const { odds, implied, normalized, edge, overround } = analysis;

  // ── Celdas de datos ────────────────────────────────────────────────────────
  const num = val => `<div class="oct-cell oct-cell--num">${val}</div>`;

  const rowOdds     = [odds.A,         odds.draw,         odds.B        ].map(v => num(v.toFixed(2))).join("");
  const rowImplied  = [implied.A,      implied.draw,      implied.B     ].map(v => num(pct1(v))).join("");
  const rowNorm     = [normalized.A,   normalized.draw,   normalized.B  ].map(v => num(pct1(v))).join("");
  const rowModel    = [modelProbs.probA, modelProbs.probDraw, modelProbs.probB]
    .map(v => `<div class="oct-cell oct-cell--num oct-cell--model">${pct1(v)}</div>`).join("");
  const rowEdge     = [edge.A, edge.draw, edge.B]
    .map(e => `<div class="oct-cell oct-cell--num"><span class="odc-edge odc-edge--${edgeCls(e)}">${pp(e)}</span></div>`).join("");

  // ── Badges resumen ─────────────────────────────────────────────────────────
  const badges = [
    { name: teamA.name,  e: edge.A    },
    { name: "Empate",    e: edge.draw },
    { name: teamB.name,  e: edge.B    },
  ].map(({ name, e }) =>
    `<div class="odds-edge-badge odds-edge-badge--${edgeCls(e)}">${name}: ${edgeLabel(e)}</div>`
  ).join("");

  $("oddsResult").innerHTML = `
    <div class="odds-result">
      <p class="odds-overround">
        Margen de la casa: <strong>${(overround * 100).toFixed(1)}%</strong>
        <span class="odds-or-note"> (suma de probabilidades implícitas − 1)</span>
      </p>

      <div class="oct-grid">
        <div class="oct-cell oct-cell--meta"></div>
        <div class="oct-cell oct-cell--head">Victoria ${teamA.name}</div>
        <div class="oct-cell oct-cell--head">Empate</div>
        <div class="oct-cell oct-cell--head">Victoria ${teamB.name}</div>

        <div class="oct-cell oct-cell--label">Cuota decimal</div>
        ${rowOdds}

        <div class="oct-cell oct-cell--label">Impl. bruta</div>
        ${rowImplied}

        <div class="oct-cell oct-cell--label">Sin margen</div>
        ${rowNorm}

        <div class="oct-cell oct-cell--label">Modelo</div>
        ${rowModel}

        <div class="oct-cell oct-cell--label">Diferencia</div>
        ${rowEdge}
      </div>

      <div class="odds-edge-labels">${badges}</div>

      <p class="odds-disclaimer">
        ⚠ Comparación estadística exclusivamente educativa. La diferencia entre el modelo
        y el mercado no implica valor esperado real, ventaja garantizada ni recomendación
        de ningún tipo. Los modelos matemáticos no predicen resultados individuales.
      </p>
    </div>`;

  $("oddsResult").style.display = "block";
}

// ── Animaciones ───────────────────────────────────────────────────────────────

function animateFills() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".compare-fill[data-target]").forEach(el => {
      const target = el.dataset.target;
      el.style.transition = "none";
      el.style.width = "0%";
      requestAnimationFrame(() => {
        el.style.transition = "width 0.8s cubic-bezier(0.4,0,0.2,1)";
        el.style.width = target;
      });
    });
  });
}
