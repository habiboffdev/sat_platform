import { useCallback } from 'react';
import { Check, X, ChevronRight, BarChart2, Target, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SubmitModuleResponse } from '@/services/exam';

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

interface ModuleResultScreenProps {
    result: SubmitModuleResponse;
    onContinue: () => void;
    onReviewAnswers?: () => void;
    isLoading?: boolean;
}

export function ModuleResultScreen({
    result,
    onContinue,
    onReviewAnswers,
    isLoading = false,
}: ModuleResultScreenProps) {
    const { module_score, section, module_type, domain_breakdown, question_results, test_completed } = result;

    const accuracy = module_score.total > 0
        ? Math.round((module_score.correct / module_score.total) * 100)
        : 0;

    const sectionLabel = section === 'reading_writing' ? 'Reading & Writing' : 'Math';
    const moduleLabel = module_type === 'module_1' ? 'Module 1' : 'Module 2';

    // Count correct/incorrect/skipped
    const correctCount = question_results.filter(q => q.is_correct).length;
    const incorrectCount = question_results.filter(q => !q.is_correct && q.user_answer !== null).length;
    const skippedCount = question_results.filter(q => q.user_answer === null).length;

    // Get performance level
    const getPerformanceLevel = useCallback((acc: number) => {
        if (acc >= 80) return { label: 'Excellent!', color: 'text-green-600', bg: 'bg-green-50 border-green-200' };
        if (acc >= 60) return { label: 'Good Job!', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' };
        if (acc >= 40) return { label: 'Keep Practicing', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' };
        return { label: 'Room to Improve', color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
    }, []);

    const performance = getPerformanceLevel(accuracy);

    return (
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex items-center justify-center p-4">
            <div className="w-full max-w-2xl space-y-6 animate-fade-in">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full text-sm font-medium text-primary">
                        <BarChart2 className="w-4 h-4" />
                        {sectionLabel} • {moduleLabel}
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Module Complete!</h1>
                </div>

                {/* Score Card */}
                <div className={cn(
                    "rounded-2xl border-2 p-8 text-center",
                    performance.bg
                )}>
                    <div className={cn("text-6xl font-bold tracking-tight mb-2", performance.color)}>
                        {accuracy}%
                    </div>
                    <div className={cn("text-lg font-semibold mb-4", performance.color)}>
                        {performance.label}
                    </div>

                    {/* Score breakdown */}
                    <div className="flex justify-center gap-8 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center">
                                <Check className="w-4 h-4" />
                            </div>
                            <div className="text-left">
                                <div className="font-bold text-lg">{correctCount}</div>
                                <div className="text-muted-foreground text-xs">Correct</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center">
                                <X className="w-4 h-4" />
                            </div>
                            <div className="text-left">
                                <div className="font-bold text-lg">{incorrectCount}</div>
                                <div className="text-muted-foreground text-xs">Wrong</div>
                            </div>
                        </div>
                        {skippedCount > 0 && (
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center font-bold">
                                    —
                                </div>
                                <div className="text-left">
                                    <div className="font-bold text-lg">{skippedCount}</div>
                                    <div className="text-muted-foreground text-xs">Skipped</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Domain Performance */}
                {domain_breakdown.length > 0 && (
                    <div className="bg-card rounded-2xl border p-6 space-y-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Target className="w-4 h-4 text-primary" />
                            Performance by Domain
                        </div>
                        <div className="space-y-3">
                            {domain_breakdown
                                .sort((a, b) => a.accuracy - b.accuracy)
                                .map((domain) => (
                                    <div key={domain.domain} className="space-y-1.5">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">
                                                {DOMAIN_LABELS[domain.domain] || domain.domain}
                                            </span>
                                            <span className={cn(
                                                "font-semibold",
                                                domain.accuracy >= 70 ? "text-green-600" :
                                                    domain.accuracy >= 50 ? "text-amber-600" : "text-red-500"
                                            )}>
                                                {domain.correct}/{domain.total} ({Math.round(domain.accuracy)}%)
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={cn(
                                                    "h-full rounded-full transition-all",
                                                    domain.accuracy >= 70 ? "bg-green-500" :
                                                        domain.accuracy >= 50 ? "bg-amber-500" : "bg-red-500"
                                                )}
                                                style={{ width: `${domain.accuracy}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                )}

                {/* Quick Results Grid */}
                <div className="bg-card rounded-2xl border p-6 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Zap className="w-4 h-4 text-primary" />
                            Question Summary
                        </div>
                        {onReviewAnswers && (
                            <Button variant="ghost" size="sm" onClick={onReviewAnswers}>
                                Review All
                                <ChevronRight className="w-4 h-4 ml-1" />
                            </Button>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {question_results.map((q) => (
                            <div
                                key={q.id}
                                className={cn(
                                    "w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold border-2 transition-all",
                                    q.is_correct && "bg-green-50 border-green-300 text-green-700",
                                    !q.is_correct && q.user_answer !== null && "bg-red-50 border-red-300 text-red-600",
                                    q.user_answer === null && "bg-muted border-border text-muted-foreground"
                                )}
                            >
                                {q.question_number}
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded bg-green-500" /> Correct
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded bg-red-500" /> Wrong
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded bg-muted border" /> Skipped
                        </span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                        className="flex-1 h-12 text-base btn-premium"
                        onClick={onContinue}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Loading...' : test_completed ? 'View Final Results' : 'Continue to Next Module'}
                        <ChevronRight className="w-5 h-5 ml-2" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
