"use client";
import { useState, useRef, useEffect } from "react";

interface TooltipProps {
  content?: string;
  contentId?: string;
  contentEn?: string;
  roleName?: string;
  children: React.ReactNode;
}

export default function Tooltip({
  content,
  contentId,
  contentEn,
  roleName,
  children,
}: TooltipProps) {
  const [show, setShow] = useState(false);
  const [lang, setLang] = useState<"id" | "en">("id");
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

  const textId = contentId || content || "Tidak ada deskripsi.";
  const textEn = contentEn || content || "No description available.";

  return (
    <div className="relative inline-block" ref={ref}>
      <div onClick={() => setShow(!show)} className="cursor-pointer">{children}</div>
      {show && (
        <div className="absolute z-50 bottom-full right-0 sm:left-1/2 sm:-translate-x-1/2 mb-2 w-80 max-w-[90vw] bg-gray-900 border border-purple-500/60 rounded-xl p-3.5 shadow-2xl text-sm text-gray-200 leading-relaxed backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-gray-700/80 pb-2 mb-2 gap-2">
            <span className="font-bold text-purple-300 text-xs flex items-center gap-1.5 truncate">
              📖 {roleName || "Deskripsi Role"}
            </span>
            {/* Language toggle tabs */}
            <div className="flex bg-gray-800 rounded-lg p-0.5 text-xs font-semibold shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLang("id");
                }}
                className={`px-2 py-0.5 rounded transition-colors ${
                  lang === "id"
                    ? "bg-purple-600 text-white shadow"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                🇮🇩 ID
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLang("en");
                }}
                className={`px-2 py-0.5 rounded transition-colors ${
                  lang === "en"
                    ? "bg-purple-600 text-white shadow"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                🇬🇧 EN
              </button>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
            {lang === "id" ? textId : textEn}
          </p>
          <div className="hidden sm:block absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-8 border-transparent border-t-gray-900" />
        </div>
      )}
    </div>
  );
}
