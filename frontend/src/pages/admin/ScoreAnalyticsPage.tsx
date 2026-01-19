import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, Search, Clock, Calendar, Target, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './ScoreAnalyticsPage.module.css';
import { adminService } from '@/services/admin';
import type { ScoreAnalyticsFilters } from '@/services/admin';

// Helper to get score badge class
function getScoreClass(score: number | null): string {
    if (!score) return styles.medium;
    if (score >= 1400) return styles.high;
    if (score >= 1200) return styles.medium;
    return styles.low;
}

export default function ScoreAnalyticsPage() {
    // Filter state
    const [filters, setFilters] = useState<ScoreAnalyticsFilters>({
        page: 1,
        page_size: 20,
    });

    // Applied filters (only update when "Apply" is clicked)
    const [appliedFilters, setAppliedFilters] = useState<ScoreAnalyticsFilters>({
        page: 1,
        page_size: 20,
    });

    // Query for score analytics
    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['score-analytics', appliedFilters],
        queryFn: () => adminService.getScoreAnalytics(appliedFilters),
        placeholderData: (previousData) => previousData,
    });

    // Query for tests (for filter dropdown)
    const { data: testsData } = useQuery({
        queryKey: ['tests-list'],
        queryFn: () => adminService.getTestsList(),
        staleTime: 5 * 60 * 1000,
    });

    // Update filter values
    const updateFilter = <K extends keyof ScoreAnalyticsFilters>(
        key: K,
        value: ScoreAnalyticsFilters[K]
    ) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    // Apply filters
    const handleApplyFilters = () => {
        setAppliedFilters({ ...filters, page: 1 });
    };

    // Clear filters
    const handleClearFilters = () => {
        const cleared: ScoreAnalyticsFilters = { page: 1, page_size: 20 };
        setFilters(cleared);
        setAppliedFilters(cleared);
    };

    // Pagination
    const handlePageChange = (newPage: number) => {
        setAppliedFilters(prev => ({ ...prev, page: newPage }));
        setFilters(prev => ({ ...prev, page: newPage }));
    };

    // Export function
    const handleExport = async (format: 'csv' | 'pdf' = 'csv') => {
        try {
            const blob = await adminService.exportScoreAnalytics(appliedFilters, format);
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `score_analytics_${format === 'csv' ? 'report' : 'summary'}_${format === 'csv' ? format : 'pdf'}.${format}`);
            document.body.appendChild(link);
            link.click();
            link.parentNode?.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Export failed. Please try again.');
        }
    };

    // Check if any filters are active
    const hasActiveFilters = useMemo(() => {
        return !!(
            appliedFilters.start_time ||
            appliedFilters.end_time ||
            appliedFilters.start_date ||
            appliedFilters.end_date ||
            appliedFilters.min_score ||
            appliedFilters.max_score ||
            appliedFilters.test_id ||
            appliedFilters.user_search
        );
    }, [appliedFilters]);

    return (
        <div className={styles.scoreAnalytics}>
            {/* Header */}
            <div className={styles.header}>
                <h1 className={styles.title}>Score Analytics</h1>
                <p className={styles.subtitle}>
                    Query student performance with precision filters
                </p>
            </div>

            {/* Filter Panel */}
            <div className={styles.filterPanel}>
                <div className={styles.filterGrid}>
                    {/* Time of Day Filter */}
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>
                            <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
                            Time of Day
                        </label>
                        <div className={styles.timeRange}>
                            <input
                                type="time"
                                className={styles.timeInput}
                                value={filters.start_time || ''}
                                onChange={(e) => updateFilter('start_time', e.target.value || undefined)}
                                placeholder="From"
                            />
                            <span className={styles.timeSeparator}>→</span>
                            <input
                                type="time"
                                className={styles.timeInput}
                                value={filters.end_time || ''}
                                onChange={(e) => updateFilter('end_time', e.target.value || undefined)}
                                placeholder="To"
                            />
                        </div>
                    </div>

                    {/* Date Range */}
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>
                            <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
                            Date Range
                        </label>
                        <div className={styles.timeRange}>
                            <input
                                type="date"
                                className={styles.dateInput}
                                value={filters.start_date || ''}
                                onChange={(e) => updateFilter('start_date', e.target.value || undefined)}
                            />
                            <span className={styles.timeSeparator}>→</span>
                            <input
                                type="date"
                                className={styles.dateInput}
                                value={filters.end_date || ''}
                                onChange={(e) => updateFilter('end_date', e.target.value || undefined)}
                            />
                        </div>
                    </div>

                    {/* Score Range */}
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>
                            <Target size={12} style={{ display: 'inline', marginRight: 4 }} />
                            Score Range
                        </label>
                        <div className={styles.scoreInputs}>
                            <input
                                type="number"
                                className={styles.scoreInput}
                                value={filters.min_score || ''}
                                onChange={(e) => updateFilter('min_score', e.target.value ? parseInt(e.target.value) : undefined)}
                                placeholder="Min"
                                min={400}
                                max={1600}
                            />
                            <span className={styles.timeSeparator}>–</span>
                            <input
                                type="number"
                                className={styles.scoreInput}
                                value={filters.max_score || ''}
                                onChange={(e) => updateFilter('max_score', e.target.value ? parseInt(e.target.value) : undefined)}
                                placeholder="Max"
                                min={400}
                                max={1600}
                            />
                        </div>
                    </div>

                    {/* Test Filter */}
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>Test</label>
                        <select
                            className={styles.selectInput}
                            value={filters.test_id || ''}
                            onChange={(e) => updateFilter('test_id', e.target.value ? parseInt(e.target.value) : undefined)}
                        >
                            <option value="">All Tests</option>
                            {testsData?.tests?.map((test: { id: number; title: string }) => (
                                <option key={test.id} value={test.id}>
                                    {test.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* User Search */}
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel}>
                            <Users size={12} style={{ display: 'inline', marginRight: 4 }} />
                            Search User
                        </label>
                        <input
                            type="text"
                            className={styles.searchInput}
                            value={filters.user_search || ''}
                            onChange={(e) => updateFilter('user_search', e.target.value || undefined)}
                            placeholder="Name or email..."
                        />
                    </div>
                </div>

                {/* Filter Actions */}
                <div className={styles.filterActions}>
                    <button className={styles.secondaryButton} onClick={handleClearFilters}>
                        Clear
                    </button>
                    <button className={styles.primaryButton} onClick={handleApplyFilters} disabled={isFetching}>
                        {isFetching ? 'Loading...' : 'Apply Filters ✨'}
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            {data?.summary && (
                <div className={styles.summaryGrid}>
                    <div className={`${styles.summaryCard} ${styles.average} ${styles.animated}`}>
                        <div className={styles.summaryValue}>
                            {data.summary.average_score?.toFixed(0) || '—'}
                        </div>
                        <div className={styles.summaryLabel}>Average Score</div>
                    </div>
                    <div className={`${styles.summaryCard} ${styles.students} ${styles.animated}`} style={{ animationDelay: '0.05s' }}>
                        <div className={styles.summaryValue}>
                            {data.summary.unique_users}
                        </div>
                        <div className={styles.summaryLabel}>Students</div>
                    </div>
                    <div className={`${styles.summaryCard} ${styles.highest} ${styles.animated}`} style={{ animationDelay: '0.1s' }}>
                        <div className={styles.summaryValue}>
                            {data.summary.highest_score || '—'}
                        </div>
                        <div className={styles.summaryLabel}>Highest Score</div>
                    </div>
                    <div className={`${styles.summaryCard} ${styles.lowest} ${styles.animated}`} style={{ animationDelay: '0.15s' }}>
                        <div className={styles.summaryValue}>
                            {data.summary.lowest_score || '—'}
                        </div>
                        <div className={styles.summaryLabel}>Lowest Score</div>
                    </div>
                </div>
            )}

            {/* Results Table */}
            <div className={styles.tableContainer}>
                <div className={styles.tableHeader}>
                    <h3 className={styles.tableTitle}>
                        Results {data?.total ? `(${data.total})` : ''}
                        {hasActiveFilters && <span style={{ opacity: 0.5, marginLeft: 8, fontSize: '0.75rem' }}>• Filtered</span>}
                    </h3>
                    <div className={styles.exportActions}>
                        <button className={styles.exportButton} onClick={() => handleExport('csv')} disabled={!data?.items.length}>
                            <Download size={14} />
                            Export CSV
                        </button>
                        <button className={styles.pdfButton} onClick={() => handleExport('pdf')} disabled={!data?.items.length}>
                            <Download size={14} />
                            Download PDF
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className={styles.loadingState}>
                        <div className={styles.spinner} />
                    </div>
                ) : data?.items.length ? (
                    <>
                        <table className={styles.dataTable}>
                            <thead>
                                <tr>
                                    <th>Student</th>
                                    <th>Test</th>
                                    <th>Total</th>
                                    <th>R&W</th>
                                    <th>Math</th>
                                    <th>Time</th>
                                    <th>Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.items.map((item, index) => (
                                    <tr
                                        key={`${item.user_id}-${item.test_id}-${item.started_at}`}
                                        className={styles.animated}
                                        style={{ animationDelay: `${index * 0.02}s` }}
                                    >
                                        <td>
                                            <div>
                                                <strong>{item.user_name}</strong>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                                    {item.user_email}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {item.test_title}
                                        </td>
                                        <td>
                                            <span className={`${styles.scoreBadge} ${getScoreClass(item.total_score)}`}>
                                                {item.total_score || '—'}
                                            </span>
                                        </td>
                                        <td>{item.reading_writing_score || '—'}</td>
                                        <td>{item.math_score || '—'}</td>
                                        <td>
                                            <div className={styles.timeDisplay}>
                                                <span className={styles.timeValue}>
                                                    {format(new Date(item.started_at), 'HH:mm')}
                                                </span>
                                                <span className={styles.dateValue}>
                                                    {format(new Date(item.started_at), 'MMM d, yyyy')}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            {item.time_taken_minutes ? `${item.time_taken_minutes} min` : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Pagination */}
                        {data.total_pages > 1 && (
                            <div className={styles.pagination}>
                                <div className={styles.paginationInfo}>
                                    Page {data.page} of {data.total_pages} ({data.total} results)
                                </div>
                                <div className={styles.paginationButtons}>
                                    <button
                                        className={styles.pageButton}
                                        onClick={() => handlePageChange(data.page - 1)}
                                        disabled={data.page <= 1}
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <button
                                        className={styles.pageButton}
                                        onClick={() => handlePageChange(data.page + 1)}
                                        disabled={data.page >= data.total_pages}
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                ) : (
                    <div className={styles.emptyState}>
                        <Search className={styles.emptyIcon} />
                        <h4 className={styles.emptyTitle}>No results found</h4>
                        <p className={styles.emptyText}>
                            {hasActiveFilters
                                ? 'Try adjusting your filters to see more results.'
                                : 'No completed test attempts yet.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
