import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./city-experience.css";

export const metadata: Metadata = {
  title: "Terra World · Rivergate",
  description:
    "Explore a living city. Restore its homes, improve its infrastructure, and shape Rivergate—one decision at a time.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body
        data-design-contract="rivergate-grounded-c5a7af33"
        data-world="rivergate"
      >
        <script
          type="application/json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              thesis:
                "A living waterfront city, explored and restored; the 3D world leads, not a dashboard.",
              world:
                "Slate, limestone, timber, muted vegetation, warm windows; precise compact controls and Barlow signage.",
              story:
                "Explore Rivergate, investigate resident needs, make a repair, observe its consequences with Leo.",
              firstViewport:
                "City fills the play area; narrow tools left, one objective above, advisor accessible on demand; first-person exploration retains context.",
              form: "User-pinned grounded city; c5a7af33. Live code-led 3D, no illustrated substitute. Ordinary integrated graphics target.",
              finish:
                "unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance",
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
