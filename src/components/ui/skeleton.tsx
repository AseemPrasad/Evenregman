"use client";

import React from "react";

export default function Skeleton({ className = "", width = "100%", height = 16 }: { className?: string; width?: string; height?: number | string }) {
  const style: React.CSSProperties = { width, height };

  return <span className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}
