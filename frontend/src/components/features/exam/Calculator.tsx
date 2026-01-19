import { useState, useRef, useCallback, useEffect } from 'react';
import { X as CloseIcon, Minimize2, Maximize2, GripHorizontal, ArrowDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CalculatorProps {
    isOpen: boolean;
    onClose: () => void;
}

// Draggable and Resizable modal-based calculator using Desmos embed
export function SimpleCalculator({ isOpen, onClose }: CalculatorProps) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [mode, setMode] = useState<'scientific' | 'graphing'>('scientific');
    const [position, setPosition] = useState({ x: 100, y: 80 });
    const [size, setSize] = useState({ width: 480, height: 580 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const modalRef = useRef<HTMLDivElement>(null);

    // Reset state when opened
    useEffect(() => {
        if (isOpen) {
            setIsMinimized(false);
            // Center on screen
            setPosition({
                x: Math.max(50, (window.innerWidth - 480) / 2),
                y: 80
            });
            setSize({ width: 480, height: 580 });
        }
    }, [isOpen]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (modalRef.current && !isMinimized) {
            const rect = modalRef.current.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            });
            setIsDragging(true);
        }
    }, [isMinimized]);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsResizing(true);
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                setPosition({
                    x: Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragOffset.x)),
                    y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.y))
                });
            } else if (isResizing) {
                if (modalRef.current) {
                    const rect = modalRef.current.getBoundingClientRect();
                    setSize({
                        width: Math.max(300, e.clientX - rect.left),
                        height: Math.max(400, e.clientY - rect.top)
                    });
                }
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
        };

        if (isDragging || isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, dragOffset, size.width]);

    if (!isOpen) return null;

    return (
        <div
            ref={modalRef}
            className={cn(
                "fixed z-50 bg-card border-2 border-border rounded-xl shadow-2xl overflow-hidden transition-all",
                isMinimized ? "w-72 h-12" : "",
                isDragging && "cursor-grabbing"
            )}
            style={{
                left: position.x,
                top: position.y,
                width: isMinimized ? undefined : size.width,
                height: isMinimized ? undefined : size.height,
            }}
        >
            {/* Draggable Header */}
            <div
                className="h-12 bg-muted/50 border-b flex items-center justify-between px-3 cursor-grab active:cursor-grabbing select-none"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    <GripHorizontal className="w-4 h-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">Calculator (Desmos)</span>
                </div>
                <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setIsMinimized(!isMinimized)}
                    >
                        {isMinimized ? (
                            <Maximize2 className="w-3.5 h-3.5" />
                        ) : (
                            <Minimize2 className="w-3.5 h-3.5" />
                        )}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive"
                        onClick={onClose}
                    >
                        <CloseIcon className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Calculator Content */}
            {!isMinimized && (
                <>
                    <div className="flex-1 h-[calc(100%-48px)] flex flex-col relative">
                        {/* Mode tabs */}
                        <div className="flex border-b bg-muted/30">
                            <button
                                className={cn(
                                    "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                                    mode === 'scientific' && "border-b-2 border-primary bg-primary/5"
                                )}
                                onClick={() => setMode('scientific')}
                            >
                                Scientific
                            </button>
                            <button
                                className={cn(
                                    "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                                    mode === 'graphing' && "border-b-2 border-primary bg-primary/5"
                                )}
                                onClick={() => setMode('graphing')}
                            >
                                Graphing
                            </button>
                        </div>

                        {/* Desmos Calculator Embed */}
                        <div className="flex-1 relative">
                            <div className="absolute inset-0 pointer-events-none" /> {/* Overlay for resizing safety if needed? No, need pointer events */}
                            <iframe
                                src={mode === 'scientific'
                                    ? "https://www.desmos.com/scientific"
                                    : "https://www.desmos.com/calculator"
                                }
                                title={`Desmos ${mode} Calculator`}
                                className="w-full h-full border-0"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                            />
                        </div>
                    </div>

                    {/* Resize Handle */}
                    <div
                        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-end justify-end p-0.5 z-10 opacity-50 hover:opacity-100"
                        onMouseDown={handleResizeStart}
                    >
                        <ArrowDownRight className="w-4 h-4 text-primary" />
                    </div>
                </>
            )}
        </div>
    );
}
