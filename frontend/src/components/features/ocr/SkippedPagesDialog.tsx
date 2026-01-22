/**
 * Skipped Pages Dialog
 *
 * Displays pages that were skipped during OCR (not detected as question pages).
 * Allows users to preview the extracted text and force re-process selected pages.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  FileQuestion,
  Loader2,
  Check,
  Play,
  Eye,
  EyeOff,
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
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ocrService } from '@/services/ocr';

interface SkippedPage {
  page_number: number;
  text_preview: string | null;
  text_length: number;
}

interface SkippedPagesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: number;
  onProcessComplete?: () => void;
}

export function SkippedPagesDialog({
  isOpen,
  onClose,
  jobId,
  onProcessComplete,
}: SkippedPagesDialogProps) {
  const [skippedPages, setSkippedPages] = useState<SkippedPage[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSkippedPages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ocrService.listSkippedPages(jobId);
      setSkippedPages(data.pages);
      // Select all by default
      setSelectedPages(new Set(data.pages.map((p) => p.page_number)));
    } catch (err) {
      setError('Failed to load skipped pages');
      console.error('Error fetching skipped pages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (isOpen) {
      fetchSkippedPages();
    }
  }, [isOpen, fetchSkippedPages]);

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

  const handleToggleExpand = (pageNumber: number) => {
    setExpandedPages((prev) => {
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
    if (selectedPages.size === skippedPages.length) {
      setSelectedPages(new Set());
    } else {
      setSelectedPages(new Set(skippedPages.map((p) => p.page_number)));
    }
  };

  const handleProcess = async () => {
    if (selectedPages.size === 0) return;

    setIsProcessing(true);
    setError(null);
    try {
      await ocrService.processSkippedPages(jobId, Array.from(selectedPages));
      onClose();
      onProcessComplete?.();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      // Handle FastAPI validation errors (array of {type, loc, msg, input})
      const message = Array.isArray(detail)
        ? detail.map((e: any) => e.msg).join(', ')
        : typeof detail === 'string'
          ? detail
          : 'Failed to process pages';
      setError(message);
      console.error('Error processing skipped pages:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const hasQuestionIndicators = (text: string | null): boolean => {
    if (!text) return false;
    const indicators = [
      /\b[ABCD]\)/i,
      /\b[ABCD]\./i,
      /question\s+\d+/i,
      /what is/i,
      /which of/i,
      /\$.*\$/,
    ];
    return indicators.some((pattern) => pattern.test(text));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileQuestion className="h-5 w-5 text-amber-500" />
            Skipped Pages
          </DialogTitle>
          <DialogDescription>
            These pages were not detected as question pages. Review and select pages to re-process.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : skippedPages.length === 0 ? (
          <div className="py-8 text-center">
            <Check className="h-8 w-8 mx-auto text-green-500 mb-2" />
            <p className="text-muted-foreground">No skipped pages!</p>
          </div>
        ) : (
          <>
            {/* Select All Header */}
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedPages.size === skippedPages.length}
                  onCheckedChange={handleSelectAll}
                  id="select-all-skipped"
                />
                <Label htmlFor="select-all-skipped" className="cursor-pointer">
                  Select All ({skippedPages.length} pages)
                </Label>
              </div>
              <Badge variant="secondary">{selectedPages.size} selected</Badge>
            </div>

            {/* Skipped Pages List */}
            <ScrollArea className="flex-1 min-h-0 overflow-auto" style={{ maxHeight: 'calc(85vh - 280px)' }}>
              <div className="space-y-2 pr-4 py-2">
                {skippedPages.map((page) => {
                  const isExpanded = expandedPages.has(page.page_number);
                  const hasIndicators = hasQuestionIndicators(page.text_preview);

                  return (
                    <Collapsible
                      key={page.page_number}
                      open={isExpanded}
                      onOpenChange={() => handleToggleExpand(page.page_number)}
                    >
                      <div
                        className={`rounded-lg border transition-colors ${
                          selectedPages.has(page.page_number)
                            ? 'border-primary bg-primary/5'
                            : 'border-border'
                        }`}
                      >
                        <div className="p-3">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedPages.has(page.page_number)}
                              onCheckedChange={() => handleTogglePage(page.page_number)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-medium">Page {page.page_number}</span>
                                <div className="flex items-center gap-2">
                                  {hasIndicators && (
                                    <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                                      May have questions
                                    </Badge>
                                  )}
                                  <Badge variant="secondary" className="text-xs">
                                    {page.text_length} chars
                                  </Badge>
                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                      {isExpanded ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </CollapsibleTrigger>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <CollapsibleContent>
                          <div className="px-3 pb-3 pt-0">
                            <div className="bg-muted/50 rounded-md p-3 text-sm font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
                              {page.text_preview || (
                                <span className="text-muted-foreground italic">No text extracted</span>
                              )}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Info Banner */}
            <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
              <strong>Tip:</strong> Pages marked "May have questions" contain patterns like answer choices (A, B, C, D)
              or question text. These are good candidates for re-processing.
            </div>
          </>
        )}

        {error && (
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleProcess}
            disabled={selectedPages.size === 0 || isProcessing || isLoading}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Process {selectedPages.size} Page{selectedPages.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SkippedPagesDialog;
