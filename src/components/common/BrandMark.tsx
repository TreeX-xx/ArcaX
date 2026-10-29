import mark from '@/brand/mark.json';

interface BrandMarkProps { size?: number; className?: string; }

/** Two cut strokes form an X; the open seam stays legible at small sizes. */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  return <svg width={size} height={size} viewBox={mark.viewBox} fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true" focusable="false">
    <path d={mark.path} />
  </svg>;
}
export function BrandWordmark({ size = 26 }: { size?: number }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}><BrandMark size={size} /><span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.5px', lineHeight: 1 }}>ArcaX</span></span>;
}
