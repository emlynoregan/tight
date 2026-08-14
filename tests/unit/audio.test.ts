import { describe, expect, it } from "vitest";
import {
  CONTENT_REGISTRY,
  createAcceptedWorldCache,
  createNewGame,
  enumeratePlanes,
  hashSaveState,
} from "../../src/core";
import {
  AssetAudioProvider,
  HybridAudioProvider,
  MissingAudioError,
  PresentationFacade,
  ProceduralAudioProvider,
  ProceduralVisualProvider,
  requiredAudioKeys,
  requiredSfxKeys,
  requiredVisualKeys,
  SilentAudioProvider,
} from "../../src/presentation";
import type { MusicRequest } from "../../src/presentation";

function musicRequest(id: string): MusicRequest {
  if (id.startsWith("music.plane.")) {
    const parts = id.split(".");
    return { plane: { a: Number(parts[2]) as 0, b: Number(parts[3]) as 1 } };
  }
  return { dimension: Number(id.split(".")[2]) };
}

describe("procedural audio provider", () => {
  const audio = new ProceduralAudioProvider();
  const visuals = requiredVisualKeys(CONTENT_REGISTRY);

  it("resolves every required SFX cue to a synth patch with a visual or text equivalent", () => {
    const sfx = requiredSfxKeys();
    expect(sfx.length).toBeGreaterThan(15);
    for (const semanticId of sfx) {
      const handle = audio.resolveCue({ semanticId });
      expect(handle.patch).not.toBeNull();
      expect(handle.patch?.durationMs).toBeGreaterThan(0);
      expect(handle.patch?.gain).toBeGreaterThan(0);
      expect(handle.equivalent?.text.length).toBeGreaterThan(0);
      if (handle.equivalent?.visualId) {
        expect(visuals).toContain(handle.equivalent.visualId);
      }
    }
  });

  it("throws MissingAudioError for unknown SFX keys", () => {
    expect(() => audio.resolveCue({ semanticId: "sfx.not_a_cue" })).toThrow(MissingAudioError);
  });

  it("resolves every dimension and plane music profile to looping note events", () => {
    for (let dimension = 0; dimension < 16; dimension += 1) {
      const handle = audio.resolveMusic({ dimension });
      expect(handle.profile?.notes.length).toBeGreaterThan(0);
      expect(handle.profile?.tempo).toBeGreaterThan(0);
      expect(handle.id).toBe(`music.dimension.${dimension}`);
    }
    const planes = enumeratePlanes();
    expect(planes.length).toBe(120);
    for (const plane of planes) {
      const handle = audio.resolveMusic({ plane });
      expect(handle.profile?.notes.length).toBeGreaterThan(0);
      expect(handle.profile?.dimension).toBe(plane.b);
      expect(handle.profile?.secondaryDimension).toBe(plane.a);
    }
  });

  it("is deterministic and mixes plane dimensions", () => {
    const first = new ProceduralAudioProvider().resolveMusic({ plane: { a: 0, b: 1 } });
    const second = new ProceduralAudioProvider().resolveMusic({ plane: { a: 0, b: 1 } });
    expect(first.profile).toEqual(second.profile);
    const field = audio.resolveMusic({ dimension: 1 });
    const mixed = audio.resolveMusic({ plane: { a: 0, b: 1 } });
    expect(mixed.profile?.notes).not.toEqual(field.profile?.notes);
    const olympus = audio.resolveMusic({ plane: { a: 14, b: 15 } });
    expect(olympus.profile?.notes).not.toEqual(mixed.profile?.notes);
  });

  it("covers the required audio key set", () => {
    for (const id of requiredAudioKeys()) {
      expect(audio.has(id)).toBe(true);
      if (id.startsWith("sfx.")) {
        expect(audio.resolveCue({ semanticId: id }).patch).not.toBeNull();
      } else {
        expect(audio.resolveMusic(musicRequest(id)).profile?.notes.length).toBeGreaterThan(0);
      }
    }
  });

  it("can be disabled without changing game state or throwing in node", () => {
    const runtime = createNewGame("tight-v1", "0", { cache: createAcceptedWorldCache() });
    const before = hashSaveState(runtime.save);
    audio.setPreferences({ enabled: false });
    expect(audio.ensureContext()).toBe(false);
    for (const semanticId of requiredSfxKeys()) {
      const played = audio.playCue({ semanticId });
      expect(played.silent).toBe(true);
    }
    const music = audio.startMusic({ plane: { a: 0, b: 1 } });
    expect(music.profile?.notes.length).toBeGreaterThan(0);
    audio.stopMusic();
    audio.suspend();
    expect(hashSaveState(runtime.save)).toBe(before);
  });
});

describe("replaceable audio providers", () => {
  it("keeps SilentAudioProvider as a mute adapter", () => {
    const facade = new PresentationFacade(new ProceduralVisualProvider(), new SilentAudioProvider());
    expect(facade.resolveAudio({ semanticId: "sfx.ui.confirm" }).silent).toBe(true);
    expect(facade.resolveMusic({ dimension: 0 }).silent).toBe(true);
  });

  it("uses hybrid primary overrides then procedural fallback", () => {
    const procedural = new ProceduralAudioProvider();
    const assets = new AssetAudioProvider();
    const override = {
      ...procedural.resolveCue({ semanticId: "sfx.ui.confirm" }),
      silent: true,
    };
    assets.putCue("sfx.ui.confirm", override);
    const hybrid = new HybridAudioProvider(assets, procedural);
    expect(hybrid.resolveCue({ semanticId: "sfx.ui.confirm" }).silent).toBe(true);
    expect(hybrid.resolveCue({ semanticId: "sfx.death" })).toEqual(procedural.resolveCue({ semanticId: "sfx.death" }));
  });
});
