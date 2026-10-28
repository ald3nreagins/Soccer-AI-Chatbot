// server/index.js — Express server with Ollama agent orchestration & stats engine tools
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const stats = require("./stats");
const { SYSTEM_PROMPT } = require("./prompt");

const app = express();
const PORT = process.env.PORT || 3001;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const DEFAULT_MODEL = process.env.MODEL || "qwen3:8b";

app.use(cors());
app.use(express.json());

/* ────────────────────────────────────────── */
/*  Tool Definitions for Ollama               */
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
        "Perform a head-to-head comparison of 2 or more players by their names or IDs. Generates comparative percentiles, per-90 stats, and tabular data.",
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
        return { results };
      }

      case "get_player_report": {
        const playerArg = args.player || args.player_id || "";
        const season = args.season ? stats.toSeasonCode(args.season) : undefined;
        const scope = args.scope || "league";
        const report = stats.playerReport(playerArg, season, scope);
        if (report.error) return { error: report.error };
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
        const metric = args.metric;
        const position = args.position;
        const league = args.league;
        const season = args.season;
        const per_90 = args.per_90 !== false;
        const limit = args.limit ? Number(args.limit) : 10;
        const result = stats.leaders({ metric, position, league, season, per_90, limit });
        return result;
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: `Failed to execute ${name}: ${err.message}` };
  }
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
  let ollamaConnected = false;
  let availableModels = [];

  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const data = await r.json();
      ollamaConnected = true;
      availableModels = (data.models || []).map((m) => m.name);
    }
  } catch {
    // Ollama not responding
  }

  res.json({
    status: "ok",
    server: "soccer-ai-chatbot-server",
    port: PORT,
    statsLoaded: stats.rowCount(),
    seasons: stats.seasons(),
    configuredModel: DEFAULT_MODEL,
    ollamaUrl: OLLAMA_URL,
    ollamaConnected,
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

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Build conversation history starting with SYSTEM_PROMPT
    const conversation = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content || "",
      })),
    ];

    let turns = 0;
    const maxTurns = 5;

    while (turns < maxTurns) {
      turns++;

      let response;
      try {
        response = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: activeModel,
            messages: conversation,
            tools: TOOLS,
            think: activeThink,
            stream: true,
          }),
        });
      } catch (networkErr) {
        throw new Error(
          `Cannot reach Ollama at ${OLLAMA_URL}. Is Ollama running? (Command: 'ollama run ${activeModel}'). Error: ${networkErr.message}`
        );
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama HTTP ${response.status}: ${errText}`);
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
          try {
            const chunk = JSON.parse(trimmed);
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
                sendEvent({
                  type: "text",
                  text: clean,
                });
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
        sendEvent({
          type: "text",
          text: flushed,
        });
      }

      // If the model requested tool calls, execute them deterministically
      if (turnToolCalls.length > 0) {
        conversation.push({
          role: "assistant",
          content: turnContent,
          tool_calls: turnToolCalls,
        });

        for (const tc of turnToolCalls) {
          const fnName = tc.function?.name;
          let fnArgs = tc.function?.arguments || {};
          if (typeof fnArgs === "string") {
            try {
              fnArgs = JSON.parse(fnArgs);
            } catch {
              fnArgs = {};
            }
          }

          // Emit tool call event so frontend displays Trophy badge
          sendEvent({
            type: "tool_call",
            tool: fnName,
            args: fnArgs,
          });

          // Execute tool against stats engine
          const toolResult = executeTool(fnName, fnArgs);

          // If tool output includes a structured stat table, emit table event
          if (toolResult.table) {
            sendEvent({
              type: "table",
              table: toolResult.table,
            });
          }

          // Append tool execution response to conversation
          conversation.push({
            role: "tool",
            content: JSON.stringify(toolResult),
          });
        }

        // Notify client that tool execution is complete and model will interpret
        sendEvent({
          type: "status",
          status: "interpreting",
        });

        // Continue loop to let the model interpret the tool outputs
        continue;
      }

      // Check if model emitted filler text promising action without invoking a tool
      const isFillerPromise =
        turns < maxTurns &&
        turnContent.length < 250 &&
        /(one moment|let me (search|retrieve|look|find|check)|searching now|i'll check|i will search|hold on)/i.test(
          turnContent
        );

      if (isFillerPromise) {
        conversation.push({
          role: "assistant",
          content: turnContent,
        });
        conversation.push({
          role: "user",
          content: "Please execute the tool call directly now without conversational filler.",
        });
        continue;
      }

      break;
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
  console.log(`  Soccer AI Match Analyst — Express Backend`);
  console.log(`  Listening on: http://localhost:${PORT} (0.0.0.0:${PORT})`);
  console.log(`  Ollama Target: ${OLLAMA_URL} (Model: ${DEFAULT_MODEL})`);
  console.log(`  Dataset: ${stats.rowCount()} player rows loaded`);
  console.log(`======================================================\n`);
});

