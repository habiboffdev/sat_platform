import type { QuestionOption } from '@/types/test';
import { QuestionType } from '@/types/test';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RichContent } from '@/components/ui/RichContent';
import { cn } from '@/lib/utils';

// Use a more flexible type that accepts the editor's question format
interface LivePreviewQuestion {
  question_text?: string;
  question_type?: string;
  options?: QuestionOption[];
  correct_answer?: string[];
  passage?: {
    title?: string;
    content?: string;
    source?: string;
  };
}

interface LivePreviewProps {
  question: LivePreviewQuestion;
  passage?: string; // Optional passage content (for backward compatibility)
}

export function LivePreview({ question, passage }: LivePreviewProps) {
  // Use passage from question object if available, otherwise use the passage prop
  const passageContent = question.passage?.content || passage;
  const hasPassage = !!passageContent;

  return (
    <div className="flex flex-col h-[600px] border rounded-lg overflow-hidden bg-white shadow-sm">
      {/* Bluebook Header Mock */}
      <div className="h-12 bg-white border-b flex items-center justify-between px-4 text-sm font-medium">
        <span>Section 1: Reading and Writing</span>
        <div className="flex items-center gap-2">
          <span className="font-mono">12:45</span>
          <button className="px-3 py-1 border rounded-full text-xs hover:bg-gray-50">Hide</button>
        </div>
        <div className="flex gap-2">
          <button className="px-2 py-1 hover:bg-gray-50 rounded">Annotate</button>
          <button className="px-2 py-1 hover:bg-gray-50 rounded">More</button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane (Passage/Stimulus) */}
        {hasPassage && (
          <div className="flex-1 p-8 overflow-y-auto border-r">
            {question.passage?.title && (
              <p className="font-semibold mb-2">{question.passage.title}</p>
            )}
            {question.passage?.source && (
              <p className="text-sm text-muted-foreground italic mb-4">{question.passage.source}</p>
            )}
            <RichContent content={passageContent || ''} className="prose prose-sm max-w-none" />
          </div>
        )}

        {/* Right Pane (Question) */}
        <div className={cn("flex-1 flex flex-col", !hasPassage && "max-w-3xl mx-auto")}>
          <ScrollArea className="flex-1 p-8">
            <div className="flex gap-4 mb-6">
              <div className="bg-black text-white w-6 h-6 flex items-center justify-center text-xs font-bold rounded-sm shrink-0 mt-1">
                1
              </div>
              <RichContent
                content={question.question_text || 'Question text will appear here...'}
                className="prose prose-sm max-w-none flex-1"
              />
            </div>

            <div className="pl-10">
              {question.question_type === QuestionType.MULTIPLE_CHOICE ? (
                <div className="space-y-3">
                  {question.options?.map((option, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer group">
                      <div className="w-6 h-6 rounded-full border flex items-center justify-center text-sm font-medium group-hover:border-black">
                        {option.id}
                      </div>
                      <RichContent content={option.text} className="text-sm pt-0.5" />
                    </div>
                  ))}
                  {(!question.options || question.options.length === 0) && (
                    <div className="text-muted-foreground text-sm italic">Add options to see preview</div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Answer</Label>
                  <Input placeholder="Enter your answer" className="max-w-[200px]" />
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Bluebook Footer Mock */}
          <div className="h-16 border-t flex items-center justify-between px-6 bg-white">
            <span className="font-bold text-sm">Student Name</span>
            <div className="flex gap-2">
              <button className="px-6 py-2 bg-[#0077c8] text-white rounded-full text-sm font-medium hover:bg-[#0062a3]">
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
