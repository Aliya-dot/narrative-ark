import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

type NextCompatibleLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  href: string;
  children?: ReactNode;
  replace?: boolean;
};

export default function Link({
  href,
  replace,
  children,
  ...props
}: NextCompatibleLinkProps) {
  return (
    <RouterLink to={href} replace={replace} {...props}>
      {children}
    </RouterLink>
  );
}
