"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleHelp,
  LayoutList,
  Leaf,
  LogOut,
  Menu,
  Plus,
  Settings2,
  Sun,
  X,
} from "lucide-react";
import { getTaskMetrics } from "@upnext/contracts";
import { orpc } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { duration, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WorkspaceContext, type Editor } from "./workspace-context";
import { EditorHost } from "./editors/editor-host";

const navigation = [
  { href: "/aujourdhui", label: "Aujourd’hui", icon: Sun },
  { href: "/taches", label: "Mes tâches", icon: LayoutList },
  { href: "/calendrier", label: "Calendrier", icon: CalendarDays },
];

export function Workspace({
  viewer,
  children,
}: {
  viewer: { name: string; email: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({ ...orpc.dashboard.get.queryOptions(), refetchInterval: 60000 });
  const { setTheme } = useTheme();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const snapshot = query.data;

  useEffect(() => {
    if (snapshot) setTheme(snapshot.preferences.theme);
  }, [snapshot?.preferences.theme, setTheme, snapshot]);

  if (!snapshot)
    return (
      <Alert>
        <AlertDescription>
          Impossible de charger ton espace.{" "}
          <Button variant="link" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    );

  const activeTasks = snapshot.tasks.filter((task) => task.progress < 100);
  const totalRemaining = activeTasks.reduce(
    (total, task) =>
      total +
      getTaskMetrics(task, snapshot.sessions, snapshot.logs, new Date(snapshot.serverNow))
        .remainingMinutes,
    0,
  );
  const totalUnplanned = activeTasks.reduce(
    (total, task) =>
      total +
      getTaskMetrics(task, snapshot.sessions, snapshot.logs, new Date(snapshot.serverNow))
        .unplannedMinutes,
    0,
  );
  const plannedRatio = totalRemaining
    ? Math.round((1 - totalUnplanned / totalRemaining) * 100)
    : 0;
  const title = navigation.find((item) => pathname === item.href)?.label ?? "Paramètres";

  async function logout() {
    await authClient.signOut();
    queryClient.clear();
    router.push("/connexion");
    router.refresh();
  }

  return (
    <WorkspaceContext
      value={{ snapshot, viewer, openEditor: setEditor, closeEditor: () => setEditor(null) }}
    >
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <div className="app-layout">
        {menuOpen && (
          <button
            className="mobile-scrim"
            aria-label="Fermer la navigation"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <aside className={cn("app-sidebar", menuOpen && "is-open")}>
          <div className="flex items-center justify-between">
            <Link href="/aujourdhui" className="brand">
              <span className="brand-mark">
                <ArrowUpRight />
              </span>
              upnext<span className="brand-dot">.</span>
            </Link>
            <Button
              className="lg:hidden"
              size="icon"
              variant="ghost"
              aria-label="Fermer le menu"
              onClick={() => setMenuOpen(false)}
            >
              <X />
            </Button>
          </div>
          <p className="sidebar-caption">UN PEU PLUS DE CLARTÉ.</p>
          <Button
            className="mt-7 w-full"
            onClick={() => {
              setEditor({ type: "task" });
              setMenuOpen(false);
            }}
          >
            <Plus data-icon="inline-start" />
            Nouvelle tâche
          </Button>
          <nav className="sidebar-nav" aria-label="Navigation principale">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn("nav-link", pathname === item.href && "active")}
                aria-current={pathname === item.href ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <item.icon className="size-[18px]" />
                <span>{item.label}</span>
                {item.href === "/taches" && activeTasks.length > 0 && (
                  <span className="nav-count">{activeTasks.length}</span>
                )}
              </Link>
            ))}
          </nav>
          <Separator />
          <div className="sidebar-tags">
            <span className="eyebrow">MES TAGS</span>
            {snapshot.tags.length === 0 ? (
              <p>Ils prennent forme avec tes tâches.</p>
            ) : (
              snapshot.tags.slice(0, 8).map((tag) => (
                <Link
                  key={tag.id}
                  href={`/taches?tag=${tag.id}`}
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="tag-dot" />
                  {tag.name}
                </Link>
              ))
            )}
          </div>
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <Leaf className="mb-3 size-5 text-primary" />
              <p className="font-semibold">Un créneau à la fois.</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {totalRemaining
                  ? `${duration(totalUnplanned)} restent à trouver leur place.`
                  : "Ajoute ce que tu as en tête. On organise la suite ensemble."}
              </p>
              <Progress
                className="mt-4"
                value={plannedRatio}
                aria-label="Part du travail planifiée"
              />
              <Link
                href="/calendrier"
                className="mt-3 flex items-center justify-between text-xs font-semibold text-primary"
              >
                Voir mon planning
                <ChevronRight className="size-4" />
              </Link>
            </div>
            <Link
              href="/parametres"
              className={cn("nav-link", pathname === "/parametres" && "active")}
              onClick={() => setMenuOpen(false)}
            >
              <Settings2 className="size-[18px]" />
              Paramètres
            </Link>
            <div className="profile-row">
              <span className="profile-avatar">{viewer.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{viewer.name}</p>
                <p className="text-xs text-muted-foreground">Mon espace personnel</p>
              </div>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Se déconnecter"
                onClick={() => void logout()}
              >
                <LogOut />
              </Button>
            </div>
          </div>
        </aside>
        <div className="main-column">
          <header className="app-topbar">
            <div className="flex items-center gap-3">
              <Button
                className="lg:hidden"
                variant="ghost"
                size="icon"
                aria-label="Ouvrir le menu"
                onClick={() => setMenuOpen(true)}
              >
                <Menu />
              </Button>
              <span className="text-muted-foreground">Mon espace</span>
              <ChevronRight className="size-3 text-muted-foreground" />
              <span>{title}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="hidden text-xs text-muted-foreground sm:block">
                {formatDate(snapshot.serverNow, snapshot.preferences.timeZone, "EEEE d MMMM")}
              </span>
              <Link href="/parametres" aria-label="Configurer mon espace">
                <CircleHelp className="size-[18px] text-muted-foreground" />
              </Link>
            </div>
          </header>
          <main id="main-content" className="app-content">
            {query.isError && (
              <Alert className="mb-5" variant="destructive">
                <AlertDescription>
                  La connexion est interrompue. Les dernières données restent affichées.{" "}
                  <Button variant="link" onClick={() => void query.refetch()}>
                    Réessayer
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {children}
          </main>
          <footer className="app-footer">
            <span>Un peu d’organisation. Beaucoup d’espace pour toi.</span>
            <span>upnext.</span>
          </footer>
        </div>
      </div>
      {editor && <EditorHost key={JSON.stringify(editor)} editor={editor} />}
    </WorkspaceContext>
  );
}
