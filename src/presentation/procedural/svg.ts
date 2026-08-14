export const SVG_SIZE = 32;

export function attr(value: string | number): string {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function svg(body: string, size = SVG_SIZE): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${body}</svg>`;
}

export function rect(x: number, y: number, w: number, h: number, fill: string, extra = ""): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${attr(fill)}"${extra}/>`;
}

export function circle(cx: number, cy: number, r: number, fill: string, extra = ""): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${attr(fill)}"${extra}/>`;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, extra = ""): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${attr(fill)}"${extra}/>`;
}

export function line(x1: number, y1: number, x2: number, y2: number, stroke: string, width = 1.5): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${attr(stroke)}" stroke-width="${width}" stroke-linecap="round"/>`;
}

export function polyline(points: string, stroke: string, width = 1.5, fill = "none"): string {
  return `<polyline points="${attr(points)}" fill="${attr(fill)}" stroke="${attr(stroke)}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

export function polygon(points: string, fill: string, extra = ""): string {
  return `<polygon points="${attr(points)}" fill="${attr(fill)}"${extra}/>`;
}

export function path(d: string, fill: string, extra = ""): string {
  return `<path d="${attr(d)}" fill="${attr(fill)}"${extra}/>`;
}

export function fingerprint(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
