"use client";

import React from "react";

export interface TableData {
  columns: string[];
  rows: (string | number | null)[][];
}

interface StatTableProps {
  table: TableData;
}

function parsePercentile(cellValue: string | number | null) {
  if (typeof cellValue !== "string") return null;
  const match = cellValue.match(/^(.*?)\s*\((\d+)(?:st|nd|rd|th)\)$/i);
  if (!match) return null;
  return {
    value: match[1].trim(),
    percentile: parseInt(match[2], 10),
  };
}

function getPercentileBadgeClass(percentile: number) {
  if (percentile >= 90) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (percentile >= 75) {
    return "bg-sky-50 text-sky-700 border-sky-200";
  }
  if (percentile >= 50) {
    return "bg-indigo-50 text-indigo-700 border-indigo-200";
  }
  return "bg-zinc-100 text-zinc-600 border-zinc-200";
}

export function StatTable({ table }: StatTableProps) {
  if (!table || !table.columns || !table.rows || table.rows.length === 0) {
    return null;
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/60 text-muted-foreground">
              {table.columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`px-3.5 py-2.5 font-semibold tracking-wide ${
                    idx === 0 ? "text-foreground font-medium" : "text-right"
                  }`}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {table.rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="transition-colors hover:bg-muted/30"
              >
                {row.map((cell, cellIdx) => {
                  const parsed = parsePercentile(cell);
                  return (
                    <td
                      key={cellIdx}
                      className={`px-3.5 py-2 whitespace-nowrap ${
                        cellIdx === 0
                          ? "font-medium text-foreground"
                          : "text-right font-mono text-zinc-800"
                      }`}
                    >
                      {parsed ? (
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <span>{parsed.value}</span>
                          <span
                            className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${getPercentileBadgeClass(
                              parsed.percentile
                            )}`}
                          >
                            {parsed.percentile}%ile
                          </span>
                        </div>
                      ) : cell === null || cell === undefined ? (
                        <span className="text-muted-foreground">-</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
