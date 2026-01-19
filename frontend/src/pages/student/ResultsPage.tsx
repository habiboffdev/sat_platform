import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Trophy,
  Target,
  TrendingUp,
  BookOpen,
  Calculator,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  ChevronRight,
  Award,
  FileText,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { examService } from '@/services/exam';
import { cn } from '@/lib/utils';

// Animated score display
function AnimatedScore({ score, max, label, color }: {
  score: number;
  max: number;
  label: string;
  color: string;
}) {
  const percentage = Math.round((score / max) * 100);

  return (
    <div className="relative">
      <div className={cn(
        "absolute inset-0 rounded-3xl blur-3xl opacity-20",
        color === 'blue' ? 'bg-blue-500' : 'bg-amber-500'
      )} />
      <div className="relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-3xl p-8 border border-white/20 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            color === 'blue' ? 'bg-blue-500/10 text-blue-600' : 'bg-amber-500/10 text-amber-600'
          )}>
            {color === 'blue' ? <BookOpen className="w-5 h-5" /> : <Calculator className="w-5 h-5" />}
          </div>
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn(
            "text-6xl font-bold tracking-tight",
            color === 'blue' ? 'text-blue-600' : 'text-amber-600'
          )}>{score}</span>
          <span className="text-2xl text-muted-foreground font-light">/ {max}</span>
        </div>
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-2">
            <span>Performance</span>
            <span>{percentage}%</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000",
                color === 'blue' ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-gradient-to-r from-amber-500 to-amber-600'
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Performance tier badge
function PerformanceBadge({ score }: { score: number }) {
  let tier = { label: 'Keep Practicing', color: 'bg-slate-500', icon: Target };

  if (score >= 1500) {
    tier = { label: 'Outstanding', color: 'bg-gradient-to-r from-purple-500 to-pink-500', icon: Trophy };
  } else if (score >= 1400) {
    tier = { label: 'Excellent', color: 'bg-gradient-to-r from-emerald-500 to-teal-500', icon: Award };
  } else if (score >= 1200) {
    tier = { label: 'Good Progress', color: 'bg-gradient-to-r from-blue-500 to-cyan-500', icon: TrendingUp };
  } else if (score >= 1000) {
    tier = { label: 'On Track', color: 'bg-gradient-to-r from-amber-500 to-orange-500', icon: Sparkles };
  }

  const Icon = tier.icon;

  return (
    <div className={cn(
      "inline-flex items-center gap-2 px-4 py-2 rounded-full text-white font-medium text-sm",
      tier.color
    )}>
      <Icon className="w-4 h-4" />
      {tier.label}
    </div>
  );
}

