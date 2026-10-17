import { useEffect, useState } from 'preact/hooks';

/** Hash routing keeps GitHub Pages from answering deep links with 404. */
export const currentRoute = (): string => location.hash.replace(/^#\/?/, '') || 'play';

export function navigate(route: string): void {
  location.hash = `#/${route}`;
}

export function useRoute(): string {
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
