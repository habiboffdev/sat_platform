/**
 * TableRenderer Component
 *
 * Renders structured table data with:
 * - LaTeX math support in cells via RichContent
 * - Responsive scrolling for wide tables
 * - Consistent styling with the design system
 */

import { cn } from '@/lib/utils';
import { RichContent } from './RichContent';

export interface TableData {
  headers: string[];
  rows: string[][];
  title?: string | null;
}

interface TableRendererProps {
  data: TableData;
  className?: string;
  compact?: boolean;
}

/**
 * Renders a structured table with LaTeX support in cells.
 *
 * Usage:
 * ```tsx
 * <TableRenderer
 *   data={{
 *     headers: ["x", "f(x)"],
 *     rows: [["1", "$2x + 1$"], ["2", "$2x + 2$"]],
 *     title: "Function Values"
 *   }}
 * />
 * ```
 */
export function TableRenderer({ data, className, compact = false }: TableRendererProps) {
  if (!data || (!data.headers?.length && !data.rows?.length)) {
    return null;
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      {data.title && (
        <p className="font-medium mb-2 text-sm text-muted-foreground">{data.title}</p>
      )}
      <table
        className={cn(
          'min-w-full border-collapse border border-border rounded-lg overflow-hidden',
          compact ? 'text-xs' : 'text-sm'
        )}
      >
        {data.headers && data.headers.length > 0 && (
          <thead>
            <tr className="bg-muted">
              {data.headers.map((header, i) => (
                <th
                  key={i}
                  className={cn(
                    'border border-border text-left font-medium',
                    compact ? 'px-2 py-1' : 'px-3 py-2'
                  )}
                >
                  <RichContent content={header} inline />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="hover:bg-muted/50 transition-colors">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={cn(
                    'border border-border',
                    compact ? 'px-2 py-1' : 'px-3 py-2'
                  )}
                >
                  <RichContent content={cell} inline />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TableRenderer;