// Domain performance card
function DomainCard({ domain, correct, total, isRW }: {
  domain: string;
  correct: number;
  total: number;
  isRW: boolean;
}) {
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  const formattedDomain = domain.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="group relative bg-white dark:bg-slate-900 rounded-2xl p-6 border hover:border-primary/30 transition-all hover:shadow-lg">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            isRW ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"
          )}>
            {isRW ? <BookOpen className="w-5 h-5" /> : <Calculator className="w-5 h-5" />}
          </div>
          <div>
            <h4 className="font-semibold text-sm">{formattedDomain}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{correct} of {total} correct</p>
          </div>
        </div>
        <div className={cn(
          "text-2xl font-bold",
          percentage >= 80 ? "text-emerald-600" : percentage >= 60 ? "text-blue-600" : "text-amber-600"
        )}>
          {percentage}%
        </div>
      </div>
      <Progress value={percentage} className="h-2" />
      <div className="mt-4 flex items-center justify-between text-xs">
        <span className={cn(
          "flex items-center gap-1",
          percentage >= 70 ? "text-emerald-600" : "text-muted-foreground"
        )}>
          {percentage >= 70 ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          {percentage >= 70 ? "Strong" : "Needs Work"}
        </span>
        <Button variant="ghost" size="sm" className="h-7 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
          Practice <ChevronRight className="w-3 h-3 ml-1" />
        </Button>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const { data: result, isLoading } = useQuery({
    queryKey: ['attempt-result', attemptId],
    queryFn: () => examService.getAttemptResult(Number(attemptId)),
    enabled: !!attemptId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="text-center space-y-4">
          <div className="relative w-20 h-20 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          </div>
          <p className="text-muted-foreground font-medium">Calculating your results...</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <XCircle className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">Results not found</h2>
        <Button variant="outline" onClick={() => navigate('/dashboard')} className="mt-4">
          Return to Dashboard
        </Button>
      </div>
    );
  }

  const totalScore = result.total_score || 0;
  const rwScore = result.reading_writing_scaled_score || 0;
  const mathScore = result.math_scaled_score || 0;

  const isRWOnly = result.scope === 'rw_only';
  const isMathOnly = result.scope === 'math_only';
  const isSingleModule = result.scope === 'single_module';
  const isFull = !result.scope || result.scope === 'full';

  // For single module, calculate aggregate module accuracy
  const totalCorrect = result.domain_breakdown?.reduce((sum, d) => sum + d.correct, 0) || 0;
  const totalQuestions = result.domain_breakdown?.reduce((sum, d) => sum + d.total, 0) || 0;
  const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

  // Separate domains by section
  const rwDomains = ['craft_and_structure', 'information_and_ideas', 'standard_english_conventions', 'expression_of_ideas'];
  const mathDomains = ['algebra', 'advanced_math', 'problem_solving_data_analysis', 'geometry_trigonometry'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Button>
          <div className="flex items-center gap-3">
            <Button
              variant="default"
              size="sm"
              className="gap-2"
              onClick={() => navigate(`/review/${attemptId}`)}
            >
              <FileText className="w-4 h-4" /> Review Answers
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-12 max-w-6xl">
        {/* Hero Score Section */}
        <div className="text-center mb-16">
          {!isSingleModule && <PerformanceBadge score={isRWOnly ? rwScore * 2 : isMathOnly ? mathScore * 2 : totalScore} />}

          <div className="mt-8 relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-amber-500/20 blur-3xl rounded-full" />
            <h1 className="relative text-8xl md:text-9xl font-bold tracking-tighter bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 dark:from-white dark:via-slate-200 dark:to-white bg-clip-text text-transparent">
              {isSingleModule ? `${accuracy}%` : isRWOnly ? rwScore : isMathOnly ? mathScore : totalScore}
            </h1>
          </div>
          <p className="text-xl text-muted-foreground mt-4">
            {isSingleModule ? 'Module Accuracy' : isRWOnly || isMathOnly ? 'out of 800' : 'out of 1600'}
          </p>

          {isSingleModule && (
            <div className="mt-4 text-muted-foreground">
              {totalCorrect} correct out of {totalQuestions} questions
            </div>
          )}

          {result.completed_at && (
            <div className="mt-6 flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {new Date(result.completed_at).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </span>
            </div>
          )}
        </div>



        {/* Module Breakdown */}
        {result.module_results && result.module_results.length > 0 && (
          <div className="mb-16">
            <h2 className="text-2xl font-bold mb-6">Module Breakdown</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {result.module_results.map((mod, idx) => {
                const percentage = Math.round((mod.correct_count / mod.total_count) * 100);
                const isRW = mod.section === 'reading_writing';

                return (
                  <div key={idx} className="bg-white dark:bg-slate-900 rounded-xl p-6 border shadow-sm">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          isRW ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"
                        )}>
                          {isRW ? <BookOpen className="w-5 h-5" /> : <Calculator className="w-5 h-5" />}
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">
                            {isRW ? 'Reading & Writing' : 'Math'}
                          </h4>
                          <p className="text-xs text-muted-foreground capitalize">
                            {mod.module_type.replace('_', ' ')}
                            {mod.next_module_difficulty && ` • ${mod.next_module_difficulty} Difficulty`}
                          </p>
                        </div>
                      </div>
                      <div className={cn(
                        "text-xl font-bold",
                        percentage >= 80 ? "text-emerald-600" : percentage >= 60 ? "text-blue-600" : "text-amber-600"
                      )}>
                        {percentage}%
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Accuracy</span>
                        <span className="font-medium">{mod.correct_count} of {mod.total_count} correct</span>
                      </div>
                      <Progress value={percentage} className="h-2" />

                      <div className="flex justify-between text-sm pt-2 border-t mt-3">
                        <span className="text-muted-foreground">Time Spent</span>
                        <span className="font-medium">
                          {Math.floor(mod.time_spent_seconds / 60)}m {mod.time_spent_seconds % 60}s
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Section Scores (Original) */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {(isFull || isRWOnly) && (
            <AnimatedScore
              score={rwScore}
              max={800}
              label="Reading & Writing"
              color="blue"
            />
          )}
          {(isFull || isMathOnly) && (
            <AnimatedScore
              score={mathScore}
              max={800}
              label="Math"
              color="amber"
            />
          )}
        </div>

        {/* Domain Breakdown */}
        {result.domain_breakdown && result.domain_breakdown.length > 0 && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Skill Breakdown</h2>
                <p className="text-muted-foreground mt-1">Performance by content domain</p>
              </div>
            </div>

            {/* Reading & Writing Domains */}
            {(isFull || isRWOnly || (isSingleModule && result.domain_breakdown.some(d => rwDomains.includes(d.domain)))) && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Reading & Writing
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {result.domain_breakdown
                    .filter(d => rwDomains.includes(d.domain))
                    .map((domain) => (
                      <DomainCard
                        key={domain.domain}
                        domain={domain.domain}
                        correct={domain.correct}
                        total={domain.total}
                        isRW={true}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Math Domains */}
            {(isFull || isMathOnly || (isSingleModule && result.domain_breakdown.some(d => mathDomains.includes(d.domain)))) && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-2">
                  <Calculator className="w-4 h-4" /> Math
                </h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  {result.domain_breakdown
                    .filter(d => mathDomains.includes(d.domain))
                    .map((domain) => (
                      <DomainCard
                        key={domain.domain}
                        domain={domain.domain}
                        correct={domain.correct}
                        total={domain.total}
                        isRW={false}
                      />
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Call to Action */}
        <div className="mt-16 text-center">
          <div className="inline-flex flex-col sm:flex-row gap-4">
            <Button
              size="lg"
              className="gap-2"
              onClick={() => navigate(`/review/${attemptId}`)}
            >
              <FileText className="w-5 h-5" /> Review All Answers
            </Button>
            <Button size="lg" variant="outline" className="gap-2" onClick={() => navigate('/dashboard')}>
              <TrendingUp className="w-5 h-5" /> Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div >
  );
}
