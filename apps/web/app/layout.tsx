import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Terra World · Build Rivergate",
  description:
    "A hands-on city-building game where young planners learn how water, energy, nature, transport, care, and budgets work together.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body data-design-contract="kid-playboard-20260829">
        {/*
          FLOWSTATE DIRECTION CONTRACT · kid-playboard-20260829
          THESIS: A cheerful toy city workbench where a child builds first and reads second; refuse the planning-dashboard density.
          OWN-WORLD: Ink-black outlines, paper white, sky blue, coral, grass green and sun yellow; chunky blocks, friendly faces and pressable controls.
          STORY: Pick a block, place it in Rivergate, try the change, then ask River why the city reacted.
          FIRST VIEWPORT: Large build blocks sit left, the playable city dominates the centre, one action bar stays below it, and the persistent expert occupies the right.
          FORM: Child playboard pinned by the supplied Terra World reference, direction kid-playboard-20260829.
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
        */}
        {children}
      </body>
    </html>
  );
}
