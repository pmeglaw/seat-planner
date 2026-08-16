// design-sync shim: next/navigation outside the Next runtime. Static values —
// previews render one route state; router methods are inert no-ops.
export function usePathname(): string {
  return "/";
}

const router = {
  push: (_href: string) => {},
  replace: (_href: string) => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: (_href: string) => {}
};

export function useRouter() {
  return router;
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function redirect(_href: string): never {
  throw new Error("redirect() is a no-op in design-sync previews");
}
