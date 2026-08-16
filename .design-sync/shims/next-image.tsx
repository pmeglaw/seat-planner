// design-sync shim: next/image outside the Next runtime. Plain <img>;
// optimizer-only props are dropped, `fill` maps to absolute-position cover.
import { forwardRef } from "react";
import type { CSSProperties, ImgHTMLAttributes } from "react";

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  unoptimized?: boolean;
  placeholder?: string;
  blurDataURL?: string;
  loader?: unknown;
};

const fillStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover"
};

const Image = forwardRef<HTMLImageElement, ImageProps>(function Image(
  { src, fill, priority, quality, unoptimized, placeholder, blurDataURL, loader, style, ...rest },
  ref
) {
  const resolved = typeof src === "string" ? src : src?.src;
  return (
    <img
      ref={ref}
      src={resolved}
      style={fill ? { ...fillStyle, ...style } : style}
      {...rest}
    />
  );
});

export default Image;
