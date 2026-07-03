"use client";

import { useRef } from "react";
import { Bold, Heading2, Link2, List, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type MarkdownEditorProps = {
  content: string;
  onChange: (content: string) => void;
  minHeightClassName?: string;
};

const snippets = [
  {
    label: "小标题",
    icon: Heading2,
    text: "\n\n## 小标题\n\n",
  },
  {
    label: "加粗",
    icon: Bold,
    text: "**重点内容**",
  },
  {
    label: "链接",
    icon: Link2,
    text: "[链接文字](https://example.com)",
  },
  {
    label: "列表",
    icon: List,
    text: "\n\n- 要点一\n- 要点二\n- 要点三\n\n",
  },
  {
    label: "表格",
    icon: Table2,
    text:
      "\n\n| 套餐 | CPU | 内存 | 硬盘 | 流量 | 价格 |\n| --- | --- | --- | --- | --- | --- |\n| 示例 | 2 核 | 2GB | 40GB SSD | 1TB | $5/月 |\n\n",
  },
];

export function MarkdownEditor({
  content,
  onChange,
  minHeightClassName = "min-h-[560px]",
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function insertSnippet(text: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${content}${text}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextContent = `${content.slice(0, start)}${text}${content.slice(end)}`;
    onChange(nextContent);

    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + text.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="overflow-hidden rounded-md border border-border/70 bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/20 px-3 py-2">
        {snippets.map((snippet) => {
          const Icon = snippet.icon;
          return (
            <Button
              key={snippet.label}
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => insertSnippet(snippet.text)}
            >
              <Icon className="size-3.5" />
              {snippet.label}
            </Button>
          );
        })}
      </div>
      <Textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        className={`${minHeightClassName} rounded-none border-0 font-mono text-sm leading-7 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0`}
        placeholder={[
          "使用 Markdown 编写正文：",
          "",
          "## 小标题",
          "",
          "正文段落，支持 [链接文字](https://example.com)。",
          "",
          "| 套餐 | 配置 | 价格 |",
          "| --- | --- | --- |",
          "| 示例 | 2核 2G | $5/月 |",
        ].join("\n")}
      />
    </div>
  );
}
