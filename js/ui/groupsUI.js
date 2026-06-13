/**
 * Groups Section UI — WC 2026 group stage cards A–L
 */

// ── Standings computation ─────────────────────────────────────────────────────

function computeStandings(letter, teams, matches) {
  const stats = {};
  teams.forEach(id => {
    stats[id] = { pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
  });

  matches
    .filter(m => m.group === letter && m.status === "finished")
    .forEach(m => {
      const h = stats[m.home];
      const a = stats[m.away];
      if (!h || !a) return;
      h.pj++; a.pj++;
      h.gf += m.goalsHome; h.ga += m.goalsAway;
      a.gf += m.goalsAway; a.ga += m.goalsHome;
      h.gd = h.gf - h.ga;
      a.gd = a.gf - a.ga;
      if (m.goalsHome > m.goalsAway)      { h.pg++; h.pts += 3; a.pp++; }
      else if (m.goalsHome < m.goalsAway) { a.pg++; a.pts += 3; h.pp++; }
      else                                { h.pe++; h.pts++; a.pe++; a.pts++; }
    });

  return stats;
}

function groupHasStarted(letter, matches) {
  return matches.some(m => m.group === letter && m.status === "finished");
}

function groupPlaysToday(letter, matches) {
  const today = new Date().toISOString().slice(0, 10);
  return matches.some(m => m.group === letter && m.date === today);
}

// ── Card builder ──────────────────────────────────────────────────────────────

function buildGroupCard(letter, group, teamsMap, matches) {
  const started = groupHasStarted(letter, matches);
  const today   = groupPlaysToday(letter, matches);
  const stats   = computeStandings(letter, group.teams, matches);

  const sorted = started
    ? [...group.teams].sort((a, b) => {
        const sa = stats[a], sb = stats[b];
        return (sb.pts - sa.pts) || (sb.gd - sa.gd) || (sb.gf - sa.gf);
      })
    : group.teams;

  const todayBadge = today
    ? `<span class="gc-badge gc-badge--today">Hoy</span>` : "";

  const headerCols = started
    ? `<span class="gc-th gc-th--pts">Pts</span><span class="gc-th gc-th--pj">PJ</span>` : "";

  const teamRows = sorted.map(id => {
    const team = teamsMap.get(id);
    const name = team ? team.name : id;
    const flag = team ? team.flag : "🏳";
    const s    = stats[id];
    const statsHTML = started && s
      ? `<span class="gc-pts">${s.pts}</span><span class="gc-pj">${s.pj}</span>`
      : `<span class="gc-pts gc-pts--hidden"></span><span class="gc-pj gc-pj--hidden"></span>`;
    return `
      <button class="gc-team" data-team-id="${id}" title="${name}">
        <span class="gc-flag">${flag}</span>
        <span class="gc-name">${name}</span>
        ${statsHTML}
      </button>`;
  }).join("");

  return `
    <div class="group-card${started ? " gc--started" : ""}" data-group="${letter}">
      <div class="gc-header">
        <span class="gc-title">Grupo ${letter}</span>
        <div class="gc-header-right">${todayBadge}${headerCols}</div>
      </div>
      <div class="gc-teams">${teamRows}</div>
    </div>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function renderGroups(groups, teamsMap, matches, onTeamClick) {
  const section = document.getElementById("groupsSection");
  const grid    = document.getElementById("groupsGrid");
  if (!section || !grid || !groups) {
    if (section) section.style.display = "none";
    return;
  }

  const allMatches = Array.isArray(matches) ? matches : [];

  grid.innerHTML = Object.entries(groups)
    .map(([letter, group]) => buildGroupCard(letter, group, teamsMap, allMatches))
    .join("");

  grid.addEventListener("click", e => {
    const btn = e.target.closest(".gc-team");
    if (btn && onTeamClick) onTeamClick(btn.dataset.teamId);
  }, { once: false });

  section.style.display = "";
}

export function filterGroups(query) {
  const grid = document.getElementById("groupsGrid");
  if (!grid) return;

  const q = query.trim().toLowerCase();
  grid.querySelectorAll(".group-card").forEach(card => {
    if (!q) {
      card.classList.remove("gc--highlighted", "gc--dimmed");
      return;
    }
    const matches = card.textContent.toLowerCase().includes(q)
      || `grupo ${card.dataset.group}`.toLowerCase().includes(q);
    card.classList.toggle("gc--highlighted", matches);
    card.classList.toggle("gc--dimmed", !matches);
  });
}
