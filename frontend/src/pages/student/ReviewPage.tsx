import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Clock,
  Zap,
  Eye,
  Timer,
  Target,
  TrendingUp,
  Keyboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/axios';
import { QuestionContent } from '@/components/ui/QuestionContent';

// Types
interface QuestionReview {
  id: number;
  question_number: number;
  question_text: string;
  question_type: string;
  question_image_url: string | null;
  options: Array<{ id: string; text: string; image_url: string | null }> | null;
  correct_answer: string[];
  explanation: string | null;
  user_answer: string | null;
  is_correct: boolean | null;
  domain?: string | null;
  difficulty?: string | null;
  time_spent_seconds?: number | null;
  passage?: { id: number; content: string; title?: string; source?: string } | null;
}

interface ModuleReview {
  module_id: number;
  section: string;
  module_type: string;
  difficulty: string;
  questions: QuestionReview[];
}

interface AttemptReview {
  attempt_id: number;
  test_id: number;
  test_title: string;
  total_score: number | null;
  reading_writing_scaled_score: number | null;
  math_scaled_score: number | null;
  modules: ModuleReview[];
  summary: {
    total_correct: number;
    total_questions: number;
    accuracy: number;
    by_domain: Record<string, { correct: number; total: number; accuracy: number }>;
  };
}

type FilterType = 'all' | 'correct' | 'incorrect' | 'skipped';

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

const DOMAIN_COLORS: Record<string, string> = {
  craft_and_structure: 'from-violet-500 to-purple-600',
  information_and_ideas: 'from-sky-500 to-blue-600',
  standard_english_conventions: 'from-teal-500 to-emerald-600',
  expression_of_ideas: 'from-indigo-500 to-blue-600',
  algebra: 'from-orange-500 to-amber-600',
  advanced_math: 'from-rose-500 to-pink-600',
  problem_solving_data_analysis: 'from-cyan-500 to-teal-600',
  geometry_trigonometry: 'from-purple-500 to-violet-600',
};

function formatTime(seconds: number): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

