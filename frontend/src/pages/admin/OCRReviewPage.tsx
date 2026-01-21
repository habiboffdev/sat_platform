/**
 * OCR Review Page
 *
 * Review and edit extracted questions and passages before importing.
 * Supports bulk approval and import to test module.
 * Includes tabs for Questions and Passages views.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  X,
  Download,
  Filter,
  AlertTriangle,
  Loader2,
  Image,
  FileText,
  FileWarning,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  QuestionCard,
  ImageCropDialog,
  TestCreationWizard,
  PassageCard,
  FailedPagesDialog,
} from '@/components/features/ocr';
import type { TestConfig } from '@/components/features/ocr/TestCreationWizard';
import {
  ocrService,
  type OCRJob,
  type ExtractedQuestion,
  type ExtractedPassage,
  type QuestionReviewStatus,
  type PassageUpdateData,
} from '@/services/ocr';
import api from '@/lib/axios';

interface TestModule {
  id: number;
  section: string;
  module: string;
  difficulty: string;
  test_id: number;
  test_title: string;
}

export default function OCRReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [job, setJob] = useState<OCRJob | null>(null);
  const [questions, setQuestions] = useState<ExtractedQuestion[]>([]);
  const [passages, setPassages] = useState<ExtractedPassage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedPassageIds, setSelectedPassageIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'questions' | 'passages'>('questions');

  // Question filters
  const [statusFilter, setStatusFilter] = useState<QuestionReviewStatus | 'all'>('all');
  const [needsAnswerFilter, setNeedsAnswerFilter] = useState<boolean | null>(null);
  const [needsImageFilter, setNeedsImageFilter] = useState<boolean | null>(null);

  // Passage filters
  const [passageStatusFilter, setPassageStatusFilter] = useState<QuestionReviewStatus | 'all'>('all');

  // Image crop dialog
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropQuestionId, setCropQuestionId] = useState<number | null>(null);
  const [cropPageNumber, setCropPageNumber] = useState<number>(1);

  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [modules, setModules] = useState<TestModule[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // New test creation wizard
  const [showTestWizard, setShowTestWizard] = useState(false);
  const [isCreatingTest, setIsCreatingTest] = useState(false);

  // Failed pages dialog
  const [showFailedPagesDialog, setShowFailedPagesDialog] = useState(false);

  const numericJobId = parseInt(jobId || '0', 10);

  // Fetch job, questions, and passages
  const fetchData = async () => {
    if (!numericJobId) return;

    try {
      setIsLoading(true);
      const [jobData, questionsData, passagesData] = await Promise.all([
        ocrService.getJob(numericJobId),
        ocrService.listQuestions(numericJobId, {
          page_size: 100,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          needs_answer: needsAnswerFilter ?? undefined,
          needs_image: needsImageFilter ?? undefined,
        }),
        ocrService.listPassages(numericJobId, {
          page_size: 100,
          status: passageStatusFilter !== 'all' ? passageStatusFilter : undefined,
        }),
      ]);
      setJob(jobData);
      setQuestions(questionsData.items);
      setPassages(passagesData.items);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load job data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch available modules for import
  const fetchModules = async () => {
    try {
      // Get all test modules
      const response = await api.get<{ items: any[] }>('/tests/admin/all?page_size=100');
      const testModules: TestModule[] = [];

      for (const test of response.data.items || []) {
        const testResponse = await api.get<{ modules: any[] }>(`/tests/${test.id}`);
        for (const mod of testResponse.data.modules || []) {
          testModules.push({
            id: mod.id,
            section: mod.section,
            module: mod.module,
            difficulty: mod.difficulty,
            test_id: test.id,
            test_title: test.title,
          });
        }
      }

      setModules(testModules);
    } catch (error) {
      console.error('Failed to fetch modules:', error);
    }
  };

  useEffect(() => {
    fetchData();
    fetchModules();
  }, [numericJobId, statusFilter, needsAnswerFilter, needsImageFilter, passageStatusFilter]);

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map((q) => q.id)));
    }
  };

  const handleSelect = (questionId: number, selected: boolean) => {
    const newSelected = new Set(selectedIds);
    if (selected) {
      newSelected.add(questionId);
    } else {
      newSelected.delete(questionId);
    }
    setSelectedIds(newSelected);
  };

  // Review actions
  const handleApprove = async (questionId: number) => {
    try {
      await ocrService.updateQuestion(questionId, {
        review_status: 'approved',
      });
      await fetchData();
      toast({ title: 'Question approved' });
    } catch (error) {
      toast({ title: 'Failed to approve', variant: 'destructive' });
    }
  };

  const handleReject = async (questionId: number) => {
    try {
      await ocrService.updateQuestion(questionId, {
        review_status: 'rejected',
      });
      await fetchData();
      toast({ title: 'Question rejected' });
    } catch (error) {
      toast({ title: 'Failed to reject', variant: 'destructive' });
    }
  };

  const handleUpdate = async (questionId: number, data: Partial<ExtractedQuestion>) => {
    try {
      await ocrService.updateQuestion(questionId, data as any);
      await fetchData();
      toast({ title: 'Question updated' });
    } catch (error) {
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  // Passage review actions
  const handlePassageApprove = async (passageId: number) => {
    try {
      await ocrService.updatePassage(passageId, {
        review_status: 'approved',
      });
      await fetchData();
      toast({ title: 'Passage approved' });
    } catch (error) {
      toast({ title: 'Failed to approve passage', variant: 'destructive' });
    }
  };

  const handlePassageReject = async (passageId: number) => {
    try {
      await ocrService.updatePassage(passageId, {
        review_status: 'rejected',
      });
      await fetchData();
      toast({ title: 'Passage rejected' });
    } catch (error) {
      toast({ title: 'Failed to reject passage', variant: 'destructive' });
    }
  };

  const handlePassageUpdate = async (passageId: number, data: PassageUpdateData) => {
    try {
      await ocrService.updatePassage(passageId, data);
      await fetchData();
      toast({ title: 'Passage updated' });
    } catch (error) {
      toast({ title: 'Failed to update passage', variant: 'destructive' });
    }
  };

  const handlePassageSelect = (passageId: number, selected: boolean) => {
    const newSelected = new Set(selectedPassageIds);
    if (selected) {
      newSelected.add(passageId);
    } else {
      newSelected.delete(passageId);
    }
    setSelectedPassageIds(newSelected);
  };

  const handleSelectAllPassages = () => {
    if (selectedPassageIds.size === passages.length) {
      setSelectedPassageIds(new Set());
    } else {
      setSelectedPassageIds(new Set(passages.map((p) => p.id)));
    }
  };

  // Bulk actions
  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) return;

    try {
      await ocrService.bulkReview(Array.from(selectedIds), 'approve');
      setSelectedIds(new Set());
      await fetchData();
      toast({ title: `${selectedIds.size} questions approved` });
    } catch (error) {
      toast({ title: 'Bulk approve failed', variant: 'destructive' });
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) return;

    try {
      await ocrService.bulkReview(Array.from(selectedIds), 'reject');
      setSelectedIds(new Set());
      await fetchData();
      toast({ title: `${selectedIds.size} questions rejected` });
    } catch (error) {
      toast({ title: 'Bulk reject failed', variant: 'destructive' });
    }
  };

  // Import (legacy - to existing module)
  const handleImport = async () => {
    if (!selectedModuleId) {
      toast({ title: 'Please select a target module', variant: 'destructive' });
      return;
    }

    setIsImporting(true);
    try {
      const result = await ocrService.importQuestions(
        numericJobId,
        selectedModuleId,
        selectedIds.size > 0 ? Array.from(selectedIds) : undefined
      );

      setShowImportDialog(false);
      toast({
        title: 'Import complete',
        description: `Imported ${result.imported} questions${result.errors.length > 0 ? ` with ${result.errors.length} errors` : ''}`,
      });
      await fetchData();
    } catch (error) {
      toast({ title: 'Import failed', variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  // Create new test with wizard
  const handleCreateTest = async (config: TestConfig) => {
    setIsCreatingTest(true);
    try {
      const result = await ocrService.importWithTest(numericJobId, {
        test_config: config,
        question_ids: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
      });

      setShowTestWizard(false);
      toast({
        title: 'Test created successfully',
        description: `Created "${result.test_title}" with ${result.modules_created} modules and ${result.questions_imported} questions`,
      });
      await fetchData();

      // Navigate to the new test
      navigate(`/admin/tests/${result.test_id}`);
    } catch (error: any) {
      toast({
        title: 'Failed to create test',
        description: error?.response?.data?.detail || 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingTest(false);
    }
  };

  // Question stats
  const pendingCount = questions.filter((q) => q.review_status === 'pending').length;
  const approvedCount = questions.filter((q) => q.review_status === 'approved').length;
  const needsAnswerCount = questions.filter((q) => q.needs_answer).length;
  const needsImageCount = questions.filter((q) => q.needs_image).length;

  // Passage stats
  const passagePendingCount = passages.filter((p) => p.review_status === 'pending').length;
  const passageApprovedCount = passages.filter((p) => p.review_status === 'approved').length;
  const totalPassagesCount = passages.length;

  // Failed pages (from job data)
  const failedPagesCount = job?.failed_pages_count || 0;

  // Image crop handlers
  const handleOpenCropDialog = (questionId: number, pageNumber: number) => {
    setCropQuestionId(questionId);
    setCropPageNumber(pageNumber);
    setCropDialogOpen(true);
  };

  const handleImageSaved = async (questionId: number, imageUrl: string) => {
    // Update the question in the local state
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, question_image_url: imageUrl, needs_image: false, image_extraction_status: 'manual' }
          : q
      )
    );
    setCropDialogOpen(false);
  };

  const handleRemoveImage = async (questionId: number) => {
    try {
      // Update via API to clear the image
      await ocrService.updateQuestion(questionId, {});
      // For now, just update locally - the API would need an endpoint to clear the image
      // or we update the update endpoint to accept image_url: null
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === questionId
            ? { ...q, question_image_url: null, needs_image: true, image_extraction_status: null }
            : q
        )
      );
      toast({ title: 'Image removed' });
    } catch (error) {
      toast({ title: 'Failed to remove image', variant: 'destructive' });
    }
  };

  // Re-extract page with quality model
  const handleReextractPage = async (pageNumber: number) => {
    if (!job) return;

    try {
      toast({ title: `Re-extracting page ${pageNumber} with quality model...` });
      await ocrService.reextractPage(job.id, pageNumber, true);
      toast({
        title: 'Re-extraction started',
        description: `Page ${pageNumber} is being re-processed with olmOCR. Refresh to see results.`,
      });
      // Refresh data after a delay to allow processing
      setTimeout(fetchData, 3000);
    } catch (error: any) {
      toast({
        title: 'Failed to re-extract',
        description: error?.response?.data?.detail || 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container mx-auto py-6">
        <p className="text-muted-foreground">Job not found</p>
        <Button variant="link" onClick={() => navigate('/admin/ocr')}>
          Back to OCR Import
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/admin/ocr')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Review Extraction</h1>
            <p className="text-muted-foreground">{job.pdf_filename}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {failedPagesCount > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowFailedPagesDialog(true)}
              className="text-amber-600 border-amber-300 hover:bg-amber-50"
            >
              <FileWarning className="h-4 w-4 mr-2" />
              {failedPagesCount} Failed Pages
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => setShowImportDialog(true)}
            disabled={approvedCount === 0 && passageApprovedCount === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Add to Existing Test
          </Button>
          <Button
            onClick={() => setShowTestWizard(true)}
            disabled={approvedCount === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Create New Test
          </Button>
        </div>
      </div>

      {/* Tabs for Questions and Passages */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'questions' | 'passages')}>
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="questions" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Questions ({questions.length})
          </TabsTrigger>
          <TabsTrigger value="passages" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Passages ({passages.length})
          </TabsTrigger>
        </TabsList>

        {/* Questions Tab */}
        <TabsContent value="questions" className="space-y-4 mt-4">
          {/* Question Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{questions.length}</div>
                <p className="text-sm text-muted-foreground">Total Extracted</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
                <p className="text-sm text-muted-foreground">Approved</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-orange-600">{needsAnswerCount}</div>
                <p className="text-sm text-muted-foreground">Need Answer</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-amber-600">{needsImageCount}</div>
                <p className="text-sm text-muted-foreground">Need Image</p>
              </CardContent>
            </Card>
          </div>

          {/* Question Filters and Bulk Actions */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => setStatusFilter(v as QuestionReviewStatus | 'all')}
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="needs_edit">Needs Edit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    variant={needsAnswerFilter ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() =>
                      setNeedsAnswerFilter(needsAnswerFilter ? null : true)
                    }
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Needs Answer
                  </Button>

                  <Button
                    variant={needsImageFilter ? 'secondary' : 'outline'}
                    size="sm"
                    onClick={() =>
                      setNeedsImageFilter(needsImageFilter ? null : true)
                    }
                  >
                    <Image className="h-3 w-3 mr-1" />
                    Needs Image
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectAll}>
                    {selectedIds.size === questions.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </Button>

                  {selectedIds.size > 0 && (
                    <>
                      <Badge variant="secondary">{selectedIds.size} selected</Badge>
                      <Button variant="outline" size="sm" onClick={handleBulkApprove}>
                        <Check className="h-3 w-3 mr-1" />
                        Approve
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleBulkReject}>
                        <X className="h-3 w-3 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Questions List */}
          <div className="space-y-4">
            {questions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No questions found with current filters.
                </CardContent>
              </Card>
            ) : (
              questions.map((question) => (
                <QuestionCard
                  key={question.id}
                  question={question}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onUpdate={handleUpdate}
                  onOpenCropDialog={handleOpenCropDialog}
                  onRemoveImage={handleRemoveImage}
                  onReextractPage={handleReextractPage}
                  isSelected={selectedIds.has(question.id)}
                  onSelect={handleSelect}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* Passages Tab */}
        <TabsContent value="passages" className="space-y-4 mt-4">
          {/* Passage Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{totalPassagesCount}</div>
                <p className="text-sm text-muted-foreground">Total Passages</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-yellow-600">{passagePendingCount}</div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{passageApprovedCount}</div>
                <p className="text-sm text-muted-foreground">Approved</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-blue-600">
                  {passages.reduce((sum, p) => sum + (p.linked_questions_count || 0), 0)}
                </div>
                <p className="text-sm text-muted-foreground">Linked Questions</p>
              </CardContent>
            </Card>
          </div>

          {/* Passage Filters */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={passageStatusFilter}
                    onValueChange={(v) => setPassageStatusFilter(v as QuestionReviewStatus | 'all')}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleSelectAllPassages}>
                    {selectedPassageIds.size === passages.length
                      ? 'Deselect All'
                      : 'Select All'}
                  </Button>

                  {selectedPassageIds.size > 0 && (
                    <Badge variant="secondary">{selectedPassageIds.size} selected</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Passages List */}
          <div className="space-y-4">
            {passages.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No passages found with current filters.
                </CardContent>
              </Card>
            ) : (
              passages.map((passage) => (
                <PassageCard
                  key={passage.id}
                  passage={passage}
                  isSelected={selectedPassageIds.has(passage.id)}
                  onSelect={handlePassageSelect}
                  onApprove={handlePassageApprove}
                  onReject={handlePassageReject}
                  onUpdate={handlePassageUpdate}
                />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Questions to Test</DialogTitle>
            <DialogDescription>
              {selectedIds.size > 0
                ? `Import ${selectedIds.size} selected questions`
                : `Import all ${approvedCount} approved questions`}{' '}
              to a test module.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <label className="text-sm font-medium">Target Module</label>
            <Select
              value={selectedModuleId?.toString() ?? ''}
              onValueChange={(v) => setSelectedModuleId(parseInt(v, 10))}
            >
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select a module" />
              </SelectTrigger>
              <SelectContent>
                {modules.map((mod) => (
                  <SelectItem key={mod.id} value={mod.id.toString()}>
                    {mod.test_title} - {mod.section} {mod.module}
                    {mod.difficulty !== 'standard' && ` (${mod.difficulty})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleImport} disabled={isImporting || !selectedModuleId}>
              {isImporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image Crop Dialog */}
      {job && cropQuestionId && (
        <ImageCropDialog
          isOpen={cropDialogOpen}
          onClose={() => {
            setCropDialogOpen(false);
            setCropQuestionId(null);
          }}
          jobId={job.id}
          questionId={cropQuestionId}
          pageNumber={cropPageNumber}
          totalPages={job.total_pages}
          onImageSaved={handleImageSaved}
        />
      )}

      {/* Test Creation Wizard Dialog */}
      <Dialog open={showTestWizard} onOpenChange={setShowTestWizard}>
        <DialogContent className="max-w-2xl">
          <TestCreationWizard
            totalQuestions={approvedCount}
            onSubmit={handleCreateTest}
            onCancel={() => setShowTestWizard(false)}
            isLoading={isCreatingTest}
          />
        </DialogContent>
      </Dialog>

      {/* Failed Pages Dialog */}
      <FailedPagesDialog
        isOpen={showFailedPagesDialog}
        onClose={() => setShowFailedPagesDialog(false)}
        jobId={job.id}
        onRetryComplete={() => {
          setShowFailedPagesDialog(false);
          fetchData();
        }}
      />
    </div>
  );
}
