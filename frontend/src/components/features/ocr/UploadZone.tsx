/**
 * PDF Upload Zone Component
 *
 * Drag & drop or click to upload PDF files for OCR processing.
 */

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadZoneProps {
  onUpload: (file: File) => Promise<void>;
  isUploading?: boolean;
  maxSizeMB?: number;
  className?: string;
}

export function UploadZone({
  onUpload,
  isUploading = false,
  maxSizeMB = 100,
  className,
}: UploadZoneProps) {
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null);

      if (acceptedFiles.length === 0) {
        return;
      }

      const file = acceptedFiles[0];

      // Validate file type
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setError('Please upload a PDF file');
        return;
      }

      // Validate file size
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > maxSizeMB) {
        setError(`File too large. Maximum size is ${maxSizeMB}MB`);
        return;
      }

      try {
        await onUpload(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    },
    [onUpload, maxSizeMB]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    disabled: isUploading,
  });

  return (
    <div className={className}>
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer',
          'hover:border-primary hover:bg-primary/5',
          isDragActive && 'border-primary bg-primary/10',
          isDragReject && 'border-destructive bg-destructive/10',
          isUploading && 'opacity-50 cursor-not-allowed',
          error && 'border-destructive'
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center justify-center gap-4 text-center">
          {isUploading ? (
            <>
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <div>
                <p className="text-lg font-medium">Uploading...</p>
                <p className="text-sm text-muted-foreground">Please wait</p>
              </div>
            </>
          ) : isDragActive ? (
            <>
              <Upload className="h-12 w-12 text-primary" />
              <p className="text-lg font-medium">Drop your PDF here</p>
            </>
          ) : (
            <>
              <FileText className="h-12 w-12 text-muted-foreground" />
              <div>
                <p className="text-lg font-medium">
                  Drag & drop your SAT PDF here
                </p>
                <p className="text-sm text-muted-foreground">
                  or click to browse (max {maxSizeMB}MB)
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}

export default UploadZone;
