import type { ImgHTMLAttributes } from "react";

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  sizes?: string;
};

/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
export default function Image({ priority, ...rest }: Props) {
  void priority;
  return <img {...rest} />;
}
