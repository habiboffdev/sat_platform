import { useEffect, useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertCircle } from 'lucide-react';

import { examService, type SubmitModuleResponse } from '@/services/exam';
import { useExamStore } from '@/store/exam';
import { ExamHeader } from '@/components/features/exam/ExamHeader';
import { ExamFooter } from '@/components/features/exam/ExamFooter';
import { QuestionViewer } from '@/components/features/exam/QuestionViewer';
import { ReviewScreen } from '@/components/features/exam/ReviewScreen';
import { ModuleBreakScreen } from '@/components/features/exam/ModuleBreakScreen';
import { ModuleResultScreen } from '@/components/features/exam/ModuleResultScreen';
import { useToast } from '@/hooks/use-toast';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export type ExamView = 'question' | 'review' | 'break' | 'result';

export default function ExamPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentView, setCurrentView] = useState<ExamView>('question');
  const [showTimeWarning, setShowTimeWarning] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [expectedNextModuleId, setExpectedNextModuleId] = useState<number | null>(null);
  const [nextModuleData, setNextModuleData] = useState<{
    moduleId: number;
    isBreak: boolean;
    breakDuration: number;
  } | null>(null);
  const [moduleResult, setModuleResult] = useState<SubmitModuleResponse | null>(null);

  // Robustness hooks
  const isOnline = useOnlineStatus();

  // Prevent accidental tab close/refresh
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Show offline toast
  useEffect(() => {
    if (!isOnline) {
      toast({
        variant: 'destructive',
        title: 'You are offline',
        description: 'Your progress is saved locally. Please reconnect to submit.',
        duration: Infinity,
      });
    }
  }, [isOnline, toast]);

  // Per-question time tracking
  const [questionTimes, setQuestionTimes] = useState<Record<number, number>>({});
  const [lastQuestionTime, setLastQuestionTime] = useState<number>(Date.now());

  const {
    currentModule,
    currentQuestionIndex,
    initializeExam,
    setQuestionIndex,
    answers,
    flags,
    timeLeft,
    resetExam,
    zoomLevel,
    setZoomLevel,
    clearModule,
  } = useExamStore();

  // Fetch module data
  const {
    data: moduleData,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['exam-module', attemptId],
    queryFn: () => examService.getCurrentModule(Number(attemptId)),
    enabled: !!attemptId,
    retry: 1,
    staleTime: 0,
  });

  // Initialize store when data arrives
  useEffect(() => {
    if (moduleData) {
      // Logic for initialization:
      // 1. Initial page load (!hasInitialized)
      // 2. Explicit transition (expectedNextModuleId matches moduleData.id)

      const isSameModule = currentModule?.id === moduleData.id;
      const shouldInitialize = !hasInitialized || (expectedNextModuleId !== null && moduleData.id === expectedNextModuleId);

      if (shouldInitialize) {
        // Optimization: If we are already initialized and it's the same module, skip
        if (hasInitialized && isSameModule) return;

        // Ensure we don't snap out of break view accidentally
        if (currentView === 'break' && !hasInitialized) {
          setCurrentView('question');
        }

        initializeExam(Number(attemptId), moduleData);
        setHasInitialized(true);

        // Reset local question timers only if it's a NEW module (not a refresh)
        if (!isSameModule) {
          setQuestionTimes({});
          setLastQuestionTime(Date.now());
        }

        setIsTransitioning(false);
        setExpectedNextModuleId(null);

        // If we were in question/review view, make sure we stay/go to question
        if (currentView !== 'break') {
          setCurrentView('question');
        }
      }
    }
  }, [moduleData, attemptId, initializeExam, expectedNextModuleId, hasInitialized, currentView, currentModule?.id]);

  // Track time when question changes
  useEffect(() => {
    if (!currentModule) return;
    const currentQ = currentModule.questions[currentQuestionIndex];
    if (!currentQ) return;

    // Save time spent on previous question
    const now = Date.now();
    const elapsed = Math.round((now - lastQuestionTime) / 1000);

    // Update time for current question (accumulate if revisiting)
    setQuestionTimes(prev => {
      const prevTime = prev[currentQ.id] || 0;
      return { ...prev, [currentQ.id]: prevTime + elapsed };
    });

    setLastQuestionTime(now);
    // Only track when question index changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionIndex]);

  // Time warning at 5 minutes and 1 minute
  useEffect(() => {
    if (timeLeft === 300 || timeLeft === 60) {
      setShowTimeWarning(true);
    }
  }, [timeLeft]);

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeLeft === 0 && currentModule) {
      handleSubmitModule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, currentModule]);

  // Keyboard shortcuts for navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Arrow keys for navigation
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (currentModule && currentQuestionIndex < currentModule.questions.length - 1) {
          setQuestionIndex(currentQuestionIndex + 1);
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (currentQuestionIndex > 0) {
          setQuestionIndex(currentQuestionIndex - 1);
        }
      }

      // Option selection with A, B, C, D keys
      if (['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D'].includes(e.key) && currentModule && currentView === 'question') {
        const question = currentModule.questions[currentQuestionIndex];
        if (question.options) {
          const optionId = e.key.toUpperCase();
          const option = question.options.find((o) => o.id === optionId);
          if (option) {
            e.preventDefault();
            const { setAnswer } = useExamStore.getState();
            setAnswer(question.id, optionId);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentModule, currentQuestionIndex, currentView, setQuestionIndex]);

  // Submit module mutation
  const submitModuleMutation = useMutation({
    mutationFn: (data: Parameters<typeof examService.submitModule>[1]) =>
      examService.submitModule(Number(attemptId), data),
    onSuccess: (response) => {
      // If test is completed, show the result screen
      if (response.test_completed) {
        resetExam();
        navigate(`/results/${attemptId}`);
        return;
      }

      // 1. Clear current module state immediately to force loader/clear stale data
      clearModule();
      setIsTransitioning(true);

      // 2. Remove queries to ensure fresh fetch
      queryClient.removeQueries({ queryKey: ['exam-module', attemptId] });

      // Determine if there's a break (between RW and Math sections)
      // Transitioning from RW Module 2 to Math Module 1
      const isRWModule2 =
        response.section === 'reading_writing' && response.module_type === 'module_2';

      if (isRWModule2 && response.next_module_id) {
        // BREAK CASE
        setNextModuleData({
          moduleId: response.next_module_id,
          isBreak: true,
          breakDuration: 600, // 10 minutes
        });
        setCurrentView('break');
        setIsTransitioning(false);
        // Important: We do NOT setExpectedNextModuleId here. 
        // We will set it when they click "Continue" from the break screen.
      } else {
        // NORMAL TRANSITION CASE (e.g. RW Mod 1 -> RW Mod 2)
        if (response.next_module_id) {
          setExpectedNextModuleId(response.next_module_id);
        }
        setCurrentView('question');
      }
    },
    onError: (error: any) => {
      // Reset transitioning state so user can retry
      setIsTransitioning(false);
      setExpectedNextModuleId(null);

      toast({
        variant: 'destructive',
        title: 'Submission failed',
        description: error.response?.data?.detail || 'Please check your connection and try again.',
      });
    },
  });

  // Handle module submission
  const handleSubmitModule = useCallback(() => {
    if (!currentModule || currentModule.id === undefined) return;

    // Finalize time for current question before submitting
    const now = Date.now();
    const currentQ = currentModule.questions[currentQuestionIndex];
    const finalTimes = { ...questionTimes };
    if (currentQ) {
      const elapsed = Math.round((now - lastQuestionTime) / 1000);
      finalTimes[currentQ.id] = (finalTimes[currentQ.id] || 0) + elapsed;
    }

    const timeSpent = currentModule.time_limit_minutes * 60 - timeLeft;
    const submitData = {
      module_id: currentModule.id,
      answers: currentModule.questions.map((q) => ({
        question_id: q.id,
        answer: answers[q.id] || null,
        is_flagged: !!flags[q.id],
        time_spent_seconds: finalTimes[q.id] || 0,
      })),
      time_spent_seconds: Math.max(0, timeSpent),
    };

    submitModuleMutation.mutate(submitData);
  }, [currentModule, answers, flags, timeLeft, submitModuleMutation, questionTimes, currentQuestionIndex, lastQuestionTime]);

  // Navigation handlers
  const handleNext = useCallback(() => {
    if (!currentModule) return;

    if (currentQuestionIndex < currentModule.questions.length - 1) {
      setQuestionIndex(currentQuestionIndex + 1);
    }
  }, [currentModule, currentQuestionIndex, setQuestionIndex]);

  const handlePrev = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setQuestionIndex(currentQuestionIndex - 1);
    }
  }, [currentQuestionIndex, setQuestionIndex]);

  // Handle review mode
  const handleGoToReview = useCallback(() => {
    setCurrentView('review');
  }, []);

  const handleExitReview = useCallback(() => {
    setCurrentView('question');
  }, []);

  // Handle continue from break
  const handleContinueFromBreak = useCallback(() => {
    if (nextModuleData) {
      setExpectedNextModuleId(nextModuleData.moduleId);
    }
    setNextModuleData(null);
    setIsTransitioning(true);
    setCurrentView('question');
    // Trigger the refetch
    queryClient.invalidateQueries({ queryKey: ['exam-module', attemptId] });
  }, [queryClient, attemptId, nextModuleData]);

  // Handle continue from result screen (not currently used in this flow but kept for safety)
  const handleContinueFromResult = useCallback(() => {
    if (!moduleResult) return;

    if (moduleResult.test_completed) {
      resetExam();
      navigate(`/results/${attemptId}`);
    } else if (moduleResult.next_module_id) {
      clearModule();
      setExpectedNextModuleId(moduleResult.next_module_id);
      setIsTransitioning(true);

      const isRWModule2 =
        moduleResult.section === 'reading_writing' && moduleResult.module_type === 'module_2';

      if (isRWModule2) {
        setNextModuleData({
          moduleId: moduleResult.next_module_id,
          isBreak: true,
          breakDuration: 600,
        });
        setCurrentView('break');
        setIsTransitioning(false);
      } else {
        setCurrentView('question');
        queryClient.invalidateQueries({ queryKey: ['exam-module', attemptId] });
      }
    }

    setModuleResult(null);
  }, [moduleResult, resetExam, navigate, attemptId, queryClient, clearModule]);

  // Handle exit test
  const handleExitTest = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  const confirmExitTest = useCallback(() => {
    resetExam();
    navigate('/dashboard');
  }, [resetExam, navigate]);

  // Loading state
  const isActuallyLoading = isLoading && (!currentModule || expectedNextModuleId);

  if (isActuallyLoading && currentView !== 'break') {
    return (
      <div className="exam-container">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Loading Your Exam</h2>
              <p className="text-muted-foreground mt-1">
                Please wait while we prepare your test...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || (submitModuleMutation.isError && !currentModule)) {
    return (
      <div className="exam-container">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md mx-auto p-6">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto text-destructive">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold">Connection Error</h2>
            <p className="text-muted-foreground">
              We couldn't load the exam data. Please check your connection and try again.
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={() => navigate('/dashboard')} variant="outline">
                Go Dashboard
              </Button>
              <Button onClick={() => refetch()} className="btn-premium">
                Retry
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Break View
  if (currentView === 'break' && nextModuleData) {
    return (
      <ModuleBreakScreen
        breakDuration={nextModuleData.breakDuration}
        onContinue={handleContinueFromBreak}
        previousSection={currentModule ? currentModule.section : 'reading_writing' as any}
      />
    );
  }

  // Result View
  if (currentView === 'result' && moduleResult) {
    return (
      <ModuleResultScreen
        result={moduleResult}
        onContinue={handleContinueFromResult}
        isLoading={submitModuleMutation.isPending}
      />
    );
  }

  // Review View
  if (currentView === 'review' && currentModule) {
    return (
      <ReviewScreen
        onClose={handleExitReview}
        onSubmit={handleSubmitModule}
        isSubmitting={submitModuleMutation.isPending}
      />
    );
  }

  // Final check for module existence before rendering viewer
  if (!currentModule) {
    return (
      <div className="exam-container flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const currentQuestion = currentModule.questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === currentModule.questions.length - 1;

  return (
    <div className="exam-container relative">
      {/* Loading Overlay for transitions (only in question/review views) */}
      {(isTransitioning || submitModuleMutation.isPending) && currentView !== 'break' && (
        <div className="absolute inset-0 z-[100] bg-white/80 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
          <div className="text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <p className="text-lg font-medium text-slate-800">
              {submitModuleMutation.isPending ? 'Submitting Answers...' : 'Preparing Next Module...'}
            </p>
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-destructive text-destructive-foreground text-center text-sm py-1 font-medium">
          You are offline. Please reconnect to submit module. Progress is saved.
        </div>
      )}

      {/* Header with timer and tools */}
      <ExamHeader
        onExit={handleExitTest}
        zoomLevel={zoomLevel}
        onZoomChange={setZoomLevel}
      />

      {/* Main content - Question Viewer with Passage */}
      <main className="flex-1 overflow-hidden" style={{ fontSize: `${zoomLevel * 100}%` }}>
        <QuestionViewer question={currentQuestion} />
      </main>

      {/* Footer with navigation */}
      <ExamFooter
        onNext={handleNext}
        onPrev={handlePrev}
        onGoToReview={handleGoToReview}
        isLastQuestion={isLastQuestion}
      />

      {/* Overlays */}
      <Dialog open={showTimeWarning} onOpenChange={setShowTimeWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>5 Minutes Remaining</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            You have 5 minutes left in this module. Make sure to review your answers.
          </div>
          <DialogFooter>
            <Button onClick={() => setShowTimeWarning(false)}>OK, Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exit Exam?</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-muted-foreground">
            Are you sure you want to exit? Your progress in this module will be lost.
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExitConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmExitTest}>
              Exit Exam
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
