import { ScrollViewStyleReset } from 'expo-router/html';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body {
            margin: 0;
            padding: 0;
            background: #050510 url('${API_URL}/api/static/fond_duelo.webp') center/cover fixed no-repeat !important;
          }
          #root,
          #root > div,
          #root > div > div,
          #root > div > div > div,
          #root > div > div > div > div,
          #root > div > div > div > div > div,
          #root > div > div > div > div > div > div,
          #root > div > div > div > div > div > div > div,
          #root > div > div > div > div > div > div > div > div,
          #root > div > div > div > div > div > div > div > div > div,
          #root > div > div > div > div > div > div > div > div > div > div,
          #root > div > div > div > div > div > div > div > div > div > div > div,
          #root > div > div > div > div > div > div > div > div > div > div > div > div {
            background-color: transparent !important;
          }
          body::before {
            content: '';
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 10, 0.15);
            pointer-events: none;
            z-index: 0;
          }
          [data-testid="admin-bg"], [data-testid="admin-bg"] > div {
            background-color: #000000 !important;
          }
          #admin-bg,
          #root #admin-bg,
          div#admin-bg {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            z-index: 9999 !important;
            background: #000000 !important;
            background-color: #000000 !important;
          }
          #admin-bg > div,
          #root #admin-bg > div {
            background-color: #000000 !important;
          }
        `}} />
      </head>
      <body>{children}</body>
    </html>
  );
}
