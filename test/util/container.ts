import { exec } from 'child_process'
import { ONE_SECOND } from './constants'

const CONTAINER_NAME = 'tempura-fulcrum'

function log(message: string, ...args: any): void {
  console.log('[TEST][CONTAINER]', message, ...args)
}

function execCommand(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    log('executing command:', command)
    const process = exec(command, (error) => {
      if (error) {
        reject(`error executing command: ${error.message}`)
      }

      process.stdout?.on('data', (data) => {
        log('process stdout:', data.toString())
      })
      process.stderr?.on('data', (data) => {
        log('process stderr:', data.toString())
      })

      resolve()
    })
  })
}

async function isContainerRunning(containerName: string): Promise<boolean> {
  log(`checking if '${containerName}' is running`)
  try {
    await execCommand(`docker inspect -f '{{.State.Running}}' ${containerName}`)
    log(`'${containerName}' is running`)
    return true
  } catch (error) {
    log(`'${containerName}' is not running`)
    return false
  }
}

async function waitForContainer(containerName: string, timeout: number = 30 * ONE_SECOND): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      await isContainerRunning(containerName)
      return
    } catch (error) {
      log(`Waiting for ${containerName} to be running...`)
      await new Promise((resolve) => setTimeout(resolve, 2 * ONE_SECOND))
    }
  }
  throw new Error(`'${containerName}' did not start within ${timeout / ONE_SECOND} seconds. Check your docker logs.`)
}

export async function ensureDockerStack(): Promise<void> {
  if (!(await isContainerRunning(CONTAINER_NAME))) {
    log('the docker stack does not appear to be running, attempting to start it...')
    await execCommand('docker compose up -d')
    await waitForContainer(CONTAINER_NAME)
    log('the docker stack now appears to be running. you may find the logs from `docker compose logs -f` useful.')
  } else {
    log('the docker stack is already running')
  }
}
