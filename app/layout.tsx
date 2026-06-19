import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aether Dynasty — 46,656 Ways",
  description:
    "A 46,656-ways expanding slot with cascading wins, wilds, golden frames and free games.",
  manifest: "/assets/favicon/site.webmanifest",
  icons: {
    icon: [
      { url: "/assets/favicon/favicon.ico", sizes: "any" },
      { url: "/assets/favicon/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/assets/favicon/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: { url: "/assets/favicon/apple-touch-icon.png", sizes: "180x180" },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0510",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {/* External fonts + the cell-break GIF preload. React hoists these
            <link> elements into <head>. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Marcellus+SC&family=Spectral:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <link rel="preload" as="image" href="/assets/cell-break.gif" />
        {children}
      </body>
    </html>
  );
}
