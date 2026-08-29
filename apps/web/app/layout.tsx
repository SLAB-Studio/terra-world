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
      <body data-design-contract="discovery-table-514fbb03">
        {/*
          FLOWSTATE DIRECTION CONTRACT · 514fbb03
          THESIS: A hands-on science-museum discovery table where every city choice becomes visible evidence; refuse the generic dashboard shell.
          OWN-WORLD: Warm exhibit paper, river blue, field green, sun yellow and brick coral; crisp ink lines, chunky planning pieces and journal-like learning notes.
          STORY: Choose a useful piece, place it on the living model, run the city, then read what Rivergate learned.
          FIRST VIEWPORT: The Rivergate model owns the centre; a compact piece rack sits left, the current field mission sits right, and the next action is always visible.
          FORM: Community planning table, grounded direction 3, seed 514fbb03.
          FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
        */}
        {children}
      </body>
    </html>
  );
}
