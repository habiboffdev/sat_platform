import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Edit, Plus, Trash2, MoreHorizontal, FileUp, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { testService } from '@/services/test';
import { useToast } from '@/hooks/use-toast';

export default function TestList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tests, isLoading } = useQuery({
    queryKey: ['admin-tests'],
    queryFn: testService.getAllTestsAdmin,
  });

  const deleteMutation = useMutation({
    mutationFn: testService.deleteTest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tests'] });
      toast({ title: 'Test deleted successfully' });
    },
  });

  if (isLoading) {
    return <div>Loading tests...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tests</h2>
          <p className="text-muted-foreground">Manage your SAT practice tests and question banks.</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Test
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/admin/tests/new">
                <Plus className="mr-2 h-4 w-4" /> Create Manually
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/admin/create-test">
                <FileUp className="mr-2 h-4 w-4" /> Import from OCR
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Questions</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tests?.map((test) => (
              <TableRow key={test.id}>
                <TableCell className="font-medium">{test.title}</TableCell>
                <TableCell className="capitalize">{test.test_type.replace('_', ' ')}</TableCell>
                <TableCell>
                  <Badge variant={test.is_published ? 'default' : 'secondary'}>
                    {test.is_published ? 'Published' : 'Draft'}
                  </Badge>
                </TableCell>
                <TableCell>
                  {test.modules?.reduce((acc, mod) => acc + (mod.questions?.length || 0), 0) || 0}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/admin/tests/${test.id}`}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => deleteMutation.mutate(test.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {(!tests || tests.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No tests found. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
