export function Sk({ w = "6ch", h = "1em", style }: { w?: string | number; h?: string | number; style?: React.CSSProperties }) {
  return <span className="sk" aria-hidden="true" style={{ width: w, height: h, verticalAlign: "middle", ...style }} />;
}
