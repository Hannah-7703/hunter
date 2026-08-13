'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const pathname = usePathname();

  const items = [
    {
      label: '记录',
      href: '/',
      icon: (
        <span className="bottom-nav-sprout" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path fill="currentColor" d="M11.2 13.5C7.6 13.4 5.4 11.2 5.4 7.6c3.6 0 5.8 2.2 5.8 5.9Z" />
            <path fill="currentColor" d="M12.5 12.9c.1-2.9 1.9-4.7 4.8-4.8-.1 2.9-1.9 4.7-4.8 4.8Z" />
            <path fill="currentColor" d="M11.2 12.5h1.6V20h-1.6z" />
          </svg>
        </span>
      ),
    },
    {
      label: '脑图',
      href: '/mindmap',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="2.5"/><circle cx="19" cy="18" r="2.5"/><circle cx="5" cy="18" r="2.5"/><line x1="12" y1="7.5" x2="17.5" y2="16"/><line x1="12" y1="7.5" x2="6.5" y2="16"/>
        </svg>
      ),
    },
    {
      label: '历史',
      href: '/history',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
    },
  ];

  return (
    <nav className="bottom-nav">
      {items.map(item => (
        <Link
          key={item.href}
          href={item.href}
          className={`bottom-nav-item ${pathname === item.href ? 'active' : ''}`}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
