import { useEffect, useReducer, useRef, useState } from 'react'
import { workflowReducer } from '../utils/workflow'
import type { WorkflowState } from '../utils/workflow'
import {
  demoStorageKey,
  loadDemoState,
  resetDemoState,
  saveDemoState,
} from '../utils/storage'

export function usePersistentWorkflow(seed: WorkflowState) {
  const [boot] = useState(() => loadDemoState(structuredClone(seed)))
  const [workflow, dispatch] = useReducer(workflowReducer, boot.state)
  const [storageStatus, setStorageStatus] = useState(boot.status)
  const [blocked, setBlocked] = useState(boot.blocked)
  const [retryVersion, setRetryVersion] = useState(0)
  const lastSaved = useRef(boot.raw)
  const blockedRef = useRef(boot.blocked)

  useEffect(() => {
    if (blockedRef.current) return
    const result = saveDemoState(workflow, lastSaved.current)
    if (result.ok) {
      lastSaved.current = result.raw
      setStorageStatus('saved')
    } else {
      setStorageStatus(result.issue)
      if (result.issue === 'conflict') {
        blockedRef.current = true
        setBlocked(true)
      }
    }
  }, [workflow, retryVersion])

  useEffect(() => {
    function externalChange(event: StorageEvent) {
      if (
        (event.key === demoStorageKey || event.key === null) &&
        event.newValue !== lastSaved.current
      ) {
        blockedRef.current = true
        setBlocked(true)
        setStorageStatus('conflict')
      }
    }
    window.addEventListener('storage', externalChange)
    return () => window.removeEventListener('storage', externalChange)
  }, [])

  function reset() {
    const fresh = structuredClone(seed)
    const result = resetDemoState(fresh)
    if (!result.ok) {
      setStorageStatus(result.issue)
      return false
    }
    lastSaved.current = result.raw
    blockedRef.current = false
    setBlocked(false)
    setStorageStatus('saved')
    dispatch({ type: 'demo-reset', state: fresh })
    return true
  }

  return {
    workflow,
    dispatch,
    storageStatus,
    storageBlocked: blocked,
    resetDemo: reset,
    retrySave: () => setRetryVersion((version) => version + 1),
  }
}
