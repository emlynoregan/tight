export function seedFromLocation(search: string, hash: string): string | null {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("seed");
  if (query && query.length > 0) {
    return query;
  }
  const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!rawHash) {
    return null;
  }
  const hashed = new URLSearchParams(rawHash).get("seed");
  if (hashed && hashed.length > 0) {
    return hashed;
  }
  return null;
}

export function forceNewFromLocation(search: string): boolean {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("new") === "1";
}

export function qaModeFromLocation(search: string): boolean {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("qa") === "1";
}

export function randomWorldSeed(random: () => number = Math.random): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return Math.floor(random() * 0xffffffffffff)
    .toString(16)
    .padStart(12, "0");
}

export function shareSeedUrl(origin: string, pathname: string, seed: string): string {
  const url = new URL(pathname || "/", origin);
  url.searchParams.set("seed", seed);
  return url.toString();
}
