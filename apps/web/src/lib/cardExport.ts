/**
 * Rasterize the server verdict card (SVG) to a PNG and download it.
 *
 * The card lives at GET /runs/{id}/card.svg (public, Lab Instrument language).
 * PRs/decks want a PNG, so we fetch the SVG, paint it onto a 2x canvas using the
 * app's already-loaded fonts, and hand back a crisp download.
 */
export async function downloadVerdictCardPng(svgUrl: string, filename: string): Promise<void> {
  const res = await fetch(svgUrl);
  if (!res.ok) throw new Error(`card fetch failed: ${res.status}`);
  const svgText = await res.text();

  // Make sure IBM Plex Mono / Instrument Serif are ready before rasterizing,
  // otherwise the SVG draws with fallback fonts.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* non-fatal */
    }
  }

  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("card image failed to load"));
      img.src = objectUrl;
    });

    const scale = 2;
    const W = 640;
    const H = 360;
    const canvas = document.createElement("canvas");
    canvas.width = W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, W, H);

    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!pngBlob) throw new Error("png encode failed");

    const pngUrl = URL.createObjectURL(pngBlob);
    const a = document.createElement("a");
    a.href = pngUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(pngUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
