"use client";
import { generateToc } from "@/lib/toc";
import Link from "next/link";
import { useState } from "react";
import { NotebookText } from "lucide-react";
interface TableOfContentsProps {
  content: string;
}

export function TableOfContents({ content }: TableOfContentsProps) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const toc = generateToc(content);
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
    <nav className="toc py-1">
      <h3 className="flex items-center gap-2 px-1 text-sm font-medium text-foreground">
        <NotebookText className="size-4 text-accent" />
        目录
      </h3>
      <ul className="mt-4 space-y-1.5">
        {toc.map((item) => (
          <li
            key={item.text}
            style={{ paddingLeft: `${(item.level - 2) * 0.85}rem` }}
          >
            <Link
              href={`#${item.id}`}
              onClick={(e) => handleClick(e, `#${item.id}`)}
              className={`block rounded-xl px-3 py-2 text-sm leading-6 transition-colors ${
                currentId === item.id
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
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
