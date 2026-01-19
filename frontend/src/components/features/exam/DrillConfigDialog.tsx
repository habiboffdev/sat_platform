import { useState, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
    Play,
    Target,
    Zap,
    BookOpen,
    Calculator,
    ChevronRight,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { drillService, type DrillConfig } from '@/services/drill';
import { useToast } from '@/hooks/use-toast';

const DOMAIN_LABELS: Record<string, string> = {
    craft_and_structure: 'Craft & Structure',
    information_and_ideas: 'Information & Ideas',
    standard_english_conventions: 'Standard English',
    expression_of_ideas: 'Expression of Ideas',
    algebra: 'Algebra',
    advanced_math: 'Advanced Math',
    problem_solving_data_analysis: 'Problem Solving',
    geometry_trigonometry: 'Geometry & Trig',
};

interface DrillConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function DrillConfigDialog({ open, onOpenChange }: DrillConfigDialogProps) {
    const navigate = useNavigate();
    const { toast } = useToast();

    const [section, setSection] = useState<string | null>(null);
    const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
    const [difficulty, setDifficulty] = useState<string | null>(null);
    const [questionCount, setQuestionCount] = useState(10);

    // Fetch available domains with counts
    const { data: domainCounts } = useQuery({
        queryKey: ['drill-domains'],
        queryFn: drillService.getDomains,
        enabled: open,
    });

    const createDrillMutation = useMutation({
        mutationFn: (config: DrillConfig) => drillService.createDrill(config),
        onSuccess: (session) => {
            onOpenChange(false);
            // Store session in sessionStorage for the drill page
            sessionStorage.setItem('drill_session', JSON.stringify(session));
            navigate('/drill');
        },
        onError: (error: any) => {
            toast({
                variant: 'destructive',
                title: 'Failed to create drill',
                description: error.response?.data?.detail || 'Not enough questions match your criteria',
            });
        },
    });

    const weakAreasMutation = useMutation({
        mutationFn: () => drillService.getWeakAreasDrill(questionCount),
        onSuccess: (session) => {
            onOpenChange(false);
            sessionStorage.setItem('drill_session', JSON.stringify(session));
            navigate('/drill');
        },
        onError: (error: any) => {
            toast({
                variant: 'destructive',
                title: 'Failed to create drill',
                description: error.response?.data?.detail || 'Unable to generate weak areas drill',
            });
        },
    });

    const handleStartDrill = useCallback(() => {
        const config: DrillConfig = {
            section: section,
            domains: selectedDomains.length > 0 ? selectedDomains : null,
            difficulty: difficulty,
            question_count: questionCount,
        };
        createDrillMutation.mutate(config);
    }, [section, selectedDomains, difficulty, questionCount, createDrillMutation]);

    const handleWeakAreas = useCallback(() => {
        weakAreasMutation.mutate();
    }, [weakAreasMutation]);

    const toggleDomain = useCallback((domain: string) => {
        setSelectedDomains(prev =>
            prev.includes(domain)
                ? prev.filter(d => d !== domain)
                : [...prev, domain]
        );
    }, []);

    const isLoading = createDrillMutation.isPending || weakAreasMutation.isPending;

    // Get domains for current section
    const rwDomains = ['craft_and_structure', 'information_and_ideas', 'standard_english_conventions', 'expression_of_ideas'];
    const mathDomains = ['algebra', 'advanced_math', 'problem_solving_data_analysis', 'geometry_trigonometry'];

    const visibleDomains = section === 'reading_writing' ? rwDomains :
        section === 'math' ? mathDomains :
            [...rwDomains, ...mathDomains];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-primary" />
                        Create Practice Drill
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Quick Practice Weak Areas */}
                    <button
                        onClick={handleWeakAreas}
                        disabled={isLoading}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
                    >
                        <div className="w-12 h-12 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                            <Zap className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                            <div className="font-semibold text-amber-900">Practice Weak Areas</div>
                            <div className="text-sm text-amber-700">
                                Focus on domains where you need the most improvement
                            </div>
                        </div>
                        {weakAreasMutation.isPending ? (
                            <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                        ) : (
                            <ChevronRight className="w-5 h-5 text-amber-600" />
                        )}
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">Or customize</span>
                        </div>
                    </div>

                    {/* Section Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Section</label>
                        <div className="flex gap-2">
                            {[
                                { value: null, label: 'Both', icon: null },
                                { value: 'reading_writing', label: 'Reading & Writing', icon: BookOpen },
                                { value: 'math', label: 'Math', icon: Calculator },
                            ].map((opt) => (
                                <button
                                    key={opt.label}
                                    onClick={() => {
                                        setSection(opt.value);
                                        setSelectedDomains([]);
                                    }}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 font-medium transition-all",
                                        section === opt.value
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border hover:border-muted-foreground/50"
                                    )}
                                >
                                    {opt.icon && <opt.icon className="w-4 h-4" />}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Domain Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            Domains {selectedDomains.length > 0 && `(${selectedDomains.length} selected)`}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {visibleDomains.map((domain) => {
                                const count = section === 'reading_writing'
                                    ? domainCounts?.reading_writing?.[domain]
                                    : section === 'math'
                                        ? domainCounts?.math?.[domain]
                                        : (domainCounts?.reading_writing?.[domain] || 0) + (domainCounts?.math?.[domain] || 0);

                                return (
                                    <button
                                        key={domain}
                                        onClick={() => toggleDomain(domain)}
                                        className={cn(
                                            "px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all",
                                            selectedDomains.includes(domain)
                                                ? "border-primary bg-primary text-primary-foreground"
                                                : "border-border hover:border-muted-foreground/50"
                                        )}
                                    >
                                        {DOMAIN_LABELS[domain] || domain}
                                        {count !== undefined && (
                                            <span className="ml-1 opacity-60">({count})</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        {selectedDomains.length === 0 && (
                            <p className="text-xs text-muted-foreground">All domains will be included</p>
                        )}
                    </div>

                    {/* Difficulty */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Difficulty</label>
                        <div className="flex gap-2">
                            {[
                                { value: null, label: 'All' },
                                { value: 'easy', label: 'Easy' },
                                { value: 'medium', label: 'Medium' },
                                { value: 'hard', label: 'Hard' },
                            ].map((opt) => (
                                <button
                                    key={opt.label}
                                    onClick={() => setDifficulty(opt.value)}
                                    className={cn(
                                        "flex-1 px-4 py-2 rounded-lg border-2 font-medium transition-all",
                                        difficulty === opt.value
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border hover:border-muted-foreground/50"
                                    )}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Question Count */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            Questions: <span className="font-bold">{questionCount}</span>
                        </label>
                        <input
                            type="range"
                            min={5}
                            max={30}
                            step={5}
                            value={questionCount}
                            onChange={(e) => setQuestionCount(Number(e.target.value))}
                            className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>5</span>
                            <span>15</span>
                            <span>30</span>
                        </div>
                    </div>

                    {/* Start Button */}
                    <Button
                        className="w-full h-12 text-base btn-premium"
                        onClick={handleStartDrill}
                        disabled={isLoading}
                    >
                        {createDrillMutation.isPending ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Creating Drill...
                            </>
                        ) : (
                            <>
                                <Play className="w-5 h-5 mr-2" />
                                Start Practice
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
