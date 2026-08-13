'use client';

import { useState } from 'react';

interface AccordionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function Accordion({ title, defaultOpen = true, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="accordion">
      <button className="accordion-header" onClick={() => setOpen(!open)}>
        <span className={`accordion-arrow ${open ? 'accordion-arrow-open' : ''}`}>{'▸'}</span>
        <span>{title}</span>
      </button>
      <div className={`accordion-body ${open ? 'accordion-body-open' : ''}`}>
        {children}
      </div>
    </div>
  );
}
