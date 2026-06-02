process.env.ARENA_PROCESS_ROLE = "worker";
const { bootstrap } = require("../dist/apps/api/src/bootstrap-runtime.js");

void bootstrap({ requestedRole: "worker" }).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
