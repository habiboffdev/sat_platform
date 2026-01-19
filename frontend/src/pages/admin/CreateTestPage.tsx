/**
 * CreateTestPage - Admin page for creating new SAT tests
 *
 * Uses the TestCreation workflow component which provides:
 * - Test type selection (Linear vs Adaptive)
 * - File upload (JSON questions + PDF source)
 * - Module separation with draggable separators
 * - Question review and editing
 * - Final submission
 */

import { TestCreation } from '@/components/features/admin/TestCreation';

export default function CreateTestPage() {
  return <TestCreation />;
}
