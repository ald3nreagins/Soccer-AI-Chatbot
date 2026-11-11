"use client";

// v2.2 changes (after Project 5 usability testing):
//   - Welcome screen: starter questions + what data the bot covers (Ctrl+F "STARTER_QUESTIONS")
//   - Stream reader buffers partial lines, so text split across network chunks is no longer dropped
//   - Backend error events now show in the chat instead of failing silently
//   - Tool badges for compare_teams and for multi-team / multi-player comparisons
//   - Markdown renderer escapes HTML first (safer) and renders "- " lines as bullets
//   - Renamed "Soccer AI" / "Match Analyst" to PitchSide AI

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, User, Send, Database, Trophy, RefreshCw, Loader2 } from "lucide-react";
import { StatTable, type TableData } from "@/components/stat-table";

/* ────────────────────────────────────────── */
/*  Types                                     */
/* ────────────────────────────────────────── */

interface ToolCallRecord {
  tool: string;
  args?: Record<string, unknown>;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallRecord[];
  tables?: TableData[];
}

/* ────────────────────────────────────────── */
/*  Starter questions & data coverage         */
/* ────────────────────────────────────────── */

// Each one shows off a different feature. Clicking a button sends the question.
const STARTER_QUESTIONS = [
  "What does xG mean?",
  "Did Brighton or Aston Villa have the better attack?",
  "Compare Saka and Palmer this season",
  "Who leads the Premier League in xA?",
];

const DATA_COVERAGE_TEXT =
  "Player stats from Europe's top five leagues (2024–25 to 2026–27) and team stats for five Premier League clubs (2020–21).";

/* ────────────────────────────────────────── */
/*  Helpers                                   */
/* ────────────────────────────────────────── */

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Lightweight markdown → HTML renderer (escapes HTML first) */
function renderMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    )
    .replace(/^- (.*)$/gm, "• $1")
    .replace(/\n/g, "<br/>");
}

function formatToolName(tool: string): string {
  switch (tool) {
    case "search_players":
      return "Player Database Search";
    case "get_player_report":
      return "Understat Player Profile";
    case "compare_players":
      return "Head-to-Head Comparison Engine";
    case "get_leaders":
      return "League Metric Leaderboard";
    case "get_team_report":
      return "Team Tactical Analysis";
    case "compare_teams":
      return "Team Comparison Engine";
    default:
      return tool;
  }
}

