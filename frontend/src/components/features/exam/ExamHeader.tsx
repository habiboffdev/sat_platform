import { useEffect, useState, useCallback } from 'react';
import { useExamStore } from '@/store/exam';
import { cn } from '@/lib/utils';
import {
  Clock,
  Eye,
  EyeOff,
  Highlighter,
  MoreHorizontal,
  HelpCircle,
  Calculator as CalculatorIcon,
  BookOpen,
  LogOut,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SimpleCalculator } from './Calculator';
import { ReferenceSheet } from './ReferenceSheet';
import { HelpModal } from './HelpModal';

interface ExamHeaderProps {
  onExit?: () => void;
  zoomLevel?: number;
  onZoomChange?: (level: number) => void;
}

// Circular progress ring component
function ProgressRing({
  progress,
  size = 32,
  strokeWidth = 3
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="module-progress-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          className="track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        <circle
          className="fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
    </div>
  );
}

export function ExamHeader({ onExit, zoomLevel = 1, onZoomChange }: ExamHeaderProps) {
  const { currentModule, currentQuestionIndex, answers, timeLeft, tickTimer } = useExamStore();
  const [isTimerVisible, setIsTimerVisible] = useState(true);

  // Tool states
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isReferenceOpen, setIsReferenceOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(tickTimer, 1000);
    return () => clearInterval(timer);
  }, [tickTimer]);

  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const getTimerClass = () => {
    if (timeLeft <= 60) return 'critical';
    if (timeLeft <= 300) return 'warning';
    return '';
  };

  const getSectionInfo = () => {
    if (!currentModule) return { section: 'Loading...', module: '', icon: BookOpen };

    const isRW = currentModule.section === 'reading_writing';
    return {
      section: isRW ? 'Section 1: Reading and Writing' : 'Section 2: Math',
      module: currentModule.module === 'module_1' ? 'Module 1 of 2' : 'Module 2 of 2',
      icon: isRW ? BookOpen : CalculatorIcon,
    };
  };

  const { section, module, icon: SectionIcon } = getSectionInfo();

  // Calculate progress
  const totalQuestions = currentModule?.questions.length || 0;
  const answeredCount = currentModule?.questions.filter((q) => answers[q.id]).length || 0;
  const progressPercent = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    if (onZoomChange && zoomLevel < 1.5) {
      onZoomChange(Math.min(1.5, zoomLevel + 0.25));
    }
  }, [onZoomChange, zoomLevel]);

  const handleZoomOut = useCallback(() => {
    if (onZoomChange && zoomLevel > 0.75) {
      onZoomChange(Math.max(0.75, zoomLevel - 0.25));
    }
  }, [onZoomChange, zoomLevel]);

  return (
    <>
      <header className="exam-header select-none">
        {/* Left: Section Info with Progress */}
        <div className="flex items-center gap-4">
          {/* Progress Ring */}
          <div className="relative">
            <ProgressRing progress={progressPercent} size={36} strokeWidth={3} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[10px] font-bold text-white">
                {answeredCount}
              </span>
            </div>
          </div>

          <div>
            <div className="exam-header-section font-semibold flex items-center gap-2">
              {SectionIcon && <SectionIcon className="w-4 h-4 text-white/70" />}
              {section}
            </div>
            <div className="text-xs text-white/60 flex items-center gap-2">
              <span>{module}</span>
              <span className="text-white/40">•</span>
              <span>{answeredCount}/{totalQuestions} answered</span>
            </div>
          </div>
        </div>

        {/* Center: Timer (Enhanced) */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTimerVisible(!isTimerVisible)}
            className="exam-tools-button"
            aria-label={isTimerVisible ? 'Hide timer' : 'Show timer'}
          >
            {isTimerVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>

          {isTimerVisible ? (
            <div className={cn(
              "timer-enhanced",
              getTimerClass()
            )}>
              <Clock className="w-4 h-4 text-white/60" />
              <span className={cn('exam-timer', getTimerClass())}>
                {formatTime(timeLeft)}
              </span>
            </div>
          ) : (
            <div className="timer-enhanced">
              <Clock className="w-4 h-4 text-white/40" />
              <span className="exam-timer text-white/40">--:--</span>
            </div>
          )}
        </div>

        {/* Progress bar underneath timer on mobile */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
          <div
            className="h-full bg-white/30 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Right: Tools */}
        <div className="flex items-center gap-1">
          {/* Question Progress Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-xs font-medium text-white/80 mr-2">
            Q{currentQuestionIndex + 1}/{totalQuestions}
          </div>

          {/* Annotate/Highlight */}
          <button className="exam-tools-button" title="Annotate (Coming Soon)">
            <Highlighter className="w-4 h-4" />
            <span className="hidden sm:inline">Annotate</span>
          </button>

          {/* Calculator (for Math section) */}
          {currentModule?.section === 'math' && (
            <button
              className={cn("exam-tools-button", isCalculatorOpen && "bg-white/20")}
              onClick={() => setIsCalculatorOpen(!isCalculatorOpen)}
            >
              <CalculatorIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Calculator</span>
            </button>
          )}

          {/* Reference Sheet (for Math section) */}
          {currentModule?.section === 'math' && (
            <button
              className="exam-tools-button"
              onClick={() => setIsReferenceOpen(true)}
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Reference</span>
            </button>
          )}

          {/* More Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="exam-tools-button">
                <MoreHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem className="gap-2" onClick={() => setIsHelpOpen(true)}>
                <HelpCircle className="w-4 h-4" />
                Help
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onClick={handleZoomIn} disabled={zoomLevel >= 1.5}>
                <ZoomIn className="w-4 h-4" />
                Zoom In {zoomLevel < 1.5 && `(${Math.round(zoomLevel * 100)}%)`}
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2" onClick={handleZoomOut} disabled={zoomLevel <= 0.75}>
                <ZoomOut className="w-4 h-4" />
                Zoom Out {zoomLevel > 0.75 && `(${Math.round(zoomLevel * 100)}%)`}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 text-destructive" onClick={onExit}>
                <LogOut className="w-4 h-4" />
                Exit Test
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Tool Modals/Components */}
      <SimpleCalculator
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />
      <ReferenceSheet
        isOpen={isReferenceOpen}
        onClose={() => setIsReferenceOpen(false)}
      />
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />
    </>
  );
}
