import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  BookOpen,
  Calculator,
  Target,
  Layers,
  Zap,
  Play,
  Timer,
  Accessibility,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Test } from '@/types/test';

export interface TestConfig {
  timeMultiplier: 1 | 1.5 | 2;
  scope: 'full' | 'rw_only' | 'math_only' | 'single_module';
  selectedModuleId?: number;
}

interface TestConfigDialogProps {
  test: Test | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (config: TestConfig) => void;
  isLoading?: boolean;
}

const TIME_OPTIONS = [
  { value: 1, label: 'Standard', desc: 'Official SAT timing', icon: Timer },
  { value: 1.5, label: 'Time and a Half', desc: '50% extended time', icon: Accessibility },
  { value: 2, label: 'Double Time', desc: '100% extended time', icon: Clock },
] as const;

const SCOPE_OPTIONS = [
  {
    value: 'full',
    label: 'Full Test',
    desc: 'All modules (RW + Math)',
    icon: Target,
    duration: '2h 14min',
    available: true,
  },
  {
    value: 'rw_only',
    label: 'Reading & Writing Only',
    desc: 'Both RW modules',
    icon: BookOpen,
    duration: '64 min',
    available: true,
  },
  {
    value: 'math_only',
    label: 'Math Only',
    desc: 'Both Math modules',
    icon: Calculator,
    duration: '70 min',
    available: true,
  },
  {
    value: 'single_module',
    label: 'Single Module',
    desc: 'Practice one module',
    icon: Zap,
    duration: '~32 min',
    available: true,
  },
] as const;

export function TestConfigDialog({
  test,
  open,
  onOpenChange,
  onStart,
  isLoading,
}: TestConfigDialogProps) {
  const [config, setConfig] = useState<TestConfig>({
    timeMultiplier: 1,
    scope: 'full',
  });

  const handleStart = () => {
    onStart(config);
  };

  // Calculate estimated time based on config
  const getEstimatedTime = () => {
    let baseMinutes = 134; // Full test
    switch (config.scope) {
      case 'rw_only':
        baseMinutes = 64;
        break;
      case 'math_only':
        baseMinutes = 70;
        break;
      case 'single_module':
        baseMinutes = 35;
        break;
    }
    const adjusted = baseMinutes * config.timeMultiplier;
    const hours = Math.floor(adjusted / 60);
    const mins = Math.round(adjusted % 60);
    return hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;
  };

  // Get available modules for single module selection
  const rwModules = test?.modules?.filter(m => m.section === 'reading_writing') || [];
  const mathModules = test?.modules?.filter(m => m.section === 'math') || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Play className="w-5 h-5 text-primary" />
            Start Practice Test
          </DialogTitle>
          <DialogDescription>
            Configure your test settings before starting. You can adjust timing and select which
            sections to practice.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Test Info */}
          {test && (
            <div className="p-4 bg-muted/30 rounded-lg border">
              <h3 className="font-semibold text-lg">{test.title}</h3>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Layers className="w-4 h-4" />
                  {test.module_count} modules
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen className="w-4 h-4" />
                  {test.total_questions} questions
                </span>
              </div>
            </div>
          )}

          {/* Time Accommodation */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Time Accommodation</Label>
            <RadioGroup
              value={String(config.timeMultiplier)}
              onValueChange={(v) =>
                setConfig((c) => ({ ...c, timeMultiplier: Number(v) as 1 | 1.5 | 2 }))
              }
              className="grid grid-cols-3 gap-3"
            >
              {TIME_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = config.timeMultiplier === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      'flex flex-col items-center p-4 rounded-xl border-2 cursor-pointer transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    )}
                  >
                    <RadioGroupItem value={String(option.value)} className="sr-only" />
                    <Icon
                      className={cn('w-6 h-6 mb-2', isSelected ? 'text-primary' : 'text-muted-foreground')}
                    />
                    <span className="font-medium text-sm">{option.label}</span>
                    <span className="text-xs text-muted-foreground mt-1">{option.desc}</span>
                  </label>
                );
              })}
            </RadioGroup>
          </div>

          {/* Test Scope */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">What to Practice</Label>
            <RadioGroup
              value={config.scope}
              onValueChange={(v) =>
                setConfig((c) => ({
                  ...c,
                  scope: v as TestConfig['scope'],
                  selectedModuleId: undefined,
                }))
              }
              className="grid grid-cols-2 gap-3"
            >
              {SCOPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = config.scope === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      'flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30',
                      !option.available && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <RadioGroupItem
                      value={option.value}
                      className="mt-1"
                      disabled={!option.available}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('w-4 h-4', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                        <span className="font-medium text-sm">{option.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{option.desc}</p>
                      <Badge variant="secondary" className="mt-2 text-xs">
                        {option.duration}
                      </Badge>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>
          </div>

          {/* Single Module Selection */}
          {config.scope === 'single_module' && (
            <div className="space-y-3 animate-in slide-in-from-top-2">
              <Label className="text-sm font-semibold">Select Module</Label>
              <div className="grid grid-cols-2 gap-3">
                {/* RW Modules */}
                <div className="space-y-2">
                  <span className="text-xs font-medium text-blue-600 flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> Reading & Writing
                  </span>
                  {rwModules.length > 0 ? (
                    rwModules.map((mod) => (
                      <button
                        key={mod.id}
                        onClick={() => setConfig((c) => ({ ...c, selectedModuleId: mod.id }))}
                        className={cn(
                          'w-full p-3 rounded-lg border text-left transition-all',
                          config.selectedModuleId === mod.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-border hover:border-blue-300'
                        )}
                      >
                        <span className="font-medium text-sm">
                          Module {mod.module === 'module_1' ? '1' : '2'}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          {mod.time_limit_minutes} min • {mod.questions?.length || 0} questions
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg">
                      No RW modules available
                    </div>
                  )}
                </div>
                
                {/* Math Modules */}
                <div className="space-y-2">
                  <span className="text-xs font-medium text-amber-600 flex items-center gap-1">
                    <Calculator className="w-3 h-3" /> Math
                  </span>
                  {mathModules.length > 0 ? (
                    mathModules.map((mod) => (
                      <button
                        key={mod.id}
                        onClick={() => setConfig((c) => ({ ...c, selectedModuleId: mod.id }))}
                        className={cn(
                          'w-full p-3 rounded-lg border text-left transition-all',
                          config.selectedModuleId === mod.id
                            ? 'border-amber-500 bg-amber-50'
                            : 'border-border hover:border-amber-300'
                        )}
                      >
                        <span className="font-medium text-sm">
                          Module {mod.module === 'module_1' ? '1' : '2'}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          {mod.time_limit_minutes} min • {mod.questions?.length || 0} questions
                        </span>
                      </button>
                    ))
                  ) : (
                    <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg">
                      No Math modules available
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="p-4 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl border">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm text-muted-foreground">Estimated Duration</span>
                <div className="text-2xl font-bold text-primary">{getEstimatedTime()}</div>
              </div>
              <div className="text-right">
                <span className="text-sm text-muted-foreground">Time Setting</span>
                <div className="font-medium">{config.timeMultiplier}x</div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleStart}
            disabled={
              isLoading || (config.scope === 'single_module' && !config.selectedModuleId)
            }
            className="btn-premium min-w-[140px]"
          >
            {isLoading ? (
              'Starting...'
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Start Test
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
