import { useCallback, useEffect, useRef, useState } from 'react'
import {
  runResearchPipeline,
  type ResearchInput,
  type ResearchJob,
  type ResearchPorts,
} from '@cookie-amazon/research-core'
import { createSellerSpriteResearchPorts } from './create-research-ports'

export type AutoResearchRunner = {
  start(input: ResearchInput, onUpdate: (job: ResearchJob) => void): Promise<ResearchJob | null>
  cancel(): void
  dispose(): void
}

export const createAutoResearchRunner = (ports: ResearchPorts): AutoResearchRunner => {
  let generation = 0
  let activeController: AbortController | null = null
  return {
    async start(input, onUpdate) {
      activeController?.abort()
      const currentGeneration = generation + 1
      generation = currentGeneration
      const controller = new AbortController()
      activeController = controller
      const job = await runResearchPipeline(input, ports, {
        signal: controller.signal,
        onUpdate(update) {
          if (generation === currentGeneration) onUpdate(update)
        },
      })
      if (generation !== currentGeneration) return null
      if (activeController === controller) activeController = null
      return job
    },
    cancel() {
      activeController?.abort()
    },
    dispose() {
      generation += 1
      activeController?.abort()
      activeController = null
    },
  }
}

export type AutoResearchState = {
  job: ResearchJob | null
  running: boolean
  error: string | null
  start: (input: ResearchInput) => Promise<void>
  cancel: () => void
}

const snapshotJob = (job: ResearchJob): ResearchJob => structuredClone(job)

export const useAutoResearch = (
  portsFactory: () => ResearchPorts = createSellerSpriteResearchPorts,
): AutoResearchState => {
  const runnerRef = useRef<AutoResearchRunner | null>(null)
  if (runnerRef.current === null) runnerRef.current = createAutoResearchRunner(portsFactory())
  const [job, setJob] = useState<ResearchJob | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => () => runnerRef.current?.dispose(), [])

  const start = useCallback(async (input: ResearchInput): Promise<void> => {
    setRunning(true)
    setError(null)
    try {
      const result = await runnerRef.current?.start(input, (update) => {
        setJob(snapshotJob(update))
        setRunning(update.status === 'running' || update.status === 'idle')
      })
      if (result) {
        setJob(snapshotJob(result))
        setRunning(false)
      }
    } catch (reason) {
      setRunning(false)
      setError(reason instanceof Error ? reason.message : 'AUTO_RESEARCH_FAILED')
    }
  }, [])

  const cancel = useCallback(() => {
    runnerRef.current?.cancel()
  }, [])

  return { job, running, error, start, cancel }
}