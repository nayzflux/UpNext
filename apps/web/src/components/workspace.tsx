"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  LayoutList,
  Menu,
  UserRound,
  Sun,
  X,
} from "lucide-react";
import { type Snapshot } from "@upnext/contracts";
import { api, orpc } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WorkspaceContext, type Editor } from "./workspace-context";
import { EditorHost } from "./editors/editor-host";
import { FormGuard, useFormGuard } from "./form-guard";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { AccountMenu, AccountSheet } from "./account-menu";
import { toast } from "@/components/ui/toast";

const navigation = [
  { href: "/aujourdhui", label: "Aujourd’hui", icon: Sun },
  { href: "/taches", label: "Mes tâches", icon: LayoutList },
  { href: "/calendrier", label: "Calendrier", icon: CalendarDays },
];

export function Workspace(props: React.ComponentProps<typeof WorkspaceContent>) {
  return (
    <FormGuard>
      <WorkspaceContent {...props} />
    </FormGuard>
  );
}

function WorkspaceContent({
  viewer,
  children,
}: {
  viewer: { name: string; email: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const guard = useFormGuard();
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({ ...orpc.dashboard.get.queryOptions(), refetchInterval: 60000 });
  const { setTheme } = useTheme();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const snapshot = query.data;
  const sessionExpired =
    query.error != null && "code" in query.error && query.error.code === "UNAUTHORIZED";
  const syncInFlight = useRef(false);

  useEffect(() => {
    if (!snapshot?.calendarSources.length) return;
    const syncDue = async () => {
      if (syncInFlight.current || document.visibilityState === "hidden") return;
      syncInFlight.current = true;
      try {
        const sources = await api.calendarSources.syncDue();
        const current = queryClient.getQueryData<Snapshot>(
          orpc.dashboard.get.queryOptions().queryKey,
        );
        if (
          sources.some((source) => {
            const previous = current?.calendarSources.find((item) => item.id === source.id);
            return (
              previous?.succeededAt !== source.succeededAt || previous?.error !== source.error
            );
          })
        ) {
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: orpc.dashboard.get.queryOptions().queryKey,
            }),
            queryClient.invalidateQueries({ queryKey: ["imported-events"] }),
          ]);
        }
      } catch {
        // The source status remains available in Settings; dashboard loading stays usable.
      } finally {
        syncInFlight.current = false;
      }
    };
    void syncDue();
    const timer = window.setInterval(() => void syncDue(), 60000);
    window.addEventListener("focus", syncDue);
    document.addEventListener("visibilitychange", syncDue);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", syncDue);
      document.removeEventListener("visibilitychange", syncDue);
    };
  }, [snapshot?.calendarSources.length, queryClient]);

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
  const title = navigation.find((item) => pathname === item.href)?.label ?? "Paramètres";
  const accountProps = {
    viewer,
    loggingOut,
    onNavigate: (href: string) =>
      guard.run(() => {
        setMenuOpen(false);
        setAccountOpen(false);
        setEditor(null);
        router.push(href);
      }),
    onLogout: () =>
      guard.run(() => {
        setAccountOpen(false);
        setMenuOpen(false);
        void logout();
      }),
  };

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message ?? "Réessaie dans un instant.");
      queryClient.clear();
      router.push("/connexion");
      router.refresh();
    } catch {
      toast.add({
        title: "La déconnexion a échoué",
        description: "Vérifie ta connexion et réessaie.",
        type: "error",
      });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <WorkspaceContext
      value={{
        snapshot,
        viewer,
        openEditor: setEditor,
        closeEditor: () => setEditor(null),
        requestCloseEditor: () => guard.run(() => setEditor(null)),
      }}
    >
      <a className="skip-link" href="#main-content">
        Aller au contenu
      </a>
      <div className="app-layout">
        <WorkspaceSidebar open={menuOpen} onOpenChange={setMenuOpen}>
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
          <div className="sidebar-bottom">
            <AccountMenu {...accountProps} />
          </div>
        </WorkspaceSidebar>
        <div className="main-column">
          <header className="app-topbar">
            <div className="flex items-center gap-3">
              <Button
                className="lg:hidden"
                variant="ghost"
                size="icon"
                aria-label="Ouvrir le menu"
                aria-expanded={menuOpen}
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
            </div>
          </header>
          <main id="main-content" className="app-content">
            {query.isError && (
              <Alert className="mb-5" variant="destructive">
                <AlertDescription>
                  {sessionExpired ? (
                    <>
                      Ta session a expiré. Reconnecte-toi dans un autre onglet pour conserver
                      ta saisie.{" "}
                      <a
                        href="/connexion"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Se reconnecter
                      </a>
                    </>
                  ) : (
                    <>
                      La connexion est interrompue. Les dernières données restent affichées.{" "}
                      <Button variant="link" onClick={() => void query.refetch()}>
                        Réessayer
                      </Button>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {children}
          </main>
          <footer className="app-footer">
            <span>Un peu d’organisation. Beaucoup d’espace pour toi.</span>
            <span>upnext.</span>
          </footer>
          <nav className="mobile-bottom-nav" aria-label="Navigation mobile">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn("mobile-nav-link", pathname === item.href && "active")}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                <item.icon />
                <span>{item.label}</span>
              </Link>
            ))}
            <button
              type="button"
              className={cn(
                "mobile-nav-link",
                (pathname === "/parametres" || accountOpen) && "active",
              )}
              aria-haspopup="dialog"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen(true)}
            >
              <UserRound />
              <span>Compte</span>
            </button>
          </nav>
        </div>
      </div>
      <AccountSheet {...accountProps} open={accountOpen} onOpenChange={setAccountOpen} />
      {editor && <EditorHost key={JSON.stringify(editor)} editor={editor} />}
    </WorkspaceContext>
  );
}
