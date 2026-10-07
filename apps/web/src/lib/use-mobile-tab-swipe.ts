"use client";

import { useRef, type TouchEvent } from "react";

type Gesture = {
  id: number;
  x: number;
  y: number;
  startedAt: number;
};

const controls =
  "input, textarea, select, button, a, [contenteditable]:not([contenteditable=false]), [role=slider], [role=combobox]";

export function useMobileTabSwipe(
  enabled: boolean,
  onSwipe: (direction: "next" | "previous") => void,
) {
  const gesture = useRef<Gesture | null>(null);

  function cancel() {
    gesture.current = null;
  }

  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      cancel();
      if (
        !enabled ||
        !window.matchMedia("(max-width: 767px)").matches ||
        event.touches.length !== 1 ||
        !(event.target instanceof Element) ||
        event.target.closest(controls) ||
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      )
        return;

      // Let nested horizontal scrollers handle their own gestures.
      for (let element = event.target; element !== event.currentTarget; ) {
        const { overflowX } = window.getComputedStyle(element);
        if (
          /^(auto|scroll)$/.test(overflowX) &&
          element.scrollWidth > element.clientWidth
        )
          return;
        if (!element.parentElement) break;
        element = element.parentElement;
      }

      const touch = event.touches[0];
      // Preserve the browser's back/forward gestures at the screen edges.
      if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
      gesture.current = {
        id: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        startedAt: event.timeStamp,
      };
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      const start = gesture.current;
      if (!start) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || touch.identifier !== start.id) {
        cancel();
        return;
      }
      const x = Math.abs(touch.clientX - start.x);
      const y = Math.abs(touch.clientY - start.y);
      // Once scrolling vertically, keep scrolling even if the finger drifts sideways.
      if (y > 10 && y >= x) cancel();
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const start = gesture.current;
      cancel();
      if (!start || !enabled || event.touches.length !== 0) return;
      const touch = Array.from(event.changedTouches).find(
        (touch) => touch.identifier === start.id,
      );
      if (!touch) return;
      const x = touch.clientX - start.x;
      const y = touch.clientY - start.y;
      if (
        Math.abs(x) >= 64 &&
        Math.abs(x) > Math.abs(y) * 1.5 &&
        event.timeStamp - start.startedAt <= 700
      )
        onSwipe(x < 0 ? "next" : "previous");
    },
    onTouchCancel: cancel,
  };
}
