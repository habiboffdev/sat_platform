import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Document, Page, pdfjs } from 'react-pdf';
import Cropper from 'react-easy-crop';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, FileText, FileJson, Check, AlertCircle,
    Sparkles, ChevronLeft, ChevronRight, Crop,
    Zap, ZoomIn, ZoomOut, CheckCircle2, GripVertical, Trash2,
    Image, AlertTriangle, PanelLeftClose, PanelLeft, HelpCircle
} from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import api from '@/lib/axios';
import adminService from '@/services/admin';
import QuestionEditor, { type ExtendedQuestion } from '@/components/features/admin/TestBuilder/QuestionEditor';
import type { QuestionOption } from '@/types/test';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Setup PDF worker - use local copy (copy pdf.worker.min.mjs to public folder)
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface Question {
    passage_text?: string;
    question_text: string;
    question_type?: string;
    options?: QuestionOption[];
    correct_answer?: string[];
    explanation?: string;
    domain?: string;
    difficulty?: string;
    skill_tags?: string[];
    needs_image?: boolean;
    question_image_url?: string;
    chart_title?: string;
    chart_data?: string; // HTML table or chart data
    passage?: {
        title?: string;
        content: string;
        source?: string;
        author?: string;
    };
}

const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = document.createElement('img');
        image.addEventListener('load', () => resolve(image))
        image.addEventListener('error', (error: Event) => reject(error))
        image.setAttribute('crossOrigin', 'anonymous')
        image.src = url
    })

async function getCroppedImg(
    imageSrc: string,
    pixelCrop: { x: number; y: number; width: number; height: number },
): Promise<Blob> {
    const image = await createImage(imageSrc)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
        throw new Error('No 2d context')
    }

    canvas.width = pixelCrop.width
    canvas.height = pixelCrop.height

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
    )

    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            if (blob) resolve(blob)
        }, 'image/jpeg')
    })
}

interface SortableQuestionItemProps {
    id: string;
    question: Question;
    index: number;
    isSelected: boolean;
    onClick: () => void;
    onDelete: () => void;
    hasImage: boolean;
    needsImage: boolean;
    needsAnswer: boolean;
    collapsed: boolean;
}

