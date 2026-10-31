import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ever After — A little less planning. A lot more us.",
  description: "Discover your wedding style and bring your plans together, one thoughtful step at a time.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
