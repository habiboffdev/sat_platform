import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, FileText, Users, LogOut, BookOpen, PanelLeftClose, PanelLeft, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/auth';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Tests', href: '/admin/tests', icon: FileText },
    { name: 'Questions', href: '/admin/questions', icon: BookOpen },
    { name: 'Users', href: '/admin/users', icon: Users },
    { name: 'Score Analytics', href: '/admin/score-analytics', icon: BarChart3 },
  ];

  // Check if current page needs full width (like import or create-test)
  const isFullWidthPage = location.pathname.includes('/import') || location.pathname.includes('/create-test');

  return (
    <TooltipProvider delayDuration={0}>
      <div className="min-h-screen bg-background flex">
        {/* Collapsible Sidebar */}
        <div className={cn(
          "bg-card border-r shadow-sm flex flex-col fixed h-full z-40 transition-all duration-200",
          collapsed ? "w-16" : "w-56"
        )}>
          {/* Logo */}
          <div className={cn("p-4 border-b flex items-center gap-2", collapsed && "justify-center")}>
            <div className="bg-primary text-primary-foreground p-1.5 rounded-md shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            {!collapsed && (
              <h1 className="text-sm font-serif font-bold text-primary tracking-tight truncate">
                Islomxon Saidov | SAT
              </h1>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;

              const linkContent = (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    collapsed && "justify-center px-2"
                  )}
                >
                  <Icon className={cn("h-5 w-5 shrink-0", !collapsed && "mr-3")} />
                  {!collapsed && item.name}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.name}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right">{item.name}</TooltipContent>
                  </Tooltip>
                );
              }
              return linkContent;
            })}
          </nav>

          {/* Collapse Toggle & Logout */}
          <div className="p-2 border-t space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn("w-full", collapsed ? "justify-center" : "justify-start")}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4 mr-2" />Collapse</>}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full text-destructive hover:text-destructive hover:bg-destructive/10",
                    collapsed ? "justify-center" : "justify-start"
                  )}
                  onClick={handleLogout}
                >
                  <LogOut className={cn("h-4 w-4", !collapsed && "mr-2")} />
                  {!collapsed && "Logout"}
                </Button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="right">Logout</TooltipContent>}
            </Tooltip>
          </div>
        </div>

        {/* Main Content */}
        <div className={cn(
          "flex-1 flex flex-col min-h-screen transition-all duration-200",
          collapsed ? "ml-16" : "ml-56"
        )}>
          {/* Header */}
          <header className="bg-card border-b h-12 flex items-center justify-between px-4 sticky top-0 z-30 shrink-0">
            <h2 className="text-sm font-medium text-muted-foreground">Admin Portal</h2>
            <div className="flex items-center gap-3">
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                AD
              </div>
            </div>
          </header>

          {/* Page Content - full width for import, constrained for others */}
          <main className={cn(
            "flex-1 overflow-hidden",
            isFullWidthPage ? "" : "p-6 max-w-6xl mx-auto w-full"
          )}>
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
