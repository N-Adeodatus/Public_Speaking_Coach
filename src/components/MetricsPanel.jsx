import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Radio, Volume2, Mic } from "lucide-react";

export const MetricsPanel = ({ f0, cv, rms, isVoiced }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="bg-card shadow-sm border-border">
        <CardContent className="p-6 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between text-muted-foreground mb-4">
            <span className="text-xs tracking-wider uppercase font-semibold">Pitch (F0)</span>
            <Radio className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-mono font-bold text-foreground">
              {typeof f0 === 'number' && f0 > 0 ? f0.toFixed(1) : '—'}
            </span>
            <span className="text-sm text-muted-foreground">Hz</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card shadow-sm border-border">
        <CardContent className="p-6 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between text-muted-foreground mb-4">
            <span className="text-xs tracking-wider uppercase font-semibold">Pitch Variance</span>
            <Activity className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-mono font-bold text-foreground">
              {typeof cv === 'number' ? cv.toFixed(3) : '—'}
            </span>
            <span className="text-sm text-muted-foreground">CV</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card shadow-sm border-border">
        <CardContent className="p-6 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between text-muted-foreground mb-4">
            <span className="text-xs tracking-wider uppercase font-semibold">Loudness</span>
            <Volume2 className="h-4 w-4" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-mono font-bold text-foreground">
              {typeof rms === 'number' ? rms.toFixed(4) : '—'}
            </span>
            <span className="text-sm text-muted-foreground">RMS</span>
          </div>
        </CardContent>
      </Card>

      <Card className={`bg-card shadow-sm border-border transition-colors ${isVoiced ? 'border-primary/50 bg-primary/5' : ''}`}>
        <CardContent className="p-6 flex flex-col justify-between h-full">
          <div className="flex items-center justify-between text-muted-foreground mb-4">
            <span className="text-xs tracking-wider uppercase font-semibold">Voice Activity</span>
            <Mic className={`h-4 w-4 ${isVoiced ? 'text-primary' : ''}`} />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className={`h-3 w-3 rounded-full ${isVoiced ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
            <span className={`text-lg font-semibold ${isVoiced ? 'text-primary' : 'text-muted-foreground'}`}>
              {isVoiced ? 'Speaking' : 'Silence'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
