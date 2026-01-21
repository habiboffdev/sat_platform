import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import LandingPage from '@/pages/LandingPage';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import AdminLayout from '@/components/layout/AdminLayout';
import StudentLayout from '@/components/layout/StudentLayout';
import TestList from '@/components/features/admin/TestList';
import TestBuilderPage from '@/pages/admin/TestBuilderPage';
import AdminDashboardPage from '@/pages/admin/DashboardPage';
import UsersPage from '@/pages/admin/UsersPage';
import QuestionBankPage from '@/pages/admin/QuestionBankPage';
import ImportQuestionsPage from '@/pages/admin/ImportQuestionsPage';
import CreateTestPage from '@/pages/admin/CreateTestPage';
import ScoreAnalyticsPage from '@/pages/admin/ScoreAnalyticsPage';
import OCRImportPage from '@/pages/admin/OCRImportPage';
import OCRReviewPage from '@/pages/admin/OCRReviewPage';
import ExamPage from '@/pages/exam/ExamPage';
import DashboardPage from '@/pages/student/DashboardPage';
import ResultsPage from '@/pages/student/ResultsPage';
import ReviewPage from '@/pages/student/ReviewPage';
import DrillPage from '@/pages/student/DrillPage';
import { ExamErrorBoundary } from '@/components/features/exam/ExamErrorBoundary';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Student Routes */}
          <Route element={<ProtectedRoute allowedRoles={['student']} />}>
            <Route element={<StudentLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/results/:attemptId" element={<ResultsPage />} />
              <Route path="/review/:attemptId" element={<ReviewPage />} />
              <Route path="/drill" element={<DrillPage />} />
            </Route>
            {/* Exam page should be standalone (no header/footer distraction) */}
            <Route path="/exam/:attemptId" element={
              <ExamErrorBoundary>
                <ExamPage />
              </ExamErrorBoundary>
            } />
          </Route>

          {/* Admin Routes */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="tests" element={<TestList />} />
              <Route path="tests/new" element={<TestBuilderPage />} />
              <Route path="tests/:id" element={<TestBuilderPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="questions" element={<QuestionBankPage />} />
              <Route path="import" element={<ImportQuestionsPage />} />
              <Route path="create-test" element={<CreateTestPage />} />
              <Route path="score-analytics" element={<ScoreAnalyticsPage />} />
              <Route path="ocr" element={<OCRImportPage />} />
              <Route path="ocr/:jobId/review" element={<OCRReviewPage />} />
            </Route>
          </Route>

          <Route path="/" element={<LandingPage />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
