// next/link: a plain <a> with the route in the hash (see navigation.ts).
import { forwardRef, type AnchorHTMLAttributes } from 'react';

import { navigate, toHash } from './navigation';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string; prefetch?: boolean; replace?: boolean; scroll?: boolean };

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, prefetch: _p, replace, scroll = true, onClick, ...rest }, ref) {
  return (
    <a
      ref={ref}
      href={toHash(href)}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target || !href.startsWith('/')) return;
        e.preventDefault();
        navigate(href, replace);
        if (scroll) scrollTo({ top: 0 });
      }}
      {...rest}
    />
  );
});
export default Link;
