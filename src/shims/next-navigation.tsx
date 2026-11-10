import { useRouterState } from "./router";

export function usePathname(): string {
  return useRouterState().pathname;
}

export function useRouter() {
  const { navigate } = useRouterState();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href),
    back: () => window.history.back(),
  };
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  const { pathname } = useRouterState();
  const mEdit = pathname.match(/^\/banners\/([^/]+)\/edit$/);
  if (mEdit) return { id: mEdit[1] } as unknown as T;
  const mDetail = pathname.match(/^\/banners\/([^/]+)$/);
  if (mDetail) return { id: mDetail[1] } as unknown as T;
  return {} as T;
}

export function notFound(): never {
  throw new Error("صفحه مورد نظر یافت نشد.");
}
