/**
 * LaTeX math parsing utilities.
 * 
 * Handles detection and rendering of LaTeX math expressions while
 * properly distinguishing them from currency values like $600.
 */

import katex from 'katex';

/**
 * Check if KaTeX can successfully parse the content as LaTeX.
 * This is the most reliable way to detect valid LaTeX.
 */
function canKaTeXParse(content: string): boolean {
    try {
        katex.renderToString(content, { throwOnError: true });
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if a string looks like a LaTeX math expression rather than currency or prose.
 * 
 * Strategy:
 * 1. First, quickly reject obvious non-math (pure numbers, long prose)
 * 2. Then use KaTeX to validate if it's actually valid LaTeX
 * 
 * This approach handles edge cases like (r, s) which is valid LaTeX
 * but wouldn't match simple regex patterns.
 */
export function isMathExpression(content: string): boolean {
    const trimmed = content.trim();

    // Empty content is not math
    if (!trimmed) return false;

    // If it's ONLY digits, commas, decimals, and spaces - it's likely currency
    // e.g., "600", "1,000", "2.50", "600 "
    if (/^[\d,.\s]+$/.test(trimmed)) {
        return false;
    }

    // PRIORITY CHECK: Contains LaTeX commands or escaped symbols - definitely math
    // This matches \frac, \sqrt, \cdot, \times, and also \%, \&, \_, \#, \{, \}
    if (/\\[a-zA-Z]+|\\[%&_#{}!$]/.test(trimmed)) {
        return true;
    }

    // PRIORITY CHECK: Contains curly braces - likely LaTeX
    if (/\{[^}]+\}/.test(trimmed)) {
        return true;
    }

    // PRIORITY CHECK: Contains definite math operators
    // Added - to the list, but we'll be careful in the prose check
    if (/[+*/=<>^_|~-]/.test(trimmed)) {
        return true;
    }

    // Minus sign that looks mathematical (already handled by the operator check above, 
    // but kept as specific logic if needed for complex variants)
    if (/\d\s*-\s*\d/.test(trimmed) || /^-\s*\d/.test(trimmed)) {
        return true;
    }

    // NOW apply prose filters (only for content that didn't match explicit math patterns)

    // Reject if it looks like a sentence (period followed by space or end)
    if (/\.\s+[A-Z]/.test(trimmed) || (trimmed.endsWith('.') && !/\d\./.test(trimmed))) {
        return false;
    }

    // Reject if it has too many words
    const wordCount = trimmed.split(/\s+/).filter(w => w.length > 0).length;
    if (wordCount > 6) {
        return false;
    }

    // Reject if it has comma followed by space and lowercase (prose pattern)
    // BUT skip this if it looks like a coordinate pair (r, s)
    if (/, \s*[a-z]/.test(trimmed) && !/^\(.*\)$/.test(trimmed)) {
        return false;
    }

    // If it starts with a number and is followed by word-like text, it's currency context
    if (/^\d[\d,]*(\.\d+)?[,\s]+[a-zA-Z]{2,}/.test(trimmed)) {
        return false;
    }

    // Single letter (variable) - likely math: x, y, f, n
    if (/^[a-zA-Z]$/.test(trimmed)) {
        return true;
    }

    // Short expressions with letters and numbers mixed: 2x, x2, 3n
    if (/^\d+[a-zA-Z]$/.test(trimmed) || /^[a-zA-Z]\d+$/.test(trimmed)) {
        return true;
    }

    // Common math variable patterns: x + 2, 2x + 3y, etc.
    if (/^[a-zA-Z]\s*[+\-*/=]\s*\d/.test(trimmed) || /^\d\s*[+\-*/=]\s*[a-zA-Z]/.test(trimmed)) {
        return true;
    }

    // Greek letters written out with backslash
    if (/\\(alpha|beta|gamma|delta|theta|pi|sigma|omega|lambda|mu)/i.test(trimmed)) {
        return true;
    }

    // Parentheses with clear math content (letters and operators)
    if (/\([^)]*[a-zA-Z][^)]*[+\-*/=^_][^)]*\)/.test(trimmed)) {
        return true;
    }

    // Function notation: f(x), g(2), sin(x)
    if (/^[a-zA-Z]+\([^)]+\)$/.test(trimmed)) {
        return true;
    }

    // Subscript/superscript patterns: x_1, x^2
    if (/[a-zA-Z][_^]\d/.test(trimmed) || /[a-zA-Z][_^]\{[^}]+\}/.test(trimmed)) {
        return true;
    }

    // Coordinate pairs like (r, s), (x, y), (a, b)
    if (/^\([a-zA-Z],\s*[a-zA-Z]\)$/.test(trimmed)) {
        return true;
    }

    // FINAL FALLBACK: For short content, try KaTeX parsing
    // This catches edge cases that are valid LaTeX but don't match simple regexes
    if (wordCount <= 4 && canKaTeXParse(trimmed)) {
        // If it contains letters and parentheses/brackets/operators, it's likely math
        if (/[a-zA-Z]/.test(trimmed) && /[()[\]+\-*/=<>]/.test(trimmed)) {
            return true;
        }
    }

    // If none of the above, default to NOT math (be conservative)
    return false;
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
