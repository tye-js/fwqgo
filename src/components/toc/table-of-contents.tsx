"use client";
import { generateToc } from "@fwqgo/core/toc";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface TableOfContentsProps {
  content: string;
  label?: string;
}

export function TableOfContents({
  content,
  label = "本文目录",
}: TableOfContentsProps) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const toc = useMemo(() => generateToc(content), [content]);

  useEffect(() => {
    if (!toc.length) return;

    const headings = toc
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element));

    if (!headings.length) return;

    const updateCurrentHeading = () => {
      const offset = 112;
      const currentHeading =
        [...headings]
          .reverse()
          .find((heading) => heading.getBoundingClientRect().top <= offset) ??
        headings[0];

      if (!currentHeading) return;
      setCurrentId(currentHeading.id);
    };

    updateCurrentHeading();
    window.addEventListener("scroll", updateCurrentHeading, { passive: true });
    window.addEventListener("resize", updateCurrentHeading);

    return () => {
      window.removeEventListener("scroll", updateCurrentHeading);
      window.removeEventListener("resize", updateCurrentHeading);
    };
  }, [toc]);

  if (!toc.length) return null;

  const handleClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    e.preventDefault();
    const targetId = href.replace("#", "");
    setCurrentId(targetId);
    const element = document.getElementById(targetId);

    if (element) {
      const topOffset = 80; // 顶部预留空间，可以根据需要调整
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - topOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
  };

  return (
    <nav
      className="toc max-h-[calc(100dvh-170px)] overflow-y-auto pr-1"
      aria-label={label}
    >
      <ul className="space-y-1.5">
        {toc.map((item) => (
          <li
            key={item.id}
            style={{ paddingLeft: `${(item.level - 2) * 0.85}rem` }}
          >
            <Link
              href={`#${item.id}`}
              onClick={(e) => handleClick(e, `#${item.id}`)}
              className={`block rounded-md border-l-2 px-3 py-2 text-sm leading-6 transition-colors ${
                currentId === item.id
                  ? "border-accent bg-accent/10 font-medium text-accent"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
