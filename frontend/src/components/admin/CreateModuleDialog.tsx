import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, BookOpen, Calculator, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { SATSection, SATModule, ModuleDifficulty } from '@/types/test';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  section: z.enum([SATSection.READING_WRITING, SATSection.MATH]),
  module: z.enum([SATModule.MODULE_1, SATModule.MODULE_2]),
  difficulty: z.enum([ModuleDifficulty.STANDARD, ModuleDifficulty.EASIER, ModuleDifficulty.HARDER]),
  time_limit_minutes: z.coerce.number().min(1, 'Time limit must be at least 1 minute'),
});

interface CreateModuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: z.infer<typeof formSchema>) => Promise<void>;
}

const SECTION_CONFIG = {
  [SATSection.READING_WRITING]: {
    label: 'Reading & Writing',
    icon: BookOpen,
    color: 'blue',
    defaultTime: 32,
    questionCount: 27,
    description: 'Comprehension, vocabulary, and grammar questions',
  },
  [SATSection.MATH]: {
    label: 'Math',
    icon: Calculator,
    color: 'amber',
    defaultTime: 35,
    questionCount: 22,
    description: 'Algebra, geometry, and data analysis',
  },
};

const DIFFICULTY_CONFIG = {
  [ModuleDifficulty.STANDARD]: {
    label: 'Standard',
    description: 'Default difficulty for Module 1',
  },
  [ModuleDifficulty.EASIER]: {
    label: 'Easier',
    description: 'Lower difficulty adaptive path',
  },
  [ModuleDifficulty.HARDER]: {
    label: 'Harder',
    description: 'Higher difficulty adaptive path',
  },
};

export function CreateModuleDialog({ open, onOpenChange, onSubmit }: CreateModuleDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      section: SATSection.READING_WRITING,
      module: SATModule.MODULE_1,
      difficulty: ModuleDifficulty.STANDARD,
      time_limit_minutes: 32,
    },
  });

  const selectedSection = form.watch('section');
  const selectedModule = form.watch('module');
  const selectedDifficulty = form.watch('difficulty');

  // Update default time limit when section changes
  useEffect(() => {
    const config = SECTION_CONFIG[selectedSection];
    form.setValue('time_limit_minutes', config.defaultTime);
  }, [selectedSection, form]);

  // For Module 1, difficulty should be standard
  useEffect(() => {
    if (selectedModule === SATModule.MODULE_1) {
      form.setValue('difficulty', ModuleDifficulty.STANDARD);
    }
  }, [selectedModule, form]);

  const handleSubmit = async (data: z.infer<typeof formSchema>) => {
    setIsSubmitting(true);
    try {
      await onSubmit(data);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sectionConfig = SECTION_CONFIG[selectedSection];
  const SectionIcon = sectionConfig.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Add New Module</DialogTitle>
          <DialogDescription>
            Configure the section, module number, and timing for this test module.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Section Selection - Visual Cards */}
            <FormField
              control={form.control}
              name="section"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-sm font-semibold">Section Type</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(SECTION_CONFIG).map(([value, config]) => {
                        const Icon = config.icon;
                        const isSelected = field.value === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => field.onChange(value)}
                            className={cn(
                              'relative flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all',
                              isSelected
                                ? config.color === 'blue'
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-amber-500 bg-amber-50'
                                : 'border-border hover:border-muted-foreground/30'
                            )}
                          >
                            <div className={cn(
                              'w-10 h-10 rounded-lg flex items-center justify-center mb-3',
                              config.color === 'blue' 
                                ? 'bg-blue-100 text-blue-600' 
                                : 'bg-amber-100 text-amber-600'
                            )}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <span className="font-semibold">{config.label}</span>
                            <span className="text-xs text-muted-foreground mt-1">
                              {config.questionCount} questions • {config.defaultTime} min
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Module Number Selection */}
            <FormField
              control={form.control}
              name="module"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel className="text-sm font-semibold">Module Number</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-3">
                      {[SATModule.MODULE_1, SATModule.MODULE_2].map((mod) => {
                        const isSelected = field.value === mod;
                        const isModule1 = mod === SATModule.MODULE_1;
                        return (
                          <button
                            key={mod}
                            type="button"
                            onClick={() => field.onChange(mod)}
                            className={cn(
                              'flex flex-col items-center p-4 rounded-xl border-2 transition-all',
                              isSelected
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-muted-foreground/30'
                            )}
                          >
                            <span className="text-2xl font-bold">{isModule1 ? '1' : '2'}</span>
                            <span className="text-xs text-muted-foreground mt-1">
                              {isModule1 ? 'Standard Start' : 'Adaptive'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </FormControl>
                  <FormDescription className="flex items-start gap-2 text-xs">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    Module 1 is always standard difficulty. Module 2 adapts based on Module 1 performance.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Difficulty Selection (Only for Module 2) */}
            {selectedModule === SATModule.MODULE_2 && (
              <FormField
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel className="text-sm font-semibold">Difficulty Level</FormLabel>
                    <FormControl>
                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(DIFFICULTY_CONFIG).map(([value, config]) => {
                          const isSelected = field.value === value;
                          const isStandard = value === ModuleDifficulty.STANDARD;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => field.onChange(value)}
                              disabled={isStandard}
                              className={cn(
                                'flex flex-col items-center p-3 rounded-lg border transition-all',
                                isSelected
                                  ? 'border-primary bg-primary/5 text-primary'
                                  : 'border-border hover:border-muted-foreground/30',
                                isStandard && 'opacity-50 cursor-not-allowed'
                              )}
                            >
                              <span className="font-medium text-sm">{config.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Time Limit */}
            <FormField
              control={form.control}
              name="time_limit_minutes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-semibold">Time Limit (minutes)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      value={field.value}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      className="max-w-[120px]"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Official SAT timing: {selectedSection === SATSection.READING_WRITING ? '32' : '35'} minutes
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Summary Preview */}
            <div className={cn(
              'p-4 rounded-xl border',
              sectionConfig.color === 'blue' ? 'bg-blue-50/50 border-blue-200' : 'bg-amber-50/50 border-amber-200'
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center',
                  sectionConfig.color === 'blue' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                )}>
                  <SectionIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-semibold">
                    {sectionConfig.label} • Module {selectedModule === SATModule.MODULE_1 ? '1' : '2'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {form.watch('time_limit_minutes')} minutes • {sectionConfig.questionCount} questions
                    {selectedModule === SATModule.MODULE_2 && selectedDifficulty !== ModuleDifficulty.STANDARD && (
                      <span className="ml-1">• {DIFFICULTY_CONFIG[selectedDifficulty].label}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Module
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
