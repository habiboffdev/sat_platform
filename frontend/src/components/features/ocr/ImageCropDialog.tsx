/**
 * Image Crop Dialog Component
 *
 * Allows users to crop images from PDF pages for questions
 * that need images (graphs, charts, diagrams).
 */

import { useState, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { ZoomIn, ZoomOut, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ocrService } from '@/services/ocr';

interface ImageCropDialogProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: number;
  questionId: number;
  pageNumber: number;
  totalPages: number;
  onImageSaved: (questionId: number, imageUrl: string) => void;
}

/**
 * Create an image element from a URL.
 */
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = document.createElement('img');
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error: Event) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

/**
 * Crop an image and return the result as a Blob.
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

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

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas to Blob failed'));
      },
      'image/jpeg',
      0.9
    );
  });
}

export function ImageCropDialog({
  isOpen,
  onClose,
  jobId,
  questionId,
  pageNumber: initialPageNumber,
  totalPages,
  onImageSaved,
}: ImageCropDialogProps) {
  const { toast } = useToast();

  // State
  const [pageNumber, setPageNumber] = useState(initialPageNumber);
  const [pageImageUrl, setPageImageUrl] = useState<string | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Crop state
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Load page image when dialog opens or page changes
  useEffect(() => {
    if (isOpen && jobId && pageNumber) {
      loadPageImage();
    }
  }, [isOpen, jobId, pageNumber]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setPageNumber(initialPageNumber);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [isOpen, initialPageNumber]);

  const loadPageImage = async () => {
    setIsLoadingPage(true);
    try {
      // Get the image URL with auth token
      const imageUrl = ocrService.getPageImageUrl(jobId, pageNumber, 2.0);

      // Fetch with auth header
      const token = localStorage.getItem('token');
      const response = await fetch(imageUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error('Failed to load page image');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPageImageUrl(objectUrl);
    } catch (error) {
      console.error('Failed to load page:', error);
      toast({
        title: 'Error',
        description: 'Failed to load PDF page. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingPage(false);
    }
  };

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (!pageImageUrl || !croppedAreaPixels) {
      toast({
        title: 'No Selection',
        description: 'Please select an area to crop.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);
    try {
      // Crop the image
      const croppedBlob = await getCroppedImg(pageImageUrl, croppedAreaPixels);

      // Upload to server
      const result = await ocrService.uploadQuestionImage(questionId, croppedBlob);

      toast({
        title: 'Image Saved',
        description: 'The cropped image has been attached to the question.',
      });

      onImageSaved(questionId, result.question_image_url);
      onClose();
    } catch (error) {
      console.error('Failed to save crop:', error);
      toast({
        title: 'Upload Failed',
        description: 'Could not save the cropped image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    // Clean up object URL
    if (pageImageUrl) {
      URL.revokeObjectURL(pageImageUrl);
      setPageImageUrl(null);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle>Crop Image from PDF</DialogTitle>
          <DialogDescription>
            Select the graph, chart, or diagram area to attach to the question.
          </DialogDescription>
        </DialogHeader>

        {/* Page Navigation */}
        <div className="px-6 py-3 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
              disabled={pageNumber <= 1 || isLoadingPage}
            >
              Previous
            </Button>
            <span className="text-sm font-medium px-3">
              Page {pageNumber} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageNumber(Math.min(totalPages, pageNumber + 1))}
              disabled={pageNumber >= totalPages || isLoadingPage}
            >
              Next
            </Button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
              disabled={zoom <= 0.5}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-14 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom(Math.min(3, zoom + 0.25))}
              disabled={zoom >= 3}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Crop Area */}
        <div className="flex-1 relative bg-slate-900">
          {isLoadingPage ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
              <span className="ml-2 text-white">Loading page...</span>
            </div>
          ) : pageImageUrl ? (
            <Cropper
              image={pageImageUrl}
              crop={crop}
              zoom={zoom}
              aspect={undefined}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: {
                  backgroundColor: '#1e293b',
                },
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <p>Failed to load page. Please try again.</p>
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isUploading}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isUploading || !croppedAreaPixels}>
            {isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save & Attach
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ImageCropDialog;
