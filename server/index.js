// server/index.js — Express server with Ollama agent orchestration & stats engine tools
//
// v2.2 changes (after Project 5 usability testing):
//   - Sets Ollama's context window (OLLAMA_NUM_CTX). Without it, Ollama's small default
//     window cut off the start of long conversations, including the system prompt.
//   - Caps conversation history (MAX_HISTORY) and strips duplicate tables from tool results
//   - Final loop turn disables tools, so the model always writes an answer after fetching data
//   - New compare_teams tool for side-by-side team comparisons with a verdict
//   - System prompt now includes exactly what data is loaded
//   - Fixed tool-call IDs and argument formats for both Ollama and cloud providers
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const stats = require("./stats");
const { buildSystemPrompt } = require("./prompt");

const app = express();
const PORT = process.env.PORT || 3001;

// Built once at startup from the data that actually loaded.
const SYSTEM_PROMPT = buildSystemPrompt(stats.coverage());

// LLM Provider Configuration: supports local Ollama OR Cloud API (Groq, OpenRouter, OpenAI)
const LLM_API_KEY =
  process.env.GROQ_API_KEY ||
  process.env.LLM_API_KEY ||
  process.env.OPENAI_API_KEY ||
  null;

const LLM_BASE_URL =
  process.env.LLM_BASE_URL ||
  (process.env.GROQ_API_KEY ? "https://api.groq.com/openai/v1" : null);

const IS_CLOUD_LLM = Boolean(LLM_API_KEY);
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL =
  process.env.MODEL || (IS_CLOUD_LLM ? "llama-3.1-8b-instant" : "qwen3:8b");

// Context window for local Ollama (tokens). qwen3:8b supports far more than Ollama's default.
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX || 16384);
// How many recent user/assistant messages to send with each request.
const MAX_HISTORY = Number(process.env.MAX_HISTORY || 12);
// Max model calls per user message (tool calls + final answer).
const MAX_TURNS = 5;

const FALLBACK_TEXT =
  "I pulled the numbers above but couldn't finish writing the analysis. Try asking again, or ask about one comparison at a time.";

app.use(cors());
app.use(express.json());

