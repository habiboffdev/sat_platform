import { useMemo } from 'react';
import 'katex/dist/katex.min.css';
import { parseMathExpressions, renderMathToHtml } from '@/lib/latex';

interface MathRendererProps {
    text: string;
    className?: string;
}

/**
 * Renders text with inline LaTeX math expressions and auto-detects simple fractions.
 * Supports:
 * - $...$ syntax for LaTeX math
 * - Smart currency vs math detection (won't render $600 as math)
 * - Simple fractions like 1/29, 29/100 (auto-converted to proper fractions)
 */
export function MathRenderer({ text, className = '' }: MathRendererProps) {
    const renderedContent = useMemo(() => {
        if (!text) return [];

        let processedText = text;

        // If text doesn't contain $, try to auto-detect fractions
        if (!text.includes('$')) {
            // Match simple fractions: digits followed by / followed by digits
            // This handles cases like "1/29", "29/100", "-3/4", etc.
            const fractionRegex = /(-?\d+)\/(\d+)/g;
            const hasFraction = fractionRegex.test(text);
            if (hasFraction) {
                // Wrap the whole text in $ and convert fractions to \frac
                processedText = text.replace(/(-?\d+)\/(\d+)/g, '$\\frac{$1}{$2}$');
            }
        }

        // Use the shared parser that handles currency vs math detection
        return parseMathExpressions(processedText);
    }, [text]);

    if (!text) return null;

    if (renderedContent.length === 0) {
        return <span className={className}>{text}</span>;
    }

    return (
        <span className={className}>
            {renderedContent.map((part, index) => {
                if (typeof part === 'string') {
                    return <span key={index}>{part}</span>;
                }
                // Render math using the shared utility
                const html = renderMathToHtml(part.math, part.display);
                return (
                    <span
                        key={index}
                        dangerouslySetInnerHTML={{ __html: html }}
                    />
                );
            })}
        </span>
    );
}

