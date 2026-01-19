import { BookOpen } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ReferenceSheetProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ReferenceSheet({ isOpen, onClose }: ReferenceSheetProps) {
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl max-h-[90vh] p-0">
                <DialogHeader className="px-6 pt-6 pb-4 border-b">
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <BookOpen className="w-5 h-5 text-primary" />
                        SAT Math Reference Sheet
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="px-6 py-4 max-h-[calc(90vh-100px)]">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Geometry - Circles */}
                        <section className="space-y-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
                            <h3 className="font-bold text-blue-900 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs">◯</span>
                                Circle Formulas
                            </h3>
                            <div className="space-y-2 text-sm text-blue-900">
                                <div className="flex justify-between items-center">
                                    <span>Area</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">A = πr²</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Circumference</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">C = 2πr = πd</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Arc Length</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">L = (θ/360)×2πr</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Sector Area</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">A = (θ/360)×πr²</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Central Angle (radians)</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">θ = s/r</code>
                                </div>
                            </div>
                        </section>

                        {/* Geometry - Rectangles & Triangles */}
                        <section className="space-y-3 p-4 bg-green-50 rounded-xl border border-green-200">
                            <h3 className="font-bold text-green-900 flex items-center gap-2">
                                <span className="w-6 h-6 rounded bg-green-500 text-white flex items-center justify-center text-xs">▢</span>
                                Area & Perimeter
                            </h3>
                            <div className="space-y-2 text-sm text-green-900">
                                <div className="flex justify-between items-center">
                                    <span>Rectangle Area</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">A = lw</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Rectangle Perimeter</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">P = 2l + 2w</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Triangle Area</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">A = ½bh</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Parallelogram Area</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">A = bh</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Trapezoid Area</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">A = ½(b₁+b₂)h</code>
                                </div>
                            </div>
                        </section>

                        {/* Volume */}
                        <section className="space-y-3 p-4 bg-purple-50 rounded-xl border border-purple-200">
                            <h3 className="font-bold text-purple-900 flex items-center gap-2">
                                <span className="w-6 h-6 rounded bg-purple-500 text-white flex items-center justify-center text-xs">3D</span>
                                Volume Formulas
                            </h3>
                            <div className="space-y-2 text-sm text-purple-900">
                                <div className="flex justify-between items-center">
                                    <span>Rectangular Prism</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">V = lwh</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Cylinder</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">V = πr²h</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Sphere</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">V = (4/3)πr³</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Cone</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">V = (1/3)πr²h</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Pyramid</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">V = (1/3)Bh</code>
                                </div>
                            </div>
                        </section>

                        {/* Pythagorean & Special Right Triangles */}
                        <section className="space-y-3 p-4 bg-amber-50 rounded-xl border border-amber-200">
                            <h3 className="font-bold text-amber-900 flex items-center gap-2">
                                <span className="w-6 h-6 rounded bg-amber-500 text-white flex items-center justify-center text-xs">△</span>
                                Right Triangles
                            </h3>
                            <div className="space-y-2 text-sm text-amber-900">
                                <div className="flex justify-between items-center">
                                    <span>Pythagorean Theorem</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">a² + b² = c²</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>45-45-90 Triangle</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">x : x : x√2</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>30-60-90 Triangle</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">x : x√3 : 2x</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>3-4-5 Triple</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">3² + 4² = 5²</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>5-12-13 Triple</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">5² + 12² = 13²</code>
                                </div>
                            </div>
                        </section>

                        {/* Trigonometry */}
                        <section className="space-y-3 p-4 bg-red-50 rounded-xl border border-red-200">
                            <h3 className="font-bold text-red-900 flex items-center gap-2">
                                <span className="w-6 h-6 rounded bg-red-500 text-white flex items-center justify-center text-xs">θ</span>
                                Trigonometry
                            </h3>
                            <div className="space-y-2 text-sm text-red-900">
                                <div className="flex justify-between items-center">
                                    <span>Sine</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">sin θ = opp/hyp</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Cosine</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">cos θ = adj/hyp</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Tangent</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">tan θ = opp/adj</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Co-function Identity</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">sin θ = cos(90-θ)</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Radians ↔ Degrees</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">180° = π rad</code>
                                </div>
                            </div>
                        </section>

                        {/* Algebra */}
                        <section className="space-y-3 p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                            <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                                <span className="w-6 h-6 rounded bg-indigo-500 text-white flex items-center justify-center text-xs">x</span>
                                Algebra
                            </h3>
                            <div className="space-y-2 text-sm text-indigo-900">
                                <div className="flex justify-between items-center">
                                    <span>Slope</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">m = (y₂-y₁)/(x₂-x₁)</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Slope-Intercept</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">y = mx + b</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Point-Slope</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">y-y₁ = m(x-x₁)</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Quadratic Formula</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono text-xs">x = (-b±√(b²-4ac))/2a</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Vertex Form</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">y = a(x-h)² + k</code>
                                </div>
                            </div>
                        </section>

                        {/* Statistics */}
                        <section className="space-y-3 p-4 bg-teal-50 rounded-xl border border-teal-200">
                            <h3 className="font-bold text-teal-900 flex items-center gap-2">
                                <span className="w-6 h-6 rounded bg-teal-500 text-white flex items-center justify-center text-xs">Σ</span>
                                Statistics & Probability
                            </h3>
                            <div className="space-y-2 text-sm text-teal-900">
                                <div className="flex justify-between items-center">
                                    <span>Mean</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">x̄ = Σx/n</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Probability</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">P = favorable/total</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Percent Change</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">(new-old)/old × 100</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Simple Interest</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">I = Prt</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Compound Interest</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono text-xs">A = P(1+r/n)^(nt)</code>
                                </div>
                            </div>
                        </section>

                        {/* Other Important Formulas */}
                        <section className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                            <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                <span className="w-6 h-6 rounded bg-slate-500 text-white flex items-center justify-center text-xs">+</span>
                                More Formulas
                            </h3>
                            <div className="space-y-2 text-sm text-slate-900">
                                <div className="flex justify-between items-center">
                                    <span>Distance Formula</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono text-xs">d = √((x₂-x₁)²+(y₂-y₁)²)</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Midpoint</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono text-xs">((x₁+x₂)/2, (y₁+y₂)/2)</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Circle Equation</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono text-xs">(x-h)²+(y-k)²=r²</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Exponential Growth</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">y = a(1+r)^t</code>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span>Exponential Decay</span>
                                    <code className="px-2 py-1 bg-white rounded font-mono">y = a(1-r)^t</code>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Key Constants */}
                    <div className="mt-6 p-4 bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl border">
                        <h3 className="font-bold text-foreground mb-3">Key Constants & Notes</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div className="text-center">
                                <div className="font-mono font-bold text-lg">π ≈ 3.14159</div>
                                <div className="text-muted-foreground text-xs">Pi</div>
                            </div>
                            <div className="text-center">
                                <div className="font-mono font-bold text-lg">√2 ≈ 1.414</div>
                                <div className="text-muted-foreground text-xs">Square root of 2</div>
                            </div>
                            <div className="text-center">
                                <div className="font-mono font-bold text-lg">√3 ≈ 1.732</div>
                                <div className="text-muted-foreground text-xs">Square root of 3</div>
                            </div>
                            <div className="text-center">
                                <div className="font-mono font-bold text-lg">180°</div>
                                <div className="text-muted-foreground text-xs">Sum of triangle angles</div>
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
