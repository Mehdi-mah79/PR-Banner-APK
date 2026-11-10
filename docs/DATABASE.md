# معماری پایگاه‌داده آفلاین (Database Architecture)

تمام داده‌ها در پایگاه‌دادهٔ محلی `IndexedDB` (`pr_banner_manager_offline_db`) روی دستگاه ذخیره می‌شوند:
- جداول منطقی: `banners`، `categories`، `tags`، `bannerTags`، `reminders`، `reminderHistory`، `usageHistory`، `images`، `settings` و `backupLog`.
- تصاویر اصلی به صورت آرایهٔ باینری (`Uint8Array`) به همراه هش `SHA-256` و تصویر بندانگشتی (Thumbnail) ذخیره می‌شوند تا فهرست بایگانی بدون افت سرعت بارگذاری شود.
