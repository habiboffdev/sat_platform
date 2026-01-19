/**
 * ReviewStep - Fourth step in test creation workflow
 * User reviews and edits individual questions with PDF reference
 *
 * Features:
 * - Module-aware question sidebar with local numbering
 * - Question editing panel
 * - PDF viewer with cropping capability
 * - Image attachment workflow
 */

import { useState, useCallback, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import Cropper from 'react-easy-crop';
// Framer motion available if needed for animations
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Crop,
  Check,
  Trash2,
  Image,
  AlertTriangle,
  HelpCircle,
  GripVertical,
  PanelLeftClose,
  PanelLeft,
  ArrowLeft,
  ArrowRight,
  FileText,
  FileJson,
  Sparkles,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import adminService from '@/services/admin';
import QuestionEditor, {
  type ExtendedQuestion,
} from '@/components/features/admin/TestBuilder/QuestionEditor';
import type { ParsedQuestion, ModuleDefinition } from '@/types/testCreation';
import { SAT_MODULES, validateQuestion } from '@/types/testCreation';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Setup PDF worker
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface ReviewStepProps {
  questions: ParsedQuestion[];
  separators: number[];
  pdfFile: File | null;
  currentQuestionIndex: number;
  sidebarCollapsed: boolean;
  onQuestionUpdate: (index: number, updates: Partial<ParsedQuestion>) => void;
  onQuestionDelete: (index: number) => void;
  onQuestionsReorder: (questions: ParsedQuestion[]) => void;
  onCurrentIndexChange: (index: number) => void;
  onToggleSidebar: () => void;
  onNext: () => void;
  onPrev: () => void;
}

// Image cropping helper
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error: Event) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) throw new Error('No 2d context');

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
    }, 'image/jpeg');
  });
}

type CropDestination = 'question' | 'passage' | 'optionA' | 'optionB' | 'optionC' | 'optionD';

