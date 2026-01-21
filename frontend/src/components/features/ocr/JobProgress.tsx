/**
 * Job Progress Component
 *
 * Displays real-time progress for OCR processing jobs.
 * Connects via WebSocket for live updates.
 */

import { useEffect, useState } from 'react';
import {
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  FileText,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ocrService,
  type OCRJob,
  type OCRJobStatus,
  type JobProgressEvent,
  type FailedPagesResponse,
} from '@/services/ocr';

interface JobProgressProps {
  job: OCRJob;
  onCancel?: () => void;
  onComplete?: () => void;
  onRetryFailed?: (jobId: number) => void;
  onShowFailedPages?: (jobId: number) => void;
  className?: string;
}

export function JobProgress({
  job,
  onCancel,
  onComplete,
  onRetryFailed,
  onShowFailedPages,
  className,
}: JobProgressProps) {
  const [progress, setProgress] = useState({
    percent: job.progress_percent,
    processedPages: job.processed_pages,
    totalPages: job.total_pages,
    questionPages: job.question_pages,
    skippedPages: job.skipped_pages,
    extractedQuestions: job.extracted_questions,
    status: job.status,
    errorMessage: job.error_message,
  });

  const [failedPagesCount, setFailedPagesCount] = useState<number | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Fetch failed pages count when job is in review or failed state
  useEffect(() => {
    const fetchFailedPages = async () => {
      if (progress.status === 'review' || progress.status === 'failed') {
        try {
          const data = await ocrService.listFailedPages(job.id);
          setFailedPagesCount(data.failed_count);
        } catch {
          // Ignore errors - failed pages feature may not be available
        }
      }
    };
    fetchFailedPages();
  }, [job.id, progress.status]);

  const handleRetryFailed = async () => {
    if (onRetryFailed) {
      onRetryFailed(job.id);
      return;
    }

    // Default behavior: retry all failed pages
    setIsRetrying(true);
    try {
      await ocrService.retryFailedPages(job.id);
      setProgress((prev) => ({ ...prev, status: 'processing' }));
      setFailedPagesCount(null);
    } catch (error) {
      console.error('Failed to retry pages:', error);
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    // Only subscribe if job is in progress
    if (!['pending', 'processing', 'structuring', 'uploading'].includes(job.status)) {
      return;
    }

    const cleanup = ocrService.subscribeToJobProgress(
      job.id,
      (event: JobProgressEvent) => {
        if (event.type === 'progress') {
          setProgress({
            percent: event.data.percent ?? progress.percent,
            processedPages: event.data.processed_pages ?? progress.processedPages,
            totalPages: event.data.total_pages ?? progress.totalPages,
            questionPages: event.data.question_pages ?? progress.questionPages,
            skippedPages: event.data.skipped_pages ?? progress.skippedPages,
            extractedQuestions: event.data.extracted_questions ?? progress.extractedQuestions,
            status: (event.data.status as OCRJobStatus) ?? progress.status,
            errorMessage: event.data.error_message ?? null,
          });
        } else if (event.type === 'complete') {
          setProgress((prev) => ({
            ...prev,
            status: (event.data.status as OCRJobStatus) ?? 'completed',
          }));
          if (onComplete) {
            onComplete();
          }
        } else if (event.type === 'error') {
          setProgress((prev) => ({
            ...prev,
            status: 'failed',
            errorMessage: event.data.message ?? 'An error occurred',
          }));
        }
      },
      (error) => {
        console.error('WebSocket error:', error);
      }
    );

    return cleanup;
  }, [job.id, job.status]);

  const isProcessing = ['pending', 'processing', 'structuring', 'uploading'].includes(
    progress.status
  );
  const isComplete = progress.status === 'completed' || progress.status === 'review';
  const isFailed = progress.status === 'failed' || progress.status === 'cancelled';

  const getStatusIcon = () => {
    if (isProcessing) {
      return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
    }
    if (isComplete) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (isFailed) {
      return <XCircle className="h-5 w-5 text-destructive" />;
    }
    return <Clock className="h-5 w-5 text-muted-foreground" />;
  };

  const formatDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const seconds = Math.floor((end - start) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('rounded-lg border p-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">{job.pdf_filename}</p>
            <p className="text-sm text-muted-foreground">
              {progress.totalPages} pages
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <Badge variant={ocrService.getStatusColor(progress.status)}>
            {ocrService.formatStatus(progress.status)}
          </Badge>
        </div>
      </div>

      {/* Progress Bar */}
      {isProcessing && (
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Processing</span>
            <span>{Math.round(progress.percent)}%</span>
          </div>
          <Progress value={progress.percent} className="h-2" />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Processed</p>
          <p className="font-medium">
            {progress.processedPages} / {progress.totalPages}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Questions</p>
          <p className="font-medium">{progress.extractedQuestions}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Question Pages</p>
          <p className="font-medium">{progress.questionPages}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Skipped</p>
          <p className="font-medium">{progress.skippedPages}</p>
        </div>
      </div>

      {/* Duration */}
      {job.started_at && (
        <div className="mt-3 text-sm text-muted-foreground">
          Duration: {formatDuration(job.started_at, job.completed_at)}
        </div>
      )}

      {/* Error Message */}
      {progress.errorMessage && (
        <div className="mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p>{progress.errorMessage}</p>
        </div>
      )}

      {/* Failed Pages Warning */}
      {failedPagesCount !== null && failedPagesCount > 0 && (
        <div className="mt-3 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">
                {failedPagesCount} page{failedPagesCount !== 1 ? 's' : ''} failed to process
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onShowFailedPages && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onShowFailedPages(job.id)}
                  className="text-amber-700 hover:text-amber-800 dark:text-amber-400"
                >
                  View Details
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryFailed}
                disabled={isRetrying}
                className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400"
              >
                {isRetrying ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3 mr-1" />
                )}
                Retry Failed
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {isProcessing && onCancel && (
        <div className="mt-4">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

export default JobProgress;
