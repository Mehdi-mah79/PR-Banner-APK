# راهنمای ساخت و تولید فایل APK در گیت‌هاب

## روش اول: ساخت خودکار در GitHub Actions (بدون نیاز به نصب برنامه روی کامپیوتر)
1. محتویات پوشهٔ استخراج‌شده از فایل زیپ را در مخزن گیت‌هاب خود آپلود کنید.
2. اطمینان حاصل کنید که فایل `.github/workflows/android-build.yml` در مخزن قرار گرفته است.
3. به تب **Actions** در مخزن گیت‌هاب خود بروید.
4. ورک‌فلوی **Build Android APK (PR Banner Manager)** به‌صورت خودکار اجرا می‌شود (یا می‌توانید روی دکمهٔ **Run workflow** کلیک کنید).
5. پس از اتمام تیک سبز، در پایین صفحهٔ اجرای ورک‌فلو، از بخش **Artifacts** فایل **PR-Banner-Manager-debug-APK** را دانلود کنید.

## روش دوم: ساخت محلی روی کامپیوتر (اختیاری)
```bash
npm install
npm test
npm run build
npm run android:prepare
cd android && ./gradlew assembleDebug
```
