'use client';

import { useState } from 'react';

interface AccordionProps {
  title: string;
  defaultOpen?: boolean;
  headerAccessory?: React.ReactNode;
  children: React.ReactNode;
}

export default function Accordion({ title, defaultOpen = true, headerAccessory, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="accordion">
      <button className="accordion-header" onClick={() => setOpen(!open)}>
        <span className={`accordion-arrow ${open ? 'accordion-arrow-open' : ''}`}>{'▸'}</span>
        <span>{title}</span>
        {headerAccessory}
      </button>
      <div className={`accordion-body ${open ? 'accordion-body-open' : ''}`}>
        {children}
      </div>
    </div>
  );
}
