import { useState, useRef } from 'react';
import { QuestionType, QuestionDomain } from '@/types/test';
import type { Question, QuestionOption } from '@/types/test';
import { RichTextEditor } from './RichTextEditor';
import { LivePreview } from './LivePreview';
import { MathRenderer } from '@/components/ui/MathRenderer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Trash2,
  Eye,
  Save,
  ListChecks,
  Hash,
  AlertCircle,
  ImagePlus,
  BookOpen,
  X,
  ChevronDown,
  ChevronUp,
  Calculator,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface PassageData {
  title?: string;
  content: string;
  source?: string;
  author?: string;
}

export interface ExtendedQuestion extends Omit<Partial<Question>, 'passage'> {
  passage?: PassageData;
}

interface QuestionEditorProps {
  initialQuestion?: Partial<Question>;
  onSave: (question: ExtendedQuestion) => void;
}

// Domain definitions with short labels
const RW_DOMAINS = [
  { value: QuestionDomain.CRAFT_AND_STRUCTURE, label: 'Craft & Structure' },
  { value: QuestionDomain.INFORMATION_AND_IDEAS, label: 'Info & Ideas' },
  { value: QuestionDomain.STANDARD_ENGLISH_CONVENTIONS, label: 'Conventions' },
  { value: QuestionDomain.EXPRESSION_OF_IDEAS, label: 'Expression' },
];

const MATH_DOMAINS = [
  { value: QuestionDomain.ALGEBRA, label: 'Algebra' },
  { value: QuestionDomain.ADVANCED_MATH, label: 'Advanced Math' },
  { value: QuestionDomain.PROBLEM_SOLVING_DATA_ANALYSIS, label: 'Data Analysis' },
  { value: QuestionDomain.GEOMETRY_TRIGONOMETRY, label: 'Geometry' },
];

