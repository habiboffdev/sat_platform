/**
 * ModuleSeparatorStep - Third step in test creation workflow
 * User visually separates questions into modules using draggable separators
 *
 * Features:
 * - Vertical question list with module-aware numbering (Q1, Q2... per module)
 * - Draggable horizontal separators between modules
 * - Module headers with question counts
 * - Visual color coding per module
 */

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  GripHorizontal,
  RotateCcw,
  Check,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ParsedQuestion, ModuleDefinition } from '@/types/testCreation';
import { SAT_MODULES, validateQuestion } from '@/types/testCreation';

interface ModuleSeparatorStepProps {
  questions: ParsedQuestion[];
  separators: number[];
  onSeparatorChange: (moduleIndex: number, afterQuestionIndex: number) => void;
  onResetSeparators: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export function ModuleSeparatorStep({
  questions,
  separators,
  onSeparatorChange,
  onResetSeparators,
  onNext,
  onPrev,
}: ModuleSeparatorStepProps) {
  const [draggedSeparator, setDraggedSeparator] = useState<number | null>(null);
  const [collapsedModules, setCollapsedModules] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  // Module info is computed inline in the JSX using getModuleQuestions

  // Toggle module collapse
  const toggleModuleCollapse = (moduleIndex: number) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleIndex)) {
        next.delete(moduleIndex);
      } else {
        next.add(moduleIndex);
      }
      return next;
    });
  };

  // Handle separator drag
  const handleDragStart = (separatorIndex: number) => {
    setDraggedSeparator(separatorIndex);
  };

  const handleDragEnd = () => {
    setDraggedSeparator(null);
  };

  const handleDragOver = useCallback(
    (questionIndex: number) => {
      if (draggedSeparator === null) return;

      // Ensure separators stay in order
      const prevSep = draggedSeparator > 0 ? separators[draggedSeparator - 1] : -1;
      const nextSep =
        draggedSeparator < separators.length - 1
          ? separators[draggedSeparator + 1]
          : questions.length;

      if (questionIndex > prevSep && questionIndex < nextSep) {
        onSeparatorChange(draggedSeparator, questionIndex);
      }
    },
    [draggedSeparator, separators, questions.length, onSeparatorChange]
  );

  // Get questions for a module
  const getModuleQuestions = (moduleIndex: number) => {
    const start = moduleIndex === 0 ? 0 : separators[moduleIndex - 1] + 1;
    const end = moduleIndex < separators.length ? separators[moduleIndex] : questions.length - 1;
    return { start, end, count: end - start + 1 };
  };

  // Module stats
  const moduleStats = SAT_MODULES.map((_, i) => {
    const { start, end, count } = getModuleQuestions(i);
    const moduleQuestions = questions.slice(start, end + 1);
    const needsAnswer = moduleQuestions.filter(
      (q) => !q.correct_answer || q.correct_answer.length === 0 || q.correct_answer[0]?.includes('NEED_ANSWER')
    ).length;
    const needsImage = moduleQuestions.filter((q) => {
      const validation = validateQuestion(q);
      return validation.issues.includes('May need an image');
    }).length;
    return { count, needsAnswer, needsImage };
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Separate Modules</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Drag the separators to define where each module starts and ends
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onResetSeparators} className="gap-2">
              <RotateCcw className="w-4 h-4" />
              Reset to Default
            </Button>
            <Badge variant="secondary" className="text-sm px-3 py-1">
              {questions.length} Questions Total
            </Badge>
          </div>
        </div>

        {/* Module overview */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {SAT_MODULES.map((mod, i) => (
            <div
              key={mod.id}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm',
                mod.bgColor,
                mod.borderColor
              )}
            >
              <span className={cn('font-semibold', mod.color)}>{mod.shortLabel}</span>
              <span className="text-muted-foreground">
                {moduleStats[i].count} Q
                {moduleStats[i].needsAnswer > 0 && (
                  <span className="text-red-500 ml-1">({moduleStats[i].needsAnswer} missing)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Question list with separators */}
        <ScrollArea className="flex-1" ref={containerRef}>
          <div className="p-6 space-y-0">
            <TooltipProvider>
              {SAT_MODULES.map((module, moduleIndex) => {
                const { start, end, count } = getModuleQuestions(moduleIndex);
                const isCollapsed = collapsedModules.has(moduleIndex);
                const moduleQuestions = questions.slice(start, end + 1);

                return (
                  <div key={module.id} className="relative">
                    {/* Module Header */}
                    <motion.div
                      initial={false}
                      animate={{ opacity: 1 }}
                      className={cn(
                        'sticky top-0 z-10 flex items-center justify-between px-4 py-3 rounded-t-xl border-x border-t cursor-pointer',
                        module.bgColor,
                        module.borderColor,
                        moduleIndex > 0 && 'mt-1'
                      )}
                      onClick={() => toggleModuleCollapse(moduleIndex)}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full',
                            module.color.replace('text-', 'bg-')
                          )}
                        />
                        <h3 className={cn('font-semibold', module.color)}>{module.label}</h3>
                        <Badge variant="outline" className="text-xs">
                          {count} questions
                        </Badge>
                        {moduleStats[moduleIndex].needsAnswer > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {moduleStats[moduleIndex].needsAnswer} need answer
                          </Badge>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        {isCollapsed ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronUp className="w-4 h-4" />
                        )}
                      </Button>
                    </motion.div>

                    {/* Questions */}
                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className={cn(
                            'border-x border-b rounded-b-xl overflow-hidden',
                            module.borderColor
                          )}
                        >
                          <div className="divide-y divide-border/50">
                            {moduleQuestions.map((q, localIdx) => {
                              const globalIdx = start + localIdx;
                              const validation = validateQuestion(q);


                              return (
                                <div
                                  key={q.id}
                                  className={cn(
                                    'flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors',
                                    draggedSeparator !== null && 'cursor-pointer'
                                  )}
                                  onMouseEnter={() =>
                                    draggedSeparator !== null && handleDragOver(globalIdx)
                                  }
                                >
                                  {/* Question number */}
                                  <div
                                    className={cn(
                                      'w-10 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0',
                                      module.bgColor,
                                      module.color
                                    )}
                                  >
                                    Q{localIdx + 1}
                                  </div>

                                  {/* Question preview */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm truncate">
                                      {q.question_text.slice(0, 80)}
                                      {q.question_text.length > 80 && '...'}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {q.domain && (
                                        <span className="text-xs text-muted-foreground capitalize">
                                          {q.domain.replace(/_/g, ' ')}
                                        </span>
                                      )}
                                      {q.question_type === 'student_produced_response' && (
                                        <Badge variant="outline" className="text-xs py-0">
                                          Grid-in
                                        </Badge>
                                      )}
                                    </div>
                                  </div>

                                  {/* Status indicators */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {validation.issues.includes('Missing correct answer') && (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <HelpCircle className="w-4 h-4 text-red-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>Missing answer</TooltipContent>
                                      </Tooltip>
                                    )}
                                    {validation.issues.includes('May need an image') && (
                                      <Tooltip>
                                        <TooltipTrigger>
                                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        </TooltipTrigger>
                                        <TooltipContent>May need image</TooltipContent>
                                      </Tooltip>
                                    )}
                                    {validation.valid && (
                                      <Check className="w-4 h-4 text-green-500" />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Separator (draggable divider between modules) */}
                    {moduleIndex < SAT_MODULES.length - 1 && (
                      <DraggableSeparator
                        moduleIndex={moduleIndex}
                        afterQuestion={separators[moduleIndex]}
                        totalQuestions={questions.length}
                        nextModule={SAT_MODULES[moduleIndex + 1]}
                        isDragging={draggedSeparator === moduleIndex}
                        onDragStart={() => handleDragStart(moduleIndex)}
                        onDragEnd={handleDragEnd}
                      />
                    )}
                  </div>
                );
              })}
            </TooltipProvider>
          </div>
        </ScrollArea>

        {/* Side panel - Module summary */}
        <div className="w-72 border-l bg-card p-4 shrink-0 hidden lg:block">
          <h3 className="font-semibold mb-4">Module Summary</h3>
          <div className="space-y-3">
            {SAT_MODULES.map((mod, i) => {
              const stats = moduleStats[i];
              const isValid =
                stats.count >= mod.defaultQuestionCount - 2 &&
                stats.count <= mod.defaultQuestionCount + 2;

              return (
                <div
                  key={mod.id}
                  className={cn(
                    'p-3 rounded-xl border',
                    mod.bgColor,
                    mod.borderColor
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={cn('font-semibold text-sm', mod.color)}>
                      {mod.shortLabel}
                    </span>
                    <span
                      className={cn(
                        'text-sm font-mono',
                        isValid ? 'text-green-600' : 'text-amber-600'
                      )}
                    >
                      {stats.count}/{mod.defaultQuestionCount}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Time limit:</span>
                      <span>{mod.timeLimit} min</span>
                    </div>
                    {stats.needsAnswer > 0 && (
                      <div className="flex justify-between text-red-500">
                        <span>Missing answers:</span>
                        <span>{stats.needsAnswer}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tips */}
          <div className="mt-6 p-3 rounded-lg bg-muted/50 text-sm">
            <h4 className="font-medium mb-2">Tips</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Standard SAT: 27 RW + 22 Math per module</li>
              <li>• Drag separators to adjust boundaries</li>
              <li>• Click module headers to collapse/expand</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer navigation */}
      <div className="px-6 py-4 border-t bg-card shrink-0 flex justify-between">
        <Button variant="outline" size="lg" onClick={onPrev} className="gap-2">
          <ArrowLeft className="w-5 h-5" />
          Back
        </Button>

        <Button size="lg" onClick={onNext} className="gap-2 px-8">
          Review Questions
          <ArrowRight className="w-5 h-5" />
        </Button>
      </div>
    </motion.div>
  );
}

interface DraggableSeparatorProps {
  moduleIndex: number;
  afterQuestion: number;
  totalQuestions: number;
  nextModule: ModuleDefinition;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}

function DraggableSeparator({
  afterQuestion,
  nextModule,
  isDragging,
  onDragStart,
  onDragEnd,
}: DraggableSeparatorProps) {
  return (
    <div
      className={cn(
        'relative my-2 py-3 flex items-center justify-center group cursor-grab active:cursor-grabbing',
        isDragging && 'z-20'
      )}
      onMouseDown={onDragStart}
      onMouseUp={onDragEnd}
      onMouseLeave={onDragEnd}
    >
      {/* Separator line */}
      <div
        className={cn(
          'absolute inset-x-0 h-1 rounded-full transition-all',
          isDragging
            ? 'bg-primary shadow-lg shadow-primary/30'
            : 'bg-border group-hover:bg-primary/50'
        )}
      />

      {/* Drag handle */}
      <div
        className={cn(
          'relative z-10 flex items-center gap-2 px-4 py-1.5 rounded-full border-2 bg-background transition-all',
          isDragging
            ? 'border-primary shadow-lg scale-105'
            : 'border-border group-hover:border-primary/50'
        )}
      >
        <GripHorizontal className="w-4 h-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          After Q{afterQuestion + 1}
        </span>
        <span className="text-xs text-muted-foreground">→</span>
        <span className={cn('text-xs font-semibold', nextModule.color)}>
          {nextModule.shortLabel}
        </span>
      </div>
    </div>
  );
}
