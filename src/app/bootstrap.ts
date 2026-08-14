import { CORE_IDENTITY } from "../core/identity";

const app = document.getElementById("app");
if (app) {
  app.textContent = `${CORE_IDENTITY.name} core booted (generator v${CORE_IDENTITY.generatorVersion}).`;
}
