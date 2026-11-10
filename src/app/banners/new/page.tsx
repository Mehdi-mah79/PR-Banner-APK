import { PageHeader } from "@/components/ui";
import { BannerForm } from "@/components/BannerForm";

export default function NewBannerPage() {
  return (
    <>
      <PageHeader title="ثبت بنر جدید" subtitle="بنر، مناسبت و یادآورها را در یک فرم و یک مرحله ثبت کنید." />
      <BannerForm />
    </>
  );
}
