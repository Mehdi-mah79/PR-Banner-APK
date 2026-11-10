import React from "react";
import { useRouterState } from "./router";

export interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children?: React.ReactNode;
}

export default function Link({ href, onClick, children, ...rest }: LinkProps) {
  const { navigate } = useRouterState();
  return (
    <a
      href={`#${href}`}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) {
          e.preventDefault();
          navigate(href);
        }
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
