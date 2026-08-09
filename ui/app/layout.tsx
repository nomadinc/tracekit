import "./globals.css";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
const inter = Inter({ subsets: ["latin"] });
export const metadata = { title: "TraceKit", description: "Track. Reconcile. Trust." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} bg-white text-black dark:bg-ink dark:text-white`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
