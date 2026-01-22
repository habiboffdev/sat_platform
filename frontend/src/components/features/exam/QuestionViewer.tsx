import { useState, useRef, useCallback, useEffect } from 'react';
import type { QuestionStudentView } from '@/services/exam';
import { QuestionType } from '@/types/test';
import { useExamStore } from '@/store/exam';
import { cn } from '@/lib/utils';
import {
  Flag,
  Check,
  Maximize2,
  GripVertical,
  BookOpen,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RichContent } from '@/components/ui/RichContent';

/**
 * Constructs full image URL from relative path.
 * Backend returns paths like /static/ocr/... which need the API base URL.
 */
function getFullImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
  // Remove /api/v1 suffix to get base host
  const baseHost = apiBase.replace(/\/api\/v1\/?$/, '');
  return `${baseHost}${url}`;
}

interface QuestionViewerProps {
  question: QuestionStudentView;
}

export function QuestionViewer({ question }: QuestionViewerProps) {
  const { answers, setAnswer, flags, toggleFlag, currentModule } = useExamStore();
  const currentAnswer = answers[question.id];
  const isFlagged = flags[question.id];

  // Resizable pane state
  const [leftPaneWidth, setLeftPaneWidth] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const [isPassageFullscreen, setIsPassageFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasPassage = !!question.passage;
  const isMathSection = currentModule?.section === 'math';
  const isGridIn = question.question_type === QuestionType.STUDENT_PRODUCED_RESPONSE;

  // Handle pane resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Add global mouse listeners for smooth dragging
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
      setLeftPaneWidth(Math.min(Math.max(newWidth, 25), 75));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Render passage content - Bluebook style
  const renderPassage = () => {
    if (!question.passage) return null;

    return (
      <div className="h-full flex flex-col">
        {/* Passage title and source */}
        {(question.passage.title || question.passage.source) && (
          <div className="px-6 py-4 border-b bg-muted/30 shrink-0">
            {question.passage.title && (
              <p className="font-semibold text-foreground">{question.passage.title}</p>
            )}
            {question.passage.source && (
              <p className="text-sm text-muted-foreground mt-1 italic">
                {question.passage.source}
              </p>
            )}
          </div>
        )}

        {/* Passage content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <RichContent
            content={question.passage.content}
            className="exam-passage"
          />
        </div>
      </div>
    );
  };

  // Render question content
  const renderQuestion = () => (
    <div className="h-full flex flex-col">
      {/* Question header */}
      <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="exam-question-number">{question.question_number}</div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground">
              {isMathSection ? 'Math' : 'Reading & Writing'}
            </span>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {question.domain && (
                <span className="capitalize">{question.domain.replace(/_/g, ' ')}</span>
              )}
              {question.difficulty && (
                <>
                  <span>•</span>
                  <span className={cn(
                    "capitalize font-medium",
                    question.difficulty === 'hard' ? "text-red-500" :
                      question.difficulty === 'medium' ? "text-amber-500" :
                        "text-green-600"
                  )}>
                    {question.difficulty}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => toggleFlag(question.id)}
          className={cn('exam-flag-button', isFlagged && 'flagged')}
        >
          <Flag className={cn('w-4 h-4', isFlagged && 'fill-current')} />
          <span className="hidden sm:inline">
            {isFlagged ? 'Marked' : 'Mark for Review'}
          </span>
        </button>
      </div>

      {/* Question content - scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Question text */}
        <div className="mb-6">
          {question.question_image_url && (
            <img
              src={getFullImageUrl(question.question_image_url) || ''}
              alt={question.question_image_alt || 'Question image'}
              className="max-w-full rounded-lg border mb-4"
            />
          )}
          <RichContent
            content={question.question_text}
            className="exam-question-text"
          />
        </div>

        {/* Directions for math grid-in */}
        {isMathSection && isGridIn && (
          <div className="exam-directions mb-6">
            <div className="exam-directions-title">Directions</div>
            <div className="exam-directions-text">
              Enter your answer in the box. You can enter up to 5 characters for a
              positive answer and 6 characters (including the negative sign) for a
              negative answer. Answers can be integers, decimals, or fractions.
            </div>
          </div>
        )}

        {/* Answer Options */}
        <div className="space-y-3 max-w-2xl">
          {!isGridIn && question.options ? (
            // Multiple Choice Options - Bluebook style
            question.options.map((option) => {
              const isSelected = currentAnswer === option.id;

              return (
                <div
                  key={option.id}
                  onClick={() => setAnswer(question.id, option.id)}
                  className={cn('exam-option', isSelected && 'selected')}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setAnswer(question.id, option.id);
                    }
                  }}
                >
                  {/* Option letter circle */}
                  <div className={cn('exam-option-letter', isSelected && 'selected')}>
                    {option.id}
                  </div>

                  {/* Option content */}
                  <div className="flex-1 min-w-0">
                    {option.image_url && (
                      <img
                        src={getFullImageUrl(option.image_url) || ''}
                        alt={option.image_alt || `Option ${option.id}`}
                        className="max-w-xs rounded-lg border mb-2"
                      />
                    )}
                    <RichContent content={option.text} className="exam-option-text" />
                  </div>

                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="w-6 h-6 rounded-full bg-[hsl(var(--exam-highlight))] flex items-center justify-center shrink-0">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            // Student Produced Response (Grid-in) - Bluebook style
            <div className="space-y-4">
              <label className="block text-sm font-medium text-muted-foreground">
                Your Answer
              </label>
              <input
                type="text"
                value={currentAnswer || ''}
                onChange={(e) => setAnswer(question.id, e.target.value)}
                className="exam-grid-input"
                placeholder="Type your answer"
                inputMode="decimal"
                autoComplete="off"
                aria-label="Your answer"
              />
              <p className="text-xs text-muted-foreground">
                Examples: 5, -3, 0.75, 3/4, 1.5
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Fullscreen passage view
  if (isPassageFullscreen && hasPassage) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        {/* Fullscreen header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <span className="font-semibold">Passage</span>
            {question.passage?.title && (
              <>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">{question.passage.title}</span>
              </>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPassageFullscreen(false)}
          >
            <X className="w-4 h-4 mr-2" />
            Close
          </Button>
        </div>

        {/* Fullscreen content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-3xl mx-auto">
            {question.passage?.source && (
              <p className="text-sm text-muted-foreground italic mb-6">
                {question.passage.source}
              </p>
            )}
            <RichContent
              content={question.passage?.content || ''}
              className="exam-passage text-lg leading-relaxed"
            />
          </div>
        </div>
      </div>
    );
  }

  // Main split-pane view (Bluebook style)
  return (
    <div
      ref={containerRef}
      className={cn('exam-content h-full', isResizing && 'select-none')}
    >
      {/* Left Pane - Passage */}
      {hasPassage && (
        <>
          <div
            className="exam-pane exam-pane-left flex flex-col"
            style={{ width: `${leftPaneWidth}%`, minWidth: 0 }}
          >
            {/* Passage header */}
            <div className="flex items-center justify-between px-5 py-3 border-b bg-blue-50/70 shrink-0">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">Passage</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-blue-600 hover:bg-blue-100"
                onClick={() => setIsPassageFullscreen(true)}
                title="Expand passage"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </div>

            {/* Passage content */}
            <div className="flex-1 overflow-hidden">{renderPassage()}</div>
          </div>

          {/* Resizable Divider */}
          <div
            className={cn(
              'w-2 bg-slate-200 hover:bg-blue-400 cursor-col-resize flex-shrink-0 flex items-center justify-center transition-colors',
              isResizing && 'bg-blue-500'
            )}
            onMouseDown={handleMouseDown}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panels"
          >
            <div className="flex flex-col gap-0.5 opacity-40">
              <GripVertical className="w-4 h-4" />
            </div>
          </div>
        </>
      )}

      {/* Right Pane - Question (or centered full-width for no passage) */}
      <div
        className={cn(
          'exam-pane flex flex-col',
          !hasPassage && 'mx-auto max-w-3xl'
        )}
        style={{
          width: hasPassage ? `${100 - leftPaneWidth}%` : '100%',
          minWidth: 0,
        }}
      >
        {renderQuestion()}
      </div>
    </div>
  );
}
