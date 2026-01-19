import { useExamStore } from '@/store/exam';
import { cn } from '@/lib/utils';
import { X, Flag, CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface QuestionNavigatorProps {
  open: boolean;
  onClose: () => void;
  onGoToReview: () => void;
}

export function QuestionNavigator({ open, onClose, onGoToReview }: QuestionNavigatorProps) {
  const { currentModule, currentQuestionIndex, setQuestionIndex, answers, flags } = useExamStore();

  if (!open || !currentModule) return null;

  const questions = currentModule.questions;
  const totalQuestions = questions.length;
  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const flaggedCount = questions.filter((q) => flags[q.id]).length;
  const unansweredCount = totalQuestions - answeredCount;

  const getQuestionStatus = (questionId: number, index: number) => {
    const isAnswered = !!answers[questionId];
    const isFlagged = !!flags[questionId];
    const isCurrent = index === currentQuestionIndex;

    return { isAnswered, isFlagged, isCurrent };
  };

  const handleQuestionClick = (index: number) => {
    setQuestionIndex(index);
    onClose();
  };

  return (
    <div className="exam-navigator" onClick={onClose}>
      <div
        className="exam-navigator-panel animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30">
          <div>
            <h2 className="text-lg font-semibold">Question Navigator</h2>
            <p className="text-sm text-muted-foreground">
              {currentModule.section === 'reading_writing'
                ? 'Section 1: Reading and Writing'
                : 'Section 2: Math'}{' '}
              • {currentModule.module === 'module_1' ? 'Module 1' : 'Module 2'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Close navigator"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Answered
            </div>
            <div className="text-2xl font-bold mt-1">{answeredCount}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground">
              <Circle className="w-4 h-4" />
              Unanswered
            </div>
            <div className="text-2xl font-bold mt-1">{unansweredCount}</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-sm font-medium text-red-500">
              <Flag className="w-4 h-4 fill-current" />
              For Review
            </div>
            <div className="text-2xl font-bold mt-1">{flaggedCount}</div>
          </div>
        </div>

        {/* Question Grid */}
        <div className="p-6">
          <div className="exam-navigator-grid">
            {questions.map((question, index) => {
              const { isAnswered, isFlagged, isCurrent } = getQuestionStatus(question.id, index);

              return (
                <button
                  key={question.id}
                  onClick={() => handleQuestionClick(index)}
                  className={cn(
                    'exam-navigator-item',
                    isAnswered && 'answered',
                    isFlagged && 'flagged',
                    isCurrent && 'current'
                  )}
                  aria-label={`Question ${index + 1}${isAnswered ? ', answered' : ', unanswered'}${isFlagged ? ', marked for review' : ''}`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 mt-6 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border bg-[hsl(var(--exam-header))]" />
              <span>Answered</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border" />
              <span>Unanswered</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded border relative">
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full" />
              </div>
              <span>Flagged</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between">
          <Button variant="outline" onClick={onClose}>
            Return to Question {currentQuestionIndex + 1}
          </Button>

          <Button
            onClick={onGoToReview}
            className="bg-[hsl(var(--exam-highlight))] hover:bg-[hsl(var(--exam-highlight))]/90"
          >
            Review & Submit
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
