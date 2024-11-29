import { generateToc } from "@/lib/toc";
import Link from "next/link";

interface TableOfContentsProps {
  content: string;
}

export function TableOfContents({ content }: TableOfContentsProps) {
  const toc = generateToc(content);
  if (!toc.length) return null;
  return (
    <nav className="toc">
      <ul className="space-y-2">
        {toc.map((item) => (
          <li
            key={item.id}
            style={{ paddingLeft: `${(item.level - 1) * 1}rem` }}
          >
            <Link href={`#${item.id}`}>{item.text}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