function SortableQuestionItem({ id, question, index, isSelected, onClick, onDelete, hasImage, needsImage, needsAnswer, collapsed }: SortableQuestionItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

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
                "flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm group relative border border-transparent",
                isSelected ? "bg-primary/10 border-primary/20 text-primary font-medium" : "hover:bg-muted",
                needsAnswer ? "border-red-500/40 bg-red-500/10" : needsImage ? "border-amber-500/40 bg-amber-500/10" : ""
            )}
        >
            {!collapsed && (
                <div {...attributes} {...listeners} className="text-muted-foreground/30 hover:text-foreground cursor-grab p-1">
                    <GripVertical className="w-3 h-3" />
                </div>
            )}

            {collapsed ? (
                // Collapsed view: just number with indicators
                <div className="flex items-center justify-center w-full gap-1">
                    <span className="font-bold">{index + 1}</span>
                    {needsAnswer && <HelpCircle className="w-3 h-3 text-red-500" />}
                    {hasImage && <Image className="w-3 h-3 text-green-500" />}
                    {needsImage && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                </div>
            ) : (
                // Expanded view
                <>
                    <div className="truncate flex-1">
                        Q{index + 1}: {question.question_text.substring(0, 18)}...
                    </div>
                    {needsAnswer && <HelpCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                    {hasImage && <Image className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                    {needsImage && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    >
                        <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                </>
            )}
        </div>
    );
}

export default function ImportQuestionsPage() {
    const { toast } = useToast();

    // State
    const [step, setStep] = useState<'upload' | 'review'>('upload');
    const [jsonFile, setJsonFile] = useState<File | null>(null);
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    // Helper: Check if question mentions image keywords but has no image
    const IMAGE_KEYWORDS = ['graph', 'chart', 'figure', 'diagram', 'table', 'image', 'picture', 'bar', 'line graph', 'scatterplot', 'histogram'];
    const questionNeedsImage = (q: Question): boolean => {
        const text = `${q.question_text} ${q.passage_text || ''} ${q.passage?.content || ''}`.toLowerCase();
        const mentionsImage = IMAGE_KEYWORDS.some(kw => text.includes(kw));
        const hasImage = !!(q.question_image_url || q.passage?.content?.includes('<img'));
        return mentionsImage && !hasImage;
    };
    const questionHasImage = (q: Question): boolean => {
        return !!(q.question_image_url || q.passage?.content?.includes('<img') || q.options?.some(o => o.image_url));
    };

    // Check if question has valid correct answer
    const questionNeedsAnswer = (q: Question): boolean => {
        if (!q.correct_answer || q.correct_answer.length === 0) return true;
        const answer = Array.isArray(q.correct_answer) ? q.correct_answer[0] : q.correct_answer;
        return answer?.includes('NEED_ANSWER') || answer === '' || answer === undefined;
    };

    // PDF & Cropper State
    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [isCropping, setIsCropping] = useState(false);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [pageImageSrc, setPageImageSrc] = useState<string | null>(null);
    const [isCapturingPage, setIsCapturingPage] = useState(false);
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    // Crop destination selection
    type CropDestination = 'question' | 'passage' | 'optionA' | 'optionB' | 'optionC' | 'optionD';
    const [showDestinationPicker, setShowDestinationPicker] = useState(false);
    const [pendingCropUrl, setPendingCropUrl] = useState<string | null>(null);

    // Submit State
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [moduleId, setModuleId] = useState<string>("");

    const currentQuestion = questions[currentQuestionIndex];

    // Ref for PDF capture
    const pdfWrapperRef = useRef<HTMLDivElement>(null);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Add unique IDs to questions if missing (for DnD)
    const [qIds, setQIds] = useState<string[]>([]);

    // Initialize IDs on load
    const ensureIds = (qs: Question[]) => {
        const ids = qs.map(() => crypto.randomUUID());
        setQIds(ids);
    };

    // Normalize question data from OCR format to editor format
    const normalizeQuestion = (q: any): Question => {
        // Parse options from "A) text" format to {id, text} objects
        let normalizedOptions: QuestionOption[] | undefined;
        if (q.options && Array.isArray(q.options)) {
            normalizedOptions = q.options.map((opt: string | QuestionOption, i: number) => {
                if (typeof opt === 'string') {
                    // Parse "A) text" or "A. text" or "A text" format
                    const match = opt.match(/^([A-D])[\)\.\s:]+\s*(.*)$/i);
                    if (match) {
                        return { id: match[1].toUpperCase(), text: match[2].trim() };
                    }
                    return { id: String.fromCharCode(65 + i), text: opt };
                }
                return opt;
            });
        }

        // Normalize passage from passage_text to passage object
        let passage = q.passage;
        if (!passage && q.passage_text) {
            passage = { content: q.passage_text };
        }

        return {
            ...q,
            options: normalizedOptions,
            passage,
            chart_title: q.chart_title || '',
            chart_data: q.chart_data || '',
        };
    };

    // Handlers
    const onDrop = useCallback((acceptedFiles: File[]) => {
        acceptedFiles.forEach(file => {
            if (file.type === 'application/json') {
                setJsonFile(file);
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const data = JSON.parse(reader.result as string);
                        const rawQs = Array.isArray(data) ? data : (data.questions || []);
                        const qs = rawQs.map(normalizeQuestion);
                        setQuestions(qs);
                        ensureIds(qs);
                        toast({ title: "JSON Parsed", description: `Found ${qs.length} questions.` });
                    } catch (e) {
                        toast({ title: "Error", description: "Invalid JSON file", variant: "destructive" });
                    }
                };
                reader.readAsText(file);
            } else if (file.type === 'application/pdf') {
                setPdfFile(file);
                toast({ title: "PDF Ready", description: file.name });
            }
        });
    }, [toast]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'application/json': ['.json'], 'application/pdf': ['.pdf'] } });

    const handleStartReview = () => {
        if (!questions.length || !pdfFile) return;
        setStep('review');
        const firstNeed = questions.findIndex(q => q.needs_image && !q.question_image_url);
        if (firstNeed !== -1) setCurrentQuestionIndex(firstNeed);
    };



    const updateQuestion = (field: keyof Question, value: any) => {
        const updated = [...questions];
        updated[currentQuestionIndex] = { ...updated[currentQuestionIndex], [field]: value };
        setQuestions(updated);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            setQuestions((items) => {
                const oldIndex = qIds.indexOf(active.id as string);
                const newIndex = qIds.indexOf(over?.id as string);
                return arrayMove(items, oldIndex, newIndex);
            });
            setQIds((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over?.id as string);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleDeleteQuestion = (index: number) => {
        const newQs = [...questions];
        const newIds = [...qIds];
        newQs.splice(index, 1);
        newIds.splice(index, 1);
        setQuestions(newQs);
        setQIds(newIds);
        if (currentQuestionIndex >= newQs.length) setCurrentQuestionIndex(Math.max(0, newQs.length - 1));
    };

    const handleEditorSave = (questionData: ExtendedQuestion) => {
        const updated = [...questions];
        updated[currentQuestionIndex] = {
            ...updated[currentQuestionIndex],
            question_text: questionData.question_text || '',
            question_type: questionData.question_type,
            options: questionData.options,
            correct_answer: questionData.correct_answer,
            explanation: questionData.explanation,
            domain: questionData.domain,
            difficulty: questionData.difficulty,
            passage: questionData.passage,
        };
        setQuestions(updated);
        setIsEditorOpen(false);
        toast({ title: 'Question Updated', description: 'Changes saved.' });
    };

    // Setup capture logic
    const startCrop = async () => {
        if (!pdfFile) return;
        setIsCapturingPage(true);

        // We need to render the current page to a canvas and grab data URL
        // We can use pdfjs directly to avoid screenshotting DOM
        try {
            const arrayBuffer = await pdfFile.arrayBuffer();
            const pdf = await pdfjs.getDocument(arrayBuffer).promise;
            const page = await pdf.getPage(currentPage);
            const viewport = page.getViewport({ scale: 2.0 }); // High res for cropping

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // @ts-ignore - TS definition mismatch for render parameters
            await page.render({ canvasContext: context!, viewport }).promise;
            setPageImageSrc(canvas.toDataURL('image/jpeg'));
            setIsCropping(true);
        } catch (e) {
            console.error(e);
            toast({ title: "Error", description: "Failed to capture PDF page for cropping", variant: "destructive" });
        } finally {
            setIsCapturingPage(false);
        }
    };

    const handleCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels)
    }, []);

    const saveCrop = async () => {
        if (!pageImageSrc || !croppedAreaPixels) return;
        setIsUploadingImage(true);
        try {
            const croppedBlob = await getCroppedImg(pageImageSrc, croppedAreaPixels);
            // Upload
            const file = new File([croppedBlob], `crop_${Date.now()}.jpg`, { type: 'image/jpeg' });
            const { url } = await adminService.uploadImage(file);

            // Store URL and show destination picker
            setPendingCropUrl(url);
            setIsCropping(false);
            setPageImageSrc(null);
            setShowDestinationPicker(true);

        } catch (e) {
            console.error(e);
            toast({ title: "Upload Failed", description: "Could not upload image", variant: "destructive" });
        } finally {
            setIsUploadingImage(false);
        }
    };

    // Apply cropped image to selected destination
    const applyImageToDestination = (destination: CropDestination) => {
        if (!pendingCropUrl) return;

        const updated = [...questions];
        const q = updated[currentQuestionIndex];

        switch (destination) {
            case 'question':
                q.question_image_url = pendingCropUrl;
                q.needs_image = false;
                break;
            case 'passage':
                // Add image to passage content as markdown
                if (q.passage) {
                    q.passage.content = `<img src="${pendingCropUrl}" alt="Passage image" class="max-w-full rounded-lg my-2" />\n\n${q.passage.content || ''}`;
                } else {
                    q.passage = { content: `<img src="${pendingCropUrl}" alt="Passage image" class="max-w-full rounded-lg my-2" />` };
                }
                break;
            case 'optionA':
            case 'optionB':
            case 'optionC':
            case 'optionD':
                const optionIndex = destination.charCodeAt(6) - 65; // A=0, B=1, C=2, D=3
                if (q.options && q.options[optionIndex]) {
                    q.options[optionIndex].image_url = pendingCropUrl;
                }
                break;
        }

        setQuestions(updated);
        setPendingCropUrl(null);
        setShowDestinationPicker(false);
        toast({ title: "Image Applied", description: `Added to ${destination}` });
    };

    const handleSubmit = async () => {
        if (!moduleId) {
            toast({ title: "Module ID Required", description: "Please enter the target Module ID.", variant: "destructive" });
            return;
        }
        setIsSubmitting(true);
        try {
            // transform questions
            const payload = {
                module_id: parseInt(moduleId),
                questions: questions.map(q => ({
                    question_text: q.question_text,
                    question_type: q.question_type?.toLowerCase() || 'multiple_choice', // fallback default
                    options: q.options?.map((opt, i) => ({ id: String.fromCharCode(65 + i), text: opt })) || [],
                    correct_answer: q.correct_answer || [],
                    explanation: q.explanation,
                    domain: q.domain || null,
                    difficulty: q.difficulty || null,
                    question_image_url: q.question_image_url
                }))
            };

            await api.post('/questions/bulk', payload);
            toast({ title: "Success!", description: `Imported ${questions.length} questions.` });
            // Redirect or clear
        } catch (e: any) {
            console.error(e);
            toast({ title: "Import Failed", description: e.response?.data?.detail || "Unknown error", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="h-full bg-background text-foreground flex flex-col overflow-hidden">
            {/* Header */}
            <header className="h-12 border-b flex items-center justify-between px-4 bg-card shrink-0">
                <div className="flex items-center gap-2 font-serif font-bold text-xl">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <span>AI Import</span>
                </div>
                <div className="flex items-center gap-4">
                    {step === 'review' && (
                        <>
                            <div className="flex items-center gap-2">
                                <Label className="whitespace-nowrap">Module ID:</Label>
                                <Input
                                    className="w-20 bg-background"
                                    value={moduleId}
                                    onChange={e => setModuleId(e.target.value)}
                                    placeholder="123"
                                />
                            </div>
                            <Badge variant="outline" className="font-mono h-8 px-3">
                                {questions.filter(q => q.needs_image && !q.question_image_url).length} Pending Review
                            </Badge>
                            <Button className="btn-premium" onClick={handleSubmit} disabled={isSubmitting}>
                                {isSubmitting ? 'Importing...' : <><Zap className="w-4 h-4 mr-2" /> Import All</>}
                            </Button>
                        </>
                    )}
                </div>
            </header>

            <main className="flex-1 overflow-hidden relative">
                <AnimatePresence mode="wait">
                    {step === 'upload' ? (
                        <motion.div
                            key="upload"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="h-full flex flex-col items-center justify-center p-8 text-center"
                        >
                            <div
                                {...getRootProps()}
                                className={cn(
                                    "border-2 border-dashed rounded-3xl p-16 w-full max-w-2xl transition-all cursor-pointer group",
                                    isDragActive ? "border-primary bg-primary/5 scale-102" : "border-border hover:border-primary/50 hover:bg-muted/30"
                                )}
                            >
                                <input {...getInputProps()} />
                                <div className="flex justify-center mb-6">
                                    <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Upload className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                </div>
                                <h2 className="text-3xl font-bold mb-4">Drop your JSON & PDF here</h2>
                                <p className="text-muted-foreground mb-8">
                                    Upload the OCR output and the original exam PDF.
                                </p>

                                <div className="flex gap-4 justify-center">
                                    <div className={cn("flex items-center gap-3 p-4 rounded-xl border w-48 text-left transition-all", jsonFile ? "bg-green-500/10 border-green-500/50" : "bg-card")}>
                                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", jsonFile ? "bg-green-500 text-white" : "bg-muted")}>
                                            {jsonFile ? <Check className="w-5 h-5" /> : <FileJson className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm">Questions</div>
                                            <div className="text-xs text-muted-foreground">{jsonFile ? "Ready" : "Missing"}</div>
                                        </div>
                                    </div>

                                    <div className={cn("flex items-center gap-3 p-4 rounded-xl border w-48 text-left transition-all", pdfFile ? "bg-blue-500/10 border-blue-500/50" : "bg-card")}>
                                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", pdfFile ? "bg-blue-500 text-white" : "bg-muted")}>
                                            {pdfFile ? <Check className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm">Source PDF</div>
                                            <div className="text-xs text-muted-foreground">{pdfFile ? "Ready" : "Missing"}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <Button
                                size="lg"
                                className="mt-8 px-12 h-14 text-lg btn-premium shadow-xl shadow-primary/20"
                                disabled={!jsonFile || !pdfFile}
                                onClick={handleStartReview}
                            >
                                Start Review Protocol
                            </Button>
                        </motion.div>
                    ) : (
                        <div className="h-full grid grid-cols-[auto_minmax(320px,400px)_1fr] overflow-hidden" key="review">
                            {/* Left: Question List Sidebar */}
                            <div className={cn(
                                "border-r bg-card flex flex-col overflow-hidden transition-all duration-200",
                                sidebarCollapsed ? "w-14" : "w-56"
                            )}>
                                <div className="h-12 px-3 border-b flex items-center justify-between bg-muted/30 shrink-0">
                                    {!sidebarCollapsed && <span className="text-sm font-medium">{questions.length} Questions</span>}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 ml-auto"
                                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                                    >
                                        {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                                    </Button>
                                </div>
                                <ScrollArea className="flex-1">
                                    <div className="p-1.5 space-y-0.5">
                                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                            <SortableContext items={qIds} strategy={verticalListSortingStrategy}>
                                                {questions.map((q, i) => (
                                                    <SortableQuestionItem
                                                        key={qIds[i]}
                                                        id={qIds[i]}
                                                        index={i}
                                                        question={q}
                                                        isSelected={i === currentQuestionIndex}
                                                        onClick={() => setCurrentQuestionIndex(i)}
                                                        onDelete={() => handleDeleteQuestion(i)}
                                                        hasImage={questionHasImage(q)}
                                                        needsImage={questionNeedsImage(q)}
                                                        needsAnswer={questionNeedsAnswer(q)}
                                                        collapsed={sidebarCollapsed}
                                                    />
                                                ))}
                                            </SortableContext>
                                        </DndContext>
                                    </div>
                                </ScrollArea>
                            </div>

                            {/* Center: Question Editor Panel */}
                            <div className="border-r bg-card flex flex-col overflow-hidden">
                                <div className="p-4 border-b flex items-center justify-between bg-muted/20">
                                    <Button variant="ghost" size="icon" onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}>
                                        <ChevronLeft className="w-5 h-5" />
                                    </Button>
                                    <div className="text-center">
                                        <div className="font-bold">Question {currentQuestionIndex + 1}</div>
                                        <div className="text-xs text-muted-foreground">of {questions.length}</div>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => setCurrentQuestionIndex(Math.min(questions.length - 1, currentQuestionIndex + 1))}>
                                        <ChevronRight className="w-5 h-5" />
                                    </Button>
                                </div>

                                <ScrollArea className="flex-1">
                                    <div className="p-6 space-y-6">
                                        {/* Status Banner */}
                                        {currentQuestion.needs_image && !currentQuestion.question_image_url && (
                                            <div className="bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-lg p-3 flex items-start gap-3">
                                                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                                <div className="text-sm">
                                                    <div className="font-semibold">Missing Graph Detected</div>
                                                    <p className="opacity-90">The text implies a visual is needed. Check PDF.</p>
                                                </div>
                                            </div>
                                        )}
                                        {currentQuestion.question_image_url && (
                                            <div className="bg-green-500/10 text-green-600 border border-green-500/20 rounded-lg p-3 flex items-center gap-3">
                                                <CheckCircle2 className="w-5 h-5 shrink-0" />
                                                <div className="text-sm font-semibold">Image Attached</div>
                                            </div>
                                        )}

                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label>Question Text</Label>
                                                <Textarea
                                                    className="min-h-[100px] font-serif leading-relaxed"
                                                    value={currentQuestion.question_text || ""}
                                                    onChange={e => updateQuestion('question_text', e.target.value)}
                                                />
                                            </div>

                                            {/* Table/Chart Display */}
                                            {(currentQuestion.chart_title || currentQuestion.chart_data) && (
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

                                            {currentQuestion.question_image_url && (
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
                                                                    updateQuestion('question_image_url', undefined);
                                                                    updateQuestion('needs_image', true);
                                                                }}
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <div className="rounded-lg border overflow-hidden">
                                                        <img src={currentQuestion.question_image_url} alt="Question Graph" className="w-full object-contain max-h-40 bg-muted/30" />
                                                    </div>
                                                </div>
                                            )}

                                            {!currentQuestion.question_image_url && (
                                                <Button variant="outline" className="w-full h-12 border-dashed" onClick={startCrop} disabled={isCapturingPage || isCropping} >
                                                    {isCapturingPage ? "Capturing PDF..." : <><Crop className="w-4 h-4 mr-2" /> Crop Graph from Page {currentPage}</>}
                                                </Button>
                                            )}

                                            {/* Quick Info */}
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div className="bg-muted/50 rounded-lg p-3">
                                                    <span className="text-muted-foreground block text-xs mb-1">Domain</span>
                                                    <span className="font-medium">{currentQuestion.domain || "Not Set"}</span>
                                                </div>
                                                <div className="bg-muted/50 rounded-lg p-3">
                                                    <span className="text-muted-foreground block text-xs mb-1">Difficulty</span>
                                                    <span className="font-medium capitalize">{currentQuestion.difficulty || "Medium"}</span>
                                                </div>
                                            </div>

                                            {/* Options Preview */}
                                            {currentQuestion.options && currentQuestion.options.length > 0 && (
                                                <div className="space-y-2">
                                                    <Label className="text-xs text-muted-foreground">Options</Label>
                                                    <div className="space-y-1">
                                                        {currentQuestion.options.map((opt, i) => (
                                                            <div key={i} className={cn(
                                                                "px-3 py-2 rounded-lg border text-sm flex items-center gap-2",
                                                                currentQuestion.correct_answer?.includes(opt.id) ? "bg-green-50 border-green-300" : "bg-muted/30"
                                                            )}>
                                                                <span className="font-bold w-6">{opt.id}.</span>
                                                                <span className="flex-1 truncate">{opt.text || "(No text)"}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Needs Image Toggle */}
                                            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                                <span className="text-sm">Needs Image?</span>
                                                <Switch
                                                    checked={currentQuestion.needs_image || false}
                                                    onCheckedChange={(c) => updateQuestion('needs_image', c)}
                                                />
                                            </div>

                                            {/* Edit Details Button */}
                                            <Button
                                                variant="default"
                                                className="w-full h-12"
                                                onClick={() => setIsEditorOpen(true)}
                                            >
                                                <Sparkles className="w-4 h-4 mr-2" /> Edit Full Details
                                            </Button>
                                        </div>
                                    </div>
                                </ScrollArea>

                                {/* Full Question Editor Dialog */}
                                <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
                                    <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0">
                                        <DialogHeader className="px-6 py-4 border-b shrink-0">
                                            <DialogTitle>Edit Question {currentQuestionIndex + 1}</DialogTitle>
                                        </DialogHeader>
                                        <div className="flex-1 overflow-auto p-6">
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

                            {/* Right: PDF Viewer */}
                            <div className="bg-muted/20 flex flex-col overflow-hidden">
                                {/* Toolbar */}
                                <div className="h-12 border-b bg-background/50 backdrop-blur flex items-center justify-between px-4 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}>
                                            <ChevronLeft className="w-4 h-4" />
                                        </Button>
                                        <span className="text-sm font-medium w-20 text-center">Page {currentPage} of {numPages}</span>
                                        <Button variant="ghost" size="icon" onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}>
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

                                {/* Canvas / PDF */}
                                <div className="flex-1 overflow-auto p-8 flex justify-center relative bg-slate-900/5" ref={pdfWrapperRef}>
                                    {/* Normal PDF View */}
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

                                    {/* Cropper View */}
                                    {isCropping && pageImageSrc && (
                                        <div className="absolute inset-0 z-50 bg-black/80 flex flex-col">
                                            <div className="relative flex-1">
                                                <Cropper
                                                    image={pageImageSrc}
                                                    crop={crop}
                                                    zoom={zoom}
                                                    aspect={undefined} // Freeform
                                                    onCropChange={setCrop}
                                                    onZoomChange={setZoom}
                                                    onCropComplete={handleCropComplete}
                                                />
                                            </div>
                                            <div className="h-20 bg-background border-t flex items-center justify-end px-8 gap-4">
                                                <Button variant="ghost" onClick={() => { setIsCropping(false); setPageImageSrc(null); }}>
                                                    Cancel
                                                </Button>
                                                <Button className="btn-premium" onClick={saveCrop} disabled={isUploadingImage}>
                                                    {isUploadingImage ? "Uploading..." : <><Check className="w-4 h-4 mr-2" /> Save Crop</>}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
