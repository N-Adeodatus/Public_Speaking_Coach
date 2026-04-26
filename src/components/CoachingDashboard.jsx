import React, { useRef } from 'react';
import { MetricsPanel } from './MetricsPanel';
import { RealtimeGraph } from './RealtimeGraph';
import { FeedbackBoard } from './FeedbackBoard';
import { SessionHistory } from './SessionHistory';
import { useAudioEngine } from '../hooks/useAudioEngine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Target, Mic, Square } from 'lucide-react';

export const CoachingDashboard = ({ activeThread, appendSession, updateThreadGoal }) => {
  const graphRef = useRef(null);
  const { startEngine, stopEngine, isRunning, metrics, feedback } = useAudioEngine(graphRef, activeThread, appendSession);
  const hasSessions = activeThread?.sessions?.length > 0;

  return (
    <div className="w-full flex flex-col gap-6">
      
      {/* Thread Goal Input */}
      {activeThread && (
        <div className="bg-card p-4 rounded-xl border border-border flex items-center gap-4 shadow-sm">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm whitespace-nowrap">
            <Target className="h-4 w-4" />
            <span>Thread Goal</span>
          </div>
          <Input
            type="text"
            placeholder="e.g. Reduce filler words and maintain eye contact..."
            value={activeThread.goal}
            onChange={(e) => updateThreadGoal(activeThread.id, e.target.value)}
            className="flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm"
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
