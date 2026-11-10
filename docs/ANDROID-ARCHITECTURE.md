# معماری اندروید (Android Architecture)

این برنامه از معماری **Offline-First Single Page Application (SPA)** در بستر **Capacitor 6** بهره می‌برد:
- مسیریابی داخلی بر پایهٔ Hash Router (`src/shims/router.tsx`) طراحی شده تا در محیط WebView اندروید هیچ‌گونه خطای 404 رخ ندهد.
- اسکریپت `scripts/prepare-android.mjs` مجوزهای `POST_NOTIFICATIONS`، `SCHEDULE_EXACT_ALARM`، `RECEIVE_BOOT_COMPLETED` و `VIBRATE` را در `AndroidManifest.xml` ثبت می‌کند.
