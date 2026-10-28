// stats.js — all number crunching happens here, NOT in the model.
// The model only explains what these functions return.

const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data", "players.json");
const MIN_MINUTES = Number(process.env.MIN_MINUTES || 360);

const LEAGUE_GAMES = {
  "ENG-Premier League": 38,
  "ESP-La Liga": 38,
  "ITA-Serie A": 38,
  "GER-Bundesliga": 34,
  "FRA-Ligue 1": 34,
};

// Per-90 metrics we compute percentiles for. Labels go into the tables.
const METRICS = {
  goals: "Goals",
  np_goals: "Non-pen goals",
  xg: "xG",
  np_xg: "npxG",
  assists: "Assists",
  xa: "xA",
  shots: "Shots",
  key_passes: "Key passes",
  xg_chain: "xGChain",
  xg_buildup: "xGBuildup",
};

// ---------- load ----------
let ROWS = [];
function load() {
  if (!fs.existsSync(DATA_PATH)) {
    console.warn(`No data at ${DATA_PATH}. Run scripts/fetch_understat.py first.`);
    ROWS = [];
    return;
  }
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  ROWS = raw.map((r) => ({
    league: r.league,
    season: String(r.season),
    team: r.team,
    player: r.player,
    player_id: String(r.player_id ?? r.player),
    position: r.position || "",
    group: positionGroup(r.position || ""),
    matches: num(r.matches ?? r.games),
    minutes: num(r.minutes),
    goals: num(r.goals),
    np_goals: num(r.np_goals),
    xg: num(r.xg),
    np_xg: num(r.np_xg),
    assists: num(r.assists),
    xa: num(r.xa),
    shots: num(r.shots),
    key_passes: num(r.key_passes),
    xg_chain: num(r.xg_chain),
    xg_buildup: num(r.xg_buildup),
    yellow_cards: num(r.yellow_cards),
    red_cards: num(r.red_cards),
  }));
  console.log(`Loaded ${ROWS.length} player-season rows`);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
const round = (n, d = 2) => (Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

// Understat positions look like "F M S", "D S", "GK". First token = main role.
function positionGroup(pos) {
  const p = pos.toUpperCase();
  if (p.includes("GK")) return "GK";
  const first = p.trim().split(/\s+/)[0];
  if (first === "F") return "FWD";
  if (first === "M") return "MID";
  if (first === "D") return "DEF";
  return "UNK";
}

function seasons() {
  return [...new Set(ROWS.map((r) => r.season))].sort().reverse();
}
const currentSeason = () => seasons()[0];

// "2627" -> "2026-27"
function seasonLabel(s) {
  if (!s || s.length !== 4) return s;
  return `20${s.slice(0, 2)}-${s.slice(2)}`;
}

// ---------- search ----------
function norm(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[a.length][b.length];
}

function nameScore(query, name) {
  const q = norm(query);
  const n = norm(name);
  if (!q) return 0;
  if (n === q) return 100;
  if (n.includes(q)) return 90;
  const qTokens = q.split(" ");
  const nTokens = n.split(" ");
  // every query token matches some name token closely ("salah", "mo salah")
  let hits = 0;
  for (const qt of qTokens) {
    if (nTokens.some((nt) => nt === qt || nt.startsWith(qt) || (qt.length > 3 && lev(qt, nt) <= 1))) hits++;
  }
  if (hits === qTokens.length) return 80;
  if (hits > 0) return 50 + hits * 5;
  const d = lev(q, n);
  return d <= 2 ? 60 : 0;
}

function searchPlayers(query, limit = 5) {
  const byId = new Map();
  for (const r of ROWS) {
    const s = nameScore(query, r.player);
    if (s === 0) continue;
    const prev = byId.get(r.player_id);
    // keep the most recent season row per player
    if (!prev || r.season > prev.row.season) byId.set(r.player_id, { score: s, row: r });
  }
  return [...byId.values()]
    .sort((a, b) => b.score - a.score || b.row.minutes - a.row.minutes)
    .slice(0, limit)
    .map(({ score, row }) => ({
      player_id: row.player_id,
      player: row.player,
      team: row.team,
      league: row.league,
      position: row.group,
      latest_season: seasonLabel(row.season),
      match_quality: score,
    }));
}

// ---------- per 90 + percentiles ----------
function per90(row) {
  const out = {};
  const m = row.minutes || 0;
  for (const k of Object.keys(METRICS)) out[k] = m > 0 ? (row[k] / m) * 90 : 0;
  return out;
}

// Pool = same season + same position group (+ same league if scope="league")
function pool(row, scope) {
  return ROWS.filter(
    (r) =>
      r.season === row.season &&
      r.group === row.group &&
      r.minutes >= MIN_MINUTES &&
      (scope === "top5" || r.league === row.league)
  );
}

function percentiles(row, scope = "league") {
  const p = pool(row, scope);
  if (p.length < 5) return { pool_size: p.length, values: null };
  const mine = per90(row);
  const values = {};
  for (const k of Object.keys(METRICS)) {
    const arr = p.map((r) => per90(r)[k]);
    const below = arr.filter((v) => v < mine[k]).length;
    const equal = arr.filter((v) => v === mine[k]).length;
    values[k] = Math.round(((below + 0.5 * equal) / arr.length) * 100);
  }
  return { pool_size: p.length, values };
}

// ---------- report ----------
function rowsFor(playerId) {
  return ROWS.filter((r) => r.player_id === String(playerId)).sort((a, b) =>
    b.season.localeCompare(a.season)
  );
}

function resolvePlayer(idOrName) {
  if (!idOrName) return null;
  const str = String(idOrName).trim();
  // 1. Direct ID match
  const direct = rowsFor(str);
  if (direct.length > 0) return { playerId: str, player: direct[0].player };
  // 2. Search by name
  const matches = searchPlayers(str, 1);
  if (matches.length > 0) return { playerId: matches[0].player_id, player: matches[0].player };
  return null;
}

// A player who moved clubs mid-season can have 2 rows in a season; merge them.
function mergeSeason(rows) {
  if (rows.length === 1) return rows[0];
  const base = { ...rows[0], team: rows.map((r) => r.team).join(" / ") };
  for (const k of ["matches", "minutes", ...Object.keys(METRICS), "yellow_cards", "red_cards"])
    base[k] = rows.reduce((s, r) => s + r[k], 0);
  return base;
}

function seasonRow(playerId, season) {
  const rows = rowsFor(playerId).filter((r) => r.season === season);
  return rows.length ? mergeSeason(rows) : null;
}

function teamGamesPlayed(row) {
  const teamRows = ROWS.filter(
    (r) => r.season === row.season && r.league === row.league && row.team.split(" / ").includes(r.team)
  );
  return Math.max(row.matches, ...teamRows.map((r) => r.matches));
}

function projection(row) {
  if (row.season !== currentSeason()) return null;
  const total = LEAGUE_GAMES[row.league];
  const played = teamGamesPlayed(row);
  if (!total || !played || row.minutes < 90) return null;
  const remaining = Math.max(0, total - played);
  const minsPerTeamGame = row.minutes / played;
  const expectedMins = minsPerTeamGame * remaining;
  const p = per90(row);
  return {
    method:
      "Rough pace projection: current per-90 xG/xA rate x the minutes he has been averaging x remaining league games. Assumes same role and health.",
    team_games_played: played,
    remaining_league_games: remaining,
    projected_final_goals: round(row.goals + (p.np_xg * expectedMins) / 90, 1),
    projected_final_assists: round(row.assists + (p.xa * expectedMins) / 90, 1),
  };
}

function playerReport(playerIdOrName, season, scope = "league") {
  const resolved = resolvePlayer(playerIdOrName);
  if (!resolved) return { error: `No player found matching "${playerIdOrName}"` };
  const playerId = resolved.playerId;
  const all = rowsFor(playerId);
  if (!all.length) return { error: `No player data found for ${resolved.player || playerId}` };
  const s = season || all[0].season;
  const row = seasonRow(playerId, s);
  if (!row) return { error: `No ${seasonLabel(s)} data for ${all[0].player}` };

  const p90 = per90(row);
  const pct = percentiles(row, scope);

  // trend vs previous seasons
  const prevSeasons = [...new Set(all.map((r) => r.season))].filter((x) => x < s);
  const history = prevSeasons.map((ps) => {
    const pr = seasonRow(playerId, ps);
    const pp = per90(pr);
    return {
      season: seasonLabel(ps),
      team: pr.team,
      minutes: pr.minutes,
      goals: pr.goals,
      assists: pr.assists,
      npxg_per90: round(pp.np_xg),
      xa_per90: round(pp.xa),
      shots_per90: round(pp.shots),
      key_passes_per90: round(pp.key_passes),
    };
  });

  return {
    player: row.player,
    player_id: row.player_id,
    team: row.team,
    league: row.league,
    season: seasonLabel(row.season),
    position_group: row.group,
    raw_position: row.position,
    matches: row.matches,
    minutes: row.minutes,
    small_sample: row.minutes < MIN_MINUTES,
    totals: {
      goals: row.goals,
      np_goals: row.np_goals,
      xg: round(row.xg),
      np_xg: round(row.np_xg),
      assists: row.assists,
      xa: round(row.xa),
      shots: row.shots,
      key_passes: row.key_passes,
      xg_chain: round(row.xg_chain),
      xg_buildup: round(row.xg_buildup),
      yellow_cards: row.yellow_cards,
      red_cards: row.red_cards,
    },
    per90: Object.fromEntries(Object.entries(p90).map(([k, v]) => [k, round(v)])),
    derived: {
      npxg_per_shot: row.shots ? round(row.np_xg / row.shots, 3) : null,
      finishing_vs_xg: round(row.np_goals - row.np_xg), // + = scoring more than chances suggest
      creating_vs_xa: round(row.assists - row.xa),
      buildup_share_of_chain: row.xg_chain ? round(row.xg_buildup / row.xg_chain) : null,
    },
    percentiles: {
      compared_against: `${row.group}s with ${MIN_MINUTES}+ minutes, ${scope === "top5" ? "all top 5 leagues" : row.league}, ${seasonLabel(row.season)}`,
      pool_size: pct.pool_size,
      values: pct.values,
    },
    history,
    projection: projection(row),
  };
}

// ---------- tables for the frontend ----------
const TABLE_ROWS = [
  ["Team", (r) => r.team],
  ["Season", (r) => r.season],
  ["Minutes", (r) => r.minutes],
  ["Goals", (r) => r.totals.goals],
  ["npxG", (r) => r.totals.np_xg],
  ["Assists", (r) => r.totals.assists],
  ["xA", (r) => r.totals.xa],
  ["npxG / 90", (r) => r.per90.np_xg, "np_xg"],
  ["xA / 90", (r) => r.per90.xa, "xa"],
  ["Shots / 90", (r) => r.per90.shots, "shots"],
  ["Key passes / 90", (r) => r.per90.key_passes, "key_passes"],
  ["xGChain / 90", (r) => r.per90.xg_chain, "xg_chain"],
  ["xGBuildup / 90", (r) => r.per90.xg_buildup, "xg_buildup"],
  ["Finishing vs xG", (r) => r.derived.finishing_vs_xg],
];

// Each cell for a per-90 stat shows the percentile too, e.g. "0.45 (88th)"
function buildTable(reports) {
  const valid = reports.filter((r) => !r.error);
  const columns = ["Stat", ...valid.map((r) => r.player)];
  const rows = TABLE_ROWS.map(([label, get, pctKey]) => [
    label,
    ...valid.map((r) => {
      const v = get(r);
      const p = pctKey && r.percentiles.values ? r.percentiles.values[pctKey] : null;
      return p != null ? `${v} (${ordinal(p)})` : v;
    }),
  ]);
  return { columns, rows };
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ---------- leaders ----------
function leaders({ metric = "np_xg", position, league, season, per_90 = true, limit = 10 }) {
  if (!METRICS[metric]) return { error: `Unknown metric. Use one of: ${Object.keys(METRICS).join(", ")}` };
  const s = season ? toSeasonCode(season) : currentSeason();
  let rows = ROWS.filter((r) => r.season === s && r.minutes >= MIN_MINUTES);
  if (position) rows = rows.filter((r) => r.group === position.toUpperCase());
  if (league) rows = rows.filter((r) => r.league.toLowerCase().includes(league.toLowerCase()));
  const scored = rows
    .map((r) => ({ r, v: per_90 ? per90(r)[metric] : r[metric] }))
    .sort((a, b) => b.v - a.v)
    .slice(0, Math.min(limit, 25));
  return {
    metric: METRICS[metric] + (per_90 ? " per 90" : " (total)"),
    season: seasonLabel(s),
    min_minutes: MIN_MINUTES,
    table: {
      columns: ["#", "Player", "Team", "League", "Minutes", METRICS[metric] + (per_90 ? " / 90" : "")],
      rows: scored.map(({ r, v }, i) => [i + 1, r.player, r.team, r.league, r.minutes, round(v)]),
    },
  };
}

// Accepts "2025-26", "25/26", "2526"
function toSeasonCode(s) {
  if (!s) return currentSeason();
  const digits = String(s).replace(/\D/g, "");
  if (digits.length === 4) return digits.startsWith("20") ? digits.slice(2) + String(Number(digits.slice(2)) + 1).padStart(2, "0") : digits;
  if (digits.length === 6) return digits.slice(2, 4) + digits.slice(4, 6);
  if (digits.length === 8) return digits.slice(2, 4) + digits.slice(6, 8);
  return currentSeason();
}

load();

module.exports = {
  searchPlayers,
  resolvePlayer,
  playerReport,
  buildTable,
  leaders,
  toSeasonCode,
  seasons: () => seasons().map(seasonLabel),
  METRICS,
  rowCount: () => ROWS.length,
};