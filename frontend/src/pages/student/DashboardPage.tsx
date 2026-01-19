import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Play,
  Clock,
  Award,
  ArrowRight,
  TrendingUp,
  Target,
  BookOpen,
  Calculator,
  Trophy,
  ChevronRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Star,
  Pencil,
  Zap,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { testService } from '@/services/test';
import { examService, AttemptStatus } from '@/services/exam';
import { analyticsService } from '@/services/analytics';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { TestConfigDialog, type TestConfig } from '@/components/features/exam/TestConfigDialog';
import { DrillConfigDialog } from '@/components/features/exam/DrillConfigDialog';
import { LineChart, DomainPerformance } from '@/components/ui/charts';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Test } from '@/types/test';

// Score Display Component
function ScoreDisplay({ score, label }: { score: number | null; label: string }) {
  const getScoreColor = (s: number) => {
    if (s >= 1400) return 'text-green-600';
    if (s >= 1200) return 'text-blue-600';
    if (s >= 1000) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="text-center">
      <div className={cn('text-4xl font-bold tracking-tight font-mono', score ? getScoreColor(score) : 'text-muted-foreground')}>
        {score ?? '--'}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuthStore();

  // State for test config dialog
  const [selectedTest, setSelectedTest] = useState<Test | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLoadingTestDetails, setIsLoadingTestDetails] = useState(false);
  const [isDrillOpen, setIsDrillOpen] = useState(false);
  const [attemptToDelete, setAttemptToDelete] = useState<number | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Target score state with localStorage persistence
  const [targetScore, setTargetScore] = useState<number>(() => {
    const saved = localStorage.getItem('targetScore');
    return saved ? parseInt(saved, 10) : 1500;
  });
  const [isEditingTarget, setIsEditingTarget] = useState(false);

  const { data: tests, isLoading: isLoadingTests } = useQuery({
    queryKey: ['tests'],
    queryFn: testService.getAllTests,
  });

  const { data: attempts, isLoading: isLoadingAttempts } = useQuery({
    queryKey: ['attempts'],
    queryFn: examService.getAttempts,
  });

  // Fetch analytics data
  const { data: analytics } = useQuery({
    queryKey: ['my-analytics'],
    queryFn: analyticsService.getMyAnalytics,
  });

  const { data: domainPerformance } = useQuery({
    queryKey: ['my-domain-performance'],
    queryFn: analyticsService.getDomainPerformance,
  });

  const queryClient = useQueryClient();

  const startAttemptMutation = useMutation({
    mutationFn: async ({ testId, config }: { testId: number; config: TestConfig }) => {
      // Convert TestConfig from dialog format to exam service format
      const examConfig = {
        time_multiplier: config.timeMultiplier,
        scope: config.scope,
        selected_module_id: config.selectedModuleId ?? null,
      };
      return examService.startAttempt(testId, examConfig);
    },
    onSuccess: (attempt) => {
      setIsConfigOpen(false);
      navigate(`/exam/${attempt.id}`);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to start test',
        description: error.response?.data?.detail || 'Something went wrong',
      });
    },
  });

  const deleteAttemptMutation = useMutation({
    mutationFn: (attemptId: number) => examService.deleteAttempt(attemptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attempts'] });
      queryClient.invalidateQueries({ queryKey: ['my-analytics'] });
      toast({
        title: 'Attempt deleted',
        description: 'The test attempt has been removed.',
      });
      setIsDeleteConfirmOpen(false);
      setAttemptToDelete(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to delete attempt',
        description: error.response?.data?.detail || 'Something went wrong',
      });
    },
  });

  const handleOpenTestConfig = async (test: Test) => {
    // Fetch full test with modules for single module selection
    setIsLoadingTestDetails(true);
    try {
      const fullTest = await testService.getTest(test.id);
      setSelectedTest(fullTest);
      setIsConfigOpen(true);
    } catch {
      toast({
        variant: 'destructive',
        title: 'Failed to load test details',
        description: 'Please try again',
      });
    } finally {
      setIsLoadingTestDetails(false);
    }
  };

  const handleStartTest = (config: TestConfig) => {
    if (!selectedTest) return;
    startAttemptMutation.mutate({ testId: selectedTest.id, config });
  };

  const handleContinueAttempt = (attemptId: number) => {
    navigate(`/exam/${attemptId}`);
  };

  const handleDeleteAttempt = (e: React.MouseEvent, attemptId: number) => {
    e.stopPropagation();
    setAttemptToDelete(attemptId);
    setIsDeleteConfirmOpen(true);
  };

  const handleViewResults = (attemptId: number) => {
    navigate(`/results/${attemptId}`);
  };

  const inProgressAttempts = attempts?.items.filter((a) => a.status === AttemptStatus.IN_PROGRESS) || [];
  const completedAttempts = attempts?.items.filter((a) => a.status === AttemptStatus.COMPLETED) || [];

  // Distinguish between Full and Practice tests for trends
  const fullTests = completedAttempts.filter(a => (a.scope || 'full') === 'full');
  const practiceTests = completedAttempts.filter(a => (a.scope || 'full') !== 'full');

  // Sort chronologically for charts
  const sortByDate = (arr: any[]) => [...arr].sort((a, b) =>
    new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  const fullSorted = sortByDate(fullTests);
  const practiceSorted = sortByDate(practiceTests);

  // Calculate real stats from full completed attempts
  const totalTests = fullTests.length;
  const highestScore = fullTests.reduce((max, a) => Math.max(max, a.total_score || 0), 0) || null;
  const averageScore = totalTests > 0
    ? Math.round(fullTests.reduce((sum, a) => sum + (a.total_score || 0), 0) / totalTests)
    : null;

  // Calculate score improvement (last vs first full test)
  const scoreTrend = (() => {
    if (fullSorted.length < 2) return null;
    const firstScore = fullSorted[0]?.total_score || 0;
    const lastScore = fullSorted[fullSorted.length - 1]?.total_score || 0;
    return lastScore - firstScore;
  })();

  const getTestTypeBadge = (testType: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      full_test: { label: 'Full SAT', className: 'test-card-badge full' },
      section_test: { label: 'Section', className: 'test-card-badge section' },
      module_test: { label: 'Module', className: 'test-card-badge section' },
      mini_test: { label: 'Mini', className: 'test-card-badge mini' },
    };
    return badges[testType] || badges.mini_test;
  };

  const firstName = user?.full_name?.split(' ')[0] || 'Student';

  return (
    <div className="space-y-8 pb-8">
      {/* Welcome Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/90 text-white p-8 md:p-10">
        <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-secondary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Welcome back, {firstName}!
            </h1>
            <p className="text-white/80 mt-2 max-w-lg">
              Ready to achieve your target score? Track your progress, practice daily, and watch your score improve.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-6 bg-white/10 backdrop-blur-sm rounded-xl p-4 md:p-6">
            <ScoreDisplay score={highestScore} label="Best Score" />
            <div className="w-px h-12 bg-white/20" />
            <ScoreDisplay score={averageScore} label="Average" />
            <div className="w-px h-12 bg-white/20" />
            <div className="text-center">
              <div className="text-4xl font-bold tracking-tight font-mono">{totalTests}</div>
              <div className="text-sm text-white/80 mt-1">Tests Done</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards Row - Using Real Data */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Tests Completed */}
        <Card className="card-premium">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center text-white">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tests Completed</p>
                <p className="text-2xl font-bold">{totalTests}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Target Score - Editable */}
        <Card className="card-premium group cursor-pointer relative" onClick={() => !isEditingTarget && setIsEditingTarget(true)}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white">
                <Target className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Target Score</p>
                {isEditingTarget ? (
                  <Input
                    type="number"
                    value={targetScore}
                    onChange={(e) => setTargetScore(Number(e.target.value))}
                    onBlur={() => {
                      localStorage.setItem('targetScore', targetScore.toString());
                      setIsEditingTarget(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        localStorage.setItem('targetScore', targetScore.toString());
                        setIsEditingTarget(false);
                      }
                    }}
                    className="text-2xl font-bold w-24 h-8 p-1"
                    min={400}
                    max={1600}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <p className="text-2xl font-bold">{targetScore}</p>
                )}
              </div>
              {!isEditingTarget && (
                <Pencil className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Score Trend */}
        <Card className="card-premium">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Score Trend</p>
                <p className={cn(
                  "text-2xl font-bold",
                  scoreTrend && scoreTrend > 0 ? 'text-green-600' :
                    scoreTrend && scoreTrend < 0 ? 'text-red-600' : ''
                )}>
                  {scoreTrend !== null ? (scoreTrend > 0 ? `+${scoreTrend}` : scoreTrend) : '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Points to Target */}
        <Card className="card-premium">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Points to Target</p>
                <p className="text-2xl font-bold">
                  {highestScore ? Math.max(0, targetScore - highestScore) : '--'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Continue Section */}
      {inProgressAttempts.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 rounded-full bg-secondary" />
            <h2 className="text-xl font-semibold">Continue Where You Left Off</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {inProgressAttempts.map((attempt) => (
              <Card
                key={attempt.id}
                className="card-premium border-l-4 border-l-secondary cursor-pointer hover:shadow-lg transition-all"
                onClick={() => handleContinueAttempt(attempt.id)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{attempt.test_title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Started {format(new Date(attempt.started_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-secondary" />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button
                      className="flex-1 btn-gold"
                      onClick={() => handleContinueAttempt(attempt.id)}
                    >
                      Resume Test
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                      onClick={(e) => handleDeleteAttempt(e, attempt.id)}
                      disabled={deleteAttemptMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Quick Practice Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-6 rounded-full bg-primary" />
            <h2 className="text-xl font-semibold">Quick Practice</h2>
          </div>
          <Button
            onClick={() => setIsDrillOpen(true)}
            className="btn-gold"
          >
            <Zap className="w-4 h-4 mr-2" />
            Create Drill
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Practice specific domains, focus on weak areas, or create custom drills.
        </p>
      </section>

      {/* Main Content Tabs */}
      <Tabs defaultValue="practice" className="space-y-6">
        <TabsList className="bg-muted/50 p-1 h-12">
          <TabsTrigger
            value="practice"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm h-10 px-6"
          >
            <Play className="w-4 h-4 mr-2" />
            Practice Tests
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm h-10 px-6"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Test History
          </TabsTrigger>
          <TabsTrigger
            value="schedule"
            className="data-[state=active]:bg-white data-[state=active]:shadow-sm h-10 px-6"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Study Plan
          </TabsTrigger>
        </TabsList>

        {/* Practice Tests Tab */}
        <TabsContent value="practice" className="space-y-6 animate-fade-in">
          {/* Section: Full Tests */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-muted-foreground">Full Practice Tests</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {isLoadingTests ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-48 rounded-xl" />
                  ))}
                </>
              ) : (
                tests
                  ?.filter((t) => t.test_type === 'full_test')
                  .map((test) => {
                    const badge = getTestTypeBadge(test.test_type);
                    return (
                      <Card key={test.id} className="test-card group">
                        <div className={badge.className}>{badge.label}</div>

                        <CardHeader className="pb-3">
                          <CardTitle className="text-lg leading-tight pr-16">
                            {test.title}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-4 mt-2">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {test.time_limit_minutes || 134} min
                            </span>
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5" />
                              {test.total_questions || 98} questions
                            </span>
                          </CardDescription>
                        </CardHeader>

                        <CardContent>
                          <Button
                            className="w-full btn-premium group-hover:shadow-lg transition-shadow"
                            onClick={() => handleOpenTestConfig(test)}
                            disabled={isLoadingTestDetails || startAttemptMutation.isPending}
                          >
                            {isLoadingTestDetails ? 'Loading...' : 'Start Practice'}
                            {!isLoadingTestDetails && <Play className="w-4 h-4 ml-2" />}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })
              )}
            </div>
          </div>

          {/* Section: Quick Practice */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-muted-foreground">Quick Practice</h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {tests
                ?.filter((t) => t.test_type !== 'full_test')
                .slice(0, 4)
                .map((test) => {
                  const isRW = test.section === 'reading_writing';

                  return (
                    <Card key={test.id} className="test-card group">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'w-10 h-10 rounded-lg flex items-center justify-center',
                              isRW ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                            )}
                          >
                            {isRW ? (
                              <BookOpen className="w-5 h-5" />
                            ) : (
                              <Calculator className="w-5 h-5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate">{test.title}</h4>
                            <p className="text-sm text-muted-foreground">
                              {test.time_limit_minutes} min • {test.total_questions} Q
                            </p>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          className="w-full mt-4"
                          onClick={() => handleOpenTestConfig(test)}
                          disabled={isLoadingTestDetails}
                        >
                          {isLoadingTestDetails ? 'Loading...' : 'Start'}
                          {!isLoadingTestDetails && <ChevronRight className="w-4 h-4 ml-1" />}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        </TabsContent>

        {/* History Tab - Enhanced with Charts */}
        <TabsContent value="history" className="animate-fade-in space-y-6">
          {/* Charts Row 1: Score & Time */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Score Progression */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  Score Progression
                </CardTitle>
                <CardDescription>Your full test scores over time</CardDescription>
              </CardHeader>
              <CardContent className="min-h-[280px]">
                {fullSorted.length > 0 ? (
                  <LineChart
                    series={[
                      {
                        name: 'Total Score',
                        data: fullSorted.map(a => a.total_score || 0),
                      },
                    ]}
                    categories={fullSorted.map((_, i) => `Test ${i + 1}`)}
                    height={250}
                    colors={['#3b82f6']}
                  />
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    <p className="text-center">Complete your first full test to see your score trend</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Practice Accuracy Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-emerald-600" />
                  Practice Accuracy
                </CardTitle>
                <CardDescription>Accuracy (%) in single module/section tests</CardDescription>
              </CardHeader>
              <CardContent className="min-h-[280px]">
                {practiceSorted.length > 0 ? (
                  <LineChart
                    series={[
                      {
                        name: 'Accuracy',
                        data: practiceSorted.map(a => {
                          // For practice tests, calculate accuracy from available data
                          // Check for raw scores (correct counts out of total questions)
                          const rwRaw = (a as any).reading_writing_raw_score || 0;
                          const mathRaw = (a as any).math_raw_score || 0;
                          const totalRaw = rwRaw + mathRaw;

                          // Estimate total questions based on scope
                          // Section test: ~54 questions, Module: ~27 questions
                          const scope = (a as any).scope || 'section';
                          const estimatedTotal = scope === 'module' ? 27 : 54;

                          if (totalRaw > 0) {
                            return Math.min(100, Math.round((totalRaw / estimatedTotal) * 100));
                          }

                          // Fallback: use total_score if available (scaled 200-800 per section)
                          const totalScore = a.total_score || 0;
                          if (totalScore > 0) {
                            // Convert scaled score to approximate percentage (400-1600 range -> 0-100%)
                            return Math.round(((totalScore - 400) / 1200) * 100);
                          }

                          return 0;
                        }),
                      },
                    ]}
                    categories={practiceSorted.map((_, i) => `Practice ${i + 1}`)}
                    height={250}
                    colors={['#10b981']}
                  />
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    <p className="text-center">Single module/section tests will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Time Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" />
                  Time Management
                </CardTitle>
                <CardDescription>Average time spent per test (minutes)</CardDescription>
              </CardHeader>
              <CardContent className="min-h-[280px]">
                {fullSorted.length > 0 ? (
                  <LineChart
                    series={[
                      {
                        name: 'Time (min)',
                        data: fullSorted.map(a => Math.round((a.time_spent_seconds || 0) / 60)),
                      },
                    ]}
                    categories={fullSorted.map((_, i) => `Test ${i + 1}`)}
                    height={250}
                    colors={['#d97706']}
                  />
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    <p className="text-center">Complete your first full test to see your time trend</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Charts Row 2: Domain Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-600" />
                Performance by Domain
              </CardTitle>
              <CardDescription>Your accuracy across all SAT domains</CardDescription>
            </CardHeader>
            <CardContent className="min-h-[280px]">
              {domainPerformance && domainPerformance.length > 0 ? (
                <DomainPerformance
                  domains={domainPerformance}
                  height={250}
                  title=""
                />
              ) : (
                <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                  <p className="text-center">Complete more tests to see your domain performance</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Weak Areas Alert */}
          {analytics?.weak_domains && analytics.weak_domains.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <h4 className="font-semibold text-amber-900">Areas to Focus On</h4>
                      <p className="text-sm text-amber-700 mt-1">
                        Your performance in these domains is below 60%. Recommended: Review topic guides and practice these specific questions.
                      </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {analytics.weak_domains.map(domain => {
                        const perf = analytics.domain_performance?.[domain];
                        const accuracy = perf ? Math.round(perf.accuracy * 100) : 0;
                        const label = domain.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                        return (
                          <div key={domain} className="bg-white/60 rounded-lg p-3 border border-amber-200/50">
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="font-medium text-sm text-amber-900">{label}</span>
                              <span className="text-xs font-bold text-amber-700">{accuracy}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-amber-100 overflow-hidden">
                              <div
                                className="h-full bg-amber-500 rounded-full"
                                style={{ width: `${accuracy}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Strong Areas */}
          {analytics?.strong_domains && analytics.strong_domains.length > 0 && (
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <Star className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-emerald-900">Your Strengths</h4>
                    <p className="text-sm text-emerald-700 mt-1">
                      You're doing great in these areas! Keep it up:
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {analytics.strong_domains.map(domain => (
                        <Badge key={domain} variant="outline" className="bg-white border-emerald-300">
                          {domain.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Test History List */}
          <Card className="card-premium">
            <CardHeader>
              <CardTitle>Test History</CardTitle>
              <CardDescription>Click on a test to review your answers</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingAttempts ? (
                <div className="p-8 text-center text-muted-foreground">Loading history...</div>
              ) : completedAttempts.length > 0 ? (
                <div className="divide-y">
                  {completedAttempts.map((attempt, index) => (
                    <div
                      key={attempt.id}
                      className="p-4 md:p-6 flex items-center gap-4 hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => handleViewResults(attempt.id)}
                    >
                      {/* Rank/Order */}
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                        {completedAttempts.length - index}
                      </div>

                      {/* Test Info */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium">{attempt.test_title}</h4>
                        <p className="text-sm text-muted-foreground">
                          {attempt.completed_at &&
                            format(new Date(attempt.completed_at), 'MMM d, yyyy • h:mm a')}
                        </p>
                      </div>

                      {/* Score */}
                      <div className="text-right">
                        <div
                          className={cn(
                            'text-2xl font-bold font-mono',
                            attempt.total_score && attempt.total_score >= 1400
                              ? 'text-green-600'
                              : attempt.total_score && attempt.total_score >= 1200
                                ? 'text-blue-600'
                                : 'text-foreground'
                          )}
                        >
                          {attempt.total_score || '--'}
                        </div>
                        <div className="text-xs text-muted-foreground">Total Score</div>
                      </div>

                      {/* Action */}
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Award className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg">No completed tests yet</h3>
                  <p className="text-muted-foreground mt-1 max-w-sm mx-auto">
                    Complete your first practice test to see your score history and track your progress.
                  </p>
                  <Button
                    className="mt-6 btn-premium"
                    onClick={() => tests?.[0] && handleOpenTestConfig(tests[0])}
                    disabled={isLoadingTestDetails}
                  >
                    {isLoadingTestDetails ? 'Loading...' : 'Take Your First Test'}
                    {!isLoadingTestDetails && <ArrowRight className="w-4 h-4 ml-2" />}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Study Plan Tab */}
        <TabsContent value="schedule" className="animate-fade-in">
          <Card className="card-premium">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-lg">Personalized Study Plan</h3>
              <p className="text-muted-foreground mt-1 max-w-md mx-auto">
                Get a custom study plan based on your target score and available time. Our AI will
                create a schedule tailored to your strengths and weaknesses.
              </p>
              <Button className="mt-6 btn-gold">
                Create Study Plan
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this test attempt and all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => attemptToDelete && deleteAttemptMutation.mutate(attemptToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAttemptMutation.isPending ? 'Deleting...' : 'Delete Attempt'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogs */}

      {/* Test Configuration Dialog */}
      <TestConfigDialog
        test={selectedTest}
        open={isConfigOpen}
        onOpenChange={setIsConfigOpen}
        onStart={handleStartTest}
        isLoading={startAttemptMutation.isPending}
      />

      {/* Drill Configuration Dialog */}
      <DrillConfigDialog
        open={isDrillOpen}
        onOpenChange={setIsDrillOpen}
      />
    </div>
  );
}
