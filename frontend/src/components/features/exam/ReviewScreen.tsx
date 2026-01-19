import { useState, useEffect, useCallback } from 'react';
import { useExamStore } from '@/store/exam';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Flag,
  Loader2,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ReviewScreenProps {
  onClose: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
}

export function ReviewScreen({ onClose, onSubmit, isSubmitting }: ReviewScreenProps) {
  const { currentModule, currentQuestionIndex, setQuestionIndex, answers, flags, timeLeft, tickTimer } =
    useExamStore();
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // Continue timer in review mode
  useEffect(() => {
    const timer = setInterval(tickTimer, 1000);
    return () => clearInterval(timer);
  }, [tickTimer]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  if (!currentModule) return null;

  const questions = currentModule.questions;
  const totalQuestions = questions.length;
  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const flaggedCount = questions.filter((q) => flags[q.id]).length;
  const unansweredCount = totalQuestions - answeredCount;

  const handleQuestionClick = (index: number) => {
    setQuestionIndex(index);
    onClose();
  };

  const handleSubmitClick = () => {
    if (unansweredCount > 0 || flaggedCount > 0) {
      setShowSubmitConfirm(true);
    } else {
      onSubmit();
    }
  };

  const getQuestionStatus = (questionId: number, index: number) => {
    const isAnswered = !!answers[questionId];
    const isFlagged = !!flags[questionId];
    const isCurrent = index === currentQuestionIndex;
    return { isAnswered, isFlagged, isCurrent };
  };

  const getSectionTitle = () => {
    if (currentModule.section === 'reading_writing') {
      return 'Section 1: Reading and Writing';
    }
    return 'Section 2: Math';
  };

  const getModuleTitle = () => {
    return currentModule.module === 'module_1' ? 'Module 1' : 'Module 2';
  };

  return (
    <div className="exam-container bg-slate-50">
      {/* Header */}
      <header className="exam-header">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white hover:bg-white/10 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Questions
          </Button>
          <div className="h-6 w-px bg-white/20" />
          <div>
            <div className="text-sm font-medium">{getSectionTitle()}</div>
            <div className="text-xs text-white/60">{getModuleTitle()}</div>
          </div>
        </div>

        {/* Timer */}
        <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5">
          <span
            className={cn(
              'exam-timer',
              timeLeft <= 60 && 'critical',
              timeLeft > 60 && timeLeft <= 300 && 'warning'
            )}
          >
            {formatTime(timeLeft)}
          </span>
        </div>

        <div className="w-32" /> {/* Spacer for centering */}
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900">Check Your Work</h1>
            <p className="text-muted-foreground mt-2">
              Review your answers before submitting. Click any question to return to it.
            </p>
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl p-6 border shadow-sm text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-600">Answered</span>
              </div>
              <div className="text-3xl font-bold text-slate-900">{answeredCount}</div>
              <div className="text-sm text-muted-foreground">of {totalQuestions}</div>
            </div>

            <div className="bg-white rounded-xl p-6 border shadow-sm text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Circle className="w-5 h-5 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">Unanswered</span>
              </div>
              <div className="text-3xl font-bold text-slate-900">{unansweredCount}</div>
              <div className="text-sm text-muted-foreground">questions</div>
            </div>

            <div className="bg-white rounded-xl p-6 border shadow-sm text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Flag className="w-5 h-5 text-red-500 fill-current" />
                <span className="text-sm font-medium text-red-600">For Review</span>
              </div>
              <div className="text-3xl font-bold text-slate-900">{flaggedCount}</div>
              <div className="text-sm text-muted-foreground">flagged</div>
            </div>
          </div>

          {/* Question Grid */}
          <div className="bg-white rounded-xl border shadow-sm p-6 mb-8">
            <h2 className="font-semibold text-lg mb-4">Question Overview</h2>
            <div className="grid grid-cols-9 sm:grid-cols-10 md:grid-cols-14 gap-2">
              {questions.map((question, index) => {
                const { isAnswered, isFlagged, isCurrent } = getQuestionStatus(
                  question.id,
                  index
                );

                return (
                  <button
                    key={question.id}
                    onClick={() => handleQuestionClick(index)}
                    className={cn(
                      'exam-navigator-item hover:scale-105 transition-transform',
                      isAnswered && 'answered',
                      isFlagged && 'flagged',
                      isCurrent && 'current'
                    )}
                    title={`Question ${index + 1}${isAnswered ? ' - Answered' : ' - Unanswered'}${isFlagged ? ' - Flagged' : ''}`}
                  >
                    {index + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-6 pt-6 border-t text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded border-2 bg-[hsl(var(--exam-header))]" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded border-2" />
                <span>Unanswered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded border-2 relative">
                  <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full" />
                </div>
                <span>For Review</span>
              </div>
            </div>
          </div>

          {/* Unanswered Questions List */}
          {unansweredCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-amber-900">Unanswered Questions</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    Questions{' '}
                    {questions
                      .map((q, i) => (!answers[q.id] ? i + 1 : null))
                      .filter(Boolean)
                      .join(', ')}{' '}
                    have not been answered.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Flagged Questions List */}
          {flaggedCount > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8">
              <div className="flex items-start gap-3">
                <Flag className="w-5 h-5 text-red-600 fill-current mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-red-900">Flagged for Review</h3>
                  <p className="text-sm text-red-700 mt-1">
                    Questions{' '}
                    {questions
                      .map((q, i) => (flags[q.id] ? i + 1 : null))
                      .filter(Boolean)
                      .join(', ')}{' '}
                    are flagged for review.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="exam-footer">
        <Button variant="outline" onClick={onClose} className="rounded-full px-6">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Return to Questions
        </Button>

        <div className="text-sm text-muted-foreground">
          {answeredCount} of {totalQuestions} answered
        </div>

        <Button
          onClick={handleSubmitClick}
          disabled={isSubmitting}
          className="rounded-full px-6 bg-[hsl(var(--exam-highlight))] hover:bg-[hsl(var(--exam-highlight))]/90"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              Submit Module
              <ChevronRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </footer>

      {/* Submit Confirmation Dialog */}
      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Submit Module?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-4">
                {unansweredCount > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-lg text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      You have <strong>{unansweredCount}</strong> unanswered{' '}
                      {unansweredCount === 1 ? 'question' : 'questions'}.
                    </span>
                  </div>
                )}
                {flaggedCount > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg text-red-800">
                    <Flag className="w-4 h-4 shrink-0 fill-current" />
                    <span>
                      You have <strong>{flaggedCount}</strong>{' '}
                      {flaggedCount === 1 ? 'question' : 'questions'} marked for review.
                    </span>
                  </div>
                )}
                <p className="text-muted-foreground text-sm">
                  Are you sure you want to submit this module? You cannot go back after
                  submitting.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowSubmitConfirm(false)}>
              Continue Testing
            </Button>
            <Button
              onClick={() => {
                setShowSubmitConfirm(false);
                onSubmit();
              }}
              disabled={isSubmitting}
              className="bg-[hsl(var(--exam-highlight))] hover:bg-[hsl(var(--exam-highlight))]/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Module'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
