/**
 * Question Card Component
 *
 * Displays an extracted question with review controls.
 * Supports inline editing and approval/rejection.
 */

import { useState } from 'react';
import {
  Check,
  X,
  Edit2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileText,
  Image,
  Crop,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { RichContent } from '@/components/ui/RichContent';
import { TableRenderer, type TableData } from '@/components/ui/TableRenderer';
import {
  ocrService,
  type ExtractedQuestion,
  type QuestionReviewStatus,
  type QuestionDomain,
  type QuestionDifficulty,
} from '@/services/ocr';

/**
 * Constructs full image URL from relative path.
 * Backend returns paths like /static/ocr/... which need the API base URL.
 */
function getFullImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
  // Remove /api/v1 suffix to get base host
  const baseHost = apiBase.replace(/\/api\/v1\/?$/, '');
  return `${baseHost}${url}`;
}

interface QuestionCardProps {
  question: ExtractedQuestion;
  onApprove?: (questionId: number) => void;
  onReject?: (questionId: number) => void;
  onUpdate?: (questionId: number, data: Partial<ExtractedQuestion>) => void;
  onOpenCropDialog?: (questionId: number, pageNumber: number) => void;
  onRemoveImage?: (questionId: number) => void;
  onReextractPage?: (pageNumber: number) => void;
  isSelected?: boolean;
  onSelect?: (questionId: number, selected: boolean) => void;
  className?: string;
}

/**
 * Sanitizes HTML content for safe rendering.
 * In production, use DOMPurify: `DOMPurify.sanitize(html)`
 * For now, we escape script tags as a basic safeguard since
 * the content comes from our controlled OCR pipeline.
 */
function sanitizeHtml(html: string): string {
  // Basic sanitization - remove script tags
  // NOTE: For production, use DOMPurify library
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=/gi, 'data-removed=');
}

