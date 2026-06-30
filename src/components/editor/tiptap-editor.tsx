"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorToolbar } from "./editor-toolbar";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function TiptapEditor({ content, onChange }: TiptapEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [2, 3, 4, 5, 6],
          },
          link: false,
        }),
        Table.configure({
          resizable: true,
        }),
        TableCell,
        TableHeader,
        TableRow,
        Image,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "text-primary underline",
          },
        }),
      ],
      content: content,
      editorProps: {
        attributes: {
          class:
            "prose-zinc prose-sm dark:prose-invert lg:prose prose-a:text-blue-600 col-span-4 h-full w-full mx-auto",
        },
      },
      onUpdate: ({ editor }) => {
        onChange(editor.getHTML());
      },
      // 添加这个配置来解决 SSR 问题
      enableInputRules: false,
      enablePasteRules: false,
      immediatelyRender: false,
    },
    [],
  );

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-lg border-border/70 bg-background shadow-sm",
        isFullscreen ? "fixed inset-0 z-50 rounded-none" : "min-h-[80vh]",
      )}
    >
      <EditorToolbar
        editor={editor}
        isFullscreen={isFullscreen}
        onToggleFullscreen={(e) => {
          e.preventDefault();
          setIsFullscreen(!isFullscreen);
        }}
      />
      <CardContent className="h-[calc(100%-252px)] overflow-y-auto px-5 py-4 md:px-6">
        <EditorContent editor={editor} className="h-full" />
      </CardContent>
    </Card>
  );
}
