import type { ReactNode } from "react";

export const metadata = {
  title: "Family Wellness Platform",
  description: "One app a whole family opens.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
