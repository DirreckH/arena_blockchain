import { afterEach, describe, expect, it } from 'vitest'
import { demoBackend } from './demo-backend'

const ACTIVE_TASK_STATUSES = new Set(['assigned', 'started'])

describe('demoBackend adjudication seeds', () => {
  afterEach(() => {
    demoBackend.reset()
  })

  it('provides ten active tasks for the adjudication highlight queue', () => {
    const activeTasks = demoBackend
      .listAdjudicationTasks()
      .filter((task) => ACTIVE_TASK_STATUSES.has(task.taskStatus))

    expect(activeTasks).toHaveLength(10)
    expect(new Set(activeTasks.map((task) => task.title)).size).toBe(10)
  })
})
