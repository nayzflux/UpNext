"use client";

import { Menu } from "@base-ui/react/menu";
import { ChevronsUpDown, LogOut, Settings2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

type AccountProps = {
  viewer: { name: string; email: string };
  onNavigate: (href: string) => void;
  onLogout: () => void;
  loggingOut: boolean;
};

const links = [
  { label: "Mon compte", href: "/parametres#compte", icon: UserRound },
  { label: "Paramètres", href: "/parametres", icon: Settings2 },
];

export function AccountMenu({ viewer, onNavigate, onLogout, loggingOut }: AccountProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            className="profile-row h-auto w-full justify-start whitespace-normal text-left"
            aria-label="Ouvrir le menu du compte"
          />
        }
      >
        <span className="profile-avatar shrink-0">
          {viewer.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{viewer.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{viewer.email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8} className="z-50">
          <Menu.Popup className="account-popup">
            <div className="border-b px-3 py-2">
              <p className="font-semibold">{viewer.name}</p>
              <p className="max-w-64 break-all text-xs text-muted-foreground">
                {viewer.email}
              </p>
            </div>
            {links.map((item) => (
              <Menu.Item
                key={item.href}
                className="account-action"
                onClick={() => onNavigate(item.href)}
              >
                <item.icon className="size-4" />
                {item.label}
              </Menu.Item>
            ))}
            <Menu.Item
              className="account-action text-destructive"
              disabled={loggingOut}
              onClick={onLogout}
            >
              <LogOut className="size-4" />
              {loggingOut ? "Déconnexion…" : "Se déconnecter"}
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function AccountSheet({
  viewer,
  onNavigate,
  onLogout,
  loggingOut,
  open,
  onOpenChange,
}: AccountProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl p-6 pb-[max(24px,env(safe-area-inset-bottom))]"
      >
        <SheetTitle>Compte</SheetTitle>
        <SheetDescription className="break-all">
          {viewer.name} · {viewer.email}
        </SheetDescription>
        <div className="flex flex-col gap-2">
          {links.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              className="min-h-11 justify-start"
              onClick={() => onNavigate(item.href)}
            >
              <item.icon data-icon="inline-start" />
              {item.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            className="min-h-11 justify-start text-destructive"
            disabled={loggingOut}
            onClick={onLogout}
          >
            <LogOut data-icon="inline-start" />
            {loggingOut ? "Déconnexion…" : "Se déconnecter"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
