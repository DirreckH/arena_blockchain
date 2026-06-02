import "reflect-metadata";

import { bootstrap } from "./bootstrap-runtime";

if (require.main === module) {
  void bootstrap().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
