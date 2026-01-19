import { HelpCircle, Keyboard, Clock, Flag, Lightbulb, MessageSquare } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <HelpCircle className="w-5 h-5 text-primary" />
                        Exam Help
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Keyboard Shortcuts */}
                    <section className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                            <Keyboard className="w-4 h-4" />
                            Keyboard Shortcuts
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                                <span>Next Question</span>
                                <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono">→</kbd>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                                <span>Previous Question</span>
                                <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono">←</kbd>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                                <span>Select Option A</span>
                                <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono">A</kbd>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                                <span>Select Option B</span>
                                <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono">B</kbd>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                                <span>Select Option C</span>
                                <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono">C</kbd>
                            </div>
                            <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                                <span>Select Option D</span>
                                <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono">D</kbd>
                            </div>
                        </div>
                    </section>

                    {/* Timer */}
                    <section className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Timer
                        </h3>
                        <div className="text-sm text-muted-foreground space-y-2">
                            <p>The timer at the top shows your remaining time for the current module.</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>Click the timer to hide/show it</li>
                                <li>Warning appears at 5 minutes remaining</li>
                                <li>Module auto-submits when time expires</li>
                                <li>Extended time users see adjusted times</li>
                            </ul>
                        </div>
                    </section>

                    {/* Flagging Questions */}
                    <section className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                            <Flag className="w-4 h-4" />
                            Flagging Questions
                        </h3>
                        <div className="text-sm text-muted-foreground space-y-2">
                            <p>Use the flag button to mark questions for review before submission.</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>Flagged questions appear with a flag icon in the navigation</li>
                                <li>You can filter to see only flagged questions in review mode</li>
                                <li>Flagging does not affect your score</li>
                            </ul>
                        </div>
                    </section>

                    {/* Exam Tools */}
                    <section className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                            <Lightbulb className="w-4 h-4" />
                            Exam Tools
                        </h3>
                        <div className="text-sm text-muted-foreground space-y-2">
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li><strong>Calculator</strong>: Available during Math section. Opens Desmos calculator.</li>
                                <li><strong>Reference Sheet</strong>: Math formulas reference (Math section only)</li>
                                <li><strong>Zoom In/Out</strong>: Adjust text size for better readability</li>
                                <li><strong>Annotate</strong>: Highlight text in reading passages</li>
                            </ul>
                        </div>
                    </section>

                    {/* Getting Help */}
                    <section className="space-y-3">
                        <h3 className="font-semibold flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            Need More Help?
                        </h3>
                        <div className="text-sm text-muted-foreground space-y-2">
                            <p>For technical issues during your exam:</p>
                            <ul className="list-disc list-inside space-y-1 ml-2">
                                <li>Do NOT close this window during an exam</li>
                                <li>Your answers are saved automatically</li>
                                <li>If you experience issues, take a screenshot</li>
                                <li>Contact support after completing your module</li>
                            </ul>
                        </div>
                    </section>
                </div>
            </DialogContent>
        </Dialog>
    );
}
