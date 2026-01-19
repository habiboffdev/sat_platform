import { useEffect, useRef, memo } from 'react';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';
import { processLatexInText } from '@/lib/latex';

interface QuestionContentProps {
  content: string;
  className?: string;
  variant?: 'default' | 'passage' | 'question' | 'option' | 'explanation';
  size?: 'sm' | 'md' | 'lg';
}

/**
 * QuestionContent - A premium content renderer for SAT questions.
 * Handles:
 * - LaTeX math expressions ($...$ for inline, $$...$$ for display mode)
 * - \(...\) and \[...\] notation
 * - HTML tables with elegant styling
 * - Rich HTML content with proper typography
 */
export const QuestionContent = memo(function QuestionContent({
  content,
  className = '',
  variant = 'default',
  size = 'md'
}: QuestionContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !content) return;

    // Process LaTeX using the shared utility (handles currency vs math detection)
    const processedContent = processLatexInText(content);

    containerRef.current.innerHTML = processedContent;
  }, [content]);

  const variantClasses = {
    default: '',
    passage: 'question-content-passage',
    question: 'question-content-question',
    option: 'question-content-option',
    explanation: 'question-content-explanation',
  };

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        'question-content',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    />
  );
});

// CSS to be added to global styles
export const questionContentStyles = `
/* Base styles for question content */
.question-content {
  line-height: 1.8;
  color: hsl(var(--foreground));
}

/* KaTeX styling */
.question-content .katex {
  font-size: 1.1em;
}

.question-content .katex-display {
  margin: 1.25rem 0;
  text-align: center;
}

/* Table styling */
.question-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.925rem;
  background: hsl(var(--card));
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
}

.question-content th,
.question-content td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid hsl(var(--border));
}

.question-content th {
  background: hsl(var(--muted));
  font-weight: 600;
}

.question-content tr:last-child td {
  border-bottom: none;
}

/* Passage variant - serif typography for reading */
.question-content-passage {
  font-family: 'Source Serif 4', Georgia, serif;
}

.question-content-passage p {
  margin-bottom: 1rem;
  text-indent: 1.5em;
}

.question-content-passage p:first-child {
  text-indent: 0;
}

/* Question variant */
.question-content-question {
  font-family: 'Source Serif 4', Georgia, serif;
  font-size: 1.125rem;
  line-height: 1.9;
}

/* Option variant - slightly smaller */
.question-content-option {
  font-family: 'Source Serif 4', Georgia, serif;
  line-height: 1.7;
}

/* Explanation variant */
.question-content-explanation {
  line-height: 1.75;
}

/* Paragraph spacing */
.question-content p {
  margin-bottom: 0.75rem;
}

.question-content p:last-child {
  margin-bottom: 0;
}
`;
