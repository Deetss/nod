/**
 * Toolbar and state icons for the inline composer. GitHub-style 16px glyphs drawn as inline SVG,
 * so no icon package is needed. Each icon is decorative: the button around it carries the label.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Svg(p: IconProps & { d: string }) {
  const { d, ...rest } = p;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
      <path d={d} />
    </svg>
  );
}

export const HeadingIcon = (p: IconProps) => (
  <Svg {...p} d="M3 2.75a.75.75 0 0 1 1.5 0V7h7V2.75a.75.75 0 0 1 1.5 0v10.5a.75.75 0 0 1-1.5 0V8.5h-7v4.75a.75.75 0 0 1-1.5 0Z" />
);
export const BoldIcon = (p: IconProps) => (
  <Svg {...p} d="M4 2h4.5a3.25 3.25 0 0 1 2.1 5.73A3.5 3.5 0 0 1 9 14H4Zm1.5 1.5v3h3a1.75 1.75 0 0 0 0-3Zm0 4.5v3.5H9a2 2 0 0 0 0-4Z" />
);
export const ItalicIcon = (p: IconProps) => (
  <Svg {...p} d="M6 2h6v1.5h-2.2L7 12.5h2V14H3v-1.5h2.2L8 3.5H6Z" />
);
export const QuoteIcon = (p: IconProps) => (
  <Svg {...p} d="M2 3.5h2.5v3.2L3.6 9.5H5.5V13H2Zm6 0h2.5v3.2L9.6 9.5h1.9V13H8Z" />
);
export const CodeIcon = (p: IconProps) => (
  <Svg {...p} d="m4.7 4.2-3.5 3.8 3.5 3.8-1.1 1L.3 8l3.3-3.8ZM11.3 4.2l3.5 3.8-3.5 3.8 1.1 1L16 8l-3.6-3.8ZM9.6 2.3 6.4 13.7l-1-.3L8.6 2Z" />
);
export const LinkIcon = (p: IconProps) => (
  <Svg {...p} d="M7.8 3.4 9 2.2a3 3 0 1 1 4.2 4.2l-2.4 2.4a3 3 0 0 1-4.2 0l-.7-.7 1-1 .7.7a1.5 1.5 0 0 0 2.1 0l2.4-2.4a1.5 1.5 0 0 0-2.1-2.1l-1.2 1.2Zm.4 9.2-1.2 1.2a3 3 0 1 1-4.2-4.2l2.4-2.4a3 3 0 0 1 4.2 0l.7.7-1 1-.7-.7a1.5 1.5 0 0 0-2.1 0L4.1 10.2a1.5 1.5 0 0 0 2.1 2.1l1.2-1.2Z" />
);
export const BulletListIcon = (p: IconProps) => (
  <Svg {...p} d="M2 3.5h1.5V5H2Zm3 0h9v1.5H5ZM2 7.25h1.5v1.5H2Zm3 0h9v1.5H5ZM2 11h1.5v1.5H2Zm3 0h9v1.5H5Z" />
);
export const NumberListIcon = (p: IconProps) => (
  <Svg {...p} d="M2 2.5h1.2V6H2.6v-2.6H2Zm0 4.6h2v.9H2.6l1.4.9v.7H2v-.5h1.1l-.5-.4Zm.3 4.1h1.6v1H3.1v.6h.6v.6H2v-1.2h.6V11H2.3ZM5 3.5h9v1.5H5Zm0 3.75h9v1.5H5Zm0 3.75h9v1.5H5Z" />
);
export const TaskListIcon = (p: IconProps) => (
  <Svg {...p} d="M2 2.5h4v4H2Zm1.5 1.5v1h1v-1Zm0 5.5h4v4H2Zm1.5 1.5v1h1v-1Zm6.5-6.5h5v1.5h-5Zm0 4.25h5v1.5h-5Zm0 4.25h5v1.5h-5Z" />
);
export const MentionIcon = (p: IconProps) => (
  <Svg {...p} d="M8 1.5a6.5 6.5 0 1 0 3.2 12.15l-.7-1.3A5 5 0 1 1 13 8v.9c0 .9-.7 1.6-1.6 1.6-.6 0-1-.3-1.3-.8A3.2 3.2 0 1 1 11.2 5h1.3v3.9c0 .4.3.6.6.6.4 0 .6-.3.6-.6V8A6.5 6.5 0 0 0 8 1.5Zm0 4.5a1.7 1.7 0 1 0 0 3.4 1.7 1.7 0 0 0 0-3.4Z" />
);
export const ReferenceIcon = (p: IconProps) => (
  <Svg {...p} d="M6.1 1.5h1.5l-.8 3.6h2.9l.8-3.6h1.5l-.8 3.6h1.8v1.5h-2.1L10.1 9.5h2v1.5h-2.3l-.8 3.5H7.5l.8-3.5H5.4l-.8 3.5H3.1l.8-3.5H1.5V9.5h2.2l1-4.4H2.5V3.6h2.9Zm.6 3.6-1 4.4h2.9l1-4.4Z" />
);
export const UndoIcon = (p: IconProps) => (
  <Svg {...p} d="M6.8 3.5a4.5 4.5 0 1 1-4.3 5.8l1.4-.5A3 3 0 1 0 6.8 5H9v1.5H5V2.5h1.8Z" />
);
export const CommentIcon = (p: IconProps) => (
  <Svg {...p} d="M1.75 2.5h12.5v8.5H7.5L4.2 13.5V11H1.75Zm1.5 1.5v5.5h1.75v1.8L7 9.5h5.25V4Z" />
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p} d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
);
export const WarningIcon = (p: IconProps) => (
  <Svg {...p} d="M8.22 1.75a.75.75 0 0 0-1.3 0L.9 13.25A.75.75 0 0 0 1.55 14.4h12.9a.75.75 0 0 0 .65-1.15Zm-.97 3.75h1.5v4.5h-1.5Zm0 5.5h1.5v1.5h-1.5Z" />
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p} d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 1.5a5 5 0 1 0 0 10A5 5 0 0 0 8 3Zm-.75 2h1.5v3.4l2.2 1.3-.75 1.3L7.25 9.2Z" />
);
export const CheckIcon = (p: IconProps) => (
  <Svg {...p} d="M13.78 4.22a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0L2.22 7.78a.75.75 0 1 1 1.06-1.06L6.97 10.44l5.75-5.75a.75.75 0 0 1 1.06 0Z" />
);
export const SpinnerIcon = (p: IconProps) => (
  <Svg {...p} d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5h-1.5A5 5 0 1 1 8 3Z" />
);
/** Circular arrow: the thread's line has changed since it was written. */
export const OutdatedIcon = (p: IconProps) => (
  <Svg {...p} d="M8 2.5a5.5 5.5 0 0 1 5.24 3.8l1.42-.46.46 1.42-2.9 1.1-1.1-2.9 1.42-.46A4 4 0 0 0 4.1 6.7L2.7 6.2A5.5 5.5 0 0 1 8 2.5Zm-5.5 5.7 2.9-1.1 1.1 2.9-1.42.46A4 4 0 0 0 11.9 9.3l1.4.5A5.5 5.5 0 0 1 2.76 11.6l-.5-1.42 1.42-.46Z" />
);
export const PlusIcon = (p: IconProps) => (
  <Svg {...p} d="M7.25 2.5h1.5v4.75h4.75v1.5H8.75v4.75h-1.5V8.75H2.5v-1.5h4.75Z" />
);
