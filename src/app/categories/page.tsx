"use client";
import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmDialog, EmptyState, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { useToast } from "@/components/Providers";
import { api, errMsg, useFetch } from "@/lib/client";
import { fa } from "@/lib/format";

interface Item {
  id: number;
  name: string;
  count: number;
}

export default function CategoriesPage() {
  return (
    <>
      <PageHeader title="دسته‌ها و برچسب‌ها" subtitle="بنرها را برای پیدا کردن سریع‌تر سازمان‌دهی کنید." />
      <div className="grid gap-5 md:grid-cols-2">
        <Manager
          title="دسته‌بندی‌ها"
          url="/api/categories"
          noun="دسته‌بندی"
          select={(d: { categories: Item[]; uncategorized: number }) => d.categories}
          extra={(d: { uncategorized: number }) => `بنرهای بدون دسته: ${fa(d.uncategorized)}`}
          deleteNote="بنرهای این دسته حذف نمی‌شوند و به حالت «بدون دسته» درمی‌آیند."
        />
        <Manager title="برچسب‌ها" url="/api/tags" noun="برچسب" select={(d: Item[]) => d} deleteNote="برچسب فقط از بنرها برداشته می‌شود؛ خود بنرها حذف نمی‌شوند." />
      </div>
    </>
  );
}

function Manager<T>({
  title,
  url,
  noun,
  select,
  extra,
  deleteNote,
}: {
  title: string;
  url: string;
  noun: string;
  select: (d: T) => Item[];
  extra?: (d: T) => string;
  deleteNote: string;
}) {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch<T>(url);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [del, setDel] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!name.trim()) return toast(`نام ${noun} را وارد کنید.`, "error");
    try {
      await api(url, { method: "POST", json: { name } });
      setName("");
      toast(`${noun} افزوده شد.`);
      reload();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }
  async function rename() {
    if (!editing) return;
    try {
      await api(`${url}/${editing.id}`, { method: "PUT", json: { name: editing.name } });
      setEditing(null);
      toast("نام تغییر کرد.");
      reload();
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }
  async function remove() {
    if (!del) return;
    setBusy(true);
    try {
      await api(`${url}/${del.id}`, { method: "DELETE" });
      toast(`${noun} حذف شد.`);
      setDel(null);
      reload();
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const items = data ? select(data) : [];
  return (
    <section className="card">
      <h2 className="mb-3 font-bold text-gold">{title}</h2>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input className="input bidi" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={`${noun} جدید`} aria-label={`نام ${noun} جدید`} />
        <button className="btn btn-gold" type="submit">
          <Plus size={16} /> افزودن
        </button>
      </form>
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState title={`هنوز ${noun}ی ثبت نشده است`} />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 py-2">
              {editing?.id === i.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename();
                  }}
                >
                  <input autoFocus className="input bidi" value={editing.name} onChange={(e) => setEditing({ id: i.id, name: e.target.value })} aria-label="نام جدید" />
                  <button className="btn btn-gold btn-sm" type="submit" aria-label="ذخیره">
                    <Check size={16} />
                  </button>
                  <button className="btn btn-sm" type="button" onClick={() => setEditing(null)} aria-label="انصراف">
                    <X size={16} />
                  </button>
                </form>
              ) : (
                <>
                  <span className="bidi min-w-0 flex-1 truncate">{i.name}</span>
                  <span className="chip">{fa(i.count)} بنر</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: i.id, name: i.name })} aria-label={`تغییر نام ${i.name}`}>
                    <Pencil size={15} />
                  </button>
                  <button className="btn btn-ghost btn-sm text-danger" onClick={() => setDel(i)} aria-label={`حذف ${i.name}`}>
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && extra && <p className="mt-3 text-xs text-muted">{extra(data as never)}</p>}
      <ConfirmDialog
        open={!!del}
        title={`حذف ${noun}`}
        message={
          <>
            «{del?.name}» ({fa(del?.count ?? 0)} بنر) حذف شود؟ <br />
            <span className="text-muted">{deleteNote}</span>
          </>
        }
        confirmLabel="حذف"
        danger
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDel(null)}
      />
    </section>
  );
}