export default function QuestionEditor({ initialQuestion, onSave }: QuestionEditorProps) {
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isPassageOpen, setIsPassageOpen] = useState(false);
  const optionImageRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const [question, setQuestion] = useState<ExtendedQuestion>(initialQuestion || {
    question_type: QuestionType.MULTIPLE_CHOICE,
    options: [
      { id: 'A', text: '' },
      { id: 'B', text: '' },
      { id: 'C', text: '' },
      { id: 'D', text: '' }
    ],
    correct_answer: [],
    difficulty: 'medium',
  });

  const handleSave = () => {
    setValidationError(null);
    const errors: string[] = [];

    if (!question.question_text || question.question_text === '<p><br></p>' || !question.question_text.trim()) {
      errors.push("Question text is required");
    }

    if (question.question_type === QuestionType.MULTIPLE_CHOICE) {
      if (!question.correct_answer || question.correct_answer.length === 0) {
        errors.push("Please select a correct answer");
      }
      if (question.options?.some(opt => !opt.text.trim() && !opt.image_url)) {
        errors.push("All options must have text or an image");
      }
    } else {
      if (!question.correct_answer || question.correct_answer.length === 0 || !question.correct_answer[0]) {
        errors.push("Correct answer is required");
      }
    }

    if (errors.length > 0) {
      setValidationError(errors[0]);
      toast({ title: "Validation Error", description: errors[0], variant: "destructive" });
      return;
    }

    // For Grid-In: Split comma-separated answers
    if (question.question_type === QuestionType.STUDENT_PRODUCED_RESPONSE) {
      // Logic: If user entered "4, 4.0", the state currently has ["4, 4.0"] as the first element.
      // We want to transform: ["4, 4.0"] -> ["4", "4.0"]
      // But we must handle if it's already an array of multiple items (e.g. if loaded from DB correctly previously)

      // Since we force all editing into correct_answer[0] in the input below, we can assume:
      // - question.correct_answer[0] contains the raw string from input

      const rawInput = question.correct_answer?.[0] || '';
      const splitAnswers = rawInput.split(',').map(s => s.trim()).filter(s => s !== '');

      const cleanQuestion = {
        ...question,
        correct_answer: splitAnswers
      };

      onSave(cleanQuestion as ExtendedQuestion);
    } else {
      onSave(question as ExtendedQuestion);
    }
  };

  const updateField = (field: keyof ExtendedQuestion, value: any) => {
    setQuestion(prev => ({ ...prev, [field]: value }));
    if (validationError) setValidationError(null);
  };

  const updateOption = (index: number, field: keyof QuestionOption, value: string) => {
    const newOptions = [...(question.options || [])];
    newOptions[index] = { ...newOptions[index], [field]: value };
    updateField('options', newOptions);
  };

  const handleOptionImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        updateOption(index, 'image_url', event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeOptionImage = (index: number) => {
    const newOptions = [...(question.options || [])];
    newOptions[index] = { ...newOptions[index], image_url: undefined, image_alt: undefined };
    updateField('options', newOptions);
  };

  const addOption = () => {
    const currentOptions = question.options || [];
    const nextId = String.fromCharCode(65 + currentOptions.length);
    updateField('options', [...currentOptions, { id: nextId, text: '' }]);
  };

  const removeOption = (index: number) => {
    const newOptions = (question.options || []).filter((_, i) => i !== index);
    const reindexedOptions = newOptions.map((opt, i) => ({ ...opt, id: String.fromCharCode(65 + i) }));
    updateField('options', reindexedOptions);
  };

  const handleOptionPaste = (index: number, e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            updateOption(index, 'image_url', event.target?.result as string);
          };
          reader.readAsDataURL(file);
        }
        break;
      }
    }
  };

  const updatePassage = (field: keyof PassageData, value: string) => {
    setQuestion(prev => ({
      ...prev,
      passage: { ...prev.passage, content: prev.passage?.content || '', [field]: value }
    }));
  };

  const hasPassage = question.passage?.content && question.passage.content.trim() !== '';

  return (
    <div className="flex flex-col">
      {/* Compact Header */}
      <div className="flex items-center justify-between pb-3 border-b mb-4 shrink-0">
        <div className="flex items-center gap-4">
          {/* Type Toggle */}
          <div className="flex p-0.5 bg-muted rounded-lg">
            <button
              onClick={() => updateField('question_type', QuestionType.MULTIPLE_CHOICE)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                question.question_type === QuestionType.MULTIPLE_CHOICE
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ListChecks className="h-3.5 w-3.5" /> MCQ
            </button>
            <button
              onClick={() => updateField('question_type', QuestionType.STUDENT_PRODUCED_RESPONSE)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                question.question_type === QuestionType.STUDENT_PRODUCED_RESPONSE
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Hash className="h-3.5 w-3.5" /> Grid-in
            </button>
          </div>

          {/* Difficulty */}
          <div className="flex p-0.5 bg-muted rounded-lg">
            {['easy', 'medium', 'hard'].map((diff) => (
              <button
                key={diff}
                onClick={() => updateField('difficulty', diff)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize",
                  question.difficulty === diff
                    ? "bg-white text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {diff}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(true)} className="h-8">
            <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
          </Button>
          <Button size="sm" onClick={handleSave} className="h-8">
            <Save className="h-3.5 w-3.5 mr-1.5" /> Save
          </Button>
        </div>
      </div>

      {validationError && (
        <div className="mb-3 p-2 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2 text-destructive text-xs font-medium shrink-0">
          <AlertCircle className="h-3.5 w-3.5" />
          {validationError}
        </div>
      )}

      {/* Split Pane Layout */}
      <div className="grid grid-cols-2 gap-6">
        {/* LEFT: Question Content */}
        <div className="flex flex-col gap-4 pr-2">
          {/* Domain Selection - Buttons */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground font-medium">Domain</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5 text-blue-600 mr-1" />
                <div className="flex flex-wrap gap-1">
                  {RW_DOMAINS.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => updateField('domain', d.value)}
                      className={cn(
                        "px-2 py-1 text-xs rounded-md border transition-all",
                        question.domain === d.value
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-muted-foreground border-border hover:border-blue-300"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Calculator className="h-3.5 w-3.5 text-amber-600 mr-1" />
                <div className="flex flex-wrap gap-1">
                  {MATH_DOMAINS.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => updateField('domain', d.value)}
                      className={cn(
                        "px-2 py-1 text-xs rounded-md border transition-all",
                        question.domain === d.value
                          ? "bg-amber-600 text-white border-amber-600"
                          : "bg-white text-muted-foreground border-border hover:border-amber-300"
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Passage (Collapsible) */}
          <Collapsible open={isPassageOpen} onOpenChange={setIsPassageOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center justify-between w-full p-2 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors text-sm">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Passage</span>
                  {hasPassage && <span className="text-green-600 text-xs">(Added)</span>}
                </div>
                {isPassageOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={question.passage?.title || ''}
                  onChange={(e) => updatePassage('title', e.target.value)}
                  placeholder="Title (optional)"
                  className="h-8 text-sm"
                />
                <Input
                  value={question.passage?.source || ''}
                  onChange={(e) => updatePassage('source', e.target.value)}
                  placeholder="Source (optional)"
                  className="h-8 text-sm"
                />
              </div>
              <div className="border rounded-lg overflow-hidden">
                <RichTextEditor
                  content={question.passage?.content || ''}
                  onChange={(content) => updatePassage('content', content)}
                  minHeight="120px"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Question Text */}
          <div className="flex-1 flex flex-col min-h-0">
            <Label className="text-xs text-muted-foreground font-medium mb-2">Question</Label>
            <div className="flex-1 border rounded-lg overflow-hidden">
              <RichTextEditor
                content={question.question_text || ''}
                onChange={(content) => updateField('question_text', content)}
                minHeight="200px"
              />
            </div>
          </div>
        </div>

        {/* RIGHT: Options & Explanation */}
        <div className="flex flex-col gap-4 pl-2 border-l">
          {/* Options / Answer */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground font-medium">
              {question.question_type === QuestionType.MULTIPLE_CHOICE ? 'Options (click letter to set correct)' : 'Answer'}
            </Label>

            {question.question_type === QuestionType.MULTIPLE_CHOICE ? (
              <div className="space-y-2">
                {question.options?.map((option, index) => (
                  <div
                    key={index}
                    className={cn(
                      "flex items-start gap-2 p-2 rounded-lg border transition-all",
                      question.correct_answer?.includes(option.id)
                        ? "border-green-500 bg-green-50/50"
                        : "border-border hover:border-muted-foreground/30"
                    )}
                  >
                    <button
                      onClick={() => updateField('correct_answer', [option.id])}
                      className={cn(
                        "w-8 h-8 flex items-center justify-center font-bold text-sm rounded-md shrink-0 transition-colors",
                        question.correct_answer?.includes(option.id)
                          ? "bg-green-500 text-white"
                          : "bg-muted text-muted-foreground hover:bg-primary/10"
                      )}
                    >
                      {option.id}
                    </button>

                    <div className="flex-1 space-y-2">
                      <Input
                        value={option.text}
                        onChange={(e) => updateOption(index, 'text', e.target.value)}
                        onPaste={(e) => handleOptionPaste(index, e)}
                        placeholder={`Option ${option.id} (Ctrl+V to paste image)`}
                        className="h-8 text-sm"
                      />
                      {/* Math preview - shows rendered fractions and math */}
                      {option.text && (option.text.includes('$') || /\d+\/\d+/.test(option.text)) && (
                        <div className="text-xs text-muted-foreground bg-muted/30 px-2 py-1 rounded">
                          Preview: <MathRenderer text={option.text} />
                        </div>
                      )}

                      {option.image_url ? (
                        <div className="relative inline-block">
                          <img src={option.image_url} alt="" className="max-h-20 rounded border" />
                          <button
                            onClick={() => removeOptionImage(index)}
                            className="absolute -top-1 -right-1 p-0.5 bg-destructive text-white rounded-full"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            ref={(el) => { optionImageRefs.current[option.id] = el; }}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleOptionImageUpload(index, e)}
                          />
                          <button
                            onClick={() => optionImageRefs.current[option.id]?.click()}
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            <ImagePlus className="h-3 w-3" /> Add image
                          </button>
                        </>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOption(index)}
                      disabled={(question.options?.length || 0) <= 2}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={addOption}
                  className="w-full h-8 border-dashed text-xs"
                  disabled={(question.options?.length || 0) >= 6}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Option
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-muted/30 rounded-lg border border-dashed">
                <Input
                  value={question.correct_answer && question.correct_answer.length > 0 ? question.correct_answer.join(', ') : ''}
                  onChange={(e) => updateField('correct_answer', [e.target.value])}
                  placeholder="Enter numeric answer"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Integers, decimals, fractions. Separate multiple with commas.
                </p>
              </div>
            )}
          </div>

          {/* Explanation */}
          <div className="flex-1 flex flex-col min-h-[200px]">
            <Label className="text-xs text-muted-foreground font-medium mb-2">Explanation (optional)</Label>
            <div className="flex-1 border rounded-lg overflow-hidden">
              <RichTextEditor
                content={question.explanation || ''}
                onChange={(content) => updateField('explanation', content)}
                minHeight="150px"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Question Preview</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden border rounded-md">
            <LivePreview question={question} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
