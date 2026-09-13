import { Link } from "@tanstack/react-router";
import { Bell, BookOpen, Compass, GraduationCap, LayoutDashboard, Moon, Sun, Wand2 } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppStore } from "@/lib/app-store";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const notifications = [
  { title: "Checkpoint passed", body: "Raft leader election — 100% on first try.", when: "2h ago" },
  { title: "New lesson unlocked", body: "Caching & Data Consistency is ready for you.", when: "yesterday" },
  { title: "Streak", body: "3 days of study in a row. Keep going.", when: "2 days ago" },
];

const studentNav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/catalog", label: "Catalog", icon: Compass },
];

const adminNav = [
  { to: "/admin", label: "Studio", icon: LayoutDashboard },
  { to: "/admin/ingest", label: "Ingest notes", icon: Wand2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { role, setRole } = useAppStore();
  const { theme, toggle } = useTheme();
  const nav = role === "admin" ? adminNav : studentNav;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <GraduationCap className="size-5" />
            </span>
            <span className="hidden font-serif text-lg font-semibold sm:block">Sarathi</span>
          </Link>

          <nav className="ml-2 flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/" || item.to === "/admin" }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                activeProps={{ className: "bg-accent text-accent-foreground" }}
              >
                <span className="flex items-center gap-2">
                  <item.icon className="size-4" />
                  {item.label}
                </span>
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
              {(["student", "admin"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    role === r
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>

            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark mode">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                  <Bell className="size-4" />
                  <span className="absolute top-2 right-2 size-2 rounded-full bg-primary" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold">
                  Notifications
                </div>
                <ul className="divide-y divide-border">
                  {notifications.map((n) => (
                    <li key={n.title} className="px-4 py-3">
                      <p className="text-sm font-medium">{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.body}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{n.when}</p>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="rounded-full" aria-label="Profile">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-secondary text-xs font-semibold">AC</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-sm font-medium">Abishek C.</div>
                  <div className="text-xs font-normal text-muted-foreground">demo@sarathi.app</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/catalog">
                    <BookOpen className="mr-2 size-4" /> Browse courses
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRole(role === "admin" ? "student" : "admin")}>
                  Switch to {role === "admin" ? "student" : "admin"} mode
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  Demo account <Badge variant="secondary" className="ml-auto">local</Badge>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
