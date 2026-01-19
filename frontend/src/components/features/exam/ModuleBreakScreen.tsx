import { useState, useEffect, useCallback } from 'react';
import { Coffee, Clock, Play, Calculator, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SATSection } from '@/types/test';

interface ModuleBreakScreenProps {
  breakDuration: number; // in seconds
  onContinue: () => void;
  previousSection: SATSection;
}

export function ModuleBreakScreen({
  breakDuration,
  onContinue,
  previousSection: _previousSection,
}: ModuleBreakScreenProps) {
  const [timeRemaining, setTimeRemaining] = useState(breakDuration);
  const [isBreakEnded, setIsBreakEnded] = useState(false);

  useEffect(() => {
    if (timeRemaining <= 0) {
      setIsBreakEnded(true);
      return;
    }

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          setIsBreakEnded(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const getProgressPercent = () => {
    return ((breakDuration - timeRemaining) / breakDuration) * 100;
  };

  return (
    <div className="exam-container bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="exam-header">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Coffee className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Break Time</div>
            <div className="text-xs text-white/60">
              Between Section 1 and Section 2
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/10 rounded-full px-5 py-2">
          <Clock className="w-4 h-4 text-white/60" />
          <span className="exam-timer text-2xl">{formatTime(timeRemaining)}</span>
        </div>

        <div className="w-32" />
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full text-center">
          {/* Completion Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 text-green-700 mb-6">
            <BookOpen className="w-4 h-4" />
            <span className="text-sm font-medium">
              Section 1: Reading and Writing Complete
            </span>
          </div>

          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
            <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
              <Coffee className="w-10 h-10 text-blue-600" />
            </div>

            <h1 className="text-3xl font-bold text-slate-900 mb-4">
              {isBreakEnded ? 'Break Ended' : 'Take a Break'}
            </h1>

            <p className="text-lg text-muted-foreground mb-8 max-w-md mx-auto">
              {isBreakEnded
                ? 'Your break is over. Click continue when you\'re ready to start the Math section.'
                : 'You have 10 minutes to rest before starting the Math section. You can resume early if you\'re ready.'}
            </p>

            {/* Progress Bar */}
            <div className="relative h-2 bg-slate-100 rounded-full mb-4 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-blue-600 rounded-full transition-all duration-1000"
                style={{ width: `${getProgressPercent()}%` }}
              />
            </div>

            <p className="text-sm text-muted-foreground mb-8">
              {isBreakEnded
                ? 'Break complete'
                : `${formatTime(timeRemaining)} remaining`}
            </p>

            {/* Next Section Preview */}
            <div className="bg-slate-50 rounded-xl p-6 mb-8">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-slate-900">Up Next: Section 2</div>
                  <div className="text-sm text-muted-foreground">Math</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-white rounded-lg p-3">
                  <div className="text-muted-foreground">Duration</div>
                  <div className="font-semibold">70 minutes</div>
                </div>
                <div className="bg-white rounded-lg p-3">
                  <div className="text-muted-foreground">Questions</div>
                  <div className="font-semibold">44 questions</div>
                </div>
              </div>
            </div>

            {/* Continue Button */}
            <Button
              onClick={onContinue}
              size="lg"
              className={cn(
                'rounded-full px-8 text-lg',
                isBreakEnded
                  ? 'bg-[hsl(var(--exam-highlight))] hover:bg-[hsl(var(--exam-highlight))]/90 animate-pulse'
                  : ''
              )}
            >
              <Play className="w-5 h-5 mr-2" />
              {isBreakEnded ? 'Start Math Section' : 'Resume Early'}
            </Button>
          </div>

          {/* Tips */}
          <div className="grid grid-cols-3 gap-4 text-left">
            <div className="bg-white/80 rounded-xl p-4">
              <div className="text-2xl mb-2">💧</div>
              <div className="font-medium text-sm">Stay Hydrated</div>
              <div className="text-xs text-muted-foreground">
                Take a sip of water
              </div>
            </div>
            <div className="bg-white/80 rounded-xl p-4">
              <div className="text-2xl mb-2">🧘</div>
              <div className="font-medium text-sm">Relax</div>
              <div className="text-xs text-muted-foreground">
                Take some deep breaths
              </div>
            </div>
            <div className="bg-white/80 rounded-xl p-4">
              <div className="text-2xl mb-2">👀</div>
              <div className="font-medium text-sm">Rest Your Eyes</div>
              <div className="text-xs text-muted-foreground">
                Look away from screen
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
