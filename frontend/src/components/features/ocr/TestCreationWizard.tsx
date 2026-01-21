/**
 * TestCreationWizard Component
 *
 * Multi-step wizard for configuring test modules before importing OCR questions.
 * Supports creating full tests, section tests, or single module tests.
 */

import { useState } from 'react';
import { Plus, Trash2, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

// Digital SAT time limits
const SAT_TIME_LIMITS = {
  reading_writing: { module_1: 32, module_2: 32 },
  math: { module_1: 35, module_2: 35 },
};

// Digital SAT question counts
const SAT_QUESTION_COUNTS = {
  reading_writing: { module_1: 27, module_2: 27 },
  math: { module_1: 22, module_2: 22 },
};

export interface ModuleConfig {
  section: 'reading_writing' | 'math';
  module: 'module_1' | 'module_2';
  difficulty: 'standard' | 'easier' | 'harder';
  question_start: number;
  question_end: number;
  time_limit_minutes: number;
}

export interface TestConfig {
  test_title: string;
  test_type: 'full_test' | 'section_test' | 'module_test';
  section: 'reading_writing' | 'math' | null;
  modules: ModuleConfig[];
  is_published: boolean;
  is_premium: boolean;
}

interface TestCreationWizardProps {
  totalQuestions: number;
  onSubmit: (config: TestConfig) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
}

type Step = 'type' | 'modules' | 'review';

export function TestCreationWizard({
  totalQuestions,
  onSubmit,
  onCancel,
  isLoading = false,
}: TestCreationWizardProps) {
  const [step, setStep] = useState<Step>('type');
  const [config, setConfig] = useState<TestConfig>({
    test_title: '',
    test_type: 'full_test',
    section: null,
    modules: [],
    is_published: false,
    is_premium: false,
  });

  // Initialize modules based on test type
  const initializeModules = (testType: string, section?: string) => {
    const modules: ModuleConfig[] = [];
    let questionStart = 1;

    if (testType === 'full_test') {
      // Full SAT: RW Module 1 & 2, Math Module 1 & 2
      // RW Module 1
      modules.push({
        section: 'reading_writing',
        module: 'module_1',
        difficulty: 'standard',
        question_start: questionStart,
        question_end: questionStart + SAT_QUESTION_COUNTS.reading_writing.module_1 - 1,
        time_limit_minutes: SAT_TIME_LIMITS.reading_writing.module_1,
      });
      questionStart += SAT_QUESTION_COUNTS.reading_writing.module_1;

      // RW Module 2
      modules.push({
        section: 'reading_writing',
        module: 'module_2',
        difficulty: 'standard',
        question_start: questionStart,
        question_end: questionStart + SAT_QUESTION_COUNTS.reading_writing.module_2 - 1,
        time_limit_minutes: SAT_TIME_LIMITS.reading_writing.module_2,
      });
      questionStart += SAT_QUESTION_COUNTS.reading_writing.module_2;

      // Math Module 1
      modules.push({
        section: 'math',
        module: 'module_1',
        difficulty: 'standard',
        question_start: questionStart,
        question_end: questionStart + SAT_QUESTION_COUNTS.math.module_1 - 1,
        time_limit_minutes: SAT_TIME_LIMITS.math.module_1,
      });
      questionStart += SAT_QUESTION_COUNTS.math.module_1;

      // Math Module 2
      modules.push({
        section: 'math',
        module: 'module_2',
        difficulty: 'standard',
        question_start: questionStart,
        question_end: questionStart + SAT_QUESTION_COUNTS.math.module_2 - 1,
        time_limit_minutes: SAT_TIME_LIMITS.math.module_2,
      });
    } else if (testType === 'section_test' && section) {
      const sec = section as 'reading_writing' | 'math';
      // Section test: Module 1 & 2 for one section
      modules.push({
        section: sec,
        module: 'module_1',
        difficulty: 'standard',
        question_start: 1,
        question_end: SAT_QUESTION_COUNTS[sec].module_1,
        time_limit_minutes: SAT_TIME_LIMITS[sec].module_1,
      });
      modules.push({
        section: sec,
        module: 'module_2',
        difficulty: 'standard',
        question_start: SAT_QUESTION_COUNTS[sec].module_1 + 1,
        question_end: SAT_QUESTION_COUNTS[sec].module_1 + SAT_QUESTION_COUNTS[sec].module_2,
        time_limit_minutes: SAT_TIME_LIMITS[sec].module_2,
      });
    } else if (testType === 'module_test' && section) {
      const sec = section as 'reading_writing' | 'math';
      // Single module test
      modules.push({
        section: sec,
        module: 'module_1',
        difficulty: 'standard',
        question_start: 1,
        question_end: totalQuestions,
        time_limit_minutes: SAT_TIME_LIMITS[sec].module_1,
      });
    }

    return modules;
  };

  const handleTestTypeChange = (testType: string) => {
    const modules = initializeModules(testType, config.section ?? undefined);
    setConfig({
      ...config,
      test_type: testType as TestConfig['test_type'],
      modules,
    });
  };

  const handleSectionChange = (section: string) => {
    const sec = section as 'reading_writing' | 'math';
    const modules = initializeModules(config.test_type, sec);
    setConfig({
      ...config,
      section: sec,
      modules,
    });
  };

  const updateModule = (index: number, updates: Partial<ModuleConfig>) => {
    const newModules = [...config.modules];
    newModules[index] = { ...newModules[index], ...updates };
    setConfig({ ...config, modules: newModules });
  };

  const addModule = () => {
    const lastModule = config.modules[config.modules.length - 1];
    const newStart = lastModule ? lastModule.question_end + 1 : 1;
    const section = config.section || 'math';
    setConfig({
      ...config,
      modules: [
        ...config.modules,
        {
          section: section as 'reading_writing' | 'math',
          module: 'module_1',
          difficulty: 'standard',
          question_start: newStart,
          question_end: Math.min(newStart + 21, totalQuestions),
          time_limit_minutes: 35,
        },
      ],
    });
  };

  const removeModule = (index: number) => {
    setConfig({
      ...config,
      modules: config.modules.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async () => {
    await onSubmit(config);
  };

  const isTypeStepValid = config.test_title.trim().length > 0;
  const isModulesStepValid = config.modules.length > 0;

  const formatSection = (section: string) => {
    return section === 'reading_writing' ? 'Reading & Writing' : 'Math';
  };

  const formatModule = (module: string) => {
    return module === 'module_1' ? 'Module 1' : 'Module 2';
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Create Test from OCR Import</CardTitle>
        <CardDescription>
          Configure how to organize {totalQuestions} questions into a test
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {['type', 'modules', 'review'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                  step === s
                    ? 'bg-primary text-primary-foreground'
                    : i < ['type', 'modules', 'review'].indexOf(step)
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {i + 1}
              </div>
              {i < 2 && (
                <ChevronRight className="w-4 h-4 mx-2 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Test Type */}
        {step === 'type' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="test_title">Test Title</Label>
              <Input
                id="test_title"
                value={config.test_title}
                onChange={(e) => setConfig({ ...config, test_title: e.target.value })}
                placeholder="e.g., Practice Test 1"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Test Type</Label>
              <Select value={config.test_type} onValueChange={handleTestTypeChange}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_test">
                    Full SAT (RW + Math, 4 modules)
                  </SelectItem>
                  <SelectItem value="section_test">
                    Section Test (2 modules)
                  </SelectItem>
                  <SelectItem value="module_test">
                    Single Module Practice
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(config.test_type === 'section_test' || config.test_type === 'module_test') && (
              <div>
                <Label>Section</Label>
                <Select
                  value={config.section || ''}
                  onValueChange={handleSectionChange}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reading_writing">Reading & Writing</SelectItem>
                    <SelectItem value="math">Math</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center justify-between pt-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={config.is_published}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, is_published: checked })
                    }
                  />
                  <Label>Publish immediately</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={config.is_premium}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, is_premium: checked })
                    }
                  />
                  <Label>Premium content</Label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Module Configuration */}
        {step === 'modules' && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground mb-4">
              Configure question ranges for each module. Total questions: {totalQuestions}
            </div>

            {config.modules.map((mod, index) => (
              <Card key={index} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="font-medium">
                    {formatSection(mod.section)} - {formatModule(mod.module)}
                  </div>
                  {config.modules.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeModule(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Section</Label>
                    <Select
                      value={mod.section}
                      onValueChange={(v) =>
                        updateModule(index, { section: v as 'reading_writing' | 'math' })
                      }
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reading_writing">Reading & Writing</SelectItem>
                        <SelectItem value="math">Math</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Module</Label>
                    <Select
                      value={mod.module}
                      onValueChange={(v) =>
                        updateModule(index, { module: v as 'module_1' | 'module_2' })
                      }
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="module_1">Module 1</SelectItem>
                        <SelectItem value="module_2">Module 2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Difficulty (for Module 2)</Label>
                    <Select
                      value={mod.difficulty}
                      onValueChange={(v) =>
                        updateModule(index, {
                          difficulty: v as 'standard' | 'easier' | 'harder',
                        })
                      }
                    >
                      <SelectTrigger className="mt-1 h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="easier">Easier</SelectItem>
                        <SelectItem value="harder">Harder</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs">Time Limit (minutes)</Label>
                    <Input
                      type="number"
                      value={mod.time_limit_minutes}
                      onChange={(e) =>
                        updateModule(index, {
                          time_limit_minutes: parseInt(e.target.value) || 32,
                        })
                      }
                      className="mt-1 h-9"
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Question Start</Label>
                    <Input
                      type="number"
                      value={mod.question_start}
                      onChange={(e) =>
                        updateModule(index, {
                          question_start: parseInt(e.target.value) || 1,
                        })
                      }
                      className="mt-1 h-9"
                      min={1}
                      max={totalQuestions}
                    />
                  </div>

                  <div>
                    <Label className="text-xs">Question End</Label>
                    <Input
                      type="number"
                      value={mod.question_end}
                      onChange={(e) =>
                        updateModule(index, {
                          question_end: parseInt(e.target.value) || totalQuestions,
                        })
                      }
                      className="mt-1 h-9"
                      min={1}
                      max={totalQuestions}
                    />
                  </div>
                </div>

                <div className="mt-2 text-xs text-muted-foreground">
                  Questions {mod.question_start}-{mod.question_end} (
                  {mod.question_end - mod.question_start + 1} questions)
                </div>
              </Card>
            ))}

            <Button variant="outline" onClick={addModule} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              Add Module
            </Button>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 'review' && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Title:</span>
                <span className="font-medium">{config.test_title}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-medium capitalize">
                  {config.test_type.replace('_', ' ')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Modules:</span>
                <span className="font-medium">{config.modules.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Published:</span>
                <span className="font-medium">{config.is_published ? 'Yes' : 'No'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Module Summary</Label>
              {config.modules.map((mod, i) => (
                <div key={i} className="text-sm p-2 bg-muted rounded">
                  {formatSection(mod.section)} {formatModule(mod.module)}
                  {mod.difficulty !== 'standard' && ` (${mod.difficulty})`}: Questions{' '}
                  {mod.question_start}-{mod.question_end} ({mod.time_limit_minutes} min)
                </div>
              ))}
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-800">
              This will create a new test and import{' '}
              {config.modules.reduce((sum, m) => sum + (m.question_end - m.question_start + 1), 0)}{' '}
              questions across {config.modules.length} module(s).
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={step === 'type' ? onCancel : () => setStep(step === 'review' ? 'modules' : 'type')}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            {step === 'type' ? 'Cancel' : 'Back'}
          </Button>

          {step === 'review' ? (
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Test & Import'
              )}
            </Button>
          ) : (
            <Button
              onClick={() => setStep(step === 'type' ? 'modules' : 'review')}
              disabled={step === 'type' ? !isTypeStepValid : !isModulesStepValid}
            >
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default TestCreationWizard;
