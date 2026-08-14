import type { AnimationKind, DimensionVisualProfile } from "../visual-types";
import { MissingVisualError } from "../visual-types";

interface PaletteRow {
  readonly name: string;
  readonly gemIdentity: string;
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
  readonly lineWeight: number;
  readonly corner: DimensionVisualProfile["corner"];
  readonly motif: string;
  readonly pattern: string;
  readonly glow: DimensionVisualProfile["glow"];
  readonly motion: AnimationKind;
}

const ROWS: readonly PaletteRow[] = [
  { name: "Field", gemIdentity: "green stone", primary: "#4a8f4a", secondary: "#6b4f2a", accent: "#d4e8a0", lineWeight: 1.2, corner: "round", motif: "leaf", pattern: "arcs", glow: "none", motion: "bob" },
  { name: "Wild", gemIdentity: "amber stone", primary: "#3d6b2c", secondary: "#8a5a2b", accent: "#c4d46a", lineWeight: 1.4, corner: "chamfer", motif: "growth", pattern: "irregular", glow: "none", motion: "jitter" },
  { name: "Hearth", gemIdentity: "red-brown stone", primary: "#8a4a32", secondary: "#c4a06a", accent: "#f0d090", lineWeight: 1.6, corner: "square", motif: "frame", pattern: "rectangles", glow: "low", motion: "pulse" },
  { name: "Order", gemIdentity: "blue-grey stone", primary: "#5a6a78", secondary: "#d0d4d8", accent: "#8aa0b4", lineWeight: 1.2, corner: "square", motif: "grid", pattern: "orthogonal", glow: "none", motion: "none" },
  { name: "Stone", gemIdentity: "slate stone", primary: "#6a6860", secondary: "#3e3c38", accent: "#b0a898", lineWeight: 2, corner: "chamfer", motif: "crack", pattern: "polygons", glow: "none", motion: "none" },
  { name: "Ruin", gemIdentity: "rust stone", primary: "#7a4a38", secondary: "#4a6a40", accent: "#c08050", lineWeight: 1.5, corner: "chamfer", motif: "fragment", pattern: "broken", glow: "none", motion: "jitter" },
  { name: "Sorcery", gemIdentity: "violet stone", primary: "#6a3a8a", secondary: "#3ad0d0", accent: "#e8c8ff", lineWeight: 1.3, corner: "round", motif: "rune", pattern: "rings", glow: "high", motion: "pulse" },
  { name: "Flux", gemIdentity: "cyan stone", primary: "#2aa0b8", secondary: "#f0d060", accent: "#80ffe0", lineWeight: 1.1, corner: "chamfer", motif: "skew", pattern: "diagonals", glow: "low", motion: "spin" },
  { name: "Spirit", gemIdentity: "pearl stone", primary: "#d8d4e8", secondary: "#90a0b8", accent: "#ffffff", lineWeight: 1, corner: "round", motif: "wisp", pattern: "contours", glow: "low", motion: "bob" },
  { name: "Dream", gemIdentity: "rose stone", primary: "#d08098", secondary: "#7040a0", accent: "#f8d0e0", lineWeight: 1.1, corner: "round", motif: "echo", pattern: "offset", glow: "low", motion: "pulse" },
  { name: "Orbit", gemIdentity: "silver stone", primary: "#8a96a4", secondary: "#203040", accent: "#e8f0ff", lineWeight: 1.2, corner: "round", motif: "radial", pattern: "circles", glow: "low", motion: "spin" },
  { name: "Deep Space", gemIdentity: "black-blue stone", primary: "#102038", secondary: "#60a0e0", accent: "#f0f4ff", lineWeight: 1, corner: "square", motif: "star", pattern: "sparse", glow: "high", motion: "pulse" },
  { name: "Shadow", gemIdentity: "smoke stone", primary: "#1a1a1e", secondary: "#6a6070", accent: "#c0b8c8", lineWeight: 1.4, corner: "square", motif: "silhouette", pattern: "narrow", glow: "none", motion: "none" },
  { name: "Abyss", gemIdentity: "near-black stone", primary: "#0a0a0c", secondary: "#6030a0", accent: "#e0c0ff", lineWeight: 1.8, corner: "chamfer", motif: "fracture", pattern: "jagged", glow: "low", motion: "jitter" },
  { name: "Heaven", gemIdentity: "white-gold stone", primary: "#f4f0e0", secondary: "#d0b050", accent: "#ffffff", lineWeight: 1.2, corner: "round", motif: "ray", pattern: "open", glow: "high", motion: "pulse" },
  { name: "Olympus", gemIdentity: "gold stone", primary: "#d4b44a", secondary: "#fff8e0", accent: "#ffffff", lineWeight: 1.8, corner: "square", motif: "monument", pattern: "symmetry", glow: "high", motion: "pulse" },
];

export function dimensionVisualProfile(dimension: number): DimensionVisualProfile {
  const row = ROWS[dimension];
  if (!row) {
    throw new MissingVisualError(`dimension.${dimension}`);
  }
  return { dimension, ...row };
}

export function mixPalette(secondaryDim: number, dominantDim: number): { fill: string; ink: string; accent: string } {
  const dominant = dimensionVisualProfile(dominantDim);
  const secondary = dimensionVisualProfile(secondaryDim);
  return { fill: dominant.primary, ink: dominant.secondary, accent: secondary.accent };
}
