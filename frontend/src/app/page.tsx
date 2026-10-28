"use client";

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
import { Bot, User, Send, Database, Trophy, RefreshCw } from "lucide-react";
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
/*  Helpers                                   */
/* ────────────────────────────────────────── */

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Lightweight markdown → HTML renderer */
function renderMarkdown(text: string): string {
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    )
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
    default:
      return tool;
  }
}

/* ────────────────────────────────────────── */
/*  Components                                */
/* ────────────────────────────────────────── */

function TypingIndicator({ activeTool }: { activeTool?: string | null }) {
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

function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";

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
            {message.toolCalls.map((tc, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
              >
                <Trophy className="size-3" />
                {formatToolName(tc.tool)}
                {tc.args && typeof tc.args.query === "string" && (
                  <span className="text-zinc-600">&quot;{tc.args.query}&quot;</span>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Text Body */}
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          message.content && (
            <div
              className="prose-chat whitespace-pre-wrap break-words"
              dangerouslySetInnerHTML={{
                __html: renderMarkdown(message.content),
              }}
            />
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

function WelcomeScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-8 text-center max-w-md mx-auto">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20">
        <Trophy className="size-6" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Soccer AI
      </h2>
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
  }, [messages, isLoading, activeTool, scrollToBottom]);

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
      setIsLoading(true);
      setActiveTool(null);

      const assistantId = generateId();

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
          const errorData = await res.json();
          throw new Error(errorData.error || `HTTP ${res.status}`);
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        let assistantContent = "";
        const toolCalls: ToolCallRecord[] = [];
        const tables: TableData[] = [];

        if (reader) {
          setMessages((prev) => [
            ...prev,
            {
              id: assistantId,
              role: "assistant",
              content: "",
              toolCalls: [],
              tables: [],
            },
          ]);

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk
              .split("\n")
              .filter((line) => line.startsWith("data: "));

            for (const line of lines) {
              const dataStr = line.slice(6).trim();
              if (dataStr === "[DONE]") break;

              try {
                const parsed = JSON.parse(dataStr);

                // Error event
                if (parsed.error) {
                  throw new Error(parsed.error);
                }

                // Tool execution started
                if (parsed.type === "tool_call") {
                  setActiveTool(parsed.tool);
                  toolCalls.push({ tool: parsed.tool, args: parsed.args });
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, toolCalls: [...toolCalls] }
                        : m
                    )
                  );
                }

                // Structured table event
                if (parsed.type === "table" && parsed.table) {
                  tables.push(parsed.table);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, tables: [...tables] }
                        : m
                    )
                  );
                }

                // Streaming text event (new protocol or legacy text)
                const textChunk =
                  parsed.type === "text" ? parsed.text : parsed.text;
                if (textChunk) {
                  setActiveTool(null);
                  assistantContent += textChunk;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, content: assistantContent }
                        : m
                    )
                  );
                }
              } catch (parseErr) {
                if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
                  console.warn("Chunk error:", parseErr.message);
                }
              }
            }
          }
        }
      } catch (err) {
        const errorText =
          err instanceof Error ? err.message : "Something went wrong";
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: `**Error:** ${errorText}`,
          },
        ]);
      } finally {
        setIsLoading(false);
        setActiveTool(null);
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

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Trophy className="size-4" />
          </div>
          <h1 className="text-sm font-semibold text-foreground">
            Soccer AI
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
          <WelcomeScreen />
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && <TypingIndicator activeTool={activeTool} />}
          </div>
        )}
      </ScrollArea>

      {/* ── Input Area ── */}
      <footer className="border-t border-border bg-surface px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-2xl items-end gap-2"
        >
          <div className="relative flex flex-1 items-end rounded-xl border border-border bg-background px-3 py-2 transition-colors focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/25">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              disabled={isLoading}
              rows={1}
              className="max-h-[160px] flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            size="icon"
            className="size-10 shrink-0 rounded-xl bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-30"
          >
            <Send className="size-4" />
          </Button>
        </form>
      </footer>
    </div>
  );
}
