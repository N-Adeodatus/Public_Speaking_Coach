import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus, FolderOpen, Mic } from "lucide-react";
import { SummaryRenderer } from './SummaryRenderer';

const PAGE_SIZE = 3;

function formatDate(isoTimestamp) {
  try {
    const normalized = isoTimestamp.replace(/T(\d{2})-(\d{2})-(\d{2})-/, 'T$1:$2:$3.');
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(normalized));
  } catch {
    return isoTimestamp;
  }
}

function formatDuration(sec) {
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

function SessionCard({ session, index }) {
  const [expanded, setExpanded] = useState(false);

  const pauseCount   = session.pauses?.length ?? 0;
  const eventCount   = session.events?.length ?? 0;
  const summaryText  = session.aiSummary ?? null;
  // Strip ━━ section headers for a clean collapsed preview
  const cleanPreview = summaryText
    ? summaryText.replace(/━━[^━]+━━/g, '').replace(/[•\-]/g, '').replace(/\s+/g, ' ').trim()
    : null;
  const preview      = cleanPreview ? cleanPreview.slice(0, 160).trimEnd() + (cleanPreview.length > 160 ? '…' : '') : null;

  // Progress Intelligence heuristic
  let progressStatus = "Stable";
  let ProgressIcon = Minus;
  let badgeVariant = "secondary";
  let badgeColor = "text-muted-foreground";

  if (summaryText) {
    const lower = summaryText.toLowerCase();
    if (lower.includes("improved") || lower.includes("progress") || lower.includes("better") || lower.includes("reduced pauses")) {
      progressStatus = "Improved";
      ProgressIcon = TrendingUp;
      badgeVariant = "outline";
      badgeColor = "text-emerald-500 border-emerald-500/30 bg-emerald-500/10";
    } else if (lower.includes("regressed") || lower.includes("worse") || lower.includes("increased pauses")) {
      progressStatus = "Regressed";
      ProgressIcon = TrendingDown;
      badgeVariant = "outline";
      badgeColor = "text-destructive border-destructive/30 bg-destructive/10";
    }
  }

  return (
    <Card 
      className={`transition-all duration-200 cursor-pointer hover:border-primary/50 ${expanded ? 'border-primary/50 shadow-md' : 'shadow-sm'}`}
      onClick={() => setExpanded(!expanded)}
    >
      <CardContent className="p-5 flex flex-col gap-4">
        {/* Header row */}
        <div className="flex justify-between items-start gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 border border-primary/20">
              #{index}
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {formatDate(session.timestamp)}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                <Clock className="h-3 w-3" />
                {formatDuration(session.durationSec)} active speech
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {summaryText && (
              <Badge variant={badgeVariant} className={`gap-1 ${badgeColor}`}>
                <ProgressIcon className="h-3 w-3" />
                {progressStatus}
              </Badge>
            )}
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {/* Stat chips */}
        <div className="flex gap-2 flex-wrap">
          {eventCount > 0 && <Badge variant="secondary">{eventCount} phrases</Badge>}
          {pauseCount > 0 && <Badge variant="secondary">{pauseCount} pauses</Badge>}
          {!summaryText && <Badge variant="outline" className="text-muted-foreground">No AI summary</Badge>}
        </div>

        {/* Summary preview or full text */}
        {summaryText && (
          <div className="border-t border-border pt-4">
            {expanded
              ? <SummaryRenderer text={summaryText} />
              : <p className="text-sm leading-relaxed text-muted-foreground">{preview}</p>
            }
          </div>
        )}

        {/* Expanded pause breakdown */}
        {expanded && session.pauses?.length > 0 && (
          <div className="border-t border-border pt-3 mt-1">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2 font-semibold">
              Pause breakdown
            </div>
            <div className="flex gap-2 flex-wrap">
              {['micro','short','long','very_long'].map(cat => {
                const count = session.pauses.filter(p => p.category === cat).length;
                if (!count) return null;
                return (
                  <Badge key={cat} variant="outline" className="bg-primary/5 text-primary border-primary/20">
                    {count} {cat.replace('_',' ')}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const SessionHistory = ({ activeThread }) => {
  const [loaded, setLoaded] = useState(PAGE_SIZE);

  if (!activeThread) return null;

  const allSessions = activeThread.sessions || [];
  const totalCount = allSessions.length;
  const reversedSessions = [...allSessions].reverse();
  const visibleSessions = reversedSessions.slice(0, loaded);

  const handleLoadMore = () => setLoaded(prev => prev + PAGE_SIZE);

  return (
    <div className="mt-8">
      {/* Section header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
          <span className="text-xs uppercase tracking-widest font-semibold">
            Session History
          </span>
          {totalCount > 0 && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
              {totalCount} total
            </span>
          )}
        </div>
      </div>

      {/* Empty state */}
      {visibleSessions.length === 0 && (
        <div className="p-12 text-center rounded-xl border border-dashed border-border flex flex-col items-center justify-center gap-3 bg-card/50">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mic className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">No sessions yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Step up to the mic to record your first practice session.</p>
          </div>
        </div>
      )}

      {/* Session cards */}
      <div className="flex flex-col gap-3">
        {visibleSessions.map((s, i) => (
          <SessionCard key={s.timestamp ?? i} session={s} index={totalCount - i} />
        ))}
      </div>

      {/* Load more */}
      {visibleSessions.length > 0 && loaded < totalCount && (
        <Button
          onClick={handleLoadMore}
          variant="outline"
          className="w-full mt-4"
        >
          Show more ({totalCount - loaded} remaining)
        </Button>
      )}
    </div>
  );
};
