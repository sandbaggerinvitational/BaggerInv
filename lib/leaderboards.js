import {
  formatHandicap,
  formatPercentage,
  formatRecord,
  getFormatName,
  getRecords,
} from "./stats";

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function pointsPerMatch(stats) {
  return stats.records.overall.matches
    ? stats.records.overall.points / stats.records.overall.matches
    : 0;
}

function pointsPerAppearance(stats) {
  return stats.appearances.length
    ? stats.records.overall.points / stats.appearances.length
    : 0;
}

const definitions = {
  "career-points": {
    title: "Career Points",
    description:
      "Individual points earned across all tracked tournaments. Team-format points are divided equally between partners.",
    rowsKey: "points",
    columns: [
      { key: "points", label: "Points", numeric: true },
      { key: "matches", label: "Matches", numeric: true },
      { key: "pointsPerMatch", label: "Points / Match", numeric: true },
      { key: "appearances", label: "Appearances", numeric: true },
    ],
    primary: (stats) => stats.records.overall.points,
  },
  "match-wins": {
    title: "Match Wins",
    description: "Most individual match wins in tournament history.",
    rowsKey: "wins",
    columns: [
      { key: "wins", label: "Wins", numeric: true },
      { key: "losses", label: "Losses", numeric: true },
      { key: "halves", label: "Ties", numeric: true },
      { key: "percentage", label: "Win %", numeric: true },
    ],
    primary: (stats) => stats.records.overall.wins,
  },
  "win-percentage": {
    title: "Point Win Percentage",
    description:
      "Winning percentage with ties counted as one-half win. A minimum of five appearances is required.",
    rowsKey: "percentage",
    columns: [
      { key: "percentage", label: "Win %", numeric: true },
      { key: "record", label: "Record" },
      { key: "matches", label: "Matches", numeric: true },
      { key: "points", label: "Points", numeric: true },
    ],
    primary: (stats) => formatPercentage(stats.percentages.overall),
  },
  championships: {
    title: "Bagger Championships",
    description: "Most championships won as a member of the winning team.",
    rowsKey: "championships",
    columns: [
      { key: "championships", label: "Titles", numeric: true },
      { key: "championshipYears", label: "Championship Years" },
      { key: "appearances", label: "Appearances", numeric: true },
      { key: "record", label: "Career Record" },
    ],
    primary: (stats) => stats.championships.length,
  },
  appearances: {
    title: "Tournament Appearances",
    description: "Most appearances in The Sandbagger Invitational.",
    rowsKey: "appearances",
    columns: [
      { key: "appearances", label: "Appearances", numeric: true },
      { key: "firstYear", label: "First Year", numeric: true },
      { key: "lastYear", label: "Most Recent", numeric: true },
      { key: "record", label: "Career Record" },
    ],
    primary: (stats) => stats.appearances.length,
  },
  "points-per-match": {
    title: "Points Per Match",
    description:
      "Career point efficiency. Team-format points are divided equally between partners. A minimum of five tournament appearances is required.",
    rowsKey: "pointsPerMatch",
    columns: [
      { key: "pointsPerMatch", label: "Points / Match", numeric: true },
      { key: "points", label: "Career Points", numeric: true },
      { key: "matches", label: "Matches", numeric: true },
      { key: "percentage", label: "Win %", numeric: true },
    ],
    primary: (stats) => round(pointsPerMatch(stats)),
  },
  "points-per-appearance": {
    title: "Points Per Appearance",
    description:
      "Average individual points earned per tournament appearance. A minimum of five tournament appearances is required.",
    rowsKey: "pointsPerAppearance",
    columns: [
      {
        key: "pointsPerAppearance",
        label: "Points / Appearance",
        numeric: true,
      },
      { key: "points", label: "Career Points", numeric: true },
      { key: "appearances", label: "Appearances", numeric: true },
      { key: "record", label: "Career Record" },
    ],
    primary: (stats) => round(pointsPerAppearance(stats)),
  },
  "average-handicap": {
    title: "Lowest Career Average Handicap",
    description:
      "Average of the tournament handicaps recorded for each player's appearances.",
    rowsKey: "averageHandicap",
    columns: [
      { key: "averageHandicap", label: "Avg. Handicap", numeric: true },
      { key: "appearances", label: "Appearances", numeric: true },
      { key: "record", label: "Career Record" },
      { key: "percentage", label: "Win %", numeric: true },
    ],
    primary: (stats) => formatHandicap(stats.averageHandicap),
  },
  "sandbagger-of-the-year": {
    title: "Sandbagger of the Year",
    description: "Most Sandbagger of the Year awards.",
    rowsKey: "soy",
    columns: [
      { key: "soy", label: "Awards", numeric: true },
      { key: "soyYears", label: "Award Years" },
      { key: "championships", label: "Championships", numeric: true },
      { key: "appearances", label: "Appearances", numeric: true },
    ],
    primary: (stats) => stats.sandbaggerOfYearYears.length,
  },
  "best-ball": formatDefinition("BB"),
  scramble: formatDefinition("SC"),
  singles: formatDefinition("SI"),
};