// Animated circular progress component
function CircularProgress({ value, size = 80, strokeWidth = 6, className = '' }: { value: number; size?: number; strokeWidth?: number; className?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--secondary))" />
            <stop offset="100%" stopColor="hsl(38, 92%, 60%)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold text-foreground">{Math.round(value)}%</span>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(true);
  const [showExplanation, setShowExplanation] = useState(true);

  const { data: review, isLoading, error } = useQuery({
    queryKey: ['attempt-review', attemptId],
    queryFn: async () => {
      const response = await api.get<AttemptReview>(`/attempts/${attemptId}/review`);
      return response.data;
    },
    enabled: !!attemptId,
  });

  const practiceWrongMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/attempts/${attemptId}/practice-wrong`);
      return response.data;
    },
    onSuccess: (data) => {
      toast({ title: 'Practice session created', description: `${data.question_count} questions ready` });
    },
  });

  const allQuestions = useMemo(() => {
    if (!review) return [];
    return review.modules.flatMap(m =>
      m.questions.map(q => ({ ...q, section: m.section, module_id: m.module_id, module_type: m.module_type }))
    );
  }, [review]);

  const filteredQuestions = useMemo(() => {
    let qs = allQuestions;
    if (selectedModule !== 'all') {
      qs = qs.filter(q => q.module_id.toString() === selectedModule);
    }
    switch (filter) {
      case 'correct': return qs.filter(q => q.is_correct === true);
      case 'incorrect': return qs.filter(q => q.is_correct === false);
      case 'skipped': return qs.filter(q => q.user_answer === null);
      default: return qs;
    }
  }, [allQuestions, filter, selectedModule]);

  const current = filteredQuestions[currentIndex];

  const stats = useMemo(() => ({
    correct: allQuestions.filter(q => q.is_correct === true).length,
    incorrect: allQuestions.filter(q => q.is_correct === false).length,
    skipped: allQuestions.filter(q => q.user_answer === null).length,
    total: allQuestions.length,
  }), [allQuestions]);

  const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;

  const domainStats = useMemo(() => {
    if (!review?.summary?.by_domain) return [];
    return Object.entries(review.summary.by_domain)
      .map(([key, val]) => ({ domain: key, label: DOMAIN_LABELS[key] || key, ...val, wrong: val.total - val.correct }))
      .sort((a, b) => a.accuracy - b.accuracy);
  }, [review]);

  const timeStats = useMemo(() => {
    const withTime = allQuestions.filter(q => q.time_spent_seconds);
    if (withTime.length === 0) return null;
    const total = withTime.reduce((sum, q) => sum + (q.time_spent_seconds || 0), 0);
    return { total, avg: Math.round(total / withTime.length), count: withTime.length };
  }, [allQuestions]);

  useEffect(() => { setCurrentIndex(0); }, [filter, selectedModule]);

  const goNext = useCallback(() => {
    if (currentIndex < filteredQuestions.length - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, filteredQuestions.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowRight' || e.key === 'j') goNext();
      if (e.key === 'ArrowLeft' || e.key === 'k') goPrev();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading review...</p>
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-muted-foreground">Unable to load review</p>
          <button onClick={() => navigate('/dashboard')} className="text-sm text-primary hover:underline">← Back to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-8">
      {/* Premium Sidebar */}
      <aside className="hidden lg:flex flex-col w-80 shrink-0 space-y-6">
        {/* Header with Back Button */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/results/${attemptId}`)}
            className="p-2.5 rounded-xl bg-card border shadow-sm hover:shadow-md transition-all hover:-translate-x-0.5"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">{review.test_title}</h1>
            <p className="text-xs text-muted-foreground">Test Review</p>
          </div>
        </div>

        {/* Accuracy Card - Premium Design */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0wIDBoNDB2NDBIMHoiLz48cGF0aCBkPSJNMjAgMjBtLTEgMGExIDEgMCAxIDAgMiAwYTEgMSAwIDEgMCAtMiAwIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIi8+PC9nPjwvc3ZnPg==')] opacity-50" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60 mb-1">Your Score</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold">{stats.correct}</span>
                <span className="text-xl text-white/50">/ {stats.total}</span>
              </div>
            </div>
            <CircularProgress value={accuracy} size={90} strokeWidth={8} className="text-white" />
          </div>

          {/* Mini Stats */}
          <div className="relative flex items-center gap-4 mt-6 pt-4 border-t border-white/10">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <span className="text-sm">{stats.correct} correct</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <span className="text-sm">{stats.incorrect} wrong</span>
            </div>
            {stats.skipped > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-white/30" />
                <span className="text-sm">{stats.skipped} skipped</span>
              </div>
            )}
          </div>
        </div>

        {/* Time Analytics */}
        {timeStats && (
          <div className="bg-card rounded-2xl border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Timer className="w-4 h-4 text-indigo-600" />
              </div>
              <span className="text-sm font-semibold text-foreground">Time Analytics</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100">
                <p className="text-xs text-indigo-600 font-medium mb-0.5">Total Time</p>
                <p className="text-lg font-bold text-indigo-900">{formatTime(timeStats.total)}</p>
              </div>
              <div className="p-3 rounded-xl bg-gradient-to-br from-violet-50 to-pink-50 border border-violet-100">
                <p className="text-xs text-violet-600 font-medium mb-0.5">Avg per Question</p>
                <p className="text-lg font-bold text-violet-900">{formatTime(timeStats.avg)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Domain Performance */}
        {domainStats.length > 0 && (
          <div className="bg-card rounded-2xl border p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-sm font-semibold text-foreground">Performance by Domain</span>
            </div>
            <div className="space-y-3">
              {domainStats.map(d => (
                <div key={d.domain} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground truncate pr-2">{d.label}</span>
                    <span className={cn(
                      "font-bold tabular-nums",
                      d.accuracy >= 70 ? "text-emerald-600" : d.accuracy >= 50 ? "text-amber-600" : "text-red-500"
                    )}>
                      {Math.round(d.accuracy)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", DOMAIN_COLORS[d.domain] || 'from-gray-400 to-gray-500')}
                      style={{ width: `${d.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Display Options */}
        <div className="bg-card rounded-2xl border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Eye className="w-4 h-4 text-slate-600" />
            </div>
            <span className="text-sm font-semibold text-foreground">Display Options</span>
          </div>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Show Correct Answers</span>
              <button
                onClick={() => setShowCorrectAnswer(!showCorrectAnswer)}
                className={cn(
                  "w-12 h-7 rounded-full transition-all duration-200 relative",
                  showCorrectAnswer ? "bg-primary" : "bg-muted"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200",
                  showCorrectAnswer ? "left-6" : "left-1"
                )} />
              </button>
            </label>
            <label className="flex items-center justify-between cursor-pointer group">
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Show Explanations</span>
              <button
                onClick={() => setShowExplanation(!showExplanation)}
                className={cn(
                  "w-12 h-7 rounded-full transition-all duration-200 relative",
                  showExplanation ? "bg-primary" : "bg-muted"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200",
                  showExplanation ? "left-6" : "left-1"
                )} />
              </button>
            </label>
          </div>
        </div>

        {/* Practice Wrong Button */}
        {stats.incorrect + stats.skipped > 0 && (
          <button
            onClick={() => practiceWrongMutation.mutate()}
            disabled={practiceWrongMutation.isPending}
            className="w-full flex items-center justify-center gap-3 px-5 py-4 text-sm font-semibold bg-gradient-to-r from-primary to-primary/80 text-primary-foreground rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/25 disabled:opacity-50"
          >
            <Zap className="w-5 h-5" />
            Practice Wrong Answers ({stats.incorrect + stats.skipped})
          </button>
        )}

        {/* Keyboard Hints */}
        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
          <Keyboard className="w-3.5 h-3.5" />
          <span>Use <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">←</kbd> <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">→</kbd> to navigate</span>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center gap-3">
          <button onClick={() => navigate(`/results/${attemptId}`)} className="p-2 rounded-xl bg-card border shadow-sm">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-foreground truncate">{review.test_title}</h1>
            <p className="text-xs text-muted-foreground">{stats.correct}/{stats.total} correct</p>
          </div>
        </div>

        {/* Filter Tabs - Premium Design */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center bg-card rounded-xl border p-1.5 shadow-sm">
            {(['all', 'correct', 'incorrect', 'skipped'] as FilterType[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                  filter === f
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {f === 'all' && <span>All <span className="opacity-60">({stats.total})</span></span>}
                {f === 'correct' && <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> {stats.correct}</span>}
                {f === 'incorrect' && <span className="flex items-center gap-1.5"><X className="w-3.5 h-3.5" /> {stats.incorrect}</span>}
                {f === 'skipped' && <span className="opacity-70">Skipped ({stats.skipped})</span>}
              </button>
            ))}
          </div>

          {review.modules.length > 1 && (
            <div className="flex items-center bg-card rounded-xl border p-1.5 shadow-sm overflow-x-auto">
              <button
                onClick={() => setSelectedModule('all')}
                className={cn(
                  "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap",
                  selectedModule === 'all'
                    ? "bg-slate-100 text-slate-900"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All Modules
              </button>
              {review.modules.map(m => (
                <button
                  key={m.module_id}
                  onClick={() => setSelectedModule(m.module_id.toString())}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap",
                    selectedModule === m.module_id.toString()
                      ? m.section === 'reading_writing' ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m.section === 'reading_writing' ? 'R&W' : 'Math'} M{m.module_type === 'module_1' ? '1' : '2'}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Question Navigator - Enhanced Pills */}
        <div className="flex flex-wrap gap-2">
          {filteredQuestions.map((q, i) => (
            <button
              key={`${q.id}-${i}`}
              onClick={() => setCurrentIndex(i)}
              className={cn(
                "relative w-11 h-11 rounded-xl text-sm font-bold flex items-center justify-center transition-all duration-200 border-2",
                q.is_correct === true && "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100",
                q.is_correct === false && "bg-red-50 border-red-300 text-red-600 hover:bg-red-100",
                q.user_answer === null && "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100",
                currentIndex === i && "ring-2 ring-offset-2 ring-slate-900 scale-110"
              )}
            >
              {q.question_number}
              {q.time_spent_seconds !== null && q.time_spent_seconds !== undefined && q.time_spent_seconds > 120 && (
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          ))}
        </div>

        {/* Current Question Card - Premium Design */}
        {current ? (
          <div className="bg-card rounded-3xl border shadow-lg overflow-hidden animate-fade-in">
            {/* Question Header */}
            <div className="px-8 py-5 border-b bg-gradient-to-r from-slate-50 to-white flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold">
                  {current.question_number}
                </span>
                <div className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide",
                  current.section === 'reading_writing' ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                )}>
                  {current.section === 'reading_writing' ? 'Reading & Writing' : 'Math'}
                </div>
              </div>

              {current.domain && (
                <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                  {DOMAIN_LABELS[current.domain] || current.domain}
                </div>
              )}

              {current.time_spent_seconds !== null && current.time_spent_seconds !== undefined && current.time_spent_seconds > 0 && (
                <div className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                  current.time_spent_seconds > 120 ? "bg-amber-50 text-amber-700" : "bg-indigo-50 text-indigo-700"
                )}>
                  <Clock className="w-3.5 h-3.5" />
                  {formatTime(current.time_spent_seconds)}
                </div>
              )}

              <div className="ml-auto flex items-center gap-4">
                <span className="text-sm text-muted-foreground font-medium">
                  {currentIndex + 1} of {filteredQuestions.length}
                </span>
                <div className={cn(
                  "px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2",
                  current.is_correct === true && "bg-emerald-100 text-emerald-700",
                  current.is_correct === false && "bg-red-100 text-red-600",
                  current.user_answer === null && "bg-slate-100 text-slate-500"
                )}>
                  {current.is_correct === true && <><Check className="w-4 h-4" /> Correct</>}
                  {current.is_correct === false && <><X className="w-4 h-4" /> Incorrect</>}
                  {current.user_answer === null && 'Skipped'}
                </div>
              </div>
            </div>

            {/* Question Content */}
            <div className="p-8 lg:p-10">
              {/* Passage */}
              {current.passage && (
                <div className="mb-10 p-8 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl border border-slate-200">
                  {current.passage.title && (
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">{current.passage.title}</p>
                  )}
                  <QuestionContent content={current.passage.content} variant="passage" />
                </div>
              )}

              {/* Question Text */}
              <QuestionContent content={current.question_text} variant="question" size="lg" className="mb-10" />

              {current.question_image_url && (
                <img
                  src={current.question_image_url}
                  alt="Question illustration"
                  className="max-w-full rounded-2xl mb-10 shadow-sm border"
                />
              )}

              {/* Answer Options */}
              {current.question_type === 'multiple_choice' && current.options ? (
                <div className="space-y-4">
                  {current.options.map(opt => {
                    const isUser = current.user_answer === opt.id;
                    const isCorrect = current.correct_answer.includes(opt.id);
                    const shouldHighlightCorrect = showCorrectAnswer && isCorrect;

                    return (
                      <div
                        key={opt.id}
                        className={cn(
                          "flex items-start gap-5 p-6 rounded-2xl border-2 transition-all duration-200",
                          shouldHighlightCorrect && "bg-emerald-50 border-emerald-300 shadow-sm",
                          isUser && !isCorrect && "bg-red-50 border-red-300 shadow-sm",
                          !shouldHighlightCorrect && !(isUser && !isCorrect) && "border-slate-200 hover:border-slate-300"
                        )}
                      >
                        <span className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center text-base font-bold shrink-0 transition-all",
                          shouldHighlightCorrect && "bg-emerald-500 text-white shadow-lg shadow-emerald-200",
                          isUser && !isCorrect && "bg-red-500 text-white shadow-lg shadow-red-200",
                          !shouldHighlightCorrect && !(isUser && !isCorrect) && "bg-slate-100 text-slate-600"
                        )}>
                          {opt.id}
                        </span>
                        <QuestionContent content={opt.text} variant="option" className="flex-1 pt-0.5" />
                        <div className="flex items-center gap-3 shrink-0 pt-1">
                          {shouldHighlightCorrect && <Check className="w-6 h-6 text-emerald-600" />}
                          {isUser && !isCorrect && <X className="w-6 h-6 text-red-500" />}
                          {isUser && (
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your answer</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div className={cn(
                    "p-6 rounded-2xl border-2",
                    !current.is_correct && current.user_answer !== null ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"
                  )}>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Your Answer</p>
                    <p className="font-mono text-3xl font-bold text-slate-900">{current.user_answer || '—'}</p>
                  </div>
                  {showCorrectAnswer && (
                    <div className="p-6 rounded-2xl border-2 border-emerald-300 bg-emerald-50">
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">Correct Answer</p>
                      <p className="font-mono text-3xl font-bold text-emerald-700">{current.correct_answer.join(' or ')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Explanation */}
              {showExplanation && current.explanation && (
                <div className="mt-10 p-8 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl border border-blue-200">
                  <div className="flex items-center gap-3 text-blue-700 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                      <Lightbulb className="w-5 h-5" />
                    </div>
                    <span className="text-lg font-bold">Explanation</span>
                  </div>
                  <QuestionContent content={current.explanation} variant="explanation" className="text-blue-900/80" />
                </div>
              )}
            </div>

            {/* Navigation Footer */}
            <div className="px-8 py-5 border-t bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-30 rounded-xl hover:bg-slate-100 transition-all"
              >
                <ChevronLeft className="w-5 h-5" /> Previous
              </button>
              <div className="flex items-center gap-2">
                {filteredQuestions.slice(Math.max(0, currentIndex - 2), currentIndex + 3).map((_, i) => {
                  const actualIndex = Math.max(0, currentIndex - 2) + i;
                  return (
                    <button
                      key={actualIndex}
                      onClick={() => setCurrentIndex(actualIndex)}
                      className={cn(
                        "w-2.5 h-2.5 rounded-full transition-all",
                        actualIndex === currentIndex ? "bg-slate-900 scale-125" : "bg-slate-300 hover:bg-slate-400"
                      )}
                    />
                  );
                })}
              </div>
              <button
                onClick={goNext}
                disabled={currentIndex >= filteredQuestions.length - 1}
                className="flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-30 rounded-xl hover:bg-slate-100 transition-all"
              >
                Next <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-card rounded-3xl border p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-6">
              <Target className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-lg text-muted-foreground mb-4">No questions match this filter</p>
            <button
              onClick={() => { setFilter('all'); setSelectedModule('all'); }}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Show all questions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
