/**
 * Passage Card Component
 *
 * Displays an extracted passage with:
 * - Content preview (expandable)
 * - Linked questions count
 * - Edit/Approve/Reject actions
 * - Image display if figures present
 */

import { useState } from 'react';
import {
  Check,
  X,
  Edit2,
  ChevronDown,
  ChevronUp,
  FileText,
  Image,
  Link2,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RichContent } from '@/components/ui/RichContent';
import { cn } from '@/lib/utils';
import type { ExtractedPassage, PassageUpdateData, QuestionReviewStatus } from '@/services/ocr';

interface PassageCardProps {
  passage: ExtractedPassage;
  isSelected?: boolean;
  onSelect?: (id: number, selected: boolean) => void;
  onApprove?: (id: number) => void;
  onReject?: (id: number) => void;
  onUpdate?: (id: number, data: PassageUpdateData) => void;
}

export function PassageCard({
  passage,
  isSelected = false,
  onSelect,
  onApprove,
  onReject,
  onUpdate,
}: PassageCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: passage.title || '',
    content: passage.content,
    source: passage.source || '',
    author: passage.author || '',
  });

  const getStatusColor = (status: QuestionReviewStatus) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'imported':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'needs_edit':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(passage.id, {
        title: editData.title || undefined,
        content: editData.content,
        source: editData.source || undefined,
        author: editData.author || undefined,
      });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditData({
      title: passage.title || '',
      content: passage.content,
      source: passage.source || '',
      author: passage.author || '',
    });
    setIsEditing(false);
  };

  // Truncate content for preview
  const previewContent =
    passage.content.length > 300
      ? passage.content.slice(0, 300) + '...'
      : passage.content;

  return (
    <Card
      className={cn(
        'transition-all',
        isSelected && 'ring-2 ring-primary',
        passage.review_status === 'rejected' && 'opacity-60'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            {onSelect && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) =>
                  onSelect(passage.id, checked as boolean)
                }
                className="mt-1"
              />
            )}
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {passage.title || `Passage ${passage.id}`}
              </CardTitle>
              <CardDescription className="flex items-center gap-3 mt-1">
                {passage.source_page_number && (
                  <span>Page {passage.source_page_number}</span>
                )}
                {passage.word_count && (
                  <span>{passage.word_count} words</span>
                )}
                {passage.genre && (
                  <Badge variant="outline" className="text-xs">
                    {passage.genre}
                  </Badge>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn('text-xs', getStatusColor(passage.review_status))}>
              {passage.review_status}
            </Badge>
            <Badge variant="secondary" className="flex items-center gap-1 text-xs">
              <Link2 className="h-3 w-3" />
              {passage.linked_questions_count}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isEditing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={editData.title}
                  onChange={(e) =>
                    setEditData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Passage title"
                />
              </div>
              <div>
                <Label htmlFor="source">Source</Label>
                <Input
                  id="source"
                  value={editData.source}
                  onChange={(e) =>
                    setEditData((prev) => ({ ...prev, source: e.target.value }))
                  }
                  placeholder="Publication name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="author">Author</Label>
              <Input
                id="author"
                value={editData.author}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, author: e.target.value }))
                }
                placeholder="Author name"
              />
            </div>
            <div>
              <Label htmlFor="content">Content</Label>
              <Textarea
                id="content"
                value={editData.content}
                onChange={(e) =>
                  setEditData((prev) => ({ ...prev, content: e.target.value }))
                }
                className="min-h-[200px] font-mono text-sm"
              />
            </div>
          </div>
        ) : (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <RichContent
                content={isExpanded ? passage.content : previewContent}
              />
            </div>

            {passage.content.length > 300 && (
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full text-muted-foreground"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-1" />
                      Show Less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-1" />
                      Show Full Passage
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            )}
          </Collapsible>
        )}

        {/* Figures */}
        {passage.figures && passage.figures.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2 flex items-center gap-1">
              <Image className="h-4 w-4" />
              {passage.figures.length} figure(s)
            </p>
            <div className="grid grid-cols-2 gap-2">
              {passage.figures.map((fig, i) => (
                <div
                  key={i}
                  className="rounded border p-2 bg-muted/50 text-sm"
                >
                  {fig.url ? (
                    <img
                      src={fig.url}
                      alt={fig.alt || `Figure ${i + 1}`}
                      className="max-h-32 object-contain mx-auto"
                    />
                  ) : (
                    <span className="text-muted-foreground">
                      {fig.caption || `Figure ${i + 1}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        {(passage.source || passage.author) && !isEditing && (
          <div className="mt-4 pt-4 border-t text-sm text-muted-foreground">
            {passage.source && <span>Source: {passage.source}</span>}
            {passage.source && passage.author && <span> • </span>}
            {passage.author && <span>Author: {passage.author}</span>}
          </div>
        )}

        {/* Confidence */}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Confidence: {Math.round(passage.extraction_confidence * 100)}%</span>
        </div>
      </CardContent>

      <CardFooter className="pt-0 flex justify-end gap-2">
        {isEditing ? (
          <>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
          </>
        ) : (
          <>
            {onUpdate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="h-3 w-3 mr-1" />
                Edit
              </Button>
            )}
            {onReject && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onReject(passage.id)}
                disabled={passage.review_status === 'rejected'}
              >
                <X className="h-3 w-3 mr-1" />
                Reject
              </Button>
            )}
            {onApprove && (
              <Button
                size="sm"
                onClick={() => onApprove(passage.id)}
                disabled={passage.review_status === 'approved'}
              >
                <Check className="h-3 w-3 mr-1" />
                Approve
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}

export default PassageCard;
