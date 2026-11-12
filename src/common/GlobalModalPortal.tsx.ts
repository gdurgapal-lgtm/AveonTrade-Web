"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface GlobalModalPortalProps {
  children: React.ReactNode;
}

export default function GlobalModalPortal({ children }: GlobalModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted) return null;

  return createPortal(children, document.body);
}