/**
 * UploadStep - Second step in test creation workflow
 * User uploads JSON (OCR output) and PDF (source document)
 */

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import {
  Upload,
  FileJson,
  FileText,
  Check,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { ParsedQuestion } from '@/types/testCreation';

interface UploadStepProps {
  jsonFile: File | null;
  pdfFile: File | null;
  questionsCount: number;
  onJsonFileChange: (file: File | null) => void;
  onPdfFileChange: (file: File | null) => void;
  onQuestionsLoaded: (questions: ParsedQuestion[]) => void;
  parseJsonQuestions: (data: unknown) => ParsedQuestion[];
  onNext: () => void;
  onPrev: () => void;
}

export function UploadStep({
  jsonFile,
  pdfFile,
  questionsCount,
  onJsonFileChange,
  onPdfFileChange,
  onQuestionsLoaded,
  parseJsonQuestions,
  onNext,
  onPrev,
}: UploadStepProps) {
  const { toast } = useToast();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      acceptedFiles.forEach((file) => {
        if (file.type === 'application/json' || file.name.endsWith('.json')) {
          onJsonFileChange(file);

          const reader = new FileReader();
          reader.onload = () => {
            try {
              const data = JSON.parse(reader.result as string);
              const questions = parseJsonQuestions(data);
              onQuestionsLoaded(questions);
              toast({
                title: 'Questions Loaded',
                description: `Found ${questions.length} questions in the file.`,
              });
            } catch (e) {
              console.error('JSON parse error:', e);
              toast({
                title: 'Invalid JSON',
                description: 'Could not parse the JSON file. Please check the format.',
                variant: 'destructive',
              });
            }
          };
          reader.readAsText(file);
        } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          onPdfFileChange(file);
          toast({
            title: 'PDF Ready',
            description: file.name,
          });
        }
      });
    },
    [onJsonFileChange, onPdfFileChange, onQuestionsLoaded, parseJsonQuestions, toast]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
      'application/pdf': ['.pdf'],
    },
  });

  const canProceed = questionsCount > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col items-center justify-center p-8"
    >
      <div className="w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Upload Files</h1>
          <p className="text-muted-foreground">
            Drop the OCR output JSON and source PDF to continue
          </p>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-3xl p-12 transition-all cursor-pointer group',
            isDragActive
              ? 'border-primary bg-primary/5 scale-[1.02]'
              : 'border-border hover:border-primary/50 hover:bg-muted/30'
          )}
        >
          <input {...getInputProps()} />

          <div className="flex justify-center mb-6">
            <motion.div
              animate={{ scale: isDragActive ? 1.1 : 1 }}
              className="w-20 h-20 rounded-full bg-muted flex items-center justify-center group-hover:scale-110 transition-transform"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
            </motion.div>
          </div>

          <h2 className="text-2xl font-bold mb-3 text-center">
            {isDragActive ? 'Drop files here...' : 'Drop your JSON & PDF here'}
          </h2>
          <p className="text-muted-foreground text-center mb-6">
            or click to browse your files
          </p>

          {/* File status indicators */}
          <div className="flex gap-4 justify-center">
            <FileStatus
              label="Questions JSON"
              file={jsonFile}
              icon={FileJson}
              extra={questionsCount > 0 ? `${questionsCount} questions` : undefined}
            />
            <FileStatus label="Source PDF" file={pdfFile} icon={FileText} />
          </div>
        </div>

        {/* Validation message */}
        {jsonFile && questionsCount === 0 && (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm">
              No questions found in the JSON file. Please check the format.
            </span>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <Button variant="outline" size="lg" onClick={onPrev} className="gap-2">
            <ArrowLeft className="w-5 h-5" />
            Back
          </Button>

          <Button size="lg" onClick={onNext} disabled={!canProceed} className="gap-2 px-8">
            Separate Modules
            <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

interface FileStatusProps {
  label: string;
  file: File | null;
  icon: typeof FileJson;
  extra?: string;
}

function FileStatus({ label, file, icon: Icon, extra }: FileStatusProps) {
  const isReady = !!file;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-4 rounded-xl border w-56 text-left transition-all',
        isReady ? 'bg-green-50 border-green-200' : 'bg-card border-border'
      )}
    >
      <div
        className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center',
          isReady ? 'bg-green-500 text-white' : 'bg-muted'
        )}
      >
        {isReady ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground truncate">
          {isReady ? (
            <>
              {file.name.length > 15 ? `${file.name.slice(0, 15)}...` : file.name}
              {extra && <span className="ml-1 text-green-600">({extra})</span>}
            </>
          ) : (
            'Not uploaded'
          )}
        </div>
      </div>
    </div>
  );
}