/** Short label of what a tool was asked about, e.g. "Brighton vs Aston Villa" */
function toolArgLabel(args?: Record<string, unknown>): string | null {
  if (!args) return null;
  for (const key of ["teams", "players"]) {
    const v = args[key];
    if (Array.isArray(v) && v.length) return v.map(String).join(" vs ");
  }
  for (const key of ["query", "player", "team", "metric"]) {
    const v = args[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

/* ────────────────────────────────────────── */
/*  Components                                */
/* ────────────────────────────────────────── */

function TypingIndicator({
  activeTool,
  statusText,
}: {
  activeTool?: string | null;
  statusText?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 animate-message-in">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
        <Bot className="size-4" />
      </div>
      <div className="flex flex-col gap-2">
        {activeTool ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 animate-pulse-subtle">
            <Database className="size-3.5 animate-spin" />
            <span>Querying {formatToolName(activeTool)}...</span>
          </div>
        ) : statusText ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 animate-pulse-subtle">
            <Loader2 className="size-3.5 animate-spin" />
            <span>{statusText}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-3 dot-animation border border-border">
            <span className="block size-2 rounded-full bg-muted-foreground" />
            <span className="block size-2 rounded-full bg-muted-foreground" />
            <span className="block size-2 rounded-full bg-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

function ChatMessage({
  message,
  isStreaming,
}: {
  message: Message;
  isStreaming?: boolean;
}) {
  const isUser = message.role === "user";

  const hasContent = Boolean(message.content && message.content.trim());
  const hasToolCalls = Boolean(message.toolCalls && message.toolCalls.length > 0);
  const hasTables = Boolean(message.tables && message.tables.length > 0);

  // Do not render empty assistant container while waiting for response
  if (!isUser && !hasContent && !hasToolCalls && !hasTables) {
    return null;
  }

  return (
    <div
      className={`flex items-start gap-3 animate-message-in ${isUser ? "flex-row-reverse" : ""
        }`}
    >
      {/* Avatar */}
      <div
        className={`flex size-8 shrink-0 items-center justify-center rounded-full ${isUser
          ? "bg-bubble-user text-white"
          : "bg-primary/10 text-primary border border-primary/20"
          }`}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      {/* Bubble Content */}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser
          ? "rounded-tr-sm bg-bubble-user text-white"
          : "rounded-tl-sm bg-surface-2 text-foreground border border-border"
          }`}
      >
        {/* Render executed tool badges */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5 border-b border-border pb-2">
            {message.toolCalls.map((tc, idx) => {
              const label = toolArgLabel(tc.args);
              return (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                >
                  <Trophy className="size-3" />
                  {formatToolName(tc.tool)}
                  {label && <span className="text-zinc-600">&quot;{label}&quot;</span>}
                </span>
              );
            })}
          </div>
        )}

        {/* Text Body */}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          message.content && (
            <div className="prose-chat break-words">
              <span
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(message.content),
                }}
              />
              {isStreaming && (
                <span className="inline-block w-1.5 h-3.5 ml-1 bg-emerald-600 animate-pulse align-middle rounded-sm" />
              )}
            </div>
          )
        )}

        {/* Structured Stat Tables */}
        {!isUser && message.tables && message.tables.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.tables.map((tbl, idx) => (
              <StatTable key={idx} table={tbl} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WelcomeScreen({
  onAsk,
  disabled,
}: {
  onAsk: (question: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center max-w-xl mx-auto">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
        <Trophy className="size-6" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          PitchSide AI
        </h2>
        <p className="text-sm text-muted-foreground">
          Ask about any stat, player, or team in plain English. Try one of these to start:
        </p>
      </div>

      <div className="grid w-full gap-2 sm:grid-cols-2">
        {STARTER_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onAsk(q)}
            disabled={disabled}
            className="rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Database className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <span className="font-medium">Data:</span> {DATA_COVERAGE_TEXT}
        </span>
      </p>
    </div>
  );
}

/* ────────────────────────────────────────── */
/*  Main Page                                 */
/* ────────────────────────────────────────── */

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [activeAssistantId, setActiveAssistantId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector(
        "[data-slot='scroll-area-viewport']"
      );
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, activeTool, statusText, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "0";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [input]);

  // Send message
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: trimmed,
      };
      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInput("");
      const assistantId = generateId();
      setActiveAssistantId(assistantId);
      setIsLoading(true);
      setActiveTool(null);
      setStatusText(null);

      // Adds the assistant message, or updates it if it already exists.
      const upsertAssistant = (patch: Partial<Message>) => {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === assistantId);
          if (exists) {
            return prev.map((m) => (m.id === assistantId ? { ...m, ...patch } : m));
          }
          return [
            ...prev,
            { id: assistantId, role: "assistant", content: "", toolCalls: [], tables: [], ...patch },
          ];
        });
      };

      let assistantContent = "";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (!res.ok) {
          let message = `HTTP ${res.status}`;
          try {
            const errorData = await res.json();
            message = errorData.error || message;
          } catch {
            // response was not JSON
          }
          throw new Error(message);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        const toolCalls: ToolCallRecord[] = [];
        const tables: TableData[] = [];
        let backendError: string | null = null;
        let buffer = "";

        if (reader) {
          upsertAssistant({});

          let finished = false;
          while (!finished) {
            const { done, value } = await reader.read();
            if (done) break;

            // Keep any partial line in the buffer until the rest arrives.
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const dataStr = line.slice(6).trim();
              if (dataStr === "[DONE]") {
                finished = true;
                break;
              }

              let parsed;
              try {
                parsed = JSON.parse(dataStr);
              } catch {
                console.warn("Skipped malformed chunk");
                continue;
              }

              // Error event from backend
              if (parsed.error) {
                backendError = String(parsed.error);
                continue;
              }

              // Tool execution started
              if (parsed.type === "tool_call") {
                setActiveTool(parsed.tool);
                setStatusText(null);
                toolCalls.push({ tool: parsed.tool, args: parsed.args });
                upsertAssistant({ toolCalls: [...toolCalls] });
              }

              // Structured table event
              if (parsed.type === "table" && parsed.table) {
                setActiveTool(null);
                setStatusText("Analyzing statistics...");
                tables.push(parsed.table);
                upsertAssistant({ tables: [...tables] });
              }

              // Status event from backend
              if (parsed.type === "status") {
                setActiveTool(null);
                setStatusText(
                  parsed.status === "interpreting"
                    ? "Interpreting metrics..."
                    : parsed.status
                );
              }

              // Streaming text event
              if (parsed.type === "text" && parsed.text) {
                setActiveTool(null);
                setStatusText(null);
                assistantContent += parsed.text;
                upsertAssistant({ content: assistantContent });
              }
            }
          }
        }

        if (backendError) throw new Error(backendError);
      } catch (err) {
        const errorText =
          err instanceof Error ? err.message : "Something went wrong";
        const prefix = assistantContent ? `${assistantContent}\n\n` : "";
        upsertAssistant({ content: `${prefix}**Error:** ${errorText}` });
      } finally {
        setIsLoading(false);
        setActiveTool(null);
        setStatusText(null);
        setActiveAssistantId(null);
        textareaRef.current?.focus();
      }
    },
    [isLoading, messages]
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
    setActiveTool(null);
    textareaRef.current?.focus();
  };

  const hasMessages = messages.length > 0;
  const currentAssistantMsg = messages.find((m) => m.id === activeAssistantId);
  const hasStreamingText = Boolean(currentAssistantMsg?.content?.trim());

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Trophy className="size-4" />
          </div>
          <h1 className="text-sm font-semibold text-foreground">
            PitchSide AI
          </h1>
        </div>

        {hasMessages && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearChat}
            className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1.5"
          >
            <RefreshCw className="size-3" />
            Clear
          </Button>
        )}
      </header>

      {/* ── Chat Area ── */}
      <ScrollArea ref={scrollRef} className="flex-1">
        {!hasMessages ? (
          <WelcomeScreen onAsk={sendMessage} disabled={isLoading} />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
            {messages.map((msg) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                isStreaming={isLoading && msg.id === activeAssistantId}
              />
            ))}
            {isLoading && !hasStreamingText && (
              <TypingIndicator
                activeTool={activeTool}
                statusText={statusText}
              />
            )}
          </div>
        )}
      </ScrollArea>

      {/* ── Input Area ── */}
      <footer className="border-t border-border bg-surface px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <div
            className={`relative flex flex-1 items-end rounded-xl border transition-colors px-3 py-2 ${
              isLoading
                ? "border-border/60 bg-muted/40 cursor-not-allowed opacity-75"
                : "border-border bg-background focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/25"
            }`}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isLoading
                  ? "PitchSide AI is answering..."
                  : "Ask about a stat, player, or team..."
              }
              disabled={isLoading}
              rows={1}
              className={`max-h-[160px] flex-1 resize-none bg-transparent text-sm text-foreground outline-none transition-opacity ${
                isLoading
                  ? "cursor-not-allowed placeholder:text-muted-foreground/70"
                  : "placeholder:text-muted-foreground"
              }`}
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            size="icon"
            className="size-10 shrink-0 rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-30"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </form>
      </footer>
    </div>
  );
}