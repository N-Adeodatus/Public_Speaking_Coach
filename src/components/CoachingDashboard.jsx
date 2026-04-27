import React, { useRef, useState, useEffect } from 'react';
import { MetricsPanel } from './MetricsPanel';
import { RealtimeGraph } from './RealtimeGraph';
import { FeedbackBoard } from './FeedbackBoard';
import { SessionHistory } from './SessionHistory';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Target, Mic, Square, Info, Check } from 'lucide-react';

export const CoachingDashboard = ({ activeThread, appendSession, updateThreadGoal }) => {
  const graphRef = useRef(null);
  const { startEngine, stopEngine, isRunning, metrics, feedback } = useAudioEngine(graphRef, activeThread, appendSession);
  const hasSessions = activeThread?.sessions?.length > 0;

  // ── Local goal state: prevents re-render focus loss ────────────────────────
  // We keep a local copy of the goal and only call the async updateThreadGoal
  // on blur or Enter, so every keystroke doesn't trigger a Puter write + re-render.
  const [localGoal, setLocalGoal]   = useState(activeThread?.goal ?? '');
  const [saved, setSaved]           = useState(false);
  const saveTimerRef                = useRef(null);

  // Sync local state when the active thread changes (e.g. user switches threads)
  useEffect(() => {
    setLocalGoal(activeThread?.goal ?? '');
    setSaved(false);
  }, [activeThread?.id]);

  const commitGoal = () => {
    const trimmed = localGoal.trim();
    if (trimmed === (activeThread?.goal ?? '')) return; // no change
    updateThreadGoal(activeThread.id, trimmed);
    setSaved(true);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaved(false), 2000);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.target.blur(); commitGoal(); }
    if (e.key === 'Escape') { setLocalGoal(activeThread?.goal ?? ''); e.target.blur(); }
  };

  return (
    <div className="w-full flex flex-col gap-6">

      {/* Thread Goal Input */}
      {activeThread && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <Target className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              Thread Goal
            </span>

            {/* Info tooltip */}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="ml-0.5 text-muted-foreground hover:text-foreground transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[260px] text-xs leading-relaxed">
                  <p className="font-semibold mb-1">What is a Thread Goal?</p>
                  <p>
                    It's a short description of what you're working on in this practice thread —
                    e.g. <em>"reduce filler words"</em> or <em>"stronger opening line"</em>.
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    The AI coach reads this before every session and tailors its feedback
                    and drills directly to your goal.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Saved indicator */}
            {saved && (
              <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-500 animate-in fade-in slide-in-from-right-2 duration-200">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
          </div>

          {/* Input */}
          <Input
            type="text"
            placeholder="e.g. Reduce filler words and open with a stronger first sentence…"
            value={localGoal}
            onChange={(e) => setLocalGoal(e.target.value)}
            onBlur={commitGoal}
            onKeyDown={handleKeyDown}
            className="border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm px-4 pb-3 pt-1 bg-transparent"
          />
        </div>
      )}

      {/* Elite Recording CTA */}
      <div className="flex justify-center mb-4 mt-2">
        {!isRunning ? (
          <Button
            onClick={startEngine}
            size="lg"
            className="h-16 px-12 rounded-full text-lg shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all gap-3"
          >
            <Mic className="h-6 w-6" />
            {hasSessions ? 'New Recording' : 'Start Recording'}
          </Button>
        ) : (
          <Button
            onClick={stopEngine}
            variant="destructive"
            size="lg"
            className="h-16 px-12 rounded-full text-lg shadow-lg shadow-destructive/25 animate-pulse gap-3"
          >
            <Square className="h-6 w-6 fill-current" />
            Stop Recording
          </Button>
        )}
      </div>

      <FeedbackBoard feedback={feedback} />
      <MetricsPanel {...metrics} />
      <RealtimeGraph ref={graphRef} />
      <SessionHistory activeThread={activeThread} />
    </div>
  );
};
