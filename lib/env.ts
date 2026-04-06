import path from "node:path";

import dotenv from "dotenv";

let hasLoadedEnv = false;

export function loadLocalEnv() {
  if (hasLoadedEnv) {
    return;
  }

  dotenv.config({
    path: path.join(process.cwd(), ".env.local")
  });

  hasLoadedEnv = true;
}
