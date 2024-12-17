"use client";
import { generateToc } from "@/lib/toc";
import Link from "next/link";
import { useState } from "react";
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
    <nav className="toc py-2">
      <ul className="space-y-2">
        {toc.map((item) => (
          <li
            key={item.text}
            style={{ paddingLeft: `${(item.level - 1) * 1}rem` }}
          >
            <Link
              href={`#${item.id}`}
              onClick={(e) => handleClick(e, `#${item.id}`)}
              className={currentId === item.id ? "text-primary" : ""}
            >
              {item.text}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
