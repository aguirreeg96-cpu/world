/**
 * Static team dataset — DATOS DE DEMOSTRACIÓN
 * Stats are illustrative only. Replace with real data from a CSV or API.
 */
export const TEAMS_DATA = {
  _disclaimer: "Estadísticas de demostración. NO son datos reales.",
  globalAvgGoals: 1.35,
  teams: [
    {
      id: "ARG", name: "Argentina", flag: "🇦🇷", confederation: "CONMEBOL",
      elo: 1920, avgGoalsFor: 2.10, avgGoalsAgainst: 0.85,
      recentResults: ["W", "W", "D", "W", "W", "W", "D", "W"],
    },
    {
      id: "FRA", name: "Francia", flag: "🇫🇷", confederation: "UEFA",
      elo: 1890, avgGoalsFor: 1.95, avgGoalsAgainst: 0.90,
      recentResults: ["W", "D", "W", "W", "L", "W", "W", "D"],
    },
    {
      id: "BRA", name: "Brasil", flag: "🇧🇷", confederation: "CONMEBOL",
      elo: 1880, avgGoalsFor: 2.20, avgGoalsAgainst: 0.80,
      recentResults: ["W", "W", "W", "D", "W", "L", "W", "W"],
    },
    {
      id: "ENG", name: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", confederation: "UEFA",
      elo: 1850, avgGoalsFor: 1.85, avgGoalsAgainst: 0.95,
      recentResults: ["W", "W", "W", "W", "D", "W", "D", "W"],
    },
    {
      id: "ESP", name: "España", flag: "🇪🇸", confederation: "UEFA",
      elo: 1840, avgGoalsFor: 2.00, avgGoalsAgainst: 0.85,
      recentResults: ["D", "W", "W", "W", "W", "D", "W", "W"],
    },
    {
      id: "GER", name: "Alemania", flag: "🇩🇪", confederation: "UEFA",
      elo: 1820, avgGoalsFor: 1.90, avgGoalsAgainst: 1.00,
      recentResults: ["W", "D", "L", "W", "W", "W", "D", "W"],
    },
    {
      id: "POR", name: "Portugal", flag: "🇵🇹", confederation: "UEFA",
      elo: 1800, avgGoalsFor: 2.05, avgGoalsAgainst: 1.05,
      recentResults: ["W", "W", "W", "D", "W", "W", "L", "W"],
    },
    {
      id: "NED", name: "Países Bajos", flag: "🇳🇱", confederation: "UEFA",
      elo: 1790, avgGoalsFor: 1.80, avgGoalsAgainst: 1.00,
      recentResults: ["W", "W", "D", "W", "L", "W", "W", "W"],
    },
    {
      id: "BEL", name: "Bélgica", flag: "🇧🇪", confederation: "UEFA",
      elo: 1780, avgGoalsFor: 1.75, avgGoalsAgainst: 1.10,
      recentResults: ["D", "W", "W", "D", "W", "W", "L", "W"],
    },
    {
      id: "URU", name: "Uruguay", flag: "🇺🇾", confederation: "CONMEBOL",
      elo: 1760, avgGoalsFor: 1.60, avgGoalsAgainst: 1.00,
      recentResults: ["W", "D", "W", "L", "W", "W", "D", "W"],
    },
    {
      id: "ITA", name: "Italia", flag: "🇮🇹", confederation: "UEFA",
      elo: 1750, avgGoalsFor: 1.55, avgGoalsAgainst: 0.90,
      recentResults: ["D", "W", "D", "W", "W", "D", "W", "L"],
    },
    {
      id: "CRO", name: "Croacia", flag: "🇭🇷", confederation: "UEFA",
      elo: 1740, avgGoalsFor: 1.65, avgGoalsAgainst: 1.05,
      recentResults: ["W", "D", "W", "W", "D", "L", "W", "W"],
    },
    {
      id: "MEX", name: "México", flag: "🇲🇽", confederation: "CONCACAF",
      elo: 1720, avgGoalsFor: 1.60, avgGoalsAgainst: 1.15,
      recentResults: ["W", "W", "D", "L", "W", "D", "W", "D"],
    },
    {
      id: "SEN", name: "Senegal", flag: "🇸🇳", confederation: "CAF",
      elo: 1710, avgGoalsFor: 1.55, avgGoalsAgainst: 1.10,
      recentResults: ["W", "W", "D", "W", "L", "D", "W", "W"],
    },
    {
      id: "MAR", name: "Marruecos", flag: "🇲🇦", confederation: "CAF",
      elo: 1700, avgGoalsFor: 1.40, avgGoalsAgainst: 0.95,
      recentResults: ["D", "W", "W", "D", "W", "W", "D", "W"],
    },
    {
      id: "JPN", name: "Japón", flag: "🇯🇵", confederation: "AFC",
      elo: 1690, avgGoalsFor: 1.70, avgGoalsAgainst: 1.10,
      recentResults: ["W", "W", "L", "W", "W", "D", "W", "D"],
    },
    {
      id: "KOR", name: "Corea del Sur", flag: "🇰🇷", confederation: "AFC",
      elo: 1650, avgGoalsFor: 1.50, avgGoalsAgainst: 1.20,
      recentResults: ["W", "D", "W", "L", "W", "D", "W", "L"],
    },
    {
      id: "USA", name: "Estados Unidos", flag: "🇺🇸", confederation: "CONCACAF",
      elo: 1660, avgGoalsFor: 1.55, avgGoalsAgainst: 1.20,
      recentResults: ["W", "D", "W", "W", "D", "L", "W", "D"],
    },
    {
      id: "AUS", name: "Australia", flag: "🇦🇺", confederation: "AFC",
      elo: 1620, avgGoalsFor: 1.40, avgGoalsAgainst: 1.30,
      recentResults: ["D", "W", "L", "W", "D", "W", "W", "D"],
    },
    {
      id: "NGA", name: "Nigeria", flag: "🇳🇬", confederation: "CAF",
      elo: 1630, avgGoalsFor: 1.55, avgGoalsAgainst: 1.25,
      recentResults: ["W", "D", "W", "L", "D", "W", "W", "D"],
    },
  ],
};

export function getTeamById(id) {
  return TEAMS_DATA.teams.find(t => t.id === id) ?? null;
}

export function getAllTeams() {
  return [...TEAMS_DATA.teams].sort((a, b) => b.elo - a.elo);
}
