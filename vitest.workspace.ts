// import "src/utils/dotenv/config";
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      pool: "threads",
      poolOptions: {
        threads: {
          singleThread: true,
        },
      },
      name: "integration",
      include: ["**/test/*.test.ts"],
      setupFiles: ["./test/setup.integration.ts"],
    },
  },
]);
