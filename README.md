# PR Banner Manager

A **100% offline Android application** designed to organize, archive, search, and manage public relations banners and events.

Built with **React + Vite + Capacitor + IndexedDB**, featuring native Android notifications powered by `@capacitor/local-notifications`.

## Key Features

- **Fully Offline – No Server Required:** All banner records, categories, tags, reminders, and original images are stored transactionally in the device's persistent storage using IndexedDB.

- **Native Android Notifications and Alarms:** Integrated with `@capacitor/local-notifications` to deliver scheduled notifications at the designated time, even when the application is closed, subject to Android notification and scheduling permissions.

- **Accurate Persian (Jalali) Calendar:** Full support for leap years, a Persian calendar date picker, and automatic calculation of upcoming occasions and events.

- **Complete Backup and Restore (ZIP / JSON / CSV):** Creates ZIP backup packages containing original images and a `manifest.json` file with SHA-256 integrity hashes.

- **Automated APK Builds with GitHub Actions:** Includes an automated CI/CD workflow at `.github/workflows/android-build.yml`. It builds the Android APK without requiring Android Studio to be installed on your local computer and publishes the generated APK as a downloadable GitHub Actions Artifact.

## Technology Stack

- React
- TypeScript
- Vite
- Capacitor
- IndexedDB
- Capacitor Local Notifications
- GitHub Actions
- Android SDK and Gradle

## Privacy and Data Security

PR Banner Manager is designed with an offline-first architecture. Application data is stored locally on the user's device, without requiring a remote server or continuous internet connection.

## Build and Deployment

The project uses GitHub Actions to automate the Android APK build process. Once the workflow completes successfully, the generated APK is available for download from the workflow's Artifacts section.

## Project Goal

The goal of PR Banner Manager is to provide a reliable, accessible, and efficient tool for public relations professionals and organizations to manage their visual communication materials, organize important events, and receive timely reminders.
