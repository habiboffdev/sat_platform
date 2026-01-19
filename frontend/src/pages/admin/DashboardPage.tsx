import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Users,
  BookOpen,
  Trophy,
  TrendingUp,
  CheckCircle2,
  BarChart3,
  Activity,
  Award,
  AlertTriangle,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { adminService } from '@/services/admin';
import { AreaChart, ScoreDistribution, LineChart } from '@/components/ui/charts';
import { cn } from '@/lib/utils';

// Stat Card Component
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  color?: 'blue' | 'green' | 'amber' | 'purple' | 'red';
}) {
  const colorMap = {
    blue: 'bg-blue-500/10 text-blue-600',
    green: 'bg-emerald-500/10 text-emerald-600',
    amber: 'bg-amber-500/10 text-amber-600',
    purple: 'bg-purple-500/10 text-purple-600',
    red: 'bg-red-500/10 text-red-600',
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div className={cn(
                "flex items-center gap-1 text-xs font-medium",
                trend.value > 0 ? "text-emerald-600" : trend.value < 0 ? "text-red-600" : "text-muted-foreground"
              )}>
                <TrendingUp className={cn("w-3 h-3", trend.value < 0 && "rotate-180")} />
                {trend.value > 0 ? '+' : ''}{trend.value}% {trend.label}
              </div>
            )}
          </div>
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", colorMap[color])}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  // Fetch dashboard data
  const { data: dashboard, isLoading: loadingDashboard } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: adminService.getDashboard,
  });

  // Fetch user analytics for charts
  const { data: userAnalytics, isLoading: loadingUserAnalytics } = useQuery({
    queryKey: ['admin-user-analytics'],
    queryFn: () => adminService.getUserAnalytics(30),
  });

  // Fetch trends for charts
  const { data: trends, isLoading: loadingTrends } = useQuery({
    queryKey: ['admin-trends'],
    queryFn: () => adminService.getTrends(30),
  });

  // Fetch score distribution
  const { data: scoreDistribution, isLoading: loadingScoreDistribution } = useQuery({
    queryKey: ['admin-score-distribution'],
    queryFn: adminService.getScoreDistribution,
  });

  // Fetch test analytics
  const { data: testAnalytics, isLoading: loadingTestAnalytics } = useQuery({
    queryKey: ['admin-test-analytics'],
    queryFn: adminService.getTestAnalytics,
  });

  // Prepare chart data
  const userGrowthData = userAnalytics?.cumulative_growth || [];
  const trendsData = trends?.daily || [];

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor platform performance and student analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Activity className="w-3 h-3" />
            Live Data
          </Badge>
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={dashboard?.users.total ?? '--'}
          subtitle={`${dashboard?.users.active ?? 0} active`}
          icon={Users}
          trend={dashboard?.users.new_this_week ? {
            value: Math.round((dashboard.users.new_this_week / Math.max(dashboard.users.total - dashboard.users.new_this_week, 1)) * 100),
            label: 'this week'
          } : undefined}
          color="blue"
        />
        <StatCard
          title="Total Tests"
          value={dashboard?.tests.total ?? '--'}
          subtitle={`${dashboard?.tests.published ?? 0} published`}
          icon={BookOpen}
          color="purple"
        />
        <StatCard
          title="Tests Completed"
          value={dashboard?.attempts.completed ?? '--'}
          subtitle={`${dashboard?.attempts.this_week ?? 0} this week`}
          icon={CheckCircle2}
          color="green"
        />
        <StatCard
          title="Average Score"
          value={dashboard?.scores.average ?? '--'}
          subtitle={`${dashboard?.attempts.completion_rate ?? 0}% completion rate`}
          icon={Trophy}
          color="amber"
        />
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Growth Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              User Growth
            </CardTitle>
            <CardDescription>Cumulative user registrations over time</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingUserAnalytics ? (
              <div className="h-[300px] flex items-center justify-center">
                <span className="text-muted-foreground">Loading chart...</span>
              </div>
            ) : (
              <AreaChart
                series={[{
                  name: 'Total Users',
                  data: userGrowthData.map(d => d.total),
                }]}
                categories={userGrowthData.map(d => format(new Date(d.date), 'MMM d'))}
                height={300}
                colors={['#3b82f6']}
              />
            )}
          </CardContent>
        </Card>

        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-amber-600" />
              Score Distribution
            </CardTitle>
            <CardDescription>
              {scoreDistribution?.stats?.count ?? 0} total scores analyzed
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingScoreDistribution ? (
              <div className="h-[300px] flex items-center justify-center">
                <span className="text-muted-foreground">Loading chart...</span>
              </div>
            ) : scoreDistribution?.distribution ? (
              <ScoreDistribution
                distribution={scoreDistribution.distribution}
                height={300}
                title=""
              />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No score data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity & Tests Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            Daily Activity
          </CardTitle>
          <CardDescription>Tests completed and new users per day</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingTrends ? (
            <div className="h-[300px] flex items-center justify-center">
              <span className="text-muted-foreground">Loading chart...</span>
            </div>
          ) : (
            <LineChart
              series={[
                {
                  name: 'Tests Completed',
                  data: trendsData.map(d => d.tests_completed),
                },
                {
                  name: 'New Users',
                  data: trendsData.map(d => d.new_users),
                },
              ]}
              categories={trendsData.map(d => format(new Date(d.date), 'MMM d'))}
              height={300}
              colors={['#10b981', '#3b82f6']}
            />
          )}
        </CardContent>
      </Card>

      {/* Tabs for detailed views */}
      <Tabs defaultValue="activity" className="space-y-4">
        <TabsList>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="performers">Top Performers</TabsTrigger>
          <TabsTrigger value="tests">Popular Tests</TabsTrigger>
          <TabsTrigger value="difficult">Difficult Questions</TabsTrigger>
        </TabsList>

        {/* Recent Activity Tab */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Recent Test Completions</CardTitle>
              <CardDescription>Latest tests completed by students</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDashboard ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : dashboard?.recent_activity?.length ? (
                <div className="space-y-4">
                  {dashboard.recent_activity.map((activity, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-semibold">
                            {activity.user_name?.charAt(0)?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{activity.user_name}</p>
                          <p className="text-sm text-muted-foreground">{activity.test_title}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          "text-xl font-bold",
                          activity.score && activity.score >= 1400 ? "text-emerald-600" :
                          activity.score && activity.score >= 1200 ? "text-blue-600" :
                          "text-muted-foreground"
                        )}>
                          {activity.score ?? '--'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.completed_at && format(new Date(activity.completed_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No recent activity
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Performers Tab */}
        <TabsContent value="performers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                Top Performers (Last 30 Days)
              </CardTitle>
              <CardDescription>Students with highest scores</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingDashboard ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : dashboard?.top_performers?.length ? (
                <div className="space-y-3">
                  {dashboard.top_performers.map((performer, i) => (
                    <div
                      key={performer.user_id}
                      className="flex items-center gap-4 p-4 rounded-lg bg-muted/30"
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                        i === 0 ? "bg-amber-500 text-white" :
                        i === 1 ? "bg-slate-400 text-white" :
                        i === 2 ? "bg-amber-700 text-white" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{performer.user_name}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-emerald-600">{performer.best_score}</p>
                        <p className="text-xs text-muted-foreground">Best Score</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Popular Tests Tab */}
        <TabsContent value="tests">
          <Card>
            <CardHeader>
              <CardTitle>Most Popular Tests</CardTitle>
              <CardDescription>Tests with the most attempts</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingTestAnalytics ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : testAnalytics?.popular_tests?.length ? (
                <div className="space-y-4">
                  {testAnalytics.popular_tests.map((test) => (
                    <div
                      key={test.test_id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{test.title}</p>
                          <Badge variant="secondary" className="text-xs mt-1">
                            {test.test_type.replace('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{test.attempt_count}</p>
                        <p className="text-xs text-muted-foreground">attempts</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  No test data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Difficult Questions Tab */}
        <TabsContent value="difficult">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Most Difficult Questions
              </CardTitle>
              <CardDescription>Questions with lowest accuracy rates</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingTestAnalytics ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : testAnalytics?.difficult_questions?.length ? (
                <div className="space-y-3">
                  {testAnalytics.difficult_questions.map((q) => (
                    <div
                      key={q.question_id}
                      className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                          <span className="text-red-600 font-bold">Q{q.question_number}</span>
                        </div>
                        <div>
                          <p className="font-medium">Question #{q.question_number}</p>
                          {q.domain && (
                            <p className="text-sm text-muted-foreground">
                              {q.domain.replace(/_/g, ' ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <Progress value={q.accuracy} className="w-24 h-2" />
                          <span className={cn(
                            "font-bold",
                            q.accuracy < 40 ? "text-red-600" :
                            q.accuracy < 60 ? "text-amber-600" :
                            "text-emerald-600"
                          )}>
                            {q.accuracy}%
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {q.times_answered} attempts
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  Not enough data yet (questions need at least 5 attempts)
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
