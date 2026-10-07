import { createElement, type TouchEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMobileTabSwipe } from "./use-mobile-tab-swipe";

class TestElement {
  parentElement: TestElement | null = null;
  scrollWidth = 100;
  clientWidth = 100;
  overflowX = "visible";
  control = false;
  closest() {
    return this.control ? this : null;
  }
}

function setup({ mobile = true, enabled = true, dialog = false } = {}) {
  vi.stubGlobal("Element", TestElement);
  vi.stubGlobal("window", {
    innerWidth: 390,
    matchMedia: () => ({ matches: mobile }),
    getComputedStyle: (element: TestElement) => ({ overflowX: element.overflowX }),
  });
  vi.stubGlobal("document", { querySelector: () => (dialog ? {} : null) });
  const onSwipe = vi.fn();
  let handlers!: ReturnType<typeof useMobileTabSwipe>;
  function Harness() {
    handlers = useMobileTabSwipe(enabled, onSwipe);
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  const main = new TestElement();
  const target = new TestElement();
  target.parentElement = main;
  const event = (x: number, y = 200, timeStamp = 100, count = 1) => {
    const touch = { identifier: 1, clientX: x, clientY: y };
    return {
      target,
      currentTarget: main,
      timeStamp,
      touches: Array.from({ length: count }, () => touch),
      changedTouches: [touch],
    } as unknown as TouchEvent<HTMLElement>;
  };
  const swipe = (from: number, to: number, endY = 205, duration = 200) => {
    handlers.onTouchStart(event(from));
    handlers.onTouchMove(event(to, endY, 200));
    handlers.onTouchEnd(event(to, endY, 100 + duration, 0));
  };
  return { handlers, onSwipe, event, swipe, target };
}

afterEach(() => vi.unstubAllGlobals());

describe("mobile tab swipe", () => {
  it("changes tabs in both directions, once per completed gesture", () => {
    const { handlers, onSwipe, swipe, event } = setup();
    swipe(280, 100);
    swipe(100, 280);
    handlers.onTouchEnd(event(280, 205, 400, 0));
    expect(onSwipe.mock.calls).toEqual([["next"], ["previous"]]);
  });

  it("ignores short, diagonal and slow gestures", () => {
    const { swipe, onSwipe } = setup();
    swipe(280, 240);
    swipe(280, 180, 280);
    swipe(280, 100, 205, 900);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("keeps a vertical scroll from becoming a swipe when the finger drifts", () => {
    const { handlers, event, onSwipe } = setup();
    handlers.onTouchStart(event(280));
    handlers.onTouchMove(event(278, 230, 150));
    handlers.onTouchMove(event(100, 235, 200));
    handlers.onTouchEnd(event(100, 235, 300, 0));
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("ignores multi-touch and cancelled gestures", () => {
    const { handlers, event, onSwipe } = setup();
    handlers.onTouchStart(event(280));
    handlers.onTouchMove(event(200, 200, 150, 2));
    handlers.onTouchEnd(event(100, 200, 300, 0));
    handlers.onTouchStart(event(280));
    handlers.onTouchCancel();
    handlers.onTouchEnd(event(100, 200, 300, 0));
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it.each([{ mobile: false }, { enabled: false }, { dialog: true }])(
    "ignores gestures when unavailable: %j",
    (options) => {
      const { swipe, onSwipe } = setup(options);
      swipe(280, 100);
      expect(onSwipe).not.toHaveBeenCalled();
    },
  );

  it("preserves controls and nested horizontal scrolling", () => {
    const { swipe, onSwipe, target } = setup();
    target.control = true;
    swipe(280, 100);
    target.control = false;
    target.overflowX = "auto";
    target.scrollWidth = 500;
    swipe(280, 100);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("preserves browser gestures starting at either screen edge", () => {
    const { swipe, onSwipe } = setup();
    swipe(10, 180);
    swipe(380, 100);
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
