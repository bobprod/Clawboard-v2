import React, { useState, useRef, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface DropdownItem {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

export const Dropdown = ({ trigger, items }: { trigger: React.ReactNode, items: DropdownItem[] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(!isOpen); }} style={{ cursor: 'pointer' }}>
        {trigger}
      </div>
      
      {isOpen && (
        <div className="glass-panel" style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          right: 0,
          minWidth: '220px',
          padding: '6px',
          zIndex: 50,
          background: 'var(--bg-surface-elevated)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.6), 0 0 15px color-mix(in srgb, var(--brand-accent) 15%, transparent)',
          animation: 'pageFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex', flexDirection: 'column', gap: '2px'
        }}>
          {items.map((item, idx) => (
            <button key={idx} 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); item.onClick(); setIsOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '10px 14px',
                background: 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer',
                color: item.danger ? 'var(--status-error)' : 'var(--text-primary)',
                fontWeight: 500, fontSize: '14px', transition: 'all 0.2s',
                textAlign: 'left'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = item.danger ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.06)';
                e.currentTarget.style.transform = 'translateX(2px)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.transform = 'translateX(0)';
              }}
            >
              <item.icon size={16} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
