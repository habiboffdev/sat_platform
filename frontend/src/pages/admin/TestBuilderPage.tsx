import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  Save,
  Plus,
  MoreVertical,
  Clock,
  BookOpen,
  Calculator,
  GripVertical,
  Settings,
  Trash2,
  Copy,
  Sparkles,
  Zap,
  LayoutTemplate,
  Pencil,
  Target,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { testService } from '@/services/test';
import { TestType, SATSection, SATModule, ModuleDifficulty } from '@/types/test';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CreateModuleDialog } from '@/components/admin/CreateModuleDialog';
import { ModuleEditor } from '@/components/admin/ModuleEditor';
import type { TestModule } from '@/types/test';

// --- Components ---



function SortableModuleCard({
  module,
  onClick,
  onDelete,
  onDuplicate,
}: {
  module: TestModule;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id! }); // Assuming module.id is stable

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };
  // Map difficulty for styling
  const getDifficultyColor = (diff: ModuleDifficulty) => {
    switch (diff) {
      case ModuleDifficulty.EASIER: return "bg-green-400";
      case ModuleDifficulty.HARDER: return "bg-red-400";
      default: return "bg-primary/20";
    }
  };

  const getDifficultyBadge = (diff: ModuleDifficulty) => {
    switch (diff) {
      case ModuleDifficulty.EASIER: return "bg-green-100 text-green-700";
      case ModuleDifficulty.HARDER: return "bg-red-100 text-red-700";
      default: return "";
    }
  };

  const isRW = module.section === SATSection.READING_WRITING;
  const questionCount = module.questions?.length || 0;
  const targetCount = isRW ? 27 : 22;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={cn(
        'group relative bg-card border rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer select-none',
        isRW ? "hover:border-blue-200" : "hover:border-amber-200"
      )}
    >
      <div className="flex items-start gap-4">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="mt-2 text-muted-foreground/30 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
        >
          <GripVertical className="h-5 w-5" />
        </div>

        {/* Difficulty Stripe */}
        <div className={cn(
          "absolute left-0 top-4 bottom-4 w-1 rounded-r-full",
          getDifficultyColor(module.difficulty)
        )} />

        {/* Icon */}
        <div className={cn(
          'w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm border',
          isRW ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-amber-50 text-amber-600 border-amber-100'
        )}>
          {isRW ? <BookOpen className="w-5 h-5" /> : <Calculator className="w-5 h-5" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <h3 className="font-serif font-semibold text-lg text-foreground tracking-tight">
              {isRW ? 'Reading & Writing' : 'Math'}
            </h3>
            <span className="text-muted-foreground">•</span>
            <span className="text-sm font-medium text-muted-foreground">
              {module.module === SATModule.MODULE_1 ? 'Module 1' : 'Module 2'}
            </span>
            {module.difficulty !== ModuleDifficulty.STANDARD && (
              <Badge variant="outline" className={cn(
                "ml-2 capitalize border-0 font-medium",
                getDifficultyBadge(module.difficulty)
              )}>
                {module.difficulty} Path
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
            <span className="flex items-center gap-1.5 bg-muted/50 px-2 py-1 rounded-md">
              <Clock className="h-3.5 w-3.5" />
              {module.time_limit_minutes} min
            </span>
            <span className={cn(
              "flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors",
              questionCount === targetCount ? "bg-green-50 text-green-700" : "bg-muted/50"
            )}>
              <div className={cn("w-1.5 h-1.5 rounded-full", questionCount === targetCount ? "bg-green-600" : "bg-amber-500")} />
              {questionCount} / {targetCount} Questions
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-all text-muted-foreground hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onClick(); }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-all"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onClick(); }}>
                <Settings className="w-4 h-4 mr-2" /> Edit Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
                <Copy className="w-4 h-4 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  onSelect,
}: {
  template: { id: string; name: string; description: string; icon: any; color: string; modules: number };
  onSelect: () => void;
}) {
  const Icon = template.icon;

  return (
    <button
      onClick={onSelect}
      className="relative flex flex-col items-start p-6 rounded-xl border bg-card hover:border-primary/50 hover:shadow-md transition-all group text-left h-full"
    >
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4 text-white bg-gradient-to-br shadow-sm", template.color)}>
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="font-serif font-bold text-lg mb-2 group-hover:text-primary transition-colors">{template.name}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{template.description}</p>

      <div className="mt-auto flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
        <LayoutTemplate className="w-3 h-3" />
        {template.modules} Modules
      </div>

      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <Sparkles className="w-5 h-5 text-primary" />
      </div>
    </button>
  );
}

