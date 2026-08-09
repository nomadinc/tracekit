import Image from "next/image";
import type { CSSProperties } from "react";

export function BrandMark({ mark = "TK", assetSrc, accent, className = "" }: { mark?: string; assetSrc?: string; accent?: string; className?: string }) {
  const style = accent ? ({ "--brand-mark-accent": accent } as CSSProperties) : undefined;
  return <span aria-hidden="true" style={style} className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-blue-300/20 bg-[linear-gradient(145deg,var(--brand-mark-accent,var(--tk-brand-primary)),var(--tk-brand-secondary))] text-[13px] font-black tracking-[-.06em] text-white shadow-sm shadow-blue-950/20 ${className}`}>{assetSrc ? <Image src={assetSrc} alt="" fill sizes="40px" className="object-contain" /> : mark}</span>;
}

export function BrandAnchor({ productName, subtitle, mark = "TK", markAssetSrc, wordmarkAssetSrc, accent }: { productName: string; subtitle: string; mark?: string; markAssetSrc?: string; wordmarkAssetSrc?: string; accent?: string }) {
  return <span className="inline-flex min-w-0 items-center gap-3"><BrandMark mark={mark} assetSrc={markAssetSrc} accent={accent}/><span className="min-w-0">{wordmarkAssetSrc ? <span className="relative block h-5 w-28"><Image src={wordmarkAssetSrc} alt={productName} fill sizes="112px" className="object-contain object-left" /></span> : <span className="block truncate text-lg font-semibold tracking-[-.025em] text-slate-950 dark:text-white">{productName}</span>}<span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">{subtitle}</span></span></span>;
}
