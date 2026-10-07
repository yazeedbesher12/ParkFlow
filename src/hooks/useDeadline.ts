import { useEffect, useState } from 'react';
import { secondsUntil } from '@/utils/authFlow';

export function useDeadline(deadline: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (deadline <= Date.now()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [deadline]);
  return secondsUntil(deadline, now);
}
