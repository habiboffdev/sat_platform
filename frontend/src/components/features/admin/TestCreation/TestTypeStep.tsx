/**
 * TestTypeStep - First step in test creation workflow
 * User selects between Linear and Adaptive test types
 */

import { motion } from 'framer-motion';
import { ArrowRight, Layers, GitBranch, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { TestMode } from '@/types/testCreation';

interface TestTypeStepProps {
  testMode: TestMode;
  testTitle: string;
  testDescription: string;
  onTestModeChange: (mode: TestMode) => void;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (desc: string) => void;
  onNext: () => void;
}

const testModeOptions: {
  mode: TestMode;
  icon: typeof Layers;
  title: string;
  description: string;
  features: string[];
  recommended: boolean;
}[] = [
  {
    mode: 'linear',
    icon: Layers,
    title: 'Linear Test',
    description: 'Standard practice test with fixed difficulty',
    features: [
      '4 modules (RW M1, RW M2, Math M1, Math M2)',
      'Fixed question order for all students',
      'Same difficulty for everyone',
      'Ideal for practice and review',
    ],
    recommended: true,
  },
  {
    mode: 'adaptive',
    icon: GitBranch,
    title: 'Adaptive Test',
    description: 'College Board style with difficulty branching',
    features: [
      '8 modules (3 difficulty variants for M2)',
      'Module 2 difficulty based on M1 performance',
      'More complex to set up',
      'Authentic SAT experience',
    ],
    recommended: false,
  },
];

export function TestTypeStep({
  testMode,
  testTitle,
  testDescription,
  onTestModeChange,
  onTitleChange,
  onDescriptionChange,
  onNext,
}: TestTypeStepProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col items-center justify-center p-8"
    >
      <div className="w-full max-w-4xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Create New Test</h1>
          <p className="text-muted-foreground">
            Choose the test type and enter basic information
          </p>
        </div>

        {/* Test Mode Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {testModeOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = testMode === option.mode;

            return (
              <motion.button
                key={option.mode}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onTestModeChange(option.mode)}
                className={cn(
                  'relative p-6 rounded-2xl border-2 text-left transition-all',
                  isSelected
                    ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                )}
              >
                {/* Recommended badge */}
                {option.recommended && (
                  <span className="absolute top-3 right-3 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    Recommended
                  </span>
                )}

                {/* Selection indicator */}
                <div
                  className={cn(
                    'absolute top-3 left-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-muted-foreground/30'
                  )}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                </div>

                <div className="pt-4 space-y-4">
                  {/* Icon and title */}
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{option.title}</h3>
                      <p className="text-sm text-muted-foreground">{option.description}</p>
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2">
                    {option.features.map((feature, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span
                          className={cn(
                            'w-1.5 h-1.5 rounded-full mt-1.5 shrink-0',
                            isSelected ? 'bg-primary' : 'bg-muted-foreground/50'
                          )}
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Test Metadata */}
        <div className="space-y-4 bg-card rounded-xl p-6 border">
          <h2 className="text-lg font-semibold">Test Information</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Test Title</Label>
              <Input
                id="title"
                placeholder="e.g., SAT Practice Test #1"
                value={testTitle}
                onChange={(e) => onTitleChange(e.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Add notes about this test..."
                value={testDescription}
                onChange={(e) => onDescriptionChange(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Continue Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            className="px-12 h-14 text-lg gap-2"
            onClick={onNext}
            disabled={!testTitle.trim()}
          >
            Continue to Upload
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
