/**
 * Failed Pages Dialog
 *
 * Displays a list of pages that failed during OCR processing,
 * with options to retry specific pages or all failed pages.
 */

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  RotateCcw,
  Loader2,
  FileWarning,
  Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ocrService,
  type FailedPageInfo,
  type FailedPagesResponse,
} from '@/services/ocr';

interface FailedPagesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: number;
  onRetryComplete?: () => void;
}

export function FailedPagesDialog({
  isOpen,
  onClose,
  jobId,
  onRetryComplete,
}: FailedPagesDialogProps) {
  const [failedPages, setFailedPages] = useState<FailedPageInfo[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [useQualityProvider, setUseQualityProvider] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch failed pages on open
  useEffect(() => {
    if (isOpen) {
      fetchFailedPages();
    }
  }, [isOpen, jobId]);

  const fetchFailedPages = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ocrService.listFailedPages(jobId);
      setFailedPages(data.pages);
      // Select all by default
      setSelectedPages(new Set(data.pages.map((p) => p.page_number)));
    } catch (err) {
      setError('Failed to load failed pages');
      console.error('Error fetching failed pages:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePage = (pageNumber: number) => {
    setSelectedPages((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(pageNumber)) {
        newSet.delete(pageNumber);
      } else {
        newSet.add(pageNumber);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedPages.size === failedPages.length) {
      setSelectedPages(new Set());
    } else {
      setSelectedPages(new Set(failedPages.map((p) => p.page_number)));
    }
  };

  const handleRetry = async () => {
    if (selectedPages.size === 0) return;

    setIsRetrying(true);
    setError(null);
    try {
      await ocrService.retryFailedPages(jobId, {
        page_numbers: Array.from(selectedPages),
        use_quality_provider: useQualityProvider,
      });
      onClose();
      if (onRetryComplete) {
        onRetryComplete();
      }
    } catch (err) {
      setError('Failed to initiate retry');
      console.error('Error retrying pages:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-amber-500" />
            Failed Pages
          </DialogTitle>
          <DialogDescription>
            Review and retry pages that failed during processing.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : failedPages.length === 0 ? (
          <div className="py-8 text-center">
            <Check className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-muted-foreground">No failed pages found!</p>
          </div>
        ) : (
          <>
            {/* Select All */}
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedPages.size === failedPages.length}
                  onCheckedChange={handleSelectAll}
                  id="select-all"
                />
                <Label htmlFor="select-all" className="cursor-pointer">
                  Select All ({failedPages.length} pages)
                </Label>
              </div>
              <Badge variant="secondary">{selectedPages.size} selected</Badge>
            </div>

            {/* Failed Pages List */}
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-4">
                {failedPages.map((page) => (
                  <div
                    key={page.page_number}
                    className={`p-3 rounded-lg border ${
                      selectedPages.has(page.page_number)
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedPages.has(page.page_number)}
                        onCheckedChange={() => handleTogglePage(page.page_number)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Page {page.page_number}</span>
                          <div className="flex items-center gap-2">
                            {page.provider_used && (
                              <Badge variant="outline" className="text-xs">
                                {page.provider_used}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="text-xs">
                              {page.retry_count} retries
                            </Badge>
                          </div>
                        </div>
                        {page.error_message && (
                          <p className="text-sm text-destructive mt-1 truncate">
                            {page.error_message}
                          </p>
                        )}
                        {page.last_error_at && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last error: {formatDate(page.last_error_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Quality Provider Toggle */}
            <div className="flex items-center justify-between py-3 border-t">
              <div>
                <Label htmlFor="quality-provider" className="font-medium">
                  Use Quality Provider
                </Label>
                <p className="text-xs text-muted-foreground">
                  Use DeepInfra (olmOCR) for better accuracy on difficult pages
                </p>
              </div>
              <Switch
                id="quality-provider"
                checked={useQualityProvider}
                onCheckedChange={setUseQualityProvider}
              />
            </div>
          </>
        )}

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleRetry}
            disabled={selectedPages.size === 0 || isRetrying || isLoading}
          >
            {isRetrying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry {selectedPages.size} Page{selectedPages.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default FailedPagesDialog;
