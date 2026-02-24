"use client";

import { useMemo } from "react";
import { diffLines } from "diff";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ConfigDiffProps {
  /** Original config JSON (before changes). */
  original: object;
  /** Modified config JSON (after changes). */
  modified: object;
  /** Optional title override. */
  title?: string;
}

interface DiffLine {
  content: string;
  type: "added" | "removed" | "unchanged";
}

/**
 * Render a visual line-by-line diff between two JSON configuration objects.
 *
 * If the two objects are identical, a compact card stating "No changes detected."
 * is rendered. Otherwise a card is rendered showing counts of added and removed lines
 * and a scrollable, color-coded diff where each line is prefixed with `+`, `-`, or a space.
 *
 * @param original - The original configuration object to compare.
 * @param modified - The modified configuration object to compare.
 * @param title - Optional title for the card; defaults to "Pending Changes".
 * @returns A React element containing either a "no changes" card or a color-coded, line-by-line diff view with added/removed counts.
 */
export function ConfigDiff({
  original,
  modified,
  title = "Pending Changes",
}: ConfigDiffProps) {
  const lines = useMemo<DiffLine[]>(() => {
    const originalText = JSON.stringify(original, null, 2);
    const modifiedText = JSON.stringify(modified, null, 2);

    if (originalText === modifiedText) return [];

    const changes = diffLines(originalText, modifiedText);
    const result: DiffLine[] = [];

    for (const change of changes) {
      const changeLines = change.value.replace(/\n$/, "").split("\n");
      for (const line of changeLines) {
        if (change.added) {
          result.push({ content: line, type: "added" });
        } else if (change.removed) {
          result.push({ content: line, type: "removed" });
        } else {
          result.push({ content: line, type: "unchanged" });
        }
      }
    }

    return result;
  }, [original, modified]);

  if (lines.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>No changes detected.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const addedCount = lines.filter((l) => l.type === "added").length;
  const removedCount = lines.filter((l) => l.type === "removed").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>
              Review your changes before saving.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-400">+{addedCount}</span>
            <span className="text-red-400">-{removedCount}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="overflow-x-auto rounded-md border bg-muted/30 font-mono text-sm"
          role="region"
          aria-label="Configuration diff"
        >
          <pre className="p-4">
            {lines.map((line, i) => (
              <div
                key={i}
                className={
                  line.type === "added"
                    ? "bg-green-500/15 text-green-400"
                    : line.type === "removed"
                      ? "bg-red-500/15 text-red-400"
                      : "text-muted-foreground"
                }
              >
                <span
                  className="mr-2 inline-block w-4 select-none text-right opacity-60"
                  aria-hidden="true"
                >
                  {line.type === "added"
                    ? "+"
                    : line.type === "removed"
                      ? "-"
                      : " "}
                </span>
                {line.content}
              </div>
            ))}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
