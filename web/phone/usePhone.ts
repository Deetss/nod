import { useEffect, useState } from 'react';
import { PHONE_MAX_WIDTH, isPhoneWidth } from './phone-logic';

/** `?phone=1` forces the phone layout at any width, for captures in a desktop browser. */
const FORCED = new URLSearchParams(window.location.search).get('phone') === '1';

const QUERY = '(min-width: ' + PHONE_MAX_WIDTH + 'px)';

/** True when the phone layout applies. Follows the viewport as it crosses 700px. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(() => isPhoneWidth(window.innerWidth, FORCED));
  useEffect(() => {
    const q = window.matchMedia(QUERY);
    const update = () => setPhone(isPhoneWidth(q.matches ? PHONE_MAX_WIDTH : 0, FORCED));
    update();
    q.addEventListener('change', update);
    return () => q.removeEventListener('change', update);
  }, []);
  return phone;
}
