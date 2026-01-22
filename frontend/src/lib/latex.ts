/**
 * LaTeX math parsing utilities.
 * 
 * Handles detection and rendering of LaTeX math expressions while
 * properly distinguishing them from currency values like $600.
 */

import katex from 'katex';

/**
 * Check if a string looks like a LaTeX math expression rather than currency or prose.
 *
 * SIMPLE RULE: Render as math UNLESS it's clearly prose text.
 * The main case to reject is currency context like "$600 car and $500" where
 * the content between $ signs is clearly prose text.
 */
export function isMathExpression(content: string): boolean {
    const trimmed = content.trim();

    // Empty content is not math
    if (!trimmed) return false;

    // ALWAYS RENDER: Single character (variable like $a$, $x$, $n$)
    if (trimmed.length === 1) {
        return true;
    }

    // ALWAYS RENDER: Two characters (like $xy$, $ab$, $2x$)
    if (trimmed.length === 2) {
        return true;
    }

    // ALWAYS RENDER if it contains LaTeX commands (backslash followed by letters)
    // e.g., \frac, \left, \right, \sqrt, \cdot, etc.
    if (/\\[a-zA-Z]+/.test(trimmed)) {
        return true;
    }

    // ALWAYS RENDER if it contains math symbols/operators
    // These are definite math indicators
    if (/[=<>^_{}+\-*/]/.test(trimmed)) {
        return true;
    }

    // ALWAYS RENDER if it contains parentheses with letters/numbers (function notation)
    // e.g., p(x), f(2), sin(x)
    if (/[a-zA-Z]\s*\(/.test(trimmed)) {
        return true;
    }

    // ALWAYS RENDER: Numbers (like $123$, $3.14$)
    if (/^-?[\d.,]+%?$/.test(trimmed)) {
        return true;
    }

    // For longer content without obvious math markers, check if it's prose
    // Split by spaces
    const words = trimmed.split(/\s+/).filter(w => w.length > 0);

    // REJECT: Starts with a number followed by word-like text (currency context)
    // e.g., "600 car" or "500 dollars"
    if (/^\d[\d,]*(\.\d+)?\s+[a-zA-Z]{3,}/.test(trimmed)) {
        return false;
    }

    // REJECT: Contains common prose words (but NOT single letters which are variables)
    // Only check words with 2+ characters
    const proseWords = ['the', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'is', 'are', 'was', 'were', 'that', 'this', 'with'];
    const lowerWords = words.filter(w => w.length >= 2).map(w => w.toLowerCase());
    if (lowerWords.some(w => proseWords.includes(w))) {
        return false;
    }

    // Everything else between $...$ should render as math
    return true;
}

/**
 * Parse text and extract math expressions with proper positions.
 * Handles both $...$ (inline) and $$...$$ (display) modes.
 * 
 * @param text - The input text to parse
 * @returns Array of parts: either plain text strings or math objects
 */
export function parseMathExpressions(text: string): Array<string | { math: string; display: boolean }> {
    if (!text) return [];

    const parts: Array<string | { math: string; display: boolean }> = [];

    // First, handle $$...$$ display mode (greedy for these)
    const displayRegex = /\$\$([^$]+)\$\$/g;
    let lastIndex = 0;
    let match;

    // Process display mode first
    const displayMathPositions: Array<{ start: number; end: number; math: string }> = [];

    while ((match = displayRegex.exec(text)) !== null) {
        displayMathPositions.push({
            start: match.index,
            end: match.index + match[0].length,
            math: match[1]
        });
    }

    // Now process inline $...$ while avoiding display mode positions
    // Match $ followed by content followed by $
    // More permissive: allows spaces at start/end of math content
    const inlineRegex = /\$([^$]+)\$/g;
    const inlineMathPositions: Array<{ start: number; end: number; math: string }> = [];

    while ((match = inlineRegex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const mathContent = match[1];

        // Skip if this overlaps with a display mode match
        const overlapsDisplay = displayMathPositions.some(
            dm => (start >= dm.start && start < dm.end) || (end > dm.start && end <= dm.end)
        );

        if (overlapsDisplay) continue;

        // Check if this looks like math (not currency)
        if (isMathExpression(mathContent)) {
            inlineMathPositions.push({ start, end, math: mathContent });
        }
    }

    // Combine and sort all positions
    const allPositions = [
        ...displayMathPositions.map(p => ({ ...p, display: true })),
        ...inlineMathPositions.map(p => ({ ...p, display: false }))
    ].sort((a, b) => a.start - b.start);

    // Build the parts array
    lastIndex = 0;
    for (const pos of allPositions) {
        // Add text before this match
        if (pos.start > lastIndex) {
            parts.push(text.slice(lastIndex, pos.start));
        }
        // Add the math expression
        parts.push({ math: pos.math, display: pos.display });
        lastIndex = pos.end;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
    }

    return parts;
}

/**
 * Render a math expression to HTML string using KaTeX.
 */
export function renderMathToHtml(math: string, displayMode: boolean): string {
    try {
        return katex.renderToString(math.trim(), {
            throwOnError: false,
            displayMode,
        });
    } catch {
        // Return the original if KaTeX fails
        return displayMode ? `$$${math}$$` : `$${math}$`;
    }
}

/**
 * Process text and replace all math expressions with rendered KaTeX HTML.
 * Also handles \(...\) and \[...\] notation.
 */
export function processLatexInText(text: string): string {
    if (!text) return '';

    let processed = text;

    // NOTE: Underscore-to-blank conversion removed - it was causing issues with LaTeX
    // Fill-in-the-blank underscores from OCR should be handled at extraction time instead

    // Handle \[...\] display mode
    processed = processed.replace(/\\\[(.+?)\\\]/gs, (_, math) => {
        return renderMathToHtml(math, true);
    });

    // Handle \(...\) inline mode
    processed = processed.replace(/\\\((.+?)\\\)/g, (_, math) => {
        return renderMathToHtml(math, false);
    });

    // Handle $$...$$ display mode
    processed = processed.replace(/\$\$([^$]+)\$\$/g, (_, math) => {
        return renderMathToHtml(math, true);
    });

    // Handle $...$ inline mode with smart detection
    // Use a function to check each match
    processed = processed.replace(/\$([^$]+)\$/g, (match, math) => {
        if (isMathExpression(math)) {
            return renderMathToHtml(math, false);
        }
        // Not math, return original
        return match;
    });

    return processed;
}
