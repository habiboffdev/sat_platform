import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit2, GripVertical } from 'lucide-react';
import type { TestModule, Question } from '@/types/test';
import QuestionEditor, { type ExtendedQuestion } from '@/components/features/admin/TestBuilder/QuestionEditor';
import { testService } from '@/services/test';
import { useToast } from '@/hooks/use-toast';

interface ModuleEditorProps {
  module: TestModule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModuleEditor({ module, open, onOpenChange }: ModuleEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isQuestionEditorOpen, setIsQuestionEditorOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Partial<Question> | undefined>(undefined);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<number | null>(null);

  const createQuestionMutation = useMutation({
    mutationFn: (data: Partial<Question>) => {
      if (!module?.id) throw new Error("Module ID is missing");
      return testService.createQuestion(0, module.id, data);
    },
    onSuccess: () => {
      toast({ title: 'Question created', description: 'The question has been successfully added to the module.' });
      queryClient.invalidateQueries({ queryKey: ['test'] });
      setIsQuestionEditorOpen(false);
    },
    onError: (error) => {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to create question.', variant: 'destructive' });
    }
  });

  const updateQuestionMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Question> }) => {
      return testService.updateQuestion(id, data);
    },
    onSuccess: () => {
      toast({ title: 'Question updated', description: 'The question has been successfully updated.' });
      queryClient.invalidateQueries({ queryKey: ['test'] });
      setIsQuestionEditorOpen(false);
    },
    onError: (error) => {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to update question.', variant: 'destructive' });
    }
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId: number) => {
      return testService.deleteQuestion(questionId);
    },
    onSuccess: () => {
      toast({ title: 'Question deleted', description: 'The question has been removed from the module.' });
      queryClient.invalidateQueries({ queryKey: ['test'] });
      setIsDeleteDialogOpen(false);
      setQuestionToDelete(null);
    },
    onError: (error) => {
      console.error(error);
      toast({ title: 'Error', description: 'Failed to delete question.', variant: 'destructive' });
    }
  });

  const handleAddQuestion = () => {
    setSelectedQuestion(undefined);
    setIsQuestionEditorOpen(true);
  };

  const handleEditQuestion = (question: Question) => {
    setSelectedQuestion(question);
    setIsQuestionEditorOpen(true);
  };

  const handleDeleteClick = (questionId: number) => {
    setQuestionToDelete(questionId);
    setIsDeleteDialogOpen(true);
  };

  const handleSaveQuestion = async (questionData: ExtendedQuestion) => {
    try {
      let passageId: number | undefined = undefined;

      // If passage data is provided, create the passage first
      if (questionData.passage?.content && questionData.passage.content.trim() !== '' && questionData.passage.content !== '<p><br></p>') {
        const passageResponse = await testService.createPassage({
          title: questionData.passage.title,
          content: questionData.passage.content,
          source: questionData.passage.source,
          author: questionData.passage.author,
        });
        passageId = passageResponse.id;
      }

      // Prepare question payload (remove passage data, add passage_id)
      const { passage: _passageData, ...questionPayload } = questionData;
      const payload = {
        ...questionPayload,
        passage_id: passageId,
      };

      if (selectedQuestion?.id) {
        updateQuestionMutation.mutate({ id: selectedQuestion.id, data: payload });
      } else {
        // Calculate the next question number based on the highest existing number
        const maxQuestionNumber = module?.questions?.reduce((max, q) => Math.max(max, q.question_number), 0) || 0;
        const nextQuestionNumber = maxQuestionNumber + 1;

        const finalPayload = {
          ...payload,
          question_number: payload.question_number ?? nextQuestionNumber
        };
        createQuestionMutation.mutate(finalPayload);
      }
    } catch (error) {
      console.error('Failed to save question with passage:', error);
      toast({ title: 'Error', description: 'Failed to save question.', variant: 'destructive' });
    }
  };

  if (!module) return null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[800px] sm:max-w-[800px] overflow-y-auto">
          <SheetHeader className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="capitalize">
                {module.section.replace('_', ' ')}
              </Badge>
              <Badge variant="secondary" className="capitalize">
                {module.module.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {module.difficulty}
              </Badge>
            </div>
            <SheetTitle className="text-2xl">Module Editor</SheetTitle>
            <SheetDescription>
              Manage questions and settings for this module.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-8">
            {/* Questions List */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Questions ({module.questions?.length || 0})</h3>
                <Button size="sm" onClick={handleAddQuestion}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Question
                </Button>
              </div>

              <div className="space-y-3">
                {module.questions?.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground">
                    No questions yet. Add one to get started.
                  </div>
                ) : (
                  module.questions?.map((question, index) => (
                    <div key={question.id || index} className="group flex items-start gap-3 p-4 border rounded-lg bg-card hover:shadow-sm transition-all">
                      <div className="mt-1 text-muted-foreground/50 cursor-grab">
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">Q{index + 1}</Badge>
                          <Badge variant="secondary" className="text-xs capitalize">{question.question_type.replace('_', ' ')}</Badge>
                          <Badge variant="outline" className="text-xs capitalize">{question.difficulty}</Badge>
                        </div>
                        <div className="text-sm line-clamp-2 font-medium mb-1">
                          {question.question_text.replace(/<[^>]*>/g, '')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditQuestion(question)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => question.id && handleDeleteClick(question.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={isQuestionEditorOpen} onOpenChange={setIsQuestionEditorOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[95vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-center gap-2">
              <DialogTitle>{selectedQuestion ? 'Edit Question' : 'Add New Question'}</DialogTitle>
            </div>
            <DialogDescription>
              {selectedQuestion ? 'Edit the details of the existing question.' : 'Create a new question for this module.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-6">
            <QuestionEditor
              initialQuestion={selectedQuestion}
              onSave={handleSaveQuestion}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the question
              from this module.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => questionToDelete && deleteQuestionMutation.mutate(questionToDelete)}
              disabled={deleteQuestionMutation.isPending}
            >
              {deleteQuestionMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
