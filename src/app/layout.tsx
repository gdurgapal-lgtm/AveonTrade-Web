import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import DisableContextMenu from "@/components/system/DisableContextMenu";
import HotkeyManager from "@/components/system/HotkeyManager";
import ToastHost from "@/components/system/ToastHost";

export const metadata: Metadata = {
  title: "AveonTrade | Web Trading",
  description: "AveonTrade web trading terminal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                try {
                  const t = localStorage.getItem('aveon-theme') || 'aveon-dark';
                  document.documentElement.setAttribute('data-theme', t);
                } catch (e) {}
              `,
            }}
          />
        </head>
      <body className="min-h-screen bg-aveon-bg font-sans text-aveon-text antialiased">
        <DisableContextMenu />
        <HotkeyManager />
        <ToastHost />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}