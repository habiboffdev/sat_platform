/**
 * OCR Import Page
 *
 * Upload PDFs for automated question extraction.
 * Shows job list with progress and links to review.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, RefreshCw, Eye, DollarSign, Clock, Play, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { UploadZone, JobProgress, SkippedPagesDialog } from '@/components/features/ocr';
import {
  ocrService,
  type OCRJob,
  type OCRQuality,
  type OCRJobStatus,
} from '@/services/ocr';

export default function OCRImportPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [jobs, setJobs] = useState<OCRJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<OCRQuality>('fast');
  const [activeJob, setActiveJob] = useState<OCRJob | null>(null);
  const [statusFilter, setStatusFilter] = useState<OCRJobStatus | 'all'>('all');
  const [skippedDialogJobId, setSkippedDialogJobId] = useState<number | null>(null);

  // Fetch jobs on mount and after upload
  const fetchJobs = async () => {
    try {
      setIsLoading(true);
      const response = await ocrService.listJobs({
        page_size: 50,
        status: statusFilter !== 'all' ? statusFilter : undefined,
      });
      setJobs(response.items);

      // Find any active job
      const processing = response.items.find((j) =>
        ['pending', 'processing', 'structuring'].includes(j.status)
      );
      if (processing) {
        setActiveJob(processing);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load OCR jobs',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [statusFilter]);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const job = await ocrService.uploadPdf(file, undefined, selectedQuality);
      toast({
        title: 'Upload started',
        description: `Processing ${file.name} (${job.total_pages} pages) with ${selectedQuality === 'quality' ? 'Qwen 72B' : 'Qwen 32B'}`,
      });
      setActiveJob(job);
      await fetchJobs();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Upload failed';
      toast({
        title: 'Upload failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = async (jobId: number) => {
    try {
      await ocrService.cancelJob(jobId);
      toast({ title: 'Job cancelled' });
      if (activeJob?.id === jobId) {
        setActiveJob(null);
      }
      await fetchJobs();
    } catch (error) {
      toast({
        title: 'Failed to cancel job',
        variant: 'destructive',
      });
    }
  };

  const handleResume = async (job: OCRJob) => {
    try {
      const result = await ocrService.resumeJob(job.id);
      toast({
        title: 'Job resumed',
        description: `Continuing from page ${result.processed_pages + 1} of ${result.total_pages}`,
      });
      setActiveJob(job);
      await fetchJobs();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Failed to resume job';
      toast({
        title: 'Failed to resume job',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const handleJobComplete = () => {
    setActiveJob(null);
    fetchJobs();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  const formatCost = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">PDF Question Import</h1>
          <p className="text-muted-foreground">
            Upload SAT PDFs to automatically extract questions using AI
          </p>
        </div>
        <Button variant="outline" onClick={fetchJobs} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle>Upload PDF</CardTitle>
          <CardDescription>
            Upload a SAT practice test PDF to extract questions automatically
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quality Selection */}
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">OCR Quality:</label>
            <Select
              value={selectedQuality}
              onValueChange={(v) => setSelectedQuality(v as OCRQuality)}
            >
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fast">
                  Fast (Qwen 32B) - Recommended
                </SelectItem>
                <SelectItem value="quality">
                  Quality (Qwen 72B) - Better for complex math
                </SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              ~{ocrService.estimateCost(100, selectedQuality)}¢ per 100 pages
            </span>
          </div>

          {/* Active Job Progress */}
          {activeJob && (
            <JobProgress
              job={activeJob}
              onCancel={() => handleCancel(activeJob.id)}
              onComplete={handleJobComplete}
              className="mb-4"
            />
          )}

          {/* Upload Zone */}
          {!activeJob && (
            <UploadZone
              onUpload={handleUpload}
              isUploading={isUploading}
              maxSizeMB={100}
            />
          )}
        </CardContent>
      </Card>

      {/* Jobs List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Processing History</CardTitle>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as OCRJobStatus | 'all')}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="review">Ready for Review</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No OCR jobs found. Upload a PDF to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Questions</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium truncate max-w-[200px]">
                            {job.pdf_filename}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {job.total_pages} pages
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ocrService.getStatusColor(job.status)}>
                        {ocrService.formatStatus(job.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {job.processed_pages} / {job.total_pages}
                        <span className="text-muted-foreground ml-1">
                          ({Math.round(job.progress_percent)}%)
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium">{job.extracted_questions}</span>
                        {job.approved_questions > 0 && (
                          <span className="text-green-600 ml-1">
                            ({job.approved_questions} approved)
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm">
                        <DollarSign className="h-3 w-3 text-muted-foreground" />
                        {formatCost(job.actual_cost_cents || job.estimated_cost_cents)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(job.created_at)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {job.status === 'review' || job.status === 'completed' ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/admin/ocr/${job.id}/review`)}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Review
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSkippedDialogJobId(job.id)}
                              title="View and re-process skipped pages"
                            >
                              <FileQuestion className="h-3 w-3 mr-1" />
                              Skipped
                            </Button>
                          </>
                        ) : ['pending', 'processing'].includes(job.status) ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResume(job)}
                              title="Resume processing from where it left off"
                            >
                              <Play className="h-3 w-3 mr-1" />
                              Resume
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancel(job.id)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Skipped Pages Dialog */}
      <SkippedPagesDialog
        isOpen={skippedDialogJobId !== null}
        onClose={() => setSkippedDialogJobId(null)}
        jobId={skippedDialogJobId ?? 0}
        onProcessComplete={fetchJobs}
      />
    </div>
  );
}
