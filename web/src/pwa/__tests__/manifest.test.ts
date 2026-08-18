/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The manifest is a JSON file no module imports and no build step validates, so
 * nothing in this repo notices when it is wrong — which is exactly how it sat
 * with `"icons": []` and an empty `public/`. That state costs nothing at build
 * time and nothing at runtime; it only means the browser silently declines to
 * offer "Install", with no error anywhere to explain why.
 *
 * These are the conditions Chrome actually checks before showing that prompt,
 * plus the colour contract with the stylesheet.
 */
const webRoot = process.cwd();
const readPublic = (path: string) => readFileSync(join(webRoot, "public", path), "utf8");

type Icon = { src: string; sizes: string; type?: string; purpose?: string };
type Manifest = {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: Icon[];
};

const manifest = (): Manifest => JSON.parse(readPublic("manifest.webmanifest")) as Manifest;

/** The single source of the palette, so the manifest cannot drift from the app. */
const canvasColour = (): string => {
  const css = readFileSync(join(webRoot, "app", "globals.css"), "utf8");
  const found = /--color-canvas:\s*(#[0-9a-fA-F]{6})/.exec(css);
  expect(found).not.toBeNull();
  return (found?.[1] ?? "").toLowerCase();
};

describe("web app manifest", () => {
  it("declares the two icon sizes a browser requires before it will offer to install", () => {
    const sizes = manifest().icons.map((icon) => icon.sizes);

    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });

  it("ships every icon file it points at", () => {
    for (const icon of manifest().icons) {
      expect({ src: icon.src, exists: existsSync(join(webRoot, "public", icon.src)) }).toEqual({
        src: icon.src,
        exists: true,
      });
    }
  });

  // Without one, Android crops a square icon into its circular mask and takes
  // the corners off whatever is there.
  it("provides a maskable icon, so Android's circular crop has a safe area to cut into", () => {
    const purposes = manifest().icons.flatMap((icon) => (icon.purpose ?? "any").split(/\s+/));

    expect(purposes).toContain("maskable");
  });

  // The splash screen is drawn from these two before any CSS loads, so a white
  // manifest against a canvas-coloured app is a visible flash on every launch.
  it("paints its splash screen in the same colour the app's body uses", () => {
    const { background_color, theme_color } = manifest();

    expect([background_color.toLowerCase(), theme_color.toLowerCase()]).toEqual([
      canvasColour(),
      canvasColour(),
    ]);
  });
});