export function ReviewStep({
  questions,
  separators,
  pdfFile,
  currentQuestionIndex,
  sidebarCollapsed,
  onQuestionUpdate,
  onQuestionDelete,
  onQuestionsReorder,
  onCurrentIndexChange,
  onToggleSidebar,
  onNext,
  onPrev,
}: ReviewStepProps) {
  const { toast } = useToast();

  // PDF state
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);

  // Cropping state
  const [isCropping, setIsCropping] = useState(false);
  const [pageImageSrc, setPageImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isCapturingPage, setIsCapturingPage] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Destination picker
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [pendingCropUrl, setPendingCropUrl] = useState<string | null>(null);

  // Editor dialog
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const pdfWrapperRef = useRef<HTMLDivElement>(null);
  const currentQuestion = questions[currentQuestionIndex];

  // DnD setup
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get module info for question
  const getModuleForQuestion = (index: number): { module: ModuleDefinition; localNum: number } => {
    let moduleIndex = 0;
    for (let i = 0; i < separators.length; i++) {
      if (index <= separators[i]) {
        moduleIndex = i;
        break;
      }
      if (i === separators.length - 1) {
        moduleIndex = i + 1;
      }
    }
    const start = moduleIndex === 0 ? 0 : separators[moduleIndex - 1] + 1;
    return {
      module: SAT_MODULES[moduleIndex] || SAT_MODULES[0],
      localNum: index - start + 1,
    };
  };

  // Validation helpers
  const questionNeedsImage = (q: ParsedQuestion): boolean => {
    const validation = validateQuestion(q);
    return validation.issues.includes('May need an image');
  };

  const questionHasImage = (q: ParsedQuestion): boolean => {
    return !!(
      q.question_image_url ||
      q.passage?.content?.includes('<img') ||
      q.options?.some((o) => o.image_url)
    );
  };

  const questionNeedsAnswer = (q: ParsedQuestion): boolean => {
    return (
      !q.correct_answer ||
      q.correct_answer.length === 0 ||
      q.correct_answer[0]?.includes('NEED_ANSWER') ||
      q.correct_answer[0] === ''
    );
  };

  // Handle drag end for reordering
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = questions.findIndex((q) => q.id === active.id);
      const newIndex = questions.findIndex((q) => q.id === over?.id);
      const newQuestions = arrayMove(questions, oldIndex, newIndex);
      onQuestionsReorder(newQuestions);
    }
  };

  // PDF cropping
  const startCrop = async () => {
    if (!pdfFile) return;
    setIsCapturingPage(true);

    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjs.getDocument(arrayBuffer).promise;
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // @ts-ignore
      await page.render({ canvasContext: context!, viewport }).promise;
      setPageImageSrc(canvas.toDataURL('image/jpeg'));
      setIsCropping(true);
    } catch (e) {
      console.error(e);
      toast({
        title: 'Error',
        description: 'Failed to capture PDF page',
        variant: 'destructive',
      });
    } finally {
      setIsCapturingPage(false);
    }
  };

  const handleCropComplete = useCallback(
    (_croppedArea: any, croppedAreaPixels: any) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const saveCrop = async () => {
    if (!pageImageSrc || !croppedAreaPixels) return;
    setIsUploadingImage(true);

    try {
      const croppedBlob = await getCroppedImg(pageImageSrc, croppedAreaPixels);
      const file = new File([croppedBlob], `crop_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const { url } = await adminService.uploadImage(file);

      setPendingCropUrl(url);
      setIsCropping(false);
      setPageImageSrc(null);
      setShowDestinationPicker(true);
    } catch (e) {
      console.error(e);
      toast({
        title: 'Upload Failed',
        description: 'Could not upload image',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const applyImageToDestination = (destination: CropDestination) => {
    if (!pendingCropUrl) return;

    const updates: Partial<ParsedQuestion> = {};

    switch (destination) {
      case 'question':
        updates.question_image_url = pendingCropUrl;
        updates.needs_image = false;
        break;
      case 'passage':
        const passageContent = `<img src="${pendingCropUrl}" alt="Passage image" class="max-w-full rounded-lg my-2" />\n\n${currentQuestion.passage?.content || ''}`;
        updates.passage = {
          ...currentQuestion.passage,
          content: passageContent,
        };
        break;
      case 'optionA':
      case 'optionB':
      case 'optionC':
      case 'optionD':
        const optionIndex = destination.charCodeAt(6) - 65;
        if (currentQuestion.options && currentQuestion.options[optionIndex]) {
          const newOptions = [...currentQuestion.options];
          newOptions[optionIndex] = {
            ...newOptions[optionIndex],
            image_url: pendingCropUrl,
          };
          updates.options = newOptions;
        }
        break;
    }

    onQuestionUpdate(currentQuestionIndex, updates);
    setPendingCropUrl(null);
    setShowDestinationPicker(false);
    toast({ title: 'Image Applied', description: `Added to ${destination}` });
  };

  const handleEditorSave = (questionData: ExtendedQuestion) => {
    onQuestionUpdate(currentQuestionIndex, {
      question_text: questionData.question_text || '',
      question_type: questionData.question_type as 'multiple_choice' | 'student_produced_response',
      options: questionData.options,
      correct_answer: questionData.correct_answer,
      explanation: questionData.explanation,
      domain: questionData.domain,
      difficulty: questionData.difficulty,
      passage: questionData.passage,
    });
    setIsEditorOpen(false);
    toast({ title: 'Question Updated', description: 'Changes saved.' });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-12 border-b flex items-center justify-between px-4 bg-card shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onPrev} className="gap-1">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="h-6 w-px bg-border" />
          <span className="text-sm text-muted-foreground">
            Review & Edit Questions
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="font-mono">
            {questions.filter((q) => questionNeedsAnswer(q)).length} need answers
          </Badge>
          <Badge variant="outline" className="font-mono">
            {questions.filter((q) => questionNeedsImage(q)).length} may need images
          </Badge>
          <Button size="sm" onClick={onNext} className="gap-1">
            Continue to Submit
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 grid grid-cols-[auto_minmax(320px,400px)_1fr] overflow-hidden">
        {/* Left: Question sidebar */}
        <div
          className={cn(
            'border-r bg-card flex flex-col overflow-hidden transition-all duration-200',
            sidebarCollapsed ? 'w-14' : 'w-56'
          )}
        >
          <div className="h-10 px-3 border-b flex items-center justify-between bg-muted/30 shrink-0">
            {!sidebarCollapsed && (
              <span className="text-sm font-medium">{questions.length} Questions</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 ml-auto"
              onClick={onToggleSidebar}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-1.5 space-y-0.5">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={questions.map((q) => q.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {questions.map((q, i) => {
                    const { module, localNum } = getModuleForQuestion(i);
                    const prevModule =
                      i > 0 ? getModuleForQuestion(i - 1).module : null;
                    const showModuleHeader = !prevModule || prevModule.id !== module.id;

                    return (
                      <div key={q.id}>
                        {/* Module header */}
                        {showModuleHeader && !sidebarCollapsed && (
                          <div
                            className={cn(
                              'px-2 py-1 text-xs font-semibold mt-2 first:mt-0 rounded',
                              module.bgColor,
                              module.color
                            )}
                          >
                            {module.shortLabel}
                          </div>
                        )}
                        <SortableQuestionItem
                          id={q.id}
                          question={q}
                          globalIndex={i}
                          localNumber={localNum}
                          module={module}
                          isSelected={i === currentQuestionIndex}
                          onClick={() => onCurrentIndexChange(i)}
                          onDelete={() => onQuestionDelete(i)}
                          hasImage={questionHasImage(q)}
                          needsImage={questionNeedsImage(q)}
                          needsAnswer={questionNeedsAnswer(q)}
                          collapsed={sidebarCollapsed}
                        />
                      </div>
                    );
                  })}
                </SortableContext>
              </DndContext>
            </div>
          </ScrollArea>
        </div>

        {/* Center: Question editor panel */}
        <div className="border-r bg-card flex flex-col overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between bg-muted/20">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCurrentIndexChange(Math.max(0, currentQuestionIndex - 1))}
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <div className="font-bold">
                {getModuleForQuestion(currentQuestionIndex).module.shortLabel} Q
                {getModuleForQuestion(currentQuestionIndex).localNum}
              </div>
              <div className="text-xs text-muted-foreground">
                {currentQuestionIndex + 1} of {questions.length}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                onCurrentIndexChange(Math.min(questions.length - 1, currentQuestionIndex + 1))
              }
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Status banners */}
              {questionNeedsAnswer(currentQuestion) && (
                <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg p-3 flex items-start gap-3">
                  <HelpCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-semibold">Missing Correct Answer</div>
                    <p className="opacity-90">Please set the correct answer for this question.</p>
                  </div>
                </div>
              )}

              {questionNeedsImage(currentQuestion) && !currentQuestion.question_image_url && (
                <div className="bg-amber-50 text-amber-600 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <div className="font-semibold">May Need Image</div>
                    <p className="opacity-90">The text references a graph or figure.</p>
                  </div>
                </div>
              )}

              {/* Question text */}
              <div className="space-y-2">
                <Label>Question Text</Label>
                <Textarea
                  className="min-h-[100px] font-serif leading-relaxed"
                  value={currentQuestion?.question_text || ''}
                  onChange={(e) =>
                    onQuestionUpdate(currentQuestionIndex, { question_text: e.target.value })
                  }
                />
              </div>

              {/* Chart/Table display */}
              {(currentQuestion?.chart_title || currentQuestion?.chart_data) && (
                <div className="space-y-2">
                  <Label>Table/Chart</Label>
                  <div className="bg-muted/30 rounded-lg p-3 border">
                    {currentQuestion.chart_title && (
                      <div className="font-semibold text-sm mb-2 text-center border-b pb-2">
                        {currentQuestion.chart_title}
                      </div>
                    )}
                    {currentQuestion.chart_data && (
                      <div
                        className="overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:border [&_td]:px-3 [&_td]:py-1.5 [&_td]:text-sm [&_td]:border"
                        dangerouslySetInnerHTML={{ __html: currentQuestion.chart_data }}
                      />
                    )}
                  </div>
                </div>
              )}

              {/* Attached image */}
              {currentQuestion?.question_image_url && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Attached Image</Label>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={startCrop}
                        disabled={isCapturingPage || isCropping}
                      >
                        <Crop className="w-3.5 h-3.5 mr-1" /> Replace
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive h-7"
                        onClick={() => {
                          onQuestionUpdate(currentQuestionIndex, {
                            question_image_url: undefined,
                            needs_image: true,
                          });
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border overflow-hidden">
                    <img
                      src={currentQuestion.question_image_url}
                      alt="Question"
                      className="w-full object-contain max-h-40 bg-muted/30"
                    />
                  </div>
                </div>
              )}

              {/* Crop button */}
              {!currentQuestion?.question_image_url && pdfFile && (
                <Button
                  variant="outline"
                  className="w-full h-12 border-dashed"
                  onClick={startCrop}
                  disabled={isCapturingPage || isCropping}
                >
                  {isCapturingPage ? (
                    'Capturing PDF...'
                  ) : (
                    <>
                      <Crop className="w-4 h-4 mr-2" /> Crop Image from Page {currentPage}
                    </>
                  )}
                </Button>
              )}

              {/* Quick info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-muted/50 rounded-lg p-3">
                  <span className="text-muted-foreground block text-xs mb-1">Domain</span>
                  <span className="font-medium capitalize">
                    {currentQuestion?.domain?.replace(/_/g, ' ') || 'Not Set'}
                  </span>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <span className="text-muted-foreground block text-xs mb-1">Difficulty</span>
                  <span className="font-medium capitalize">
                    {currentQuestion?.difficulty || 'Medium'}
                  </span>
                </div>
              </div>

              {/* Options preview */}
              {currentQuestion?.options && currentQuestion.options.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Options</Label>
                  <div className="space-y-1">
                    {currentQuestion.options.map((opt, i) => (
                      <div
                        key={i}
                        className={cn(
                          'px-3 py-2 rounded-lg border text-sm flex items-center gap-2',
                          currentQuestion.correct_answer?.includes(opt.id)
                            ? 'bg-green-50 border-green-300'
                            : 'bg-muted/30'
                        )}
                      >
                        <span className="font-bold w-6">{opt.id}.</span>
                        <span className="flex-1 truncate">{opt.text || '(No text)'}</span>
                        {opt.image_url && <Image className="w-4 h-4 text-blue-500" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Needs image toggle */}
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <span className="text-sm">Needs Image?</span>
                <Switch
                  checked={currentQuestion?.needs_image || false}
                  onCheckedChange={(c) =>
                    onQuestionUpdate(currentQuestionIndex, { needs_image: c })
                  }
                />
              </div>

              {/* Edit full details button */}
              <Button variant="default" className="w-full h-12" onClick={() => setIsEditorOpen(true)}>
                <Sparkles className="w-4 h-4 mr-2" /> Edit Full Details
              </Button>
            </div>
          </ScrollArea>
        </div>

        {/* Right: PDF Viewer */}
        <div className="bg-muted/20 flex flex-col overflow-hidden">
          {/* PDF Toolbar */}
          <div className="h-12 border-b bg-background/50 backdrop-blur flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium w-24 text-center">
                Page {currentPage} of {numPages}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}>
                <ZoomOut className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium w-12 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="ghost" size="icon" onClick={() => setZoom(Math.min(3, zoom + 0.25))}>
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* PDF Canvas */}
          <div
            className="flex-1 overflow-auto p-8 flex justify-center relative bg-slate-900/5"
            ref={pdfWrapperRef}
          >
            {!isCropping && pdfFile && (
              <Document
                file={pdfFile}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                loading={<div className="p-10 animate-pulse">Loading PDF...</div>}
                className="shadow-2xl"
              >
                <Page
                  pageNumber={currentPage}
                  scale={zoom}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="shadow-2xl rounded-sm"
                />
              </Document>
            )}

            {!pdfFile && (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No PDF uploaded
              </div>
            )}

            {/* Cropper overlay */}
            {isCropping && pageImageSrc && (
              <div className="absolute inset-0 z-50 bg-black/80 flex flex-col">
                <div className="relative flex-1">
                  <Cropper
                    image={pageImageSrc}
                    crop={crop}
                    zoom={zoom}
                    aspect={undefined}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={handleCropComplete}
                  />
                </div>
                <div className="h-20 bg-background border-t flex items-center justify-end px-8 gap-4">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsCropping(false);
                      setPageImageSrc(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={saveCrop} disabled={isUploadingImage}>
                    {isUploadingImage ? (
                      'Uploading...'
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-2" /> Save Crop
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full Question Editor Dialog */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle>Edit Question</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-6">
            {currentQuestion && (
              <QuestionEditor
                initialQuestion={{
                  question_text: currentQuestion.question_text,
                  question_type: currentQuestion.question_type as any,
                  options: currentQuestion.options,
                  correct_answer: currentQuestion.correct_answer,
                  explanation: currentQuestion.explanation,
                  domain: currentQuestion.domain as any,
                  difficulty: currentQuestion.difficulty as any,
                  passage: currentQuestion.passage as any,
                }}
                onSave={handleEditorSave}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Destination Picker */}
      <Dialog open={showDestinationPicker} onOpenChange={setShowDestinationPicker}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Where to place this image?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-4">
            <Button
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => applyImageToDestination('question')}
            >
              <FileText className="w-6 h-6" />
              <span>Question</span>
            </Button>
            <Button
              variant="outline"
              className="h-20 flex-col gap-2"
              onClick={() => applyImageToDestination('passage')}
            >
              <FileJson className="w-6 h-6" />
              <span>Passage</span>
            </Button>
            {currentQuestion?.options?.map((opt) => (
              <Button
                key={opt.id}
                variant="outline"
                className="h-16 flex-col gap-1"
                onClick={() => applyImageToDestination(`option${opt.id}` as CropDestination)}
              >
                <span className="font-bold text-lg">{opt.id}</span>
                <span className="text-xs text-muted-foreground truncate max-w-full px-2">
                  {opt.text?.slice(0, 15) || 'Option'}...
                </span>
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            className="mt-2"
            onClick={() => {
              setShowDestinationPicker(false);
              setPendingCropUrl(null);
            }}
          >
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sortable question item component
interface SortableQuestionItemProps {
  id: string;
  question: ParsedQuestion;
  globalIndex: number;
  localNumber: number;
  module: ModuleDefinition;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  hasImage: boolean;
  needsImage: boolean;
  needsAnswer: boolean;
  collapsed: boolean;
}

function SortableQuestionItem({
  id,
  question,
  localNumber,
  module,
  isSelected,
  onClick,
  onDelete,
  hasImage,
  needsImage,
  needsAnswer,
  collapsed,
}: SortableQuestionItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm group relative border border-transparent',
        isSelected ? 'bg-primary/10 border-primary/20 text-primary font-medium' : 'hover:bg-muted',
        needsAnswer
          ? 'border-red-500/40 bg-red-500/10'
          : needsImage
            ? 'border-amber-500/40 bg-amber-500/10'
            : ''
      )}
    >
      {!collapsed && (
        <div
          {...attributes}
          {...listeners}
          className="text-muted-foreground/30 hover:text-foreground cursor-grab p-1"
        >
          <GripVertical className="w-3 h-3" />
        </div>
      )}

      {collapsed ? (
        <div className="flex items-center justify-center w-full gap-1">
          <span className={cn('font-bold text-xs', module.color)}>Q{localNumber}</span>
          {needsAnswer && <HelpCircle className="w-3 h-3 text-red-500" />}
          {hasImage && <Image className="w-3 h-3 text-green-500" />}
          {needsImage && <AlertTriangle className="w-3 h-3 text-amber-500" />}
        </div>
      ) : (
        <>
          <div
            className={cn(
              'w-8 h-6 rounded text-xs font-bold flex items-center justify-center shrink-0',
              module.bgColor,
              module.color
            )}
          >
            Q{localNumber}
          </div>
          <div className="truncate flex-1 text-xs">
            {question.question_text.substring(0, 25)}...
          </div>
          {needsAnswer && <HelpCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
          {hasImage && <Image className="w-3.5 h-3.5 text-green-500 shrink-0" />}
          {needsImage && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="w-3 h-3 text-red-500" />
          </Button>
        </>
      )}
    </div>
  );
}
