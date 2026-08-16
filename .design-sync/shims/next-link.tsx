// design-sync shim: next/link outside the Next runtime. Renders a plain
// anchor; navigation props (prefetch, scroll, replace, shallow) are dropped.
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string | { pathname?: string };
  prefetch?: boolean;
  scroll?: boolean;
  replace?: boolean;
  shallow?: boolean;
  children?: ReactNode;
};

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, prefetch, scroll, replace, shallow, children, ...rest },
  ref
) {
  const resolved = typeof href === "string" ? href : (href?.pathname ?? "#");
  return (
    <a ref={ref} href={resolved} {...rest}>
      {children}
    </a>
  );
});

export default Link;

export function useLinkStatus() {
  return { pending: false };
}