/* ────────────────────────────────────────── */
/*  Tool Definitions                          */
/* ────────────────────────────────────────── */

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_players",
      description:
        "Search the Understat database for soccer players by name. Returns matching player IDs, teams, leagues, and positions.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Player name or surname, e.g. 'Salah', 'Haaland', 'Cole Palmer'",
          },
          limit: {
            type: "integer",
            description: "Maximum number of matching players to return (default 5)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_player_report",
      description:
        "Retrieve the comprehensive statistical report for a single player by name or Understat ID (e.g. 'Harry Kane', 'Salah', or '647'). Includes per-90 metrics, percentile rankings against peers, finishing vs xG, historical trends, and pace projections.",
      parameters: {
        type: "object",
        properties: {
          player: {
            type: "string",
            description: "Player name or unique Understat player ID (e.g. 'Harry Kane', 'Salah', '647')",
          },
          season: {
            type: "string",
            description: "Optional season code (e.g. '2025-26', '2526'). Defaults to latest available season.",
          },
          scope: {
            type: "string",
            enum: ["league", "top5"],
            description: "Percentile comparison pool: 'league' (default) or 'top5' across all 5 leagues.",
          },
        },
        required: ["player"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_players",
      description:
        "Head-to-head comparison of 2 or more players by name or ID. Always pass EVERY player the user wants compared, including players from earlier in the conversation.",
      parameters: {
        type: "object",
        properties: {
          players: {
            type: "array",
            items: { type: "string" },
            description: "Array of player names or IDs to compare, e.g. ['Harry Kane', 'Erling Haaland']",
          },
          season: {
            type: "string",
            description: "Optional season code (e.g. '2025-26'). Defaults to latest season.",
          },
          scope: {
            type: "string",
            enum: ["league", "top5"],
            description: "Percentile comparison pool: 'league' (default) or 'top5'.",
          },
        },
        required: ["players"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_leaders",
      description:
        "Get top ranking players for a specific metric across Europe's top 5 leagues or a specific league.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: [
              "goals",
              "np_goals",
              "xg",
              "np_xg",
              "assists",
              "xa",
              "shots",
              "key_passes",
              "xg_chain",
              "xg_buildup",
            ],
            description: "Statistical metric to rank by (e.g. 'np_xg', 'xa', 'goals')",
          },
          position: {
            type: "string",
            enum: ["FWD", "MID", "DEF", "GK"],
            description: "Filter by position group (optional)",
          },
          league: {
            type: "string",
            description: "Filter by league name e.g. 'Premier League', 'La Liga' (optional)",
          },
          season: {
            type: "string",
            description: "Season to rank in (e.g. '2025-26'). Defaults to current season.",
          },
          per_90: {
            type: "boolean",
            description: "Whether to rank per 90 minutes (true, default) or season totals (false).",
          },
          limit: {
            type: "integer",
            description: "Number of leader rows to return (default 10, max 25).",
          },
        },
        required: ["metric"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_team_report",
      description:
        "Retrieve ONE Premier League club's season shooting metrics, expected goals (xG/npxG), finishing efficiency, and finishing diagnosis. For two or more clubs, use compare_teams instead.",
      parameters: {
        type: "object",
        properties: {
          team: {
            type: "string",
            description: "Club name, e.g. 'Arsenal', 'Chelsea', 'Brighton', 'Aston Villa'",
          },
        },
        required: ["team"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_teams",
      description:
        "Compare 2 or more Premier League clubs side by side. Returns each club's stats, which club leads each stat (the Edge), and an overall attacking verdict. Use this whenever the user asks about more than one team, e.g. 'Who had the better attack, Brighton or Aston Villa?'",
      parameters: {
        type: "object",
        properties: {
          teams: {
            type: "array",
            items: { type: "string" },
            description: "Array of club names, e.g. ['Brighton', 'Aston Villa']",
          },
        },
        required: ["teams"],
      },
    },
  },
];

/* ────────────────────────────────────────── */
/*  Tool Dispatcher                           */
/* ────────────────────────────────────────── */

function executeTool(name, args) {
  try {
    switch (name) {
      case "search_players": {
        const query = args.query || "";
        const limit = args.limit ? Number(args.limit) : 5;
        const results = stats.searchPlayers(query, limit);
        if (!results.length) return { results, note: `No matches. ${stats.coverageText()}` };
        return { results };
      }

      case "get_player_report": {
        const playerArg = args.player || args.player_id || "";
        const season = args.season ? stats.toSeasonCode(args.season) : undefined;
        const scope = args.scope || "league";
        const report = stats.playerReport(playerArg, season, scope);
        if (report.error) return report;
        const table = stats.buildTable([report]);
        return { report, table };
      }

      case "compare_players": {
        const rawPlayers = args.players || args.player_ids || [];
        const players = Array.isArray(rawPlayers) ? rawPlayers.map(String) : [String(rawPlayers)];
        const season = args.season ? stats.toSeasonCode(args.season) : undefined;
        const scope = args.scope || "league";
        const reports = players.map((p) => stats.playerReport(p, season, scope));
        const validReports = reports.filter((r) => !r.error);
        const table = validReports.length > 0 ? stats.buildTable(validReports) : null;
        return { reports, table };
      }

      case "get_leaders": {
        const per_90 = args.per_90 !== false;
        const limit = args.limit ? Number(args.limit) : 10;
        return stats.leaders({
          metric: args.metric,
          position: args.position,
          league: args.league,
          season: args.season,
          per_90,
          limit,
        });
      }

      case "get_team_report": {
        const report = stats.teamReport(args.team || "");
        if (report.error) return report;
        const table = stats.buildTeamTable([report]);
        return { report, table };
      }

      case "compare_teams": {
        const rawTeams = args.teams || args.team || [];
        const teams = Array.isArray(rawTeams) ? rawTeams.map(String) : [String(rawTeams)];
        return stats.compareTeams(teams);
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: `Failed to execute ${name}: ${err.message}` };
  }
}

// The frontend already receives each table as its own event, so the model doesn't need
// the table a second time. Player history is also dropped from multi-player comparisons.
// Smaller tool results keep long conversations inside the context window.
function compactForModel(name, result) {
  const copy = { ...result };
  delete copy.table;
  if (name === "compare_players" && Array.isArray(copy.reports)) {
    copy.reports = copy.reports.map((r) => {
      if (r.error) return r;
      const { history, ...rest } = r;
      return rest;
    });
  }
  return JSON.stringify(copy);
}

function parseArgs(raw) {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

/* ────────────────────────────────────────── */
/*  Think Filter (strips <think>...</think>)  */
/* ────────────────────────────────────────── */

class ThinkFilter {
  constructor() {
    this.inThink = false;
    this.buffer = "";
  }

  filter(chunk) {
    this.buffer += chunk;
    let output = "";

    while (this.buffer.length > 0) {
      if (!this.inThink) {
        const startIdx = this.buffer.indexOf("<think>");
        if (startIdx === -1) {
          // Check if buffer ends with a partial prefix of '<think>'
          let keep = 0;
          for (let i = 1; i < 7 && i <= this.buffer.length; i++) {
            if ("<think>".startsWith(this.buffer.slice(-i))) {
              keep = i;
              break;
            }
          }
          output += this.buffer.slice(0, this.buffer.length - keep);
          this.buffer = this.buffer.slice(this.buffer.length - keep);
          break;
        } else {
          output += this.buffer.slice(0, startIdx);
          this.buffer = this.buffer.slice(startIdx + 7);
          this.inThink = true;
        }
      } else {
        const endIdx = this.buffer.indexOf("</think>");
        if (endIdx === -1) {
          // Inside think block; discard except potential prefix of '</think>'
          let keep = 0;
          for (let i = 1; i < 8 && i <= this.buffer.length; i++) {
            if ("</think>".startsWith(this.buffer.slice(-i))) {
              keep = i;
              break;
            }
          }
          this.buffer = this.buffer.slice(this.buffer.length - keep);
          break;
        } else {
          this.buffer = this.buffer.slice(endIdx + 8);
          this.inThink = false;
        }
      }
    }

    return output;
  }

  flush() {
    let out = "";
    if (!this.inThink && this.buffer) {
      out = this.buffer;
    }
    this.buffer = "";
    return out;
  }
}

/* ────────────────────────────────────────── */
/*  Health & Model Info Endpoints             */
/* ────────────────────────────────────────── */

app.get("/api/health", async (req, res) => {
  let llmConnected = false;
  let availableModels = [];

  if (IS_CLOUD_LLM) {
    try {
      const endpoint = `${LLM_BASE_URL.replace(/\/+$/, "")}/models`;
      const r = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${LLM_API_KEY}` },
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) {
        const data = await r.json();
        llmConnected = true;
        availableModels = (data.data || []).map((m) => m.id).slice(0, 10);
      }
    } catch {
      // cloud fetch timeout
    }
  } else {
    try {
      const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) {
        const data = await r.json();
        llmConnected = true;
        availableModels = (data.models || []).map((m) => m.name);
      }
    } catch {
      // Ollama not responding
    }
  }

  res.json({
    status: "ok",
    server: "soccer-ai-chatbot-server",
    port: PORT,
    mode: IS_CLOUD_LLM ? "cloud" : "local_ollama",
    llmProvider: IS_CLOUD_LLM
      ? process.env.GROQ_API_KEY
        ? "Groq"
        : "OpenAI-compatible"
      : "Ollama",
    statsLoaded: stats.rowCount(),
    teamsLoaded: stats.teamCount(),
    seasons: stats.seasons(),
    coverage: stats.coverage(),
    configuredModel: DEFAULT_MODEL,
    contextWindow: IS_CLOUD_LLM ? "provider default" : OLLAMA_NUM_CTX,
    maxHistory: MAX_HISTORY,
    llmConnected,
    availableModels,
  });
});

app.get("/api/models", async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) {
      return res.status(502).json({ error: `Ollama returned HTTP ${r.status}` });
    }
    const data = await r.json();
    res.json({
      activeDefault: DEFAULT_MODEL,
      models: data.models || [],
    });
  } catch (err) {
    res.status(502).json({
      error: `Unable to connect to Ollama at ${OLLAMA_URL}. Ensure Ollama is running. (${err.message})`,
    });
  }
});

/* ────────────────────────────────────────── */
/*  Chat SSE Endpoint                         */
/* ────────────────────────────────────────── */

app.post("/api/chat", async (req, res) => {
  const { messages, model: requestedModel, think: requestedThink } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Missing or invalid 'messages' array." });
  }

  // Model & think options
  const activeModel = requestedModel || process.env.MODEL || DEFAULT_MODEL;
  const activeThink =
    typeof requestedThink === "boolean"
      ? requestedThink
      : process.env.OLLAMA_THINK === "true"; // default false for responsive speed

  // Set SSE Headers immediately
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
  // Send an immediate SSE comment ping so client/proxy connects without waiting for model generation
  res.write(":\n\n");

  let anyText = false;
  const sendEvent = (data) => {
    if (data.type === "text" && data.text) anyText = true;
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Keep only recent user/assistant text messages, starting with a user message.
    const history = messages
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim()
      )
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content }));
    while (history.length && history[0].role !== "user") history.shift();

    // The system prompt always comes first, so it is never the part that gets cut.
    const conversation = [{ role: "system", content: SYSTEM_PROMPT }, ...history];

    let turns = 0;
    let lastTurnUsedTools = false;

    while (turns < MAX_TURNS) {
      turns++;
      // On the final turn, tools are switched off so the model must write its answer.
      const allowTools = turns < MAX_TURNS;

      if (!allowTools && lastTurnUsedTools) {
        conversation.push({
          role: "user",
          content:
            "Using the tool results above, write your answer now in the required format (Headline, Breakdown, Stat check, Data). Do not call more tools.",
        });
      }

      let response;
      try {
        if (IS_CLOUD_LLM) {
          const endpoint = `${LLM_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
          response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LLM_API_KEY}`,
            },
            body: JSON.stringify({
              model: activeModel,
              messages: conversation,
              tools: TOOLS,
              tool_choice: allowTools ? "auto" : "none",
              stream: true,
            }),
          });
        } else {
          response = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: activeModel,
              messages: conversation,
              ...(allowTools ? { tools: TOOLS } : {}),
              think: activeThink,
              stream: true,
              options: { num_ctx: OLLAMA_NUM_CTX },
            }),
          });
        }
      } catch (networkErr) {
        const target = IS_CLOUD_LLM ? LLM_BASE_URL : OLLAMA_URL;
        throw new Error(
          `Cannot reach LLM provider at ${target}. Error: ${networkErr.message}`
        );
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LLM provider HTTP ${response.status}: ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const thinkFilter = new ThinkFilter();

      let turnContent = "";
      const turnToolCalls = [];
      let streamBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split("\n");
        streamBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === "data: [DONE]") break;

          try {
            const jsonStr = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
            const chunk = JSON.parse(jsonStr);

            // 1. OpenAI / Groq format: chunk.choices[0].delta
            if (chunk.choices && Array.isArray(chunk.choices)) {
              const delta = chunk.choices[0]?.delta || {};

              if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? turnToolCalls.length;
                  if (!turnToolCalls[idx]) {
                    turnToolCalls[idx] = {
                      id: tc.id || `call_${turns}_${idx}`,
                      type: "function",
                      function: { name: tc.function?.name || "", arguments: "" },
                    };
                  }
                  if (tc.id) turnToolCalls[idx].id = tc.id;
                  if (tc.function?.name) turnToolCalls[idx].function.name = tc.function.name;
                  if (tc.function?.arguments) {
                    turnToolCalls[idx].function.arguments += tc.function.arguments;
                  }
                }
              }

              if (typeof delta.content === "string" && delta.content) {
                const clean = thinkFilter.filter(delta.content);
                if (clean) {
                  turnContent += clean;
                  sendEvent({ type: "text", text: clean });
                }
              }
            } else {
              // 2. Ollama format: chunk.message
              const msg = chunk.message || {};

              if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
                for (const tc of msg.tool_calls) {
                  turnToolCalls.push(tc);
                }
              }

              if (typeof msg.content === "string" && msg.content) {
                const clean = thinkFilter.filter(msg.content);
                if (clean) {
                  turnContent += clean;
                  sendEvent({ type: "text", text: clean });
                }
              }
            }
          } catch {
            // Ignore malformed partial lines
          }
        }
      }

      const flushed = thinkFilter.flush();
      if (flushed) {
        turnContent += flushed;
        sendEvent({ type: "text", text: flushed });
      }

      const toolCalls = turnToolCalls.filter((tc) => tc && tc.function?.name);

      // If the model requested tool calls, execute them deterministically
      if (toolCalls.length > 0 && allowTools) {
        lastTurnUsedTools = true;

        // One ID per call, used in BOTH the assistant message and the tool result.
        const calls = toolCalls.map((tc, idx) => ({
          id: tc.id || `call_${turns}_${idx}`,
          name: tc.function.name,
          args: parseArgs(tc.function.arguments),
        }));

        // Cloud providers expect arguments as a JSON string; Ollama expects an object.
        conversation.push({
          role: "assistant",
          content: turnContent || (IS_CLOUD_LLM ? null : ""),
          tool_calls: calls.map((c) =>
            IS_CLOUD_LLM
              ? { id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } }
              : { function: { name: c.name, arguments: c.args } }
          ),
        });

        for (const c of calls) {
          // Emit tool call event so frontend displays Trophy badge
          sendEvent({ type: "tool_call", tool: c.name, args: c.args });

          // Execute tool against stats engine
          const toolResult = executeTool(c.name, c.args);

          // If tool output includes a structured stat table, emit table event
          if (toolResult.table) {
            sendEvent({ type: "table", table: toolResult.table });
          }

          // Append tool execution response to conversation (without the duplicate table)
          conversation.push(
            IS_CLOUD_LLM
              ? { role: "tool", tool_call_id: c.id, name: c.name, content: compactForModel(c.name, toolResult) }
              : { role: "tool", tool_name: c.name, content: compactForModel(c.name, toolResult) }
          );
        }

        // Notify client that tool execution is complete and model will interpret
        sendEvent({ type: "status", status: "interpreting" });

        // Continue loop to let the model interpret the tool outputs
        continue;
      }

      lastTurnUsedTools = false;

      // Check if model emitted filler text promising action without invoking a tool
      const isFillerPromise =
        turns < MAX_TURNS &&
        turnContent.length < 250 &&
        /(one moment|let me (search|retrieve|look|find|check)|searching now|i'll check|i will search|hold on)/i.test(
          turnContent
        );

      if (isFillerPromise) {
        conversation.push({ role: "assistant", content: turnContent });
        conversation.push({
          role: "user",
          content: "Please execute the tool call directly now without conversational filler.",
        });
        continue;
      }

      break;
    }

    // Never leave the user with only a table and no explanation.
    if (!anyText) {
      sendEvent({ type: "text", text: FALLBACK_TEXT });
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    sendEvent({
      error: err.message || "An unexpected error occurred in backend server",
    });
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

/* ────────────────────────────────────────── */
/*  Start Express Server                      */
/* ────────────────────────────────────────── */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n======================================================`);
  console.log(`  PitchSide AI — Express Backend (v2.2)`);
  console.log(`  Listening on: http://localhost:${PORT} (0.0.0.0:${PORT})`);
  console.log(`  Mode: ${IS_CLOUD_LLM ? `Cloud (${process.env.GROQ_API_KEY ? "Groq" : "OpenAI-compatible"})` : "Local Ollama"}`);
  console.log(`  Model: ${DEFAULT_MODEL}`);
  if (!IS_CLOUD_LLM) console.log(`  Context window: ${OLLAMA_NUM_CTX} tokens`);
  console.log(`  Dataset: ${stats.rowCount()} player rows, ${stats.teamCount()} teams loaded`);
  console.log(`======================================================\n`);
});