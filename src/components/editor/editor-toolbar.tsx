"use client";

import { type Editor } from "@tiptap/react";
import { useState } from "react";
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  ImageIcon,
  Link as LinkIcon,
  List,
  ListOrdered,
  Maximize2,
  Quote,
  Redo,
  SquareCode,
  Table2,
  Undo,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";

interface EditorToolbarProps {
  editor: Editor;
  onToggleFullscreen?: (e: React.MouseEvent) => void;
  isFullscreen?: boolean;
}

type ToolbarButton = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick: () => void;
};

function ToolbarGroup({
  title,
  items,
}: {
  title: string;
  items: ToolbarButton[];
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-border/70 bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Toggle
            key={item.label}
            size="sm"
            pressed={item.active}
            onPressedChange={() => item.onClick()}
            className="rounded-md border border-border/70 bg-background px-3 hover:bg-muted data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            aria-label={item.label}
          >
            <item.icon className="h-4 w-4" />
          </Toggle>
        ))}
      </div>
    </div>
  );
}

export function EditorToolbar({
  editor,
  onToggleFullscreen,
  isFullscreen,
}: EditorToolbarProps) {
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [url, setUrl] = useState("");
  const isTableActive = editor.isActive("table");

  const headingLevels = [2, 3, 4, 5, 6] as const;

  const headingItems: ToolbarButton[] = headingLevels.map((level) => ({
    label: `标题 ${level}`,
    icon:
      {
        2: Heading2,
        3: Heading3,
        4: Heading4,
        5: Heading5,
        6: Heading6,
      }[level] ?? Heading2,
    active: editor.isActive("heading", { level }),
    onClick: () => editor.chain().focus().toggleHeading({ level }).run(),
  }));

  const formatItems: ToolbarButton[] = [
    {
      label: "粗体",
      icon: Bold,
      active: editor.isActive("bold"),
      onClick: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "行内代码",
      icon: Code,
      active: editor.isActive("code"),
      onClick: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: "代码块",
      icon: SquareCode,
      active: editor.isActive("codeBlock"),
      onClick: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "无序列表",
      icon: List,
      active: editor.isActive("bulletList"),
      onClick: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "有序列表",
      icon: ListOrdered,
      active: editor.isActive("orderedList"),
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "引用",
      icon: Quote,
      active: editor.isActive("blockquote"),
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
    },
  ];

  function closeDialog() {
    setUrl("");
    setIsImageDialogOpen(false);
    setIsLinkDialogOpen(false);
    editor.commands.focus();
  }

  function handleImageSubmit() {
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
    closeDialog();
  }

  function handleLinkSubmit() {
    if (!url) return;
    editor.chain().focus().setLink({ href: url }).run();
    closeDialog();
  }

  return (
    <>
      <Card className="rounded-none border-x-0 border-t-0 border-b border-border/70 shadow-none">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">编辑器工具栏</p>
              <p className="mt-1 text-xs text-muted-foreground">
                先写内容，再做结构和媒体补充，表格工具单独放在下面。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => editor.chain().focus().undo().run()}
                disabled={!editor.can().undo()}
                aria-label="撤销"
                title="撤销"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => editor.chain().focus().redo().run()}
                disabled={!editor.can().redo()}
                aria-label="重做"
                title="重做"
              >
                <Redo className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant={isFullscreen ? "secondary" : "outline"}
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? "退出全屏" : "全屏编辑"}
                title={isFullscreen ? "退出全屏" : "全屏编辑"}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1fr_1.2fr_0.9fr]">
            <ToolbarGroup title="标题层级" items={headingItems} />
            <ToolbarGroup title="基础格式" items={formatItems} />
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                插入内容
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsImageDialogOpen(true)}
                >
                  <ImageIcon className="h-4 w-4" />
                  图片
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setIsLinkDialogOpen(true)}
                >
                  <LinkIcon className="h-4 w-4" />
                  链接
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                      .run()
                  }
                >
                  <Table2 className="h-4 w-4" />
                  表格
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                表格操作
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().addColumnAfter().run()}
              >
                添加列
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().deleteColumn().run()}
              >
                删除列
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().addRowAfter().run()}
              >
                添加行
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().deleteRow().run()}
              >
                删除行
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().toggleHeaderColumn().run()}
              >
                列标题
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().toggleHeaderRow().run()}
              >
                行标题
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={!isTableActive}
                onClick={() => editor.chain().focus().deleteTable().run()}
              >
                删除表格
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>插入图片</DialogTitle>
            <DialogDescription>输入图片 URL 后即可插入正文。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="editor-image-url">图片 URL</Label>
            <Input
              id="editor-image-url"
              type="url"
              inputMode="url"
              placeholder="https://example.com/image.webp"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleImageSubmit();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={closeDialog}>
              取消
            </Button>
            <Button type="button" onClick={handleImageSubmit}>
              插入图片
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>插入链接</DialogTitle>
            <DialogDescription>输入链接 URL 后即可添加超链接。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="editor-link-url">链接 URL</Label>
            <Input
              id="editor-link-url"
              type="url"
              inputMode="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleLinkSubmit();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={closeDialog}>
              取消
            </Button>
            <Button type="button" onClick={handleLinkSubmit}>
              插入链接
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
