/**
 * Dashboard Renderer
 * All DOM mutations are isolated here — models stay pure.
 */

// ── helpers ──────────────────────────────────────────────────────────────────

const pct  = n => `${(n * 100).toFixed(1)}%`;
const fmt2 = n => n.toFixed(2);
const $ = id => document.getElementById(id);

function el(tag, cls, inner = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (inner) e.innerHTML = inner;
  return e;
}

function animateBar(element, targetPct, delay = 0) {
  element.style.width = "0%";
  setTimeout(() => {
    element.style.transition = "width 0.8s cubic-bezier(0.4,0,0.2,1)";
    element.style.width = targetPct;
  }, delay);
}

// ── team preview (shown in selector while picking) ───────────────────────────

export function renderTeamPreview(team, containerId) {
  const container = $(containerId);
  if (!team) { container.innerHTML = ""; return; }
  container.innerHTML = `
    <div class="team-preview-card">
      <span class="team-preview-flag">${team.flag}</span>
      <div class="team-preview-info">
        <span class="team-preview-name">${team.name}</span>
        <span class="team-preview-conf">${team.confederation}</span>
      </div>
      <div class="team-preview-elo">ELO <strong>${team.elo}</strong></div>
    </div>`;
}

// ── main results render ───────────────────────────────────────────────────────

