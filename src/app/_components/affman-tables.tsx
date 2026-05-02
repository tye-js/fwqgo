"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  addAffProvider,
  deleteAffProvider,
  deleteAffProviders,
  updateAffProvider,
} from "../_actions/aff-provider";
import { AdminTableEmpty, AdminTableWorkbench } from "@/app/_components/admin-table-workbench";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { type AffManData } from "@/types";

export default function AffManTable({ data }: { data: AffManData[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortValue, setSortValue] = useState("id-desc");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [affUrl, setAffUrl] = useState("");
  const [affParam, setAffParam] = useState("");
  const [affValue, setAffValue] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [isDelete, setIsDelete] = useState(false);
  const [isSave, setIsSave] = useState(false);
  const [isAdd, setIsAdd] = useState(false);
  const [isAddSave, setIsAddSave] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const filteredData = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return data.filter((item) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.officialUrl.toLowerCase().includes(normalizedQuery);

      const matchesFilter =
        filter === "all" ||
        (filter === "with-aff" && item.affUrl.trim().length > 0) ||
        (filter === "empty-aff" && item.affUrl.trim().length === 0);

      return matchesQuery && matchesFilter;
    });
  }, [data, filter, query]);

  const sortedData = useMemo(() => {
    const [sortKey, sortDirection] = sortValue.split("-");
    const direction = sortDirection === "asc" ? 1 : -1;
    const result = [...filteredData];

    result.sort((left, right) => {
      if (sortKey === "name") {
        return left.name.localeCompare(right.name) * direction;
      }

      if (sortKey === "officialUrl") {
        return left.officialUrl.localeCompare(right.officialUrl) * direction;
      }

      return (left.id - right.id) * direction;
    });

    return result;
  }, [filteredData, sortValue]);

  const allFilteredSelected =
    sortedData.length > 0 &&
    sortedData.every((item) => selectedIds.includes(item.id));

  async function handleSave() {
    setIsSave(true);
    await updateAffProvider({
      id: editId!,
      name,
      affUrl,
      affParam,
      affValue,
      officialUrl,
    });
    setIsSave(false);
    setEditId(null);
    toast.success("返利商家已更新");
  }

  async function handleDelete(id: number) {
    setIsDelete(true);
    await deleteAffProvider(id);
    setIsDelete(false);
    setSelectedIds((prev) => prev.filter((item) => item !== id));
    toast.success("返利商家已删除");
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      toast.error("请先选择商家");
      return;
    }

    setIsBulkDeleting(true);
    const result = await deleteAffProviders(selectedIds);
    setIsBulkDeleting(false);

    if ("error" in result && typeof result.error === "string") {
      toast.error(result.error);
      return;
    }

    toast.success(`已删除 ${selectedIds.length} 个商家`);
    setSelectedIds([]);
  }

  async function handleAdd() {
    if (!name || !affUrl || !affParam || !affValue || !officialUrl) {
      toast.error("请填写完整信息");
      return;
    }

    setIsAddSave(true);
    await addAffProvider({
      name,
      affUrl,
      affParam,
      affValue,
      officialUrl,
    });
    setName("");
    setAffUrl("");
    setAffParam("");
    setAffValue("");
    setOfficialUrl("");
    setIsAddSave(false);
    setIsAdd(false);
    toast.success("返利商家已添加");
  }

  return (
    <div className="space-y-5">
      <AdminTableWorkbench
        title="返利商家工作台"
        description="支持按商家名和官网检索，快速维护返利参数，并进行批量删除。"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索商家名或官网域名"
        selectionCount={selectedIds.length}
        filterSlot={
          <div className="flex items-center gap-3">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-auto w-[140px] border-0 bg-transparent p-0 shadow-none focus:ring-0">
                <SelectValue placeholder="全部商家" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部商家</SelectItem>
                <SelectItem value="with-aff">已配置返利</SelectItem>
                <SelectItem value="empty-aff">空返利链接</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortValue} onValueChange={setSortValue}>
              <SelectTrigger className="h-auto w-[148px] border-0 bg-transparent p-0 shadow-none focus:ring-0">
                <SelectValue placeholder="排序方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id-desc">ID 从新到旧</SelectItem>
                <SelectItem value="id-asc">ID 从旧到新</SelectItem>
                <SelectItem value="name-asc">商家名 A-Z</SelectItem>
                <SelectItem value="officialUrl-asc">官网域名 A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        actionSlot={
          <Button
            variant="destructive"
            disabled={selectedIds.length === 0 || isBulkDeleting}
            onClick={handleBulkDelete}
          >
            <Trash2 className="size-4" />
            {isBulkDeleting ? "删除中..." : "批量删除"}
          </Button>
        }
      />

      <div className="rounded-2xl border border-border/70 bg-muted/20 p-5">
        <p className="text-sm font-medium text-foreground">添加商家</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          新增商家后，这里的返利配置会直接影响采集文章中的返利链接替换逻辑。
        </p>
        {isAdd ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_140px_140px_1fr_auto]">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="商家名" />
            <Input value={affUrl} onChange={(e) => setAffUrl(e.target.value)} placeholder="返利链接" />
            <Input value={affParam} onChange={(e) => setAffParam(e.target.value)} placeholder="返利参数" />
            <Input value={affValue} onChange={(e) => setAffValue(e.target.value)} placeholder="返利值" />
            <Input value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="商家官网" />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setIsAdd(false)}>
                取消
              </Button>
              <Button disabled={isAddSave} onClick={handleAdd}>
                {isAddSave ? "添加中..." : "添加"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Button variant="outline" onClick={() => setIsAdd(true)}>
              添加新商家
            </Button>
          </div>
        )}
      </div>

      {sortedData.length === 0 ? (
        <AdminTableEmpty
          title="没有匹配的商家"
          description="试试更换关键词，或者切换筛选项看看。"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={(checked) =>
                    setSelectedIds(Boolean(checked) ? sortedData.map((item) => item.id) : [])
                  }
                />
              </TableHead>
              <TableHead>ID</TableHead>
              <TableHead className="text-nowrap">商家名</TableHead>
              <TableHead className="text-nowrap">返利链接</TableHead>
              <TableHead className="text-nowrap">返利参数</TableHead>
              <TableHead className="text-nowrap">返利值</TableHead>
              <TableHead>商家官网</TableHead>
              <TableHead className="text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => (
              <TableRow key={item.id} className="hover:bg-muted/30">
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(item.id)}
                    onCheckedChange={(checked) =>
                      setSelectedIds((prev) =>
                        Boolean(checked)
                          ? [...prev, item.id]
                          : prev.filter((id) => id !== item.id),
                      )
                    }
                  />
                </TableCell>
                {editId === item.id ? (
                  <>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>
                      <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8" value={affUrl} onChange={(e) => setAffUrl(e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8" value={affParam} onChange={(e) => setAffParam(e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8" value={affValue} onChange={(e) => setAffValue(e.target.value)} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8" value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} />
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setEditId(null)}>
                          取消
                        </Button>
                        <Button disabled={isSave} size="sm" onClick={handleSave}>
                          {isSave ? "保存中..." : "保存"}
                        </Button>
                      </div>
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>{item.id}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="block truncate">{item.affUrl}</span>
                    </TableCell>
                    <TableCell>{item.affParam}</TableCell>
                    <TableCell>{item.affValue}</TableCell>
                    <TableCell className="max-w-[220px]">
                      <span className="block truncate text-muted-foreground">
                        {item.officialUrl}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditId(item.id);
                            setName(item.name);
                            setAffUrl(item.affUrl);
                            setAffParam(item.affParam);
                            setAffValue(item.affValue);
                            setOfficialUrl(item.officialUrl);
                          }}
                        >
                          编辑
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              删除
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>确定删除这个商家吗？</AlertDialogTitle>
                              <AlertDialogDescription>
                                删除后将无法恢复，当前商家为
                                <p className="mt-2 text-red-500">{item.name}</p>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(item.id)}>
                                {isDelete ? "删除中..." : "确定删除"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
