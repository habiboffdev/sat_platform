import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    BookOpen,
    Search,
    Upload,
    ChevronLeft,
    ChevronRight,
    AlertTriangle,
    FileDown,
    X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/axios';
import { cn } from '@/lib/utils';

// Types
interface QuestionBankItem {
    id: number;
    question_number: number;
    question_text: string;
    question_type: string;
    domain: string | null;
    difficulty: string | null;
    times_answered: number;
    times_correct: number;
    accuracy: number | null;
    module_id: number;
    module_section: string;
    test_id: number;
    test_title: string;
}

interface QuestionBankResponse {
    items: QuestionBankItem[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

interface QuestionStats {
    total: number;
    by_domain: Record<string, number>;
    by_difficulty: Record<string, number>;
    hardest_questions: Array<{
        id: number;
        text: string;
        domain: string | null;
        accuracy: number | null;
    }>;
}

// API functions
const questionService = {
    list: async (params: Record<string, any>): Promise<QuestionBankResponse> => {
        const queryStr = new URLSearchParams(
            Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
        ).toString();
        const response = await api.get<QuestionBankResponse>(`/questions?${queryStr}`);
        return response.data;
    },
    getStats: async (): Promise<QuestionStats> => {
        const response = await api.get<QuestionStats>('/questions/stats');
        return response.data;
    },
    bulkImport: async (moduleId: number, questions: any[]): Promise<{ imported: number; errors: string[] }> => {
        const response = await api.post('/questions/bulk', { module_id: moduleId, questions });
        return response.data;
    },
    exportQuestions: async (params: Record<string, any>): Promise<QuestionExportItem[]> => {
        const queryStr = new URLSearchParams(
            Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
        ).toString();
        const response = await api.get<QuestionExportItem[]>(`/questions/export?${queryStr}`);
        return response.data;
    },
};

// Full question data for export
interface QuestionExportItem {
    id: number;
    question_number: number;
    question_text: string;
    question_type: string;
    options: Array<{ id: string; text: string }> | null;
    correct_answer: string[] | null;
    explanation: string | null;
    domain: string | null;
    difficulty: string | null;
    module_section: string;
    test_title: string;
    passage_text: string | null;
}



const domainLabels: Record<string, string> = {
    algebra: 'Algebra',
    advanced_math: 'Advanced Math',
    problem_solving_data_analysis: 'Problem Solving',
    geometry_trigonometry: 'Geometry & Trig',
    information_and_ideas: 'Info & Ideas',
    craft_and_structure: 'Craft & Structure',
    expression_of_ideas: 'Expression',
    standard_english_conventions: 'Standard English',
};

const domainColors: Record<string, string> = {
    algebra: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
    advanced_math: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
    problem_solving_data_analysis: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
    geometry_trigonometry: 'bg-orange-100 text-orange-800 hover:bg-orange-200',
    information_and_ideas: 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200',
    craft_and_structure: 'bg-rose-100 text-rose-800 hover:bg-rose-200',
    expression_of_ideas: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
    standard_english_conventions: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
};

const stripHtml = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || '';
};

// Filter Chip Component
function FilterChip({
    label,
    active,
    onClick,
    color
}: {
    label: string;
    active: boolean;
    onClick: () => void;
    color?: string;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                active
                    ? color || "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
        >
            {label}
        </button>
    );
}

export default function QuestionBankPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [search, setSearch] = useState('');
    const [sectionFilter, setSectionFilter] = useState<string | null>(null);
    const [domainFilter, setDomainFilter] = useState<string | null>(null);
    const [difficultyFilter, setDifficultyFilter] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const pageSize = 20;

    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importModuleId, setImportModuleId] = useState('');
    const [importJson, setImportJson] = useState('');

    // Export state
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [includeAnswers, setIncludeAnswers] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Fetch questions
    const { data: questionsData, isLoading } = useQuery({
        queryKey: ['question-bank', page, search, sectionFilter, domainFilter, difficultyFilter],
        queryFn: () =>
            questionService.list({
                page,
                page_size: pageSize,
                search: search || undefined,
                section: sectionFilter || undefined,
                domain: domainFilter || undefined,
                difficulty: difficultyFilter || undefined,
            }),
    });

    // Fetch stats
    const { data: stats } = useQuery({
        queryKey: ['question-bank-stats'],
        queryFn: questionService.getStats,
    });

    // Bulk import mutation - now auto-wraps single objects
    const importMutation = useMutation({
        mutationFn: async () => {
            let parsed = JSON.parse(importJson);
            // Auto-wrap single object in array
            if (!Array.isArray(parsed)) {
                parsed = [parsed];
            }
            return questionService.bulkImport(parseInt(importModuleId), parsed);
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['question-bank'] });
            queryClient.invalidateQueries({ queryKey: ['question-bank-stats'] });
            setIsImportOpen(false);
            setImportJson('');
            setImportModuleId('');
            toast({
                title: `Imported ${data.imported} question${data.imported !== 1 ? 's' : ''}`,
                description: data.errors.length > 0 ? `${data.errors.length} errors occurred` : undefined,
            });
        },
        onError: (error: any) => {
            toast({
                variant: 'destructive',
                title: 'Import failed',
                description: error.message || 'Invalid JSON format',
            });
        },
    });

    const questions = questionsData?.items || [];
    const totalPages = questionsData?.total_pages || 1;

    // Check if any filters are active
    const hasActiveFilters = sectionFilter || domainFilter || difficultyFilter;

    const clearFilters = () => {
        setSectionFilter(null);
        setDomainFilter(null);
        setDifficultyFilter(null);
        setPage(1);
    };

    // College Board Style PDF Export
    const exportToPdf = async () => {
        setIsExporting(true);
        try {
            // Fetch full question data from export endpoint
            const exportData = await questionService.exportQuestions({
                section: sectionFilter || undefined,
                domain: domainFilter || undefined,
                difficulty: difficultyFilter || undefined,
                search: search || undefined,
                limit: 100,
            });

            if (exportData.length === 0) {
                toast({ variant: 'destructive', title: 'No questions to export' });
                return;
            }

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                toast({ variant: 'destructive', title: 'Popup blocked', description: 'Please allow popups to export PDF' });
                return;
            }

            const difficultyBars = (level: string | null) => {
                const filled = level === 'easy' ? 1 : level === 'medium' ? 2 : level === 'hard' ? 3 : 0;
                return `<span style="display:inline-flex;gap:2px;">${[1, 2, 3].map(i =>
                    `<span style="display:inline-block;width:12px;height:12px;background:${i <= filled ? '#1e3a5f' : '#d1d5db'};"></span>`
                ).join('')}</span>`;
            };

            const html = `
<!DOCTYPE html>
<html>
<head>
    <title>SAT Question Export</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background: #fff; color: #1a1a1a; }
        .question-card { margin-bottom: 40px; page-break-after: always; border: 1px solid #ddd; }
        .header-bar { background: #1e3a5f; color: white; padding: 12px 20px; font-size: 18px; font-weight: bold; }
        .meta-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .meta-table td { padding: 8px 12px; border: 1px solid #ddd; }
        .meta-table .label { background: #f5f5f5; font-weight: 600; width: 120px; }
        .content { padding: 20px; }
        .passage { background: #f8fafc; border-left: 4px solid #1e3a5f; padding: 15px 20px; margin-bottom: 20px; font-size: 14px; line-height: 1.8; }
        .id-badge { background: #1e3a5f; color: white; padding: 6px 16px; font-size: 13px; display: inline-block; margin-bottom: 15px; }
        .question-text { font-size: 15px; line-height: 1.7; margin-bottom: 20px; }
        .options { margin-left: 10px; }
        .option { margin-bottom: 10px; font-size: 14px; }
        .option-letter { font-weight: bold; margin-right: 8px; }
        .answer-section { background: #f9fafb; border-top: 1px solid #ddd; }
        .answer-header { background: #1e3a5f; color: white; padding: 8px 16px; font-size: 14px; font-weight: bold; }
        .answer-content { padding: 20px; }
        .correct-answer { font-weight: bold; margin-bottom: 15px; font-size: 14px; }
        .rationale-title { font-weight: bold; margin-bottom: 8px; font-size: 14px; }
        .rationale { font-size: 13px; line-height: 1.6; color: #444; }
        .difficulty-row { margin-top: 15px; font-size: 13px; font-weight: 600; }
        @media print { 
            body { padding: 10px; }
            .question-card { border: 1px solid #999; }
        }
    </style>
</head>
<body>
    ${exportData.map((q) => `
        <div class="question-card">
            <div class="header-bar">Question ID ${q.id}</div>
            <table class="meta-table">
                <tr>
                    <td class="label">Assessment</td>
                    <td class="label">Test</td>
                    <td class="label">Domain</td>
                    <td class="label">Skill</td>
                    <td class="label">Difficulty</td>
                </tr>
                <tr>
                    <td>SAT</td>
                    <td>${q.module_section === 'reading_writing' ? 'Reading and Writing' : 'Math'}</td>
                    <td>${q.domain ? (domainLabels[q.domain] || q.domain) : '-'}</td>
                    <td>${q.question_type === 'multiple_choice' ? 'Multiple Choice' : 'Student Response'}</td>
                    <td>${difficultyBars(q.difficulty)}</td>
                </tr>
            </table>
            <div class="content">
                ${q.passage_text ? `<div class="passage">${q.passage_text}</div>` : ''}
                <div class="id-badge">ID: ${q.id}</div>
                <div class="question-text">${q.question_text}</div>
                ${q.options && q.question_type === 'multiple_choice' ? `
                    <div class="options">
                        ${q.options.map(opt => `
                            <div class="option"><span class="option-letter">${opt.id}.</span> ${opt.text}</div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
            ${includeAnswers ? `
                <div class="answer-section">
                    <div class="answer-header">ID: ${q.id} Answer</div>
                    <div class="answer-content">
                        <div class="correct-answer">Correct Answer: ${q.correct_answer?.join(', ') || '-'}</div>
                        ${q.explanation ? `
                            <div class="rationale-title">Rationale</div>
                            <div class="rationale">${q.explanation}</div>
                        ` : ''}
                        <div class="difficulty-row">Question Difficulty: ${q.difficulty ? q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1) : '-'}</div>
                    </div>
                </div>
            ` : ''}
        </div>
    `).join('')}
</body>
</html>`;

            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = () => {
                printWindow.print();
            };

            setIsExportOpen(false);
        } catch (error) {
            toast({ variant: 'destructive', title: 'Export failed', description: 'Could not fetch questions for export' });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Question Bank</h1>
                    <p className="text-muted-foreground">Browse and manage all questions across tests</p>
                </div>
                <div className="flex gap-2">
                    <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="gap-2" disabled={questionsData?.total === 0}>
                                <FileDown className="w-4 h-4" />
                                Export PDF
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Export Questions as PDF</DialogTitle>
                                <DialogDescription>
                                    College Board style PDF with current filters applied
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-4">
                                <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30">
                                    <input
                                        type="checkbox"
                                        id="includeAnswers"
                                        checked={includeAnswers}
                                        onChange={(e) => setIncludeAnswers(e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-300"
                                    />
                                    <label htmlFor="includeAnswers" className="flex-1 cursor-pointer">
                                        <p className="font-medium">Include Answer Keys</p>
                                        <p className="text-sm text-muted-foreground">
                                            Show correct answers, rationale, and difficulty for each question
                                        </p>
                                    </label>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    <p><strong>Current filters:</strong></p>
                                    <ul className="list-disc list-inside mt-1">
                                        {sectionFilter && <li>Section: {sectionFilter === 'reading_writing' ? 'Reading & Writing' : 'Math'}</li>}
                                        {domainFilter && <li>Domain: {domainLabels[domainFilter]}</li>}
                                        {difficultyFilter && <li>Difficulty: {difficultyFilter}</li>}
                                        {search && <li>Search: "{search}"</li>}
                                        {!hasActiveFilters && !search && <li>All questions (up to 100)</li>}
                                    </ul>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsExportOpen(false)}>Cancel</Button>
                                <Button onClick={exportToPdf} disabled={isExporting} className="gap-2">
                                    {isExporting ? 'Generating...' : 'Generate PDF'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                    <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2">
                                <Upload className="w-4 h-4" />
                                Bulk Import
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>Bulk Import Questions</DialogTitle>
                                <DialogDescription>
                                    Paste JSON (single object or array). Single objects are auto-wrapped.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>Target Module ID</Label>
                                    <Input
                                        type="number"
                                        placeholder="Enter module ID"
                                        value={importModuleId}
                                        onChange={(e) => setImportModuleId(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Questions JSON</Label>
                                    <Textarea
                                        className="font-mono text-sm h-64"
                                        placeholder={`{
  "question_text": "What is 2+2?",
  "question_type": "multiple_choice",
  "options": [
    {"id": "A", "text": "3"},
    {"id": "B", "text": "4"}
  ],
  "correct_answer": ["B"],
  "domain": "algebra",
  "difficulty": "easy"
}`}
                                        value={importJson}
                                        onChange={(e) => setImportJson(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Tip: Paste a single question object or an array of questions [...]
                                    </p>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsImportOpen(false)}>Cancel</Button>
                                <Button
                                    onClick={() => importMutation.mutate()}
                                    disabled={importMutation.isPending || !importModuleId || !importJson}
                                >
                                    {importMutation.isPending ? 'Importing...' : 'Import Questions'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <Card className="card-premium">
                    <CardContent className="pt-4 pb-4">
                        <p className="text-sm text-muted-foreground">Total Questions</p>
                        <p className="text-2xl font-bold">{stats?.total || 0}</p>
                    </CardContent>
                </Card>
                <Card className="card-premium">
                    <CardContent className="pt-4 pb-4">
                        <p className="text-sm text-muted-foreground">Math</p>
                        <p className="text-2xl font-bold text-blue-600">
                            {(stats?.by_domain.algebra || 0) + (stats?.by_domain.advanced_math || 0) +
                                (stats?.by_domain.problem_solving_data_analysis || 0) + (stats?.by_domain.geometry_trigonometry || 0)}
                        </p>
                    </CardContent>
                </Card>
                <Card className="card-premium">
                    <CardContent className="pt-4 pb-4">
                        <p className="text-sm text-muted-foreground">Reading/Writing</p>
                        <p className="text-2xl font-bold text-purple-600">
                            {(stats?.by_domain.information_and_ideas || 0) + (stats?.by_domain.craft_and_structure || 0) +
                                (stats?.by_domain.expression_of_ideas || 0) + (stats?.by_domain.standard_english_conventions || 0)}
                        </p>
                    </CardContent>
                </Card>
                <Card
                    className="card-premium cursor-pointer hover:ring-2 hover:ring-amber-300 transition-all"
                    onClick={() => {
                        if (stats?.hardest_questions?.[0]?.domain) {
                            setDomainFilter(stats.hardest_questions[0].domain);
                            setPage(1);
                        }
                    }}
                    title={stats?.hardest_questions?.[0] ? `Click to filter by ${domainLabels[stats.hardest_questions[0].domain || ''] || 'domain'}` : undefined}
                >
                    <CardContent className="pt-4 pb-4 flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500" />
                        <div>
                            <p className="text-sm text-muted-foreground">Hardest Question</p>
                            <p className="text-xl font-bold text-amber-600">
                                {stats?.hardest_questions?.[0]?.accuracy !== undefined ? `${stats.hardest_questions[0].accuracy}%` : '-'}
                            </p>
                            {stats?.hardest_questions?.[0]?.domain && (
                                <p className="text-xs text-muted-foreground">
                                    {domainLabels[stats.hardest_questions[0].domain] || stats.hardest_questions[0].domain}
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Search + Filters */}
            <Card>
                <CardContent className="pt-6 space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search questions..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="pl-10"
                        />
                    </div>

                    {/* Section Filters */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase">Section</Label>
                        <div className="flex flex-wrap gap-2">
                            <FilterChip
                                label="Reading & Writing"
                                active={sectionFilter === 'reading_writing'}
                                onClick={() => { setSectionFilter(sectionFilter === 'reading_writing' ? null : 'reading_writing'); setPage(1); }}
                                color={sectionFilter === 'reading_writing' ? 'bg-purple-500 text-white border-purple-500' : undefined}
                            />
                            <FilterChip
                                label="Math"
                                active={sectionFilter === 'math'}
                                onClick={() => { setSectionFilter(sectionFilter === 'math' ? null : 'math'); setPage(1); }}
                                color={sectionFilter === 'math' ? 'bg-blue-500 text-white border-blue-500' : undefined}
                            />
                        </div>
                    </div>

                    {/* Domain Filters */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase">Domain</Label>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(domainLabels).map(([key, label]) => (
                                <FilterChip
                                    key={key}
                                    label={label}
                                    active={domainFilter === key}
                                    onClick={() => { setDomainFilter(domainFilter === key ? null : key); setPage(1); }}
                                    color={domainFilter === key ? domainColors[key]?.replace('hover:bg-', '') : undefined}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Difficulty Filters */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground uppercase">Difficulty</Label>
                        <div className="flex flex-wrap gap-2">
                            <FilterChip
                                label="Easy"
                                active={difficultyFilter === 'easy'}
                                onClick={() => { setDifficultyFilter(difficultyFilter === 'easy' ? null : 'easy'); setPage(1); }}
                                color={difficultyFilter === 'easy' ? 'bg-green-500 text-white border-green-500' : undefined}
                            />
                            <FilterChip
                                label="Medium"
                                active={difficultyFilter === 'medium'}
                                onClick={() => { setDifficultyFilter(difficultyFilter === 'medium' ? null : 'medium'); setPage(1); }}
                                color={difficultyFilter === 'medium' ? 'bg-yellow-500 text-white border-yellow-500' : undefined}
                            />
                            <FilterChip
                                label="Hard"
                                active={difficultyFilter === 'hard'}
                                onClick={() => { setDifficultyFilter(difficultyFilter === 'hard' ? null : 'hard'); setPage(1); }}
                                color={difficultyFilter === 'hard' ? 'bg-red-500 text-white border-red-500' : undefined}
                            />
                        </div>
                    </div>

                    {/* Clear Filters */}
                    {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                            <X className="w-3 h-3" />
                            Clear all filters
                        </Button>
                    )}
                </CardContent>
            </Card>

            {/* Questions Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5" />
                        Questions
                        {questionsData && <Badge variant="secondary">{questionsData.total}</Badge>}
                    </CardTitle>
                    <CardDescription>
                        {isLoading ? 'Loading...' : `Page ${page} of ${totalPages}`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-muted/50 border-y">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Question</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Domain</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Difficulty</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Accuracy</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Source</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {questions.map((q) => (
                                    <tr key={q.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4 max-w-md">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm shrink-0">
                                                    {q.question_number}
                                                </div>
                                                <div>
                                                    <p className="text-sm line-clamp-2">{stripHtml(q.question_text)}</p>
                                                    <Badge variant="outline" className="mt-1 text-xs capitalize">
                                                        {q.question_type.replace('_', ' ')}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {q.domain && (
                                                <Badge className={cn('capitalize', domainColors[q.domain] || 'bg-gray-100')}>
                                                    {domainLabels[q.domain] || q.domain}
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {q.difficulty && (
                                                <Badge
                                                    variant="outline"
                                                    className={cn(
                                                        'capitalize',
                                                        q.difficulty === 'easy' && 'border-green-300 text-green-700',
                                                        q.difficulty === 'medium' && 'border-yellow-300 text-yellow-700',
                                                        q.difficulty === 'hard' && 'border-red-300 text-red-700'
                                                    )}
                                                >
                                                    {q.difficulty}
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            {q.accuracy !== null ? (
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className={cn(
                                                            'w-2 h-2 rounded-full',
                                                            q.accuracy >= 70 && 'bg-green-500',
                                                            q.accuracy >= 40 && q.accuracy < 70 && 'bg-yellow-500',
                                                            q.accuracy < 40 && 'bg-red-500'
                                                        )}
                                                    />
                                                    <span className="text-sm">{q.accuracy}%</span>
                                                    <span className="text-xs text-muted-foreground">({q.times_answered})</span>
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">No data</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm">
                                                <p className="font-medium truncate max-w-[180px]">{q.test_title}</p>
                                                <p className="text-muted-foreground text-xs capitalize">
                                                    {q.module_section.replace('_', ' ')}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {questions.length === 0 && !isLoading && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                                            No questions found
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t">
                            <p className="text-sm text-muted-foreground">
                                Page {page} of {totalPages} ({questionsData?.total || 0} questions)
                            </p>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                                    <ChevronLeft className="w-4 h-4 mr-1" />
                                    Previous
                                </Button>
                                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                                    Next
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