function formatDefinition(format) {
  return {
    title: `${getFormatName(format)} Leaders`,
    description: `Career ${getFormatName(
      format
    )} records. A minimum of five tournament appearances is required.`,
    rowsKey: `format:${format}`,
    format,
    columns: [
      { key: "formatPercentage", label: "Win %", numeric: true },
      { key: "formatRecord", label: "Record" },
      { key: "formatWins", label: "Wins", numeric: true },
      { key: "formatPoints", label: "Points", numeric: true },
    ],
    primary: (stats) => formatPercentage(stats.percentages[format]),
  };
}

function rowValues(player, stats, definition) {
  const years = [...stats.appearances].sort((a, b) => a - b);
  const format = definition.format;

  return {
    id: player["Player ID"],
    name: player["Display Name"],
    slug: player.slug,
    photo: player["Photo Filename"] || "",
    points: stats.records.overall.points,
    wins: stats.records.overall.wins,
    losses: stats.records.overall.losses,
    halves: stats.records.overall.halves,
    matches: stats.records.overall.matches,
    record: formatRecord(stats.records.overall),
    percentage: round(stats.percentages.overall, 1),
    percentageDisplay: formatPercentage(stats.percentages.overall),
    championships: stats.championships.length,
    championshipYears: [...stats.championships]
      .sort((a, b) => a - b)
      .join(" • "),
    soy: stats.sandbaggerOfYearYears.length,
    soyYears: [...stats.sandbaggerOfYearYears]
      .sort((a, b) => a - b)
      .join(" • "),
    appearances: stats.appearances.length,
    firstYear: years[0] ?? "—",
    lastYear: years.at(-1) ?? "—",
    pointsPerMatch: round(pointsPerMatch(stats)),
    pointsPerAppearance: round(pointsPerAppearance(stats)),
    averageHandicap:
      stats.averageHandicap === null
        ? null
        : round(stats.averageHandicap, 1),
    averageHandicapDisplay: formatHandicap(stats.averageHandicap),
    formatPercentage: format
      ? round(stats.percentages[format], 1)
      : null,
    formatPercentageDisplay: format
      ? formatPercentage(stats.percentages[format])
      : null,
    formatRecord: format ? formatRecord(stats.records[format]) : null,
    formatWins: format ? stats.records[format].wins : null,
    formatPoints: format ? stats.records[format].points : null,
  };
}

export function getLeaderboardDefinition(slug) {
  return definitions[slug] ?? null;
}

export function getLeaderboardSlugs() {
  return Object.keys(definitions);
}

export function getLeaderboard(slug) {
  const definition = getLeaderboardDefinition(slug);
  if (!definition) return null;

  const records = getRecords();
  const sourceRows = definition.rowsKey.startsWith("format:")
    ? records.byFormat[definition.format]
    : records[definition.rowsKey];

  return {
    ...definition,
    slug,
    rows: sourceRows.map(({ player, stats }) =>
      rowValues(player, stats, definition)
    ),
  };
}

export function getStatisticsSections() {
  return [
    {
      title: "Career",
      description: "Career production, efficiency, longevity, and honors.",
      links: [
        "career-points",
        "match-wins",
        "win-percentage",
        "points-per-match",
        "points-per-appearance",
        "appearances",
      ],
    },
    {
      title: "Formats",
      description: "Career leaders in each competitive match format.",
      links: ["best-ball", "scramble", "singles"],
    },
    {
      title: "Honors",
      description:
        "Competitive honors earned in The Sandbagger Invitational.",
      links: ["championships", "sandbagger-of-the-year"],
    },
    {
      title: "Partnerships & Rivalries",
      description:
        "The most successful pairings and most frequently contested head-to-head matchups.",
      customLinks: [
        {
          href: "/statistics/partnerships",
          title: "Partnership Analytics",
          description:
            "Partnership points, winning percentage, and matches played together.",
        },
        {
          href: "/statistics/rivalries",
          title: "Rivalry Analytics",
          description:
            "Most-played, closest, and most-halved rivalries.",
        },
      ],
      links: [],
    },
    {
      title: "Handicap",
      description: "Career and single-tournament handicap measurements.",
      customLinks: [
        {
          href: "/statistics/handicaps",
          title: "Handicap Analytics",
          description:
            "Lowest tournament indexes, highest indexes, and career improvement.",
        },
      ],
      links: ["average-handicap"],
    },
  ].map((section) => ({
    ...section,
    links: [
      ...section.links.map((slug) => ({
        slug,
        href: `/records/${slug}`,
        title: definitions[slug].title,
        description: definitions[slug].description,
      })),
      ...(section.customLinks ?? []).map((item) => ({
        ...item,
        slug: null,
      })),
    ],
  }));
}
