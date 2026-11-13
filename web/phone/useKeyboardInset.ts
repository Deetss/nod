import { useEffect, useState } from 'react';

/** Height of the visual viewport in px, or undefined when it equals the layout viewport. */
export function useKeyboardInset(): number | undefined {
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setHeight(Math.abs(vv.height - window.innerHeight) > 1 ? vv.height : undefined);
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);
  return height;
}
