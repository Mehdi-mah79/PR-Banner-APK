"use client";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BannerForm } from "@/components/BannerForm";

export default function EditBannerPage() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    return <div className="card text-danger">شناسه بنر نامعتبر است.</div>;
  }
  return (
    <>
      <PageHeader title="ویرایش بنر" subtitle="اطلاعات بنر و یادآورهای آن را در همین فرم تغییر دهید." />
      <BannerForm bannerId={id} />
    </>
  );
}
