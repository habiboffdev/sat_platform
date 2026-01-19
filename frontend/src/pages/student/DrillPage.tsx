import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    Check,
    X,
    Lightbulb,
    Target,
    BarChart2,
    Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RichContent } from '@/components/ui/RichContent';
import { cn } from '@/lib/utils';
import { drillService, type DrillSession, type DrillAnswer, type DrillResult } from '@/services/drill';
import { useToast } from '@/hooks/use-toast';

const DOMAIN_LABELS: Record<string, string> = {
    craft_and_structure: 'Craft & Structure',
    information_and_ideas: 'Information & Ideas',
    standard_english_conventions: 'Standard English',
    expression_of_ideas: 'Expression of Ideas',
    algebra: 'Algebra',
    advanced_math: 'Advanced Math',
    problem_solving_data_analysis: 'Problem Solving',
    geometry_trigonometry: 'Geometry & Trig',
};

type DrillMode = 'practice' | 'result';

export default function DrillPage() {
    const navigate = useNavigate();
    const { toast } = useToast();

    const [mode, setMode] = useState<DrillMode>('practice');
    const [session, setSession] = useState<DrillSession | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [result, setResult] = useState<DrillResult | null>(null);
    const [showExplanations, setShowExplanations] = useState(true);

    // Load session from sessionStorage
    useEffect(() => {
        const stored = sessionStorage.getItem('drill_session');
        if (stored) {
            try {
                setSession(JSON.parse(stored));
            } catch {
                navigate('/dashboard');
            }
        } else {
            navigate('/dashboard');
        }
    }, [navigate]);

    const submitMutation = useMutation({
        mutationFn: (drillAnswers: DrillAnswer[]) => drillService.submitDrill(drillAnswers),
        onSuccess: (data) => {
            setResult(data);
            setMode('result');
            setCurrentIndex(0);
            sessionStorage.removeItem('drill_session');
        },
        onError: () => {
            toast({
                variant: 'destructive',
                title: 'Submission failed',
                description: 'Please try again.',
            });
        },
    });

    const handleAnswer = useCallback((questionId: number, answer: string) => {
        setAnswers(prev => ({ ...prev, [questionId]: answer }));
    }, []);

    const handleSubmit = useCallback(() => {
        if (!session) return;

        const drillAnswers: DrillAnswer[] = session.questions.map(q => ({
            question_id: q.id,
            answer: answers[q.id] || null,
        }));

        submitMutation.mutate(drillAnswers);
    }, [session, answers, submitMutation]);

    const currentQuestion = session?.questions[currentIndex];

    // Result mode question
    const currentResultQuestion = result?.questions[currentIndex];

    // Stats for practice mode
    const answeredCount = Object.keys(answers).length;
    const totalQuestions = session?.questions.length || 0;

    if (!session) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                Loading...
            </div>
        );
    }

    // Result View
    if (mode === 'result' && result) {
        return (
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold">Drill Complete!</h1>
                        <p className="text-sm text-muted-foreground">
                            {result.correct_count}/{result.total_questions} correct ({result.accuracy}%)
                        </p>
                    </div>
                </div>

                {/* Score Summary */}
                <div className={cn(
                    "rounded-2xl border-2 p-6 text-center",
                    result.accuracy >= 80 ? "bg-green-50 border-green-200" :
                        result.accuracy >= 60 ? "bg-blue-50 border-blue-200" :
                            result.accuracy >= 40 ? "bg-amber-50 border-amber-200" :
                                "bg-red-50 border-red-200"
                )}>
                    <div className={cn(
                        "text-5xl font-bold mb-2",
                        result.accuracy >= 80 ? "text-green-600" :
                            result.accuracy >= 60 ? "text-blue-600" :
                                result.accuracy >= 40 ? "text-amber-600" :
                                    "text-red-600"
                    )}>
                        {result.accuracy}%
                    </div>
                    <div className="text-muted-foreground">
                        {result.correct_count} correct out of {result.total_questions}
                    </div>
                </div>

                {/* Domain Breakdown */}
                {result.domain_breakdown.length > 0 && (
                    <div className="bg-card rounded-xl border p-5 space-y-4">
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <BarChart2 className="w-4 h-4 text-primary" />
                            Performance by Domain
                        </div>
                        <div className="space-y-3">
                            {result.domain_breakdown
                                .sort((a, b) => a.accuracy - b.accuracy)
                                .map((d) => (
                                    <div key={d.domain} className="space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">{DOMAIN_LABELS[d.domain] || d.domain}</span>
                                            <span className={cn(
                                                "font-semibold",
                                                d.accuracy >= 70 ? "text-green-600" :
                                                    d.accuracy >= 50 ? "text-amber-600" : "text-red-500"
                                            )}>
                                                {d.correct}/{d.total} ({Math.round(d.accuracy)}%)
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full",
                                                    d.accuracy >= 70 ? "bg-green-500" :
                                                        d.accuracy >= 50 ? "bg-amber-500" : "bg-red-500"
                                                )}
                                                style={{ width: `${d.accuracy}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* Question Review Navigator */}
                <div className="bg-card rounded-xl border p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">Review Questions</div>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowExplanations(!showExplanations)}
                        >
                            {showExplanations ? 'Hide' : 'Show'} Explanations
                        </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {result.questions.map((q, i) => (
                            <button
                                key={q.id}
                                onClick={() => setCurrentIndex(i)}
                                className={cn(
                                    "w-9 h-9 rounded-lg text-sm font-semibold border-2 transition-all",
                                    q.is_correct && "bg-green-50 border-green-300 text-green-700",
                                    !q.is_correct && "bg-red-50 border-red-300 text-red-600",
                                    currentIndex === i && "ring-2 ring-primary ring-offset-2"
                                )}
                            >
                                {q.question_number}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Current Question Review */}
                {currentResultQuestion && (
                    <div className="bg-card rounded-xl border overflow-hidden">
                        <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-3">
                            <span className="font-semibold">Q{currentResultQuestion.question_number}</span>
                            {currentResultQuestion.domain && (
                                <span className="px-2 py-1 rounded text-xs bg-muted">
                                    {DOMAIN_LABELS[currentResultQuestion.domain] || currentResultQuestion.domain}
                                </span>
                            )}
                            <div className="ml-auto">
                                <span className={cn(
                                    "px-3 py-1 rounded-full text-xs font-semibold",
                                    currentResultQuestion.is_correct
                                        ? "bg-green-100 text-green-700"
                                        : "bg-red-100 text-red-600"
                                )}>
                                    {currentResultQuestion.is_correct ? '✓ Correct' : '✗ Wrong'}
                                </span>
                            </div>
                        </div>

                        <div className="p-6 space-y-4">
                            <RichContent
                                content={currentResultQuestion.question_text}
                                className="text-lg"
                            />

                            {currentResultQuestion.options && (
                                <div className="space-y-2">
                                    {currentResultQuestion.options.map(opt => {
                                        const isCorrect = currentResultQuestion.correct_answer.includes(opt.id);
                                        const isUser = currentResultQuestion.user_answer === opt.id;

                                        return (
                                            <div
                                                key={opt.id}
                                                className={cn(
                                                    "flex items-center gap-3 p-3 rounded-lg border-2",
                                                    isCorrect && "bg-green-50 border-green-300",
                                                    isUser && !isCorrect && "bg-red-50 border-red-300",
                                                    !isCorrect && !isUser && "border-border"
                                                )}
                                            >
                                                <span className={cn(
                                                    "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                                                    isCorrect && "bg-green-500 text-white",
                                                    isUser && !isCorrect && "bg-red-500 text-white",
                                                    !isCorrect && !isUser && "bg-muted"
                                                )}>
                                                    {opt.id}
                                                </span>
                                                <RichContent content={opt.text} className="flex-1" />
                                                <div className="flex items-center gap-2">
                                                    {isCorrect && <Check className="w-4 h-4 text-green-600" />}
                                                    {isUser && !isCorrect && <X className="w-4 h-4 text-red-500" />}
                                                    {isUser && <span className="text-xs text-muted-foreground">yours</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {showExplanations && currentResultQuestion.explanation && (
                                <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                                    <div className="flex items-center gap-2 text-blue-700 mb-2">
                                        <Lightbulb className="w-4 h-4" />
                                        <span className="font-semibold">Explanation</span>
                                    </div>
                                    <RichContent
                                        content={currentResultQuestion.explanation}
                                        className="text-blue-900/80"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Navigation */}
                        <div className="px-6 py-4 border-t flex items-center justify-between">
                            <Button
                                variant="ghost"
                                onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                                disabled={currentIndex === 0}
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" />
                                Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                                {currentIndex + 1} of {result.questions.length}
                            </span>
                            <Button
                                variant="ghost"
                                onClick={() => setCurrentIndex(i => Math.min(result.questions.length - 1, i + 1))}
                                disabled={currentIndex >= result.questions.length - 1}
                            >
                                Next
                                <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => navigate('/dashboard')}>
                        <Home className="w-4 h-4 mr-2" />
                        Back to Dashboard
                    </Button>
                    <Button
                        className="flex-1 btn-premium"
                        onClick={() => {
                            setMode('practice');
                            setResult(null);
                            setAnswers({});
                            setCurrentIndex(0);
                            // Would need to refetch session here in real impl
                            navigate('/dashboard');
                        }}
                    >
                        <Target className="w-4 h-4 mr-2" />
                        Practice Again
                    </Button>
                </div>
            </div>
        );
    }

    // Practice Mode
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold">Practice Drill</h1>
                        <p className="text-sm text-muted-foreground">
                            {answeredCount}/{totalQuestions} answered
                        </p>
                    </div>
                </div>
                <Button
                    onClick={handleSubmit}
                    disabled={submitMutation.isPending}
                    className="btn-premium"
                >
                    {submitMutation.isPending ? 'Submitting...' : 'Submit Drill'}
                </Button>
            </div>

            {/* Progress */}
            <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
                />
            </div>

            {/* Question Navigator */}
            <div className="flex flex-wrap gap-1.5">
                {session.questions.map((q, i) => (
                    <button
                        key={q.id}
                        onClick={() => setCurrentIndex(i)}
                        className={cn(
                            "w-9 h-9 rounded-lg text-sm font-semibold border-2 transition-all",
                            answers[q.id] && "bg-primary/10 border-primary text-primary",
                            !answers[q.id] && "border-border text-muted-foreground",
                            currentIndex === i && "ring-2 ring-primary ring-offset-2"
                        )}
                    >
                        {q.question_number}
                    </button>
                ))}
            </div>

            {/* Current Question */}
            {currentQuestion && (
                <div className="bg-card rounded-xl border overflow-hidden">
                    <div className="px-6 py-4 border-b bg-muted/30 flex items-center gap-3">
                        <span className="font-semibold">Question {currentQuestion.question_number}</span>
                        {currentQuestion.domain && (
                            <span className="px-2 py-1 rounded text-xs bg-muted">
                                {DOMAIN_LABELS[currentQuestion.domain] || currentQuestion.domain}
                            </span>
                        )}
                        {currentQuestion.difficulty && (
                            <span className={cn(
                                "px-2 py-1 rounded text-xs",
                                currentQuestion.difficulty === 'easy' && "bg-green-100 text-green-700",
                                currentQuestion.difficulty === 'medium' && "bg-amber-100 text-amber-700",
                                currentQuestion.difficulty === 'hard' && "bg-red-100 text-red-700"
                            )}>
                                {currentQuestion.difficulty}
                            </span>
                        )}
                    </div>

                    <div className="p-6 space-y-4">
                        {/* Passage */}
                        {currentQuestion.passage && (
                            <div className="p-4 bg-muted/40 rounded-lg border-l-4 border-primary/30 mb-4">
                                {currentQuestion.passage.title && (
                                    <p className="text-xs font-semibold text-muted-foreground mb-2">
                                        {currentQuestion.passage.title}
                                    </p>
                                )}
                                <RichContent
                                    content={currentQuestion.passage.content}
                                    className="text-sm leading-relaxed"
                                />
                            </div>
                        )}

                        {/* Question Text */}
                        <RichContent
                            content={currentQuestion.question_text}
                            className="text-lg"
                        />

                        {currentQuestion.question_image_url && (
                            <img
                                src={currentQuestion.question_image_url}
                                alt=""
                                className="max-w-full rounded-lg"
                            />
                        )}

                        {/* Options - Multiple Choice */}
                        {currentQuestion.question_type !== 'student_produced_response' && currentQuestion.options && currentQuestion.options.length > 0 ? (
                            <div className="space-y-2 pt-4">
                                {currentQuestion.options.map(opt => (
                                    <button
                                        key={opt.id}
                                        onClick={() => handleAnswer(currentQuestion.id, opt.id)}
                                        className={cn(
                                            "w-full flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all hover:border-primary/50",
                                            answers[currentQuestion.id] === opt.id
                                                ? "border-primary bg-primary/5"
                                                : "border-border"
                                        )}
                                    >
                                        <span className={cn(
                                            "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0",
                                            answers[currentQuestion.id] === opt.id
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted"
                                        )}>
                                            {opt.id}
                                        </span>
                                        <RichContent content={opt.text} className="flex-1" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            /* Grid-In / Student Produced Response */
                            <div className="space-y-3 pt-4">
                                <label className="block text-sm font-medium text-muted-foreground">
                                    Your Answer
                                </label>
                                <input
                                    type="text"
                                    value={answers[currentQuestion.id] || ''}
                                    onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                                    className="w-48 h-14 text-2xl font-mono text-center border-2 rounded-xl transition-all focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                                    placeholder="Enter answer"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Enter your numerical answer. Use "/" for fractions (e.g., 3/4)
                                </p>
                            </div>
                        )}

                    </div>

                    {/* Navigation */}
                    <div className="px-6 py-4 border-t flex items-center justify-between">
                        <Button
                            variant="ghost"
                            onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
                            disabled={currentIndex === 0}
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            Previous
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setCurrentIndex(i => Math.min(totalQuestions - 1, i + 1))}
                            disabled={currentIndex >= totalQuestions - 1}
                        >
                            Next
                            <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
