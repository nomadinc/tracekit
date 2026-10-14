import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
const inter = Inter({ subsets: ["latin"] });
export const metadata = { title: "TraceKit", description: "Track. Reconcile. Trust." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.className} bg-(--tk-background) text-(--tk-text-primary)`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
