/**
 * TestCreation - Main container component for the test creation workflow
 *
 * Orchestrates the multi-step workflow:
 * 1. Type Selection (Linear vs Adaptive)
 * 2. File Upload (JSON + PDF)
 * 3. Module Separation (drag separators)
 * 4. Review & Edit Questions
 * 5. Submit & Create Test
 */

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTestCreation } from '@/hooks/useTestCreation';
import { TestTypeStep } from './TestTypeStep';
import { UploadStep } from './UploadStep';
import { ModuleSeparatorStep } from './ModuleSeparatorStep';
import { ReviewStep } from './ReviewStep';
import { SubmitStep } from './SubmitStep';
import { testService } from '@/services/test';

// Step indicator component
function StepIndicator({
  currentStep,
  steps,
}: {
  currentStep: string;
  steps: { id: string; label: string }[];
}) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, i) => {
        const isActive = step.id === currentStep;
        const isCompleted = i < currentIndex;

        return (
          <div key={step.id} className="flex items-center">
            {i > 0 && (
              <div
                className={`w-8 h-0.5 mx-1 ${isCompleted ? 'bg-primary' : 'bg-muted'
                  }`}
              />
            )}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${isActive
                ? 'bg-primary text-primary-foreground'
                : isCompleted
                  ? 'bg-primary/20 text-primary'
                  : 'bg-muted text-muted-foreground'
                }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isActive
                  ? 'bg-primary-foreground text-primary'
                  : isCompleted
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted-foreground/30'
                  }`}
              >
                {i + 1}
              </span>
              <span className="hidden sm:inline">{step.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const STEPS = [
  { id: 'type', label: 'Test Type' },
  { id: 'upload', label: 'Upload' },
  { id: 'separate', label: 'Modules' },
  { id: 'review', label: 'Review' },
  { id: 'submit', label: 'Submit' },
];

export function TestCreation() {
  const { toast } = useToast();
  const {
    state,
    nextStep,
    prevStep,
    setTestMode,
    setTestTitle,
    setTestDescription,
    setJsonFile,
    setPdfFile,
    setQuestions,
    updateQuestion,
    deleteQuestion,
    setSeparatorPosition,
    resetSeparators,
    setCurrentQuestionIndex,
    toggleSidebar,
    modulesWithQuestions,
    parseJsonQuestions,
  } = useTestCreation();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdTestId, setCreatedTestId] = useState<number | undefined>();

  // Handle test submission
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Create the test
      const testPayload = {
        title: state.testTitle,
        description: state.testDescription || undefined,
        test_type: 'full_test' as const,
        is_published: false,
        is_premium: false,
      };

      const createdTest = await testService.createTest(testPayload);

      // Create modules and add questions
      for (let i = 0; i < modulesWithQuestions.length; i++) {
        const mwq = modulesWithQuestions[i];
        const modulePayload = {
          section: mwq.definition.section,
          module: mwq.definition.module,
          difficulty: mwq.definition.difficulty,
          time_limit_minutes: mwq.definition.timeLimit,
          order_index: i,
        };

        const createdModule = await testService.createModule(createdTest.id, modulePayload);

        // Add questions to module
        for (let j = 0; j < mwq.questions.length; j++) {
          const q = mwq.questions[j];

          // Levenshtein distance for fuzzy matching
          const levenshtein = (a: string, b: string): number => {
            const matrix: number[][] = [];
            for (let i = 0; i <= b.length; i++) matrix[i] = [i];
            for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= b.length; i++) {
              for (let j = 1; j <= a.length; j++) {
                matrix[i][j] = b[i - 1] === a[j - 1]
                  ? matrix[i - 1][j - 1]
                  : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
              }
            }
            return matrix[b.length][a.length];
          };

          // Valid domain enum values
          const VALID_DOMAINS = [
            'craft_and_structure',
            'information_and_ideas',
            'standard_english_conventions',
            'expression_of_ideas',
            'algebra',
            'advanced_math',
            'problem_solving_data_analysis',
            'geometry_trigonometry',
          ];

          // Map domain from human-readable to enum format with fuzzy matching
          const mapDomain = (d: string | undefined): string | null => {
            if (!d) return null;

            // Normalize input
            const normalized = d.toLowerCase().trim().replace(/[\s-]+/g, '_');

            // Direct match check
            if (VALID_DOMAINS.includes(normalized)) return normalized;

            // Fuzzy match using Levenshtein distance
            let bestMatch = VALID_DOMAINS[0];
            let bestDistance = levenshtein(normalized, VALID_DOMAINS[0]);

            for (const domain of VALID_DOMAINS) {
              const distance = levenshtein(normalized, domain);
              if (distance < bestDistance) {
                bestDistance = distance;
                bestMatch = domain;
              }
            }

            // If closest match is reasonably close (distance < 50% of string length), use it
            if (bestDistance <= Math.max(normalized.length, bestMatch.length) * 0.5) {
              console.log(`Domain "${d}" mapped to "${bestMatch}" (distance: ${bestDistance})`);
              return bestMatch;
            }

            // Fallback to null if no good match found
            console.warn(`Domain "${d}" could not be matched to any valid domain`);
            return null;
          };

          // Determine question type based on options presence
          const hasOptions = q.options && q.options.length > 0;
          const detectedQuestionType = hasOptions ? 'multiple_choice' : 'student_produced_response';

          // Create passage if question has passage_text or chart_data
          let passageId: number | undefined;
          const passageContent = q.passage_text || q.passage?.content;
          const chartData = q.chart_data;
          const chartTitle = q.chart_title;

          if (passageContent || chartData) {
            // Build passage content - combine text and table if both exist
            let fullPassageContent = passageContent || '';
            if (chartData) {
              // Add chart/table after the text with title as content header (not passage title)
              if (fullPassageContent) fullPassageContent += '\n\n';
              if (chartTitle) fullPassageContent += `<strong>${chartTitle}</strong>\n\n`;
              fullPassageContent += chartData;
            }

            try {
              const createdPassage = await testService.createPassage({
                // Don't use chart_title as passage title - it's part of the content
                title: undefined,
                content: fullPassageContent,
              });
              passageId = createdPassage.id;
            } catch (passageError) {
              console.warn('Failed to create passage for question', j + 1, passageError);
              // Continue without passage if creation fails
            }
          }

          const questionPayload = {
            question_number: j + 1,
            question_text: q.question_text,
            question_type: detectedQuestionType as 'multiple_choice' | 'student_produced_response',
            options: hasOptions ? q.options : undefined,
            correct_answer: q.correct_answer || [],
            explanation: q.explanation,
            difficulty: (q.difficulty || 'medium').toLowerCase() as 'easy' | 'medium' | 'hard',
            domain: mapDomain(q.domain) as any,
            question_image_url: q.question_image_url || undefined,
            skill_tags: q.skill_tags,
            passage_id: passageId,
          };

          await testService.createQuestion(createdTest.id, createdModule.id!, questionPayload);
        }
      }

      setCreatedTestId(createdTest.id);
      toast({
        title: 'Test Created!',
        description: `Successfully created "${state.testTitle}" with ${state.questions.length} questions.`,
      });
    } catch (error: any) {
      console.error('Failed to create test:', error);
      console.error('Error response data:', error.response?.data);

      // Extract meaningful error message from Pydantic validation errors
      let errorMessage = 'Failed to create test';
      if (error.response?.data?.detail) {
        const detail = error.response.data.detail;
        if (Array.isArray(detail)) {
          // Pydantic validation errors come as array
          errorMessage = detail.map((e: any) => `${e.loc?.join('.')}: ${e.msg}`).join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      }

      setSubmitError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle question reorder with proper state update
  const handleQuestionsReorder = (newQuestions: typeof state.questions) => {
    // This needs to update the questions array directly
    // The reorderQuestions function expects from/to indices, so we need to update manually
    setQuestions(newQuestions);
  };

  return (
    <div className="h-full bg-background text-foreground flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-6 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-serif font-bold text-xl">
            <Sparkles className="w-5 h-5 text-primary" />
            <span>Create Test</span>
          </div>
        </div>

        <StepIndicator currentStep={state.step} steps={STEPS} />

        <div className="w-32" /> {/* Spacer for balance */}
      </header>

      {/* Main content - step components */}
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {state.step === 'type' && (
            <TestTypeStep
              key="type"
              testMode={state.testMode}
              testTitle={state.testTitle}
              testDescription={state.testDescription}
              onTestModeChange={setTestMode}
              onTitleChange={setTestTitle}
              onDescriptionChange={setTestDescription}
              onNext={nextStep}
            />
          )}

          {state.step === 'upload' && (
            <UploadStep
              key="upload"
              jsonFile={state.jsonFile}
              pdfFile={state.pdfFile}
              questionsCount={state.questions.length}
              onJsonFileChange={setJsonFile}
              onPdfFileChange={setPdfFile}
              onQuestionsLoaded={setQuestions}
              parseJsonQuestions={parseJsonQuestions}
              onNext={nextStep}
              onPrev={prevStep}
            />
          )}

          {state.step === 'separate' && (
            <ModuleSeparatorStep
              key="separate"
              questions={state.questions}
              separators={state.separators}
              onSeparatorChange={setSeparatorPosition}
              onResetSeparators={resetSeparators}
              onNext={nextStep}
              onPrev={prevStep}
            />
          )}

          {state.step === 'review' && (
            <ReviewStep
              key="review"
              questions={state.questions}
              separators={state.separators}
              pdfFile={state.pdfFile}
              currentQuestionIndex={state.currentQuestionIndex}
              sidebarCollapsed={state.sidebarCollapsed}
              onQuestionUpdate={updateQuestion}
              onQuestionDelete={deleteQuestion}
              onQuestionsReorder={handleQuestionsReorder}
              onCurrentIndexChange={setCurrentQuestionIndex}
              onToggleSidebar={toggleSidebar}
              onNext={nextStep}
              onPrev={prevStep}
            />
          )}

          {state.step === 'submit' && (
            <SubmitStep
              key="submit"
              testTitle={state.testTitle}
              testDescription={state.testDescription}
              testMode={state.testMode}
              questions={state.questions}
              separators={state.separators}
              modulesWithQuestions={modulesWithQuestions}
              isSubmitting={isSubmitting}
              submitError={submitError}
              onSubmit={handleSubmit}
              onPrev={prevStep}
              createdTestId={createdTestId}
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default TestCreation;
