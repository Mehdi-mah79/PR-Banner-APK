import React from "react";
import { RouterProvider, useRouterState } from "./shims/router";
import { Providers } from "./components/Providers";
import { AppShell } from "./components/AppShell";

import DashboardPage from "./app/page";
import ArchivePage from "./app/banners/page";
import NewBannerPage from "./app/banners/new/page";
import BannerDetailPage from "./app/banners/[id]/page";
import EditBannerPage from "./app/banners/[id]/edit/page";
import RemindersPage from "./app/reminders/page";
import CalendarPage from "./app/calendar/page";
import CategoriesPage from "./app/categories/page";
import TrashPage from "./app/trash/page";
import BackupPage from "./app/backup/page";
import SettingsPage from "./app/settings/page";

function RouteRenderer() {
  const { pathname } = useRouterState();
  if (pathname === "/" || pathname === "") return <DashboardPage />;
  if (pathname === "/banners") return <ArchivePage />;
  if (pathname === "/banners/new") return <NewBannerPage />;
  if (/^\/banners\/[^/]+\/edit$/.test(pathname)) return <EditBannerPage />;
  if (/^\/banners\/[^/]+$/.test(pathname)) return <BannerDetailPage />;
  if (pathname === "/reminders") return <RemindersPage />;
  if (pathname === "/calendar") return <CalendarPage />;
  if (pathname === "/categories") return <CategoriesPage />;
  if (pathname === "/trash") return <TrashPage />;
  if (pathname === "/backup") return <BackupPage />;
  if (pathname === "/settings") return <SettingsPage />;
  return <DashboardPage />;
}

export default function App() {
  return (
    <RouterProvider>
      <Providers>
        <AppShell>
          <RouteRenderer />
        </AppShell>
      </Providers>
    </RouterProvider>
  );
}
