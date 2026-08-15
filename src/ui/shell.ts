export interface ShellElements {
  readonly root: HTMLElement;
  readonly worldHost: HTMLElement;
  readonly gems: HTMLElement;
  readonly plane: HTMLElement;
  readonly hp: HTMLElement;
  readonly statuses: HTMLElement;
  readonly hints: HTMLElement;
  readonly messages: HTMLElement;
  readonly modal: HTMLElement;
  readonly banner: HTMLElement;
  readonly touch: HTMLElement;
  readonly settingsButton: HTMLButtonElement;
}

export function mountShell(host: HTMLElement): ShellElements {
  host.innerHTML = "";
  host.className = "tight-root";
  const shell = document.createElement("div");
  shell.className = "tight-shell";
  shell.innerHTML = `
    <div class="tight-banner" data-hud="banner" hidden></div>
    <header class="tight-top">
      <div class="tight-gems" data-hud="gems"></div>
      <div class="tight-plane" data-hud="plane"></div>
      <button type="button" class="tight-settings-btn" data-hud="settings">Settings</button>
    </header>
    <div class="tight-main">
      <div class="tight-world-host" data-hud="world"></div>
      <aside class="tight-side">
        <div class="tight-hp" data-hud="hp"></div>
        <div class="tight-statuses" data-hud="statuses"></div>
        <div class="tight-hints" data-hud="hints"></div>
        <div class="tight-modal" data-hud="modal" hidden role="dialog" aria-modal="true"></div>
      </aside>
    </div>
    <nav class="tight-touch" data-hud="touch" aria-label="Touch controls">
      <div class="tight-touch-pad">
        <button type="button" data-touch="north" aria-label="Move north">N</button>
        <div class="tight-touch-mid">
          <button type="button" data-touch="west" aria-label="Move west">W</button>
          <button type="button" data-touch="south" aria-label="Move south">S</button>
          <button type="button" data-touch="east" aria-label="Move east">E</button>
        </div>
      </div>
      <div class="tight-touch-actions">
        <button type="button" data-touch="wait">Wait</button>
        <button type="button" data-touch="interact">Interact</button>
        <button type="button" data-touch="attack">Attack</button>
        <button type="button" data-touch="pickup">Pick up</button>
        <button type="button" data-touch="settings">Settings</button>
      </div>
    </nav>
    <footer class="tight-log" data-hud="messages"></footer>
  `;
  host.append(shell);
  const worldHost = shell.querySelector("[data-hud=world]");
  const gems = shell.querySelector("[data-hud=gems]");
  const plane = shell.querySelector("[data-hud=plane]");
  const hp = shell.querySelector("[data-hud=hp]");
  const statuses = shell.querySelector("[data-hud=statuses]");
  const hints = shell.querySelector("[data-hud=hints]");
  const messages = shell.querySelector("[data-hud=messages]");
  const modal = shell.querySelector("[data-hud=modal]");
  const banner = shell.querySelector("[data-hud=banner]");
  const touch = shell.querySelector("[data-hud=touch]");
  const settingsButton = shell.querySelector("[data-hud=settings]");
  if (
    !worldHost ||
    !gems ||
    !plane ||
    !hp ||
    !statuses ||
    !hints ||
    !messages ||
    !modal ||
    !banner ||
    !touch ||
    !(settingsButton instanceof HTMLButtonElement)
  ) {
    throw new Error("HUD shell failed to mount");
  }
  return {
    root: host,
    worldHost: worldHost as HTMLElement,
    gems: gems as HTMLElement,
    plane: plane as HTMLElement,
    hp: hp as HTMLElement,
    statuses: statuses as HTMLElement,
    hints: hints as HTMLElement,
    messages: messages as HTMLElement,
    modal: modal as HTMLElement,
    banner: banner as HTMLElement,
    touch: touch as HTMLElement,
    settingsButton,
  };
}