// --- Main Page ---

export default function TestBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isNew = !id;

  // State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [testType, setTestType] = useState<TestType>(TestType.FULL_TEST);
  const [localModules, setLocalModules] = useState<TestModule[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  const [isCreateModuleOpen, setIsCreateModuleOpen] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);
  const [isModuleEditorOpen, setIsModuleEditorOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Queries
  const { data: test, isLoading } = useQuery({
    queryKey: ['test', id],
    queryFn: () => testService.getTest(Number(id)),
    enabled: !isNew,
  });

  // Load data
  useEffect(() => {
    if (test) {
      setTitle(test.title);
      setDescription(test.description || '');
      setTestType(test.test_type as TestType);
      setIsPublished(test.is_published);
      setIsPremium(test.is_premium);
      // Sort and set local modules
      if (test.modules) {
        setLocalModules([...test.modules].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)));
      }
    }
  }, [test]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setLocalModules((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over?.id);

        const newOrder = arrayMove(items, oldIndex, newIndex);

        // Update order indices for all affected items and persist
        const updates = newOrder.map((module, index) => ({
          id: module.id,
          order_index: index
        })).filter(u => u.id !== undefined);

        // Trigger updates in background
        updates.forEach(update => {
          if (update.id) {
            testService.updateModule(update.id, { order_index: update.order_index })
              .catch(console.error);
          }
        });

        toast({ title: "Order updated", description: "Module order saved." });

        return newOrder.map((m, i) => ({ ...m, order_index: i }));
      });
    }
  };

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (data: any) => isNew ? testService.createTest(data) : testService.updateTest(Number(id), data),
    onSuccess: (data) => {
      toast({ title: 'Test saved', description: 'Changes saved successfully.' });
      if (isNew) navigate(`/admin/tests/${data.id}`, { replace: true });
      else queryClient.invalidateQueries({ queryKey: ['test', id] });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.response?.data?.detail || 'Failed to save', variant: 'destructive' }),
  });

  const createModuleMutation = useMutation({
    mutationFn: (data: any) => testService.createModule(Number(id), data),
    onSuccess: () => {
      toast({ title: 'Module added' });
      queryClient.invalidateQueries({ queryKey: ['test', id] });
      setIsCreateModuleOpen(false);
    },
  });

  const deleteModuleMutation = useMutation({
    mutationFn: (moduleId: number) => testService.deleteModule(moduleId),
    onSuccess: () => {
      toast({ title: 'Module deleted' });
      queryClient.invalidateQueries({ queryKey: ['test', id] });
    },
  });

  const handleDeleteModule = (moduleId: number) => {
    if (confirm('Are you sure you want to delete this module?')) {
      deleteModuleMutation.mutate(moduleId);
    }
  };

  const handleDuplicateModule = async (module: TestModule) => {
    try {
      const { id: _, ...moduleData } = module;
      // Append (Copy) to the module number or name if possible, but schema relies on enums mostly.
      // We'll just create a new one with same data.
      await createModuleMutation.mutateAsync({
        ...moduleData,
        order_index: localModules.length // Add to end
      });
      toast({ title: "Module duplicated" });
    } catch (e) {
      toast({ title: "Error duplicating module", variant: "destructive" });
    }
  };

  const handleTemplateSelect = async (templateId: string) => {
    toast({ title: 'Creating test...', description: 'Setting up modules structure.' });

    try {
      // 1. Create Test First
      const testData = {
        title: 'New Practice Test',
        description: 'Created from template',
        test_type: TestType.FULL_TEST, // Default
        is_published: false,
      };

      const newTest = await testService.createTest(testData);

      // 2. Define Modules based on template
      const templates = {
        'adaptive': [
          // Reading & Writing
          { section: SATSection.READING_WRITING, module: SATModule.MODULE_1, difficulty: ModuleDifficulty.STANDARD, time_limit_minutes: 32, order_index: 0 },
          { section: SATSection.READING_WRITING, module: SATModule.MODULE_2, difficulty: ModuleDifficulty.EASIER, time_limit_minutes: 32, order_index: 1 },
          { section: SATSection.READING_WRITING, module: SATModule.MODULE_2, difficulty: ModuleDifficulty.HARDER, time_limit_minutes: 32, order_index: 2 },
          // Math
          { section: SATSection.MATH, module: SATModule.MODULE_1, difficulty: ModuleDifficulty.STANDARD, time_limit_minutes: 35, order_index: 3 },
          { section: SATSection.MATH, module: SATModule.MODULE_2, difficulty: ModuleDifficulty.EASIER, time_limit_minutes: 35, order_index: 4 },
          { section: SATSection.MATH, module: SATModule.MODULE_2, difficulty: ModuleDifficulty.HARDER, time_limit_minutes: 35, order_index: 5 },
        ],
        'linear': [
          { section: SATSection.READING_WRITING, module: SATModule.MODULE_1, difficulty: ModuleDifficulty.STANDARD, time_limit_minutes: 32, order_index: 0 },
          { section: SATSection.READING_WRITING, module: SATModule.MODULE_2, difficulty: ModuleDifficulty.STANDARD, time_limit_minutes: 32, order_index: 1 },
          { section: SATSection.MATH, module: SATModule.MODULE_1, difficulty: ModuleDifficulty.STANDARD, time_limit_minutes: 35, order_index: 2 },
          { section: SATSection.MATH, module: SATModule.MODULE_2, difficulty: ModuleDifficulty.STANDARD, time_limit_minutes: 35, order_index: 3 },
        ],
        'rw': [
          { section: SATSection.READING_WRITING, module: SATModule.MODULE_1, difficulty: ModuleDifficulty.STANDARD, time_limit_minutes: 32, order_index: 0 },
          { section: SATSection.READING_WRITING, module: SATModule.MODULE_2, difficulty: ModuleDifficulty.EASIER, time_limit_minutes: 32, order_index: 1 },
          { section: SATSection.READING_WRITING, module: SATModule.MODULE_2, difficulty: ModuleDifficulty.HARDER, time_limit_minutes: 32, order_index: 2 },
        ],
        'math': [
          { section: SATSection.MATH, module: SATModule.MODULE_1, difficulty: ModuleDifficulty.STANDARD, time_limit_minutes: 35, order_index: 0 },
          { section: SATSection.MATH, module: SATModule.MODULE_2, difficulty: ModuleDifficulty.EASIER, time_limit_minutes: 35, order_index: 1 },
          { section: SATSection.MATH, module: SATModule.MODULE_2, difficulty: ModuleDifficulty.HARDER, time_limit_minutes: 35, order_index: 2 },
        ]
      };

      const modules = templates[templateId as keyof typeof templates];

      // 3. Create Modules
      if (modules) {
        for (const m of modules) {
          await testService.createModule(newTest.id, m);
        }
      }

      // 4. Redirect
      navigate(`/admin/tests/${newTest.id}`, { replace: true });
      toast({ title: 'Success', description: 'Test created from template!' });

    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to create from template', variant: 'destructive' });
    }
  };



  if (isLoading) return <div className="h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/admin/tests')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <div className="h-6 w-px bg-border" />
            <span className="font-semibold text-sm">Test Builder</span>
            {isPublished && <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-0">Published</Badge>}
          </div>

          <div className="flex items-center gap-3">
            {!isNew && (
              <div className="flex items-center gap-2 mr-4">
                <span className="text-sm font-medium text-muted-foreground">Draft</span>
                <Switch checked={isPublished} onCheckedChange={(c) => saveMutation.mutate({ is_published: c })} />
                <span className="text-sm font-medium">Publish</span>
              </div>
            )}
            <Button
              onClick={() => saveMutation.mutate({ title, description, test_type: testType, is_premium: isPremium })}
              disabled={saveMutation.isPending || isNew}
              className="btn-premium min-w-[100px]"
            >
              {saveMutation.isPending ? 'Saving...' : <><Save className="w-4 h-4 mr-2" /> Save</>}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Title Section */}
        <div className="mb-10 space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled Test"
            className="text-4xl font-serif font-bold bg-transparent border-0 px-0 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/30 h-auto"
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a description..."
            className="resize-none bg-transparent border-0 px-0 shadow-none focus-visible:ring-0 text-muted-foreground h-auto min-h-[60px]"
          />
        </div>

        {/* Create Mode: Templates */}
        {isNew ? (
          <div className="animate-fade-in">
            <div className="flex items-center gap-2 mb-6 text-xl font-semibold">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2>Choose a Structure</h2>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              <TemplateCard
                template={{
                  id: 'adaptive',
                  name: 'Adaptive SAT',
                  description: 'Full exam with 6 modules: Standard path + Easy/Hard adaptive paths for both sections.',
                  icon: Target,
                  color: 'from-indigo-500 to-violet-600',
                  modules: 6
                }}
                onSelect={() => handleTemplateSelect('adaptive')}
              />
              <TemplateCard
                template={{
                  id: 'linear',
                  name: 'Linear Practice',
                  description: 'Standard practice test with 4 modules (2 R&W + 2 Math). Non-adaptive.',
                  icon: LayoutTemplate,
                  color: 'from-blue-500 to-cyan-500',
                  modules: 4
                }}
                onSelect={() => handleTemplateSelect('linear')}
              />
              <TemplateCard
                template={{
                  id: 'rw',
                  name: 'R&W Section',
                  description: 'Focused Reading & Writing practice. 3 modules (Adaptive).',
                  icon: BookOpen,
                  color: 'from-amber-500 to-orange-600',
                  modules: 3
                }}
                onSelect={() => handleTemplateSelect('rw')}
              />
              <TemplateCard
                template={{
                  id: 'math',
                  name: 'Math Section',
                  description: 'Focused Math practice. 3 modules (Adaptive).',
                  icon: Calculator,
                  color: 'from-emerald-500 to-green-600',
                  modules: 3
                }}
                onSelect={() => handleTemplateSelect('math')}
              />
            </div>
          </div>
        ) : (
          /* Edit Mode: Module List */
          <div className="grid lg:grid-cols-3 gap-8 animate-fade-in">
            {/* Left Col: Modules */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Modules</h2>
                <Button variant="outline" size="sm" onClick={() => setIsCreateModuleOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Add Module
                </Button>
              </div>

              {!test?.modules?.length ? (
                <div
                  onClick={() => setIsCreateModuleOpen(true)}
                  className="border-2 border-dashed rounded-xl p-12 text-center hover:bg-muted/30 hover:border-primary/50 cursor-pointer transition-all"
                >
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                    <Plus className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg">No modules yet</h3>
                  <p className="text-muted-foreground text-sm">Click to add your first module</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={localModules.map(m => m.id!)}
                      strategy={verticalListSortingStrategy}
                    >
                      {localModules.map((module) => (
                        <SortableModuleCard
                          key={module.id}
                          module={module}
                          onClick={() => { setSelectedModuleId(module.id!); setIsModuleEditorOpen(true); }}
                          onDelete={() => module.id && handleDeleteModule(module.id)}
                          onDuplicate={() => handleDuplicateModule(module)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              )}
            </div>

            {/* Right Col: Settings */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">Premium Only</div>
                      <div className="text-xs text-muted-foreground">Require subscription</div>
                    </div>
                    <Switch checked={isPremium} onCheckedChange={(c) => { setIsPremium(c); saveMutation.mutate({ is_premium: c }); }} />
                  </div>
                  <div className="pt-4 border-t">
                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-3">Quick Actions</div>
                    <Button variant="outline" className="w-full justify-start text-muted-foreground hover:text-foreground mb-2">
                      <Zap className="w-4 h-4 mr-2" /> Bulk Import Questions
                    </Button>
                    <Button variant="outline" className="w-full justify-start text-muted-foreground hover:text-foreground">
                      <Copy className="w-4 h-4 mr-2" /> Duplicate Test
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* Dialogs */}
      <CreateModuleDialog
        open={isCreateModuleOpen}
        onOpenChange={setIsCreateModuleOpen}
        onSubmit={async (data) => {
          await createModuleMutation.mutateAsync(data);
        }}
      />

      {isModuleEditorOpen && selectedModuleId && (
        <ModuleEditor
          module={test?.modules?.find(m => m.id === selectedModuleId) || null}
          open={isModuleEditorOpen}
          onOpenChange={setIsModuleEditorOpen}
        />
      )}
    </div>
  );
}



