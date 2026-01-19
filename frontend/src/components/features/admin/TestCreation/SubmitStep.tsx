/**
 * SubmitStep - Final step in test creation workflow
 * User reviews the test summary and submits to create the test
 */

// React hooks can be imported here as needed
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  CheckCircle2,
  FileText,
  Clock,
  HelpCircle,
  Layers,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { ParsedQuestion, TestMode, ModuleWithQuestions } from '@/types/testCreation';
import { validateQuestion } from '@/types/testCreation';

interface SubmitStepProps {
  testTitle: string;
  testDescription: string;
  testMode: TestMode;
  questions: ParsedQuestion[];
  separators: number[];
  modulesWithQuestions: ModuleWithQuestions[];
  isSubmitting: boolean;
  submitError: string | null;
  onSubmit: () => Promise<void>;
  onPrev: () => void;
  createdTestId?: number;
}

export function SubmitStep({
  testTitle,
  testDescription,
  testMode,
  questions,
  modulesWithQuestions,
  isSubmitting,
  submitError,
  onSubmit,
  onPrev,
  createdTestId,
}: SubmitStepProps) {
  // Calculate validation stats
  const validationStats = questions.reduce(
    (acc, q) => {
      const validation = validateQuestion(q);
      if (validation.valid) acc.valid++;
      if (validation.issues.includes('Missing correct answer')) acc.needsAnswer++;
      if (validation.issues.includes('May need an image')) acc.needsImage++;
      return acc;
    },
    { valid: 0, needsAnswer: 0, needsImage: 0 }
  );

  const validPercentage = Math.round((validationStats.valid / questions.length) * 100);
  const canSubmit = validationStats.needsAnswer === 0 && questions.length > 0;

  // Calculate total time
  const totalTime = modulesWithQuestions.reduce(
    (acc, m) => acc + m.definition.timeLimit,
    0
  );

  if (createdTestId) {
    // Success state
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="h-full flex flex-col items-center justify-center p-8"
      >
        <div className="text-center space-y-6 max-w-md">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto"
          >
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </motion.div>

          <h1 className="text-3xl font-bold">Test Created Successfully!</h1>
          <p className="text-muted-foreground">
            Your test "{testTitle}" has been created with {questions.length} questions
            across {modulesWithQuestions.length} modules.
          </p>

          <div className="flex gap-3 justify-center pt-4">
            <Button variant="outline" asChild>
              <a href="/admin/tests">
                <FileText className="w-4 h-4 mr-2" />
                View All Tests
              </a>
            </Button>
            <Button asChild>
              <a href={`/admin/tests/${createdTestId}`}>
                View Test
                <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Review & Submit</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Review your test configuration before creating
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant={canSubmit ? 'default' : 'destructive'}
              className="px-3 py-1"
            >
              {canSubmit ? 'Ready to Submit' : 'Issues Found'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Test Info Card */}
          <div className="bg-card border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Test Information</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <InfoItem label="Title" value={testTitle} />
              <InfoItem
                label="Type"
                value={testMode === 'linear' ? 'Linear Test' : 'Adaptive Test'}
              />
              <InfoItem label="Total Questions" value={String(questions.length)} />
              <InfoItem label="Total Time" value={`${totalTime} minutes`} icon={Clock} />
            </div>
            {testDescription && (
              <div className="mt-4 pt-4 border-t">
                <span className="text-sm text-muted-foreground">Description:</span>
                <p className="mt-1 text-sm">{testDescription}</p>
              </div>
            )}
          </div>

          {/* Module Breakdown */}
          <div className="bg-card border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Module Breakdown</h2>
            <div className="space-y-3">
              {modulesWithQuestions.map((mwq) => {
                const moduleQuestions = mwq.questions;
                const needsAnswer = moduleQuestions.filter(
                  (q) =>
                    !q.correct_answer ||
                    q.correct_answer.length === 0 ||
                    q.correct_answer[0]?.includes('NEED_ANSWER')
                ).length;
                const isValid = needsAnswer === 0;

                return (
                  <div
                    key={mwq.definition.id}
                    className={cn(
                      'flex items-center justify-between p-4 rounded-xl border',
                      mwq.definition.bgColor,
                      mwq.definition.borderColor
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center',
                          mwq.definition.color.replace('text-', 'bg-').replace('600', '100')
                        )}
                      >
                        <Layers className={cn('w-5 h-5', mwq.definition.color)} />
                      </div>
                      <div>
                        <h3 className={cn('font-semibold', mwq.definition.color)}>
                          {mwq.definition.label}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {mwq.questions.length} questions • {mwq.definition.timeLimit} min
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {needsAnswer > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <HelpCircle className="w-3 h-3" />
                          {needsAnswer} missing
                        </Badge>
                      )}
                      {isValid && <Check className="w-5 h-5 text-green-600" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Validation Summary */}
          <div className="bg-card border rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Validation Summary</h2>

            <div className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Questions validated</span>
                  <span className="font-medium">
                    {validationStats.valid}/{questions.length} ({validPercentage}%)
                  </span>
                </div>
                <Progress value={validPercentage} className="h-2" />
              </div>

              {/* Issue breakdown */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <ValidationItem
                  label="Missing Answers"
                  count={validationStats.needsAnswer}
                  type="error"
                />
                <ValidationItem
                  label="May Need Images"
                  count={validationStats.needsImage}
                  type="warning"
                />
              </div>

              {/* Warning messages */}
              {validationStats.needsAnswer > 0 && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Cannot submit</p>
                    <p className="text-sm opacity-90">
                      {validationStats.needsAnswer} questions are missing correct answers.
                      Please go back and add answers to all questions.
                    </p>
                  </div>
                </div>
              )}

              {validationStats.needsImage > 0 && validationStats.needsAnswer === 0 && (
                <div className="bg-amber-50 text-amber-700 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Optional: Some questions may need images</p>
                    <p className="text-sm opacity-90">
                      {validationStats.needsImage} questions reference graphs or figures but
                      don't have images attached. You can still submit.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Error message */}
          {submitError && (
            <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Submission Failed</p>
                <p className="text-sm opacity-90">{submitError}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer navigation */}
      <div className="px-6 py-4 border-t bg-card shrink-0 flex justify-between">
        <Button variant="outline" size="lg" onClick={onPrev} disabled={isSubmitting} className="gap-2">
          <ArrowLeft className="w-5 h-5" />
          Back to Review
        </Button>

        <Button
          size="lg"
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          className="gap-2 px-8 min-w-[180px]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating Test...
            </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Create Test
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}

interface InfoItemProps {
  label: string;
  value: string;
  icon?: typeof Clock;
}

function InfoItem({ label, value, icon: Icon }: InfoItemProps) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
        <span className="font-medium">{value}</span>
      </div>
    </div>
  );
}

interface ValidationItemProps {
  label: string;
  count: number;
  type: 'error' | 'warning';
}

function ValidationItem({ label, count, type }: ValidationItemProps) {
  const isError = type === 'error';
  const hasIssue = count > 0;

  return (
    <div
      className={cn(
        'p-3 rounded-lg flex items-center justify-between',
        hasIssue
          ? isError
            ? 'bg-red-50 text-red-700'
            : 'bg-amber-50 text-amber-700'
          : 'bg-green-50 text-green-700'
      )}
    >
      <span className="text-sm font-medium">{label}</span>
      <Badge
        variant={hasIssue ? (isError ? 'destructive' : 'outline') : 'default'}
        className={cn(!hasIssue && 'bg-green-600')}
      >
        {count}
      </Badge>
    </div>
  );
}
