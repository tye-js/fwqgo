"use client";

import { type Editor } from "@tiptap/react";

import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  SquareCode,
  Redo,
  Undo,
  ImageIcon,
  Link,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Maximize2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";

interface EditorToolbarProps {
  editor: Editor;
  onToggleFullscreen?: (e: React.MouseEvent) => void;
  onTogglePreview?: (e: React.MouseEvent) => void;
  isFullscreen?: boolean;
  isPreview?: boolean;
}

export function EditorToolbar({
  editor,
  onToggleFullscreen,
  isFullscreen,
}: EditorToolbarProps) {
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [url, setUrl] = useState("");

  const handleImageSubmit = () => {
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
      setUrl("");
      setIsImageDialogOpen(false);
    }
  };

  const handleLinkSubmit = () => {
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
      setUrl("");
      setIsLinkDialogOpen(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 border-b p-2">
        {/* 标题按钮组 */}
        <div className="flex gap-1 border-r pr-2">
          {/* 重复类似的Toggle组件用于h2-h6 */}
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 2 })}
            onPressedChange={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Heading2 className="h-4 w-4" />
          </Toggle>
          {/* ... h3-h6 类似 ... */}
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 3 })}
            onPressedChange={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Heading3 className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 4 })}
            onPressedChange={() =>
              editor.chain().focus().toggleHeading({ level: 4 }).run()
            }
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Heading4 className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 5 })}
            onPressedChange={() =>
              editor.chain().focus().toggleHeading({ level: 5 }).run()
            }
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Heading5 className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("heading", { level: 6 })}
            onPressedChange={() =>
              editor.chain().focus().toggleHeading({ level: 6 }).run()
            }
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Heading6 className="h-4 w-4" />
          </Toggle>
        </div>

        {/* 格式化按钮组 */}
        <div className="flex gap-1 border-r pr-2">
          <Toggle
            size="sm"
            pressed={editor.isActive("bold")}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Bold className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("italic")}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Italic className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("code")}
            onPressedChange={() => editor.chain().focus().toggleCode().run()}
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Code className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive("codeBlock")}
            onPressedChange={() =>
              editor.chain().focus().toggleCodeBlock().run()
            }
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <SquareCode className="h-4 w-4" />
          </Toggle>

          <Toggle
            size="sm"
            pressed={editor.isActive("bulletList")}
            onPressedChange={() =>
              editor.chain().focus().toggleBulletList().run()
            }
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <List className="h-4 w-4" />
          </Toggle>

          <Toggle
            size="sm"
            pressed={editor.isActive("orderedList")}
            onPressedChange={() =>
              editor.chain().focus().toggleOrderedList().run()
            }
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <ListOrdered className="h-4 w-4" />
          </Toggle>

          <Toggle
            size="sm"
            pressed={editor.isActive("blockquote")}
            onPressedChange={() =>
              editor.chain().focus().toggleBlockquote().run()
            }
            className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
          >
            <Quote className="h-4 w-4" />
          </Toggle>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <Undo className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <Redo className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault();
            setIsImageDialogOpen(true);
          }}
          className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.preventDefault();
            setIsLinkDialogOpen(true);
          }}
          className="hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <Link className="h-4 w-4" />
        </Button>
        {/* 视图控制按钮组 */}
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={isFullscreen ? "secondary" : "ghost"}
            onClick={onToggleFullscreen}
            className="hover:bg-muted"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>插入图片</DialogTitle>
            <DialogDescription>输入图片URL，然后按回车键确认</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="输入图片URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleImageSubmit();
              }
            }}
          />
          <DialogFooter>
            <Button onClick={handleImageSubmit}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>插入链接</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="输入链接URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleLinkSubmit();
              }
            }}
          />
          <DialogFooter>
            <Button onClick={handleLinkSubmit}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
