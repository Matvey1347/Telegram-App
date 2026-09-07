"use client";

import {
  Children,
  type PropsWithChildren,
  isValidElement,
  useLayoutEffect,
  useRef,
} from "react";

export function MasonryGrid({
  children,
  className = "",
  itemClassName = "",
}: PropsWithChildren<{ className?: string; itemClassName?: string }>) {
  const gridRef = useRef<HTMLDivElement>(null);
  const itemCount = Children.count(children);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const contents = Array.from(
      grid.querySelectorAll<HTMLElement>("[data-masonry-content]"),
    );
    const updateSpan = (content: HTMLElement) => {
      const item = content.parentElement;
      if (!item) return;
      const span = Math.max(1, Math.ceil(content.getBoundingClientRect().height));
      item.style.gridRowEnd = `span ${span}`;
    };
    const updateAll = () => contents.forEach(updateSpan);

    updateAll();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateAll);
      return () => window.removeEventListener("resize", updateAll);
    }

    const observer = new ResizeObserver((entries) => {
      entries.forEach((entry) => updateSpan(entry.target as HTMLElement));
    });
    contents.forEach((content) => observer.observe(content));
    return () => observer.disconnect();
  }, [itemCount]);

  return (
    <div
      ref={gridRef}
      className={`grid grid-flow-row-dense grid-cols-1 gap-x-4 [grid-auto-rows:1px] md:grid-cols-2 xl:grid-cols-3 ${className}`}
    >
      {Children.map(children, (child, index) => (
        <MasonryGridItem
          key={
            isValidElement(child) && child.key != null
              ? String(child.key)
              : index
          }
          className={itemClassName}
        >
          {child}
        </MasonryGridItem>
      ))}
    </div>
  );
}

function MasonryGridItem({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={className}>
      <div data-masonry-content className="pb-4">
        {children}
      </div>
    </div>
  );
}
