// import "src/utils/dotenv/config";
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      mockReset: true,
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      pool: 'threads',
      poolOptions: {
        threads: {
          singleThread: true,
        },
      },
      name: 'scenario',
      include: ['**/test/*.test.ts'],
      setupFiles: ['./test/setup.scenario.ts'],
    },
  },
])
