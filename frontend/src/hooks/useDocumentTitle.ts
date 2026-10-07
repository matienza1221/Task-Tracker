import { useEffect } from 'react';

const APP_NAME = 'TeamBoard';

/** Sets the document title as "<title> · TeamBoard" (or just the app name). */
export function useDocumentTitle(title?: string): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
