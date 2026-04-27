import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { SummaryRenderer } from './SummaryRenderer';

export const FeedbackBoard = ({ feedback }) => {
  const { message, severity } = feedback || { message: 'Ready to listen.', severity: 'neutral' };

  const isAnalyzing  = message.includes('Analyzing session');
  const isStructured = /━━\s*.+?\s*━━/.test(message);

  let colorClass = 'text-foreground';
  let borderClass = 'border-border';
  let bgClass = 'bg-card';

  if (severity === 'green') {
    colorClass = 'text-emerald-500';
    borderClass = 'border-emerald-500/20';
    bgClass = 'bg-emerald-500/5';
  }
  if (severity === 'yellow') {
    colorClass = 'text-yellow-500';
    borderClass = 'border-yellow-500/20';
    bgClass = 'bg-yellow-500/5';
  }
  if (severity === 'red') {
    colorClass = 'text-destructive';
    borderClass = 'border-destructive/20';
    bgClass = 'bg-destructive/5';
  }

  // Adaptive text sizing based on length
  const textSizeClass = message.length > 120 ? 'text-base sm:text-lg font-normal'
    : message.length > 60 ? 'text-lg sm:text-xl font-medium'
    : 'text-2xl sm:text-3xl font-semibold tracking-tight';

  // ── Structured AI summary: left-aligned, sectioned layout ─────────────────
  if (isStructured) {
    return (
      <Card className="w-full border-border bg-card shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <SummaryRenderer text={message} />
        </CardContent>
      </Card>
    );
  }

  // ── Short status message: centred card ──────────────────────────────────────
  return (
    <Card className={`w-full transition-all duration-500 ${borderClass} ${bgClass} shadow-sm overflow-hidden`}>
      <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center min-h-[160px] text-center gap-4">
        {isAnalyzing && (
          <Loader2 className="h-8 w-8 text-yellow-500 animate-spin" />
        )}
        <p className={`leading-relaxed transition-all duration-300 ${colorClass} ${textSizeClass} ${isAnalyzing ? 'animate-pulse' : ''}`}>
          {isAnalyzing ? "Analyzing speech patterns and preparing your coaching summary..." : message}
        </p>
      </CardContent>
    </Card>
  );
};