export function renderResults(teamA, teamB, result) {
  renderMatchHeader(teamA, teamB);
  renderProbabilities(teamA, teamB, result);
  renderGoals(teamA, teamB, result);
  renderElo(teamA, teamB, result);
  renderForm(teamA, teamB, result);
  renderScoreGrid(teamA, teamB, result.topScores);
  renderMethodology(teamA, teamB, result);

  $("resultsSection").style.display = "block";
  $("resultsSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── match header ─────────────────────────────────────────────────────────────

function renderMatchHeader(teamA, teamB) {
  $("matchTitle").innerHTML = `
    <div class="match-team-name">
      <span>${teamA.flag}</span> ${teamA.name}
    </div>
    <span class="match-vs">VS</span>
    <div class="match-team-name">
      <span>${teamB.flag}</span> ${teamB.name}
    </div>`;
  $("matchDate").textContent = new Date().toLocaleDateString("es-AR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── probability cards ────────────────────────────────────────────────────────

function renderProbabilities(teamA, teamB, { probA, probDraw, probB }) {
  const dominant = probA > probB ? "A" : probB > probA ? "B" : null;

  renderProbCard("A", teamA, probA, dominant === "A");
  renderProbCard("Draw", null, probDraw, false);
  renderProbCard("B", teamB, probB, dominant === "B");
}

function renderProbCard(side, team, prob, isDominant) {
  const label = side === "Draw" ? "Empate" : team.name;
  const flag  = side === "Draw" ? "🤝" : team.flag;

  const card = $("prob" + (side === "Draw" ? "Draw" : side));
  card.classList.toggle("prob-card--dominant", isDominant);

  $("label" + (side === "Draw" ? "Draw" : side)).innerHTML =
    `<span class="prob-flag">${flag}</span> ${label}`;
  $("value" + (side === "Draw" ? "Draw" : side)).textContent = pct(prob);

  const bar = $("bar" + (side === "Draw" ? "Draw" : side));
  bar.style.width = "0%";
  animateBar(bar, pct(prob), side === "A" ? 100 : side === "Draw" ? 200 : 300);
}

// ── expected goals ────────────────────────────────────────────────────────────

function renderGoals(teamA, teamB, { lambdaA, lambdaB }) {
  const maxLambda = Math.max(lambdaA, lambdaB, 0.01);
  const barA = Math.round((lambdaA / maxLambda) * 100);
  const barB = Math.round((lambdaB / maxLambda) * 100);

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

// ── ELO comparison ────────────────────────────────────────────────────────────

function renderElo(teamA, teamB, { elo }) {
  const min  = Math.min(elo.ratingA, elo.ratingB) - 50;
  const max  = Math.max(elo.ratingA, elo.ratingB) + 50;
  const span = max - min;
  const barA = Math.round(((elo.ratingA - min) / span) * 100);
  const barB = Math.round(((elo.ratingB - min) / span) * 100);
  const delta = elo.ratingA - elo.ratingB;
  const { strengthLabel } = window._eloUtils || {};

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
      Diferencia: <strong>${delta > 0 ? "+" : ""}${delta} pts</strong>
    </div>`;
  animateFills();
}

// ── form comparison ───────────────────────────────────────────────────────────

function renderForm(teamA, teamB, { formA, formB }) {
  $("formComparison").innerHTML = `
    <div class="form-row">
      <span class="form-team-name">${teamA.flag} ${teamA.name}</span>
      <div class="form-dots">${dotsHTML(formA.dots)}</div>
      <span class="form-label form-label--${formA.label.toLowerCase()}">${formA.label}</span>
    </div>
    <div class="form-row">
      <span class="form-team-name">${teamB.flag} ${teamB.name}</span>
      <div class="form-dots">${dotsHTML(formB.dots)}</div>
      <span class="form-label form-label--${formB.label.toLowerCase()}">${formB.label}</span>
    </div>`;
}

function dotsHTML(dots) {
  return dots.map(d =>
    `<span class="dot dot--${d.code}">${d.label}</span>`
  ).join("");
}

// ── score grid ────────────────────────────────────────────────────────────────

function renderScoreGrid(teamA, teamB, scores) {
  const maxProb = scores[0]?.prob || 0.01;
  const html = scores.map(s => {
    const intensity = Math.round((s.prob / maxProb) * 100);
    const winner = s.goalsA > s.goalsB ? "score--a"
                 : s.goalsA < s.goalsB ? "score--b"
                 : "score--draw";
    return `
      <div class="score-cell ${winner}" style="--intensity: ${intensity}%">
        <span class="score-cell__scoreline">${s.goalsA} – ${s.goalsB}</span>
        <span class="score-cell__prob">${pct(s.prob)}</span>
      </div>`;
  }).join("");
  $("scoresGrid").innerHTML = html;
}

// ── methodology panel ─────────────────────────────────────────────────────────

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
  const { breakdown, lambdaA, lambdaB, probA, probDraw, probB } = result;

  $("methodologyContent").innerHTML = `
    <div class="meth-section">
      <h4 class="meth-title">1 — Motor ELO (peso: ${pct(breakdown.weights.elo)})</h4>
      <p>Diferencia de rating: <code>${teamA.elo} − ${teamB.elo} = ${teamA.elo - teamB.elo} pts</code></p>
      <p>P(${teamA.name} gana) = 1 / (1 + 10<sup>−Δ/400</sup>) = <strong>${pct(result.elo.pA)}</strong></p>
      <p class="meth-note">El ELO no modela empates directamente. La probabilidad de empate se toma del modelo Poisson y se redistribuye proporcionalmente.</p>
    </div>

    <div class="meth-section">
      <h4 class="meth-title">2 — Modelo Poisson (peso: ${pct(breakdown.weights.poisson)})</h4>
      <p>Goles esperados base: λ<sub>A</sub> = ${fmt2(breakdown.lambdaBase.a)}, λ<sub>B</sub> = ${fmt2(breakdown.lambdaBase.b)}</p>
      <p>Forma reciente: factor A = ×${fmt2(result.formA.factor)}, factor B = ×${fmt2(result.formB.factor)}</p>
      <p>Goles esperados ajustados: λ<sub>A</sub> = <strong>${fmt2(lambdaA)}</strong>, λ<sub>B</sub> = <strong>${fmt2(lambdaB)}</strong></p>
      <p>Poisson puro → Victoria A ${pct(result.poisson.pA)}, Empate ${pct(result.poisson.pDraw)}, Victoria B ${pct(result.poisson.pB)}</p>
    </div>

    <div class="meth-section">
      <h4 class="meth-title">3 — Combinación y resultado final</h4>
      <div class="meth-table">
        <div class="meth-row meth-row--header">
          <span>Resultado</span><span>ELO (×${breakdown.weights.elo})</span>
          <span>Poisson (×${breakdown.weights.poisson})</span><span>Final</span>
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
    </div>

    <div class="meth-section meth-section--disclaimer">
      <p><strong>⚠ Limitaciones del modelo:</strong> los datos son de demostración,
      los pesos ELO/Poisson son estimados (no calibrados con backtesting real),
      el modelo no contempla bajas por lesión, el contexto del torneo, ni factores tácticos.
      <strong>Este análisis no predice resultados ni debe usarse para apuestas.</strong></p>
    </div>`;
}

// ── utility: animate data-target fills ───────────────────────────────────────

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
