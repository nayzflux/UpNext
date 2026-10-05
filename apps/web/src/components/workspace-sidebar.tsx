"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export function WorkspaceSidebar({
  children,
  open,
  onOpenChange,
}: {
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      setMobile(media.matches);
      if (!media.matches) onOpenChange(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [onOpenChange]);

  if (!mobile) return <aside className="app-sidebar">{children}</aside>;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="mobile-sidebar" showCloseButton={false}>
        <SheetTitle className="sr-only">Navigation principale</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
