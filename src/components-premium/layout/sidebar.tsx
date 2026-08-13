'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib-premium/cn';

const links = [
  { href: '/premium/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/premium/registrations', label: 'Registrations', icon: '👥' },
  { href: '/premium/audit', label: 'Audit Log', icon: '📋' },
  { href: '/premium/settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'bg-[var(--bg-surface-l1)] border-r border-[var(--bg-border)]',
        'flex flex-col h-screen transition-all duration-300',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      <div className="p-4 flex items-center justify-between">
        {!collapsed && <h1 className="text-lg font-bold">Evenregman</h1>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 hover:bg-[var(--bg-surface-l2)] rounded-lg transition-colors"
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 space-y-1">
        {links.map(link => (
          <Link key={link.href} href={link.href}>
            <div className="premium-nav-link flex items-center space-x-3">
              <span>{link.icon}</span>
              {!collapsed && <span>{link.label}</span>}
            </div>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-[var(--bg-border)]">
        <div className={cn(
          'text-xs text-[var(--text-muted)]',
          collapsed && 'text-center'
        )}>
          {collapsed ? 'v1' : 'Premium UI v1'}
        </div>
      </div>
    </aside>
  );
}
