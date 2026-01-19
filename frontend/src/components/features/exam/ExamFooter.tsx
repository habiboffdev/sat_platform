import { useState, useMemo } from 'react';
import { useExamStore } from '@/store/exam';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { QuestionNavigator } from './QuestionNavigator';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  Flag,
} from 'lucide-react';

interface ExamFooterProps {
  onNext: () => void;
  onPrev: () => void;
  isLastQuestion: boolean;
  onGoToReview: () => void;
}

export function ExamFooter({ onNext, onPrev, isLastQuestion, onGoToReview }: ExamFooterProps) {
  const { currentQuestionIndex, currentModule, answers, flags, setQuestionIndex } = useExamStore();
  const { user } = useAuthStore();
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);

  const totalQuestions = currentModule?.questions.length || 0;
  const currentQuestion = currentModule?.questions[currentQuestionIndex];
  const isCurrentAnswered = currentQuestion ? !!answers[currentQuestion.id] : false;
  const isCurrentFlagged = currentQuestion ? !!flags[currentQuestion.id] : false;

  // Calculate progress stats
  const answeredCount = currentModule?.questions.filter((q) => answers[q.id]).length || 0;
  const flaggedCount = currentModule?.questions.filter((q) => flags[q.id]).length || 0;

  // Create mini nav dots data
  const navDots = useMemo(() => {
    if (!currentModule) return [];
    return currentModule.questions.map((q, index) => ({
      index,
      isAnswered: !!answers[q.id],
      isFlagged: !!flags[q.id],
      isCurrent: index === currentQuestionIndex,
    }));
  }, [currentModule, answers, flags, currentQuestionIndex]);

  // Get visible dots (show context around current question)
  const visibleDots = useMemo(() => {
    const maxVisible = 15;
    if (navDots.length <= maxVisible) return navDots;

    const start = Math.max(0, currentQuestionIndex - Math.floor(maxVisible / 2));
    const end = Math.min(navDots.length, start + maxVisible);
    const adjustedStart = Math.max(0, end - maxVisible);

    return navDots.slice(adjustedStart, end);
  }, [navDots, currentQuestionIndex]);

  const handleDotClick = (index: number) => {
    setQuestionIndex(index);
  };

  return (
    <>
      <footer className="exam-footer select-none">
        {/* Left: User info & mini progress */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
            {user?.full_name?.charAt(0) || 'S'}
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-medium">{user?.full_name || 'Student'}</div>
            <div className="text-xs text-muted-foreground">
              {answeredCount}/{totalQuestions} answered
            </div>
          </div>
        </div>

        {/* Center: Mini Question Navigator + Open Full Navigator */}
        <div className="flex items-center gap-3">
          {/* Mini dots navigation */}
          <div className="hidden md:flex footer-question-nav">
            {visibleDots.map((dot) => (
              <button
                key={dot.index}
                onClick={() => handleDotClick(dot.index)}
                className={cn(
                  "footer-nav-dot",
                  dot.isAnswered && "answered",
                  !dot.isAnswered && "unanswered",
                  dot.isFlagged && "flagged",
                  dot.isCurrent && "current"
                )}
                title={`Question ${dot.index + 1}${dot.isAnswered ? ' (answered)' : ''}${dot.isFlagged ? ' (flagged)' : ''}`}
              />
            ))}
          </div>

          {/* Current question status */}
          <div className="hidden lg:flex items-center gap-2 text-sm">
            {isCurrentFlagged && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-medium">
                <Flag className="w-3 h-3 fill-current" />
                Marked
              </span>
            )}
            {isCurrentAnswered && !isCurrentFlagged && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-600 text-xs font-medium">
                ✓ Answered
              </span>
            )}
          </div>

          {/* Question grid button */}
          <Button
            variant="ghost"
            size="sm"
            className="font-medium hover:bg-muted gap-2"
            onClick={() => setIsNavigatorOpen(true)}
          >
            <Grid3X3 className="w-4 h-4" />
            <span className="hidden sm:inline">Q{currentQuestionIndex + 1}/{totalQuestions}</span>
            <span className="sm:hidden">{currentQuestionIndex + 1}/{totalQuestions}</span>
          </Button>

          {/* Flagged count badge */}
          {flaggedCount > 0 && (
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-600 text-xs font-semibold">
              <Flag className="w-3 h-3 fill-current" />
              {flaggedCount}
            </div>
          )}
        </div>

        {/* Right: Navigation buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full px-4"
            onClick={onPrev}
            disabled={currentQuestionIndex === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Back</span>
          </Button>

          {isLastQuestion ? (
            <Button
              size="sm"
              className="rounded-full px-4 bg-[hsl(var(--exam-highlight))] hover:bg-[hsl(var(--exam-highlight))]/90"
              onClick={onGoToReview}
            >
              <span className="hidden sm:inline">Review & Submit</span>
              <span className="sm:hidden">Submit</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="rounded-full px-4 bg-[hsl(var(--exam-highlight))] hover:bg-[hsl(var(--exam-highlight))]/90"
              onClick={onNext}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </footer>

      {/* Question Navigator Overlay */}
      <QuestionNavigator
        open={isNavigatorOpen}
        onClose={() => setIsNavigatorOpen(false)}
        onGoToReview={() => {
          setIsNavigatorOpen(false);
          onGoToReview();
        }}
      />
    </>
  );
}
