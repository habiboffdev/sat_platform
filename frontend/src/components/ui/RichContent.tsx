import { useEffect, useRef } from 'react';
import 'katex/dist/katex.min.css';
import { processLatexInText } from '@/lib/latex';

interface RichContentProps {
  content: string;
  className?: string;
}

/**
 * Renders rich content with:
 * - LaTeX math expressions ($...$ for inline, $$...$$ for display mode)
 * - HTML tables with proper styling
 * - Standard HTML content
 */
export function RichContent({ content, className = '' }: RichContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !content) return;

    // Process LaTeX using the shared utility (handles currency vs math detection)
    const processedContent = processLatexInText(content);

    // Set the processed content
    containerRef.current.innerHTML = processedContent;
  }, [content]);

  return (
    <div
      ref={containerRef}
      className={`rich-content ${className}`}
    />
  );
}

// CSS styles to be added to global styles or scoped
export const richContentStyles = `
.rich-content {
  line-height: 1.7;
}

.rich-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.9rem;
  background: var(--background);
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
}

.rich-content th,
.rich-content td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid hsl(var(--border));
}

.rich-content th {
  background: hsl(var(--muted));
  font-weight: 600;
  color: hsl(var(--foreground));
}

.rich-content tr:last-child td {
  border-bottom: none;
}

.rich-content tr:hover td {
  background: hsl(var(--muted) / 0.3);
}

.rich-content .katex {
  font-size: 1.1em;
}

.rich-content .katex-display {
  margin: 1rem 0;
  text-align: center;
}

.rich-content p {
  margin-bottom: 0.75rem;
}

.rich-content p:last-child {
  margin-bottom: 0;
}
`;
