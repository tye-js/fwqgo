"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorToolbar } from "./editor-toolbar";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
}

export function TiptapEditor({ content, onChange }: TiptapEditorProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3, 4, 5, 6],
        },
      }),
      Image,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
    ],
    content,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm lg:prose mx-auto focus:outline-none h-full w-full",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    // 添加这个配置来解决 SSR 问题
    enableInputRules: false,
    enablePasteRules: false,
    immediatelyRender: false,
  });

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