export function QuestionCard({
  question,
  onApprove,
  onReject,
  onUpdate,
  onOpenCropDialog,
  onRemoveImage,
  onReextractPage,
  isSelected,
  onSelect,
  className,
}: QuestionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [editData, setEditData] = useState({
    question_text: question.question_text,
    correct_answer: question.correct_answer?.join(', ') ?? '',
    explanation: question.explanation ?? '',
    domain: question.domain,
    difficulty: question.difficulty,
  });

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(question.id, {
        question_text: editData.question_text,
        correct_answer: editData.correct_answer
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean),
        explanation: editData.explanation || undefined,
        domain: editData.domain ?? undefined,
        difficulty: editData.difficulty ?? undefined,
      } as Partial<ExtractedQuestion>);
    }
    setIsEditing(false);
  };

  const getConfidenceBadge = () => {
    const confidence = question.extraction_confidence;
    if (confidence >= 0.9) {
      return <Badge variant="default">High Confidence</Badge>;
    }
    if (confidence >= 0.7) {
      return <Badge variant="secondary">Medium Confidence</Badge>;
    }
    return <Badge variant="destructive">Low Confidence</Badge>;
  };

  const getStatusBadge = () => {
    const colors: Record<QuestionReviewStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
      needs_edit: 'bg-orange-100 text-orange-800',
      imported: 'bg-blue-100 text-blue-800',
    };

    return (
      <span
        className={cn(
          'px-2 py-1 rounded-full text-xs font-medium',
          colors[question.review_status]
        )}
      >
        {question.review_status.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all',
        isSelected && 'ring-2 ring-primary',
        question.needs_answer && 'border-orange-300 bg-orange-50/50',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {onSelect && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onSelect(question.id, e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Page {question.source_page_number}
              </span>
              {getStatusBadge()}
              {getConfidenceBadge()}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {question.needs_answer && (
            <Badge variant="destructive" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Needs Answer
            </Badge>
          )}
          {question.needs_image && (
            <Badge className="flex items-center gap-1 bg-amber-100 text-amber-800 hover:bg-amber-200">
              <Image className="h-3 w-3" />
              Needs Image
            </Badge>
          )}
          {question.question_image_url && (
            <Badge className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-200">
              <Image className="h-3 w-3" />
              Has Image
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Question Preview */}
      <div className="mb-3">
        {isEditing ? (
          <Textarea
            value={editData.question_text}
            onChange={(e) =>
              setEditData({ ...editData, question_text: e.target.value })
            }
            rows={4}
            className="font-mono text-sm"
          />
        ) : (
          <div className="prose prose-sm max-w-none">
            <RichContent content={question.question_text} />
          </div>
        )}
      </div>

      {/* Question Image Section */}
      {(question.question_image_url || question.needs_image) && (
        <div className="mb-3">
          {question.question_image_url ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-muted-foreground flex items-center gap-1">
                  <Image className="h-3 w-3" /> Question Image
                </Label>
                <div className="flex gap-1">
                  {onOpenCropDialog && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => onOpenCropDialog(question.id, question.source_page_number)}
                    >
                      <Crop className="w-3.5 h-3.5 mr-1" /> Replace
                    </Button>
                  )}
                  {onRemoveImage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-7"
                      onClick={() => onRemoveImage(question.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                    </Button>
                  )}
                </div>
              </div>
              <div className="rounded-lg border overflow-hidden bg-muted/30">
                <img
                  src={getFullImageUrl(question.question_image_url) || ''}
                  alt="Question Graph"
                  className="w-full object-contain max-h-48"
                />
              </div>
            </div>
          ) : question.needs_image && onOpenCropDialog ? (
            <Button
              variant="outline"
              className="w-full h-10 border-dashed border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={() => onOpenCropDialog(question.id, question.source_page_number)}
            >
              <Crop className="w-4 h-4 mr-2" />
              Crop Image from Page {question.source_page_number}
            </Button>
          ) : null}
        </div>
      )}

      {/* Options */}
      {question.options && question.options.length > 0 && (
        <div className="mb-3 space-y-1">
          {question.options.map((opt) => (
            <div
              key={opt.id}
              className={cn(
                'text-sm px-2 py-1 rounded',
                question.correct_answer?.includes(opt.id) && 'bg-green-100'
              )}
            >
              <span className="font-medium">{opt.id}.</span>{' '}
              <RichContent content={opt.text} inline />
            </div>
          ))}
        </div>
      )}

      {/* Correct Answer */}
      <div className="mb-3">
        <Label className="text-sm text-muted-foreground">Correct Answer</Label>
        {isEditing ? (
          <Input
            value={editData.correct_answer}
            onChange={(e) =>
              setEditData({ ...editData, correct_answer: e.target.value })
            }
            placeholder="e.g., A, B or comma-separated values"
            className="mt-1"
          />
        ) : (
          <p className="font-medium">
            {question.correct_answer?.join(', ') || (
              <span className="text-destructive">Not set</span>
            )}
          </p>
        )}
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 space-y-4 pt-4 border-t">
          {/* Passage */}
          {question.passage_text && (
            <div>
              <Label className="text-sm text-muted-foreground flex items-center gap-1">
                <FileText className="h-3 w-3" /> Passage
              </Label>
              <div className="mt-1 p-3 bg-muted/50 rounded text-sm">
                <RichContent content={question.passage_text} />
              </div>
            </div>
          )}

          {/* Table Data - render structured table if present */}
          {question.table_data && (
            <div>
              <Label className="text-sm text-muted-foreground">Table</Label>
              <div className="mt-1">
                <TableRenderer data={question.table_data as TableData} />
              </div>
            </div>
          )}

          {/* Legacy Chart Data - only show if no structured table_data */}
          {!question.table_data && question.chart_data && (
            <div>
              <Label className="text-sm text-muted-foreground">Chart/Table (Legacy)</Label>
              <div className="mt-1 p-3 bg-muted/50 rounded text-sm overflow-x-auto">
                <RichContent content={question.chart_data} />
              </div>
            </div>
          )}

          {/* Explanation */}
          <div>
            <Label className="text-sm text-muted-foreground">Explanation</Label>
            {isEditing ? (
              <Textarea
                value={editData.explanation}
                onChange={(e) =>
                  setEditData({ ...editData, explanation: e.target.value })
                }
                rows={2}
                className="mt-1"
              />
            ) : (
              <p className="mt-1 text-sm">
                {question.explanation || 'No explanation provided'}
              </p>
            )}
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">Domain</Label>
              {isEditing ? (
                <Select
                  value={editData.domain ?? ''}
                  onValueChange={(v) =>
                    setEditData({ ...editData, domain: v as QuestionDomain })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="algebra">Algebra</SelectItem>
                    <SelectItem value="advanced_math">Advanced Math</SelectItem>
                    <SelectItem value="geometry_trigonometry">
                      Geometry & Trigonometry
                    </SelectItem>
                    <SelectItem value="problem_solving_data_analysis">
                      Problem Solving & Data Analysis
                    </SelectItem>
                    <SelectItem value="craft_and_structure">
                      Craft & Structure
                    </SelectItem>
                    <SelectItem value="information_and_ideas">
                      Information & Ideas
                    </SelectItem>
                    <SelectItem value="expression_of_ideas">
                      Expression of Ideas
                    </SelectItem>
                    <SelectItem value="standard_english_conventions">
                      Standard English Conventions
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 text-sm">
                  {ocrService.formatDomain(question.domain)}
                </p>
              )}
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Difficulty</Label>
              {isEditing ? (
                <Select
                  value={editData.difficulty ?? ''}
                  onValueChange={(v) =>
                    setEditData({
                      ...editData,
                      difficulty: v as QuestionDifficulty,
                    })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <p className="mt-1 text-sm capitalize">
                  {question.difficulty || 'Not set'}
                </p>
              )}
            </div>
          </div>

          {/* Validation Errors */}
          {question.validation_errors && question.validation_errors.length > 0 && (
            <div className="p-3 bg-destructive/10 rounded text-sm">
              <p className="font-medium text-destructive mb-1">Validation Issues:</p>
              <ul className="list-disc list-inside text-destructive">
                {question.validation_errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center justify-between pt-3 border-t">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button size="sm" onClick={handleSave}>
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="h-3 w-3 mr-1" />
                Edit
              </Button>
              {onReextractPage && question.source_page_number && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onReextractPage(question.source_page_number!)}
                  title="Re-extract this page using the quality model (olmOCR)"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Re-extract
                </Button>
              )}
            </>
          )}
        </div>

        {question.review_status === 'pending' && (
          <div className="flex items-center gap-2">
            {onReject && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReject(question.id)}
              >
                <X className="h-3 w-3 mr-1" />
                Reject
              </Button>
            )}
            {onApprove && (
              <Button size="sm" onClick={() => onApprove(question.id)}>
                <Check className="h-3 w-3 mr-1" />
                Approve
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default QuestionCard;
