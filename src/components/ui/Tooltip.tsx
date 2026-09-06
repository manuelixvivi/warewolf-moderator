"use client";
import { useState, useRef, useEffect } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export default function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setShow(false);
      }
    };
    if (show) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [show]);

  return (
    <div className="relative inline-block" ref={ref}>
      <div onClick={() => setShow(!show)}>{children}</div>
      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-gray-800 border border-gray-600 rounded-lg p-3 shadow-xl text-sm text-gray-200 leading-relaxed">
          <div className="font-semibold text-purple-400 mb-1">📖 Deskripsi Role</div>
          <p className="whitespace-pre-wrap">{content}</p>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-8 border-transparent border-t-gray-800" />
        </div>
      )}
    </div>
  );
}