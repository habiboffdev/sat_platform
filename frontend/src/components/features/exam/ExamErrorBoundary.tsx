import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
    children: ReactNode;
    onReset?: () => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ExamErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error to console (could send to error tracking service)
        console.error('Exam Error Boundary caught an error:', error, errorInfo);

        // Try to preserve exam state in localStorage
        try {
            const examState = localStorage.getItem('exam-storage');
            if (examState) {
                localStorage.setItem('exam-storage-backup', examState);
                console.log('Exam state backed up successfully');
            }
        } catch (e) {
            console.error('Failed to backup exam state:', e);
        }
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    handleGoHome = () => {
        this.setState({ hasError: false, error: null });
        window.location.href = '/dashboard';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-background flex items-center justify-center p-4">
                    <div className="max-w-md w-full text-center space-y-6">
                        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
                            <AlertTriangle className="w-10 h-10 text-destructive" />
                        </div>

                        <div className="space-y-2">
                            <h1 className="text-2xl font-bold">Something went wrong</h1>
                            <p className="text-muted-foreground">
                                Don't worry! Your answers have been saved automatically.
                                You can try refreshing the page or return to the dashboard.
                            </p>
                        </div>

                        {this.state.error && (
                            <div className="p-4 bg-muted rounded-lg text-left">
                                <p className="text-xs font-mono text-muted-foreground break-all">
                                    {this.state.error.message}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Button variant="outline" onClick={this.handleGoHome}>
                                <Home className="w-4 h-4 mr-2" />
                                Go to Dashboard
                            </Button>
                            <Button onClick={this.handleRetry}>
                                <RefreshCw className="w-4 h-4 mr-2" />
                                Try Again
                            </Button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            If this problem persists, please contact support.
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
