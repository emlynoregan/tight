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
}

export function mountShell(host: HTMLElement): ShellElements {
  host.innerHTML = "";
  host.className = "tight-root";
  const shell = document.createElement("div");
  shell.className = "tight-shell";
  shell.innerHTML = `
    <header class="tight-top">
      <div class="tight-gems" data-hud="gems"></div>
      <div class="tight-plane" data-hud="plane"></div>
    </header>
    <div class="tight-main">
      <div class="tight-world-host" data-hud="world"></div>
      <aside class="tight-side">
        <div class="tight-hp" data-hud="hp"></div>
        <div class="tight-statuses" data-hud="statuses"></div>
        <div class="tight-hints" data-hud="hints"></div>
        <div class="tight-modal" data-hud="modal" hidden></div>
      </aside>
    </div>
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
  if (!worldHost || !gems || !plane || !hp || !statuses || !hints || !messages || !modal) {
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
  };
}
