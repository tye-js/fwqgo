"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorToolbar } from "./editor-toolbar";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

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
    [content],
  );

  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "relative h-full border",
        isFullscreen && "fixed inset-0 z-50 bg-background",
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
      <div className="h-full *:overflow-y-auto">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}
