import { expect, mock, test } from 'claude-code/testing'

test('registers the Flappy command with a stored record', async ($, on) => {
  const commands = []
  on('store.get', () => ({ value: 7 }))
  on('command.register', ($, e) => { commands.push(e); return { value: undefined } })
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(commands.length).toBe(1)
  expect(commands[0].name).toBe('flappy')
})

test('the Flappy command opens a native pane without a model call', async ($, on) => {
  const opened = []
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', ($, e) => { opened.push(e); return { value: { isPlaced: true } } })
  const result = await $.command.run({ command: 'flappy', args: '' })
  expect(result).toEqual({})
  expect(opened.length).toBe(1)
  expect(opened[0].id).toBe('flappy-coding-break')
})

test('the pane produces a supported Client on terminal and desktop', async ($, on) => {
  for (const surface of ['terminal', 'desktop']) {
    const ui = await $.ui.mount({
      plugin: 'flappy-coding-break', component: 'Pane', requestId: 'flappy-coding-break', surface,
      viewport: { columns: 100, rows: 40 },
      props: { title: 'Flappy Bird', isFocused: true, bodyColumns: 44, placement: 'inline', scroll: { offset: 0, bodyRows: 29 }, view: {} }
    })
    expect(await ui.find({ type: 'Client' })).toBeDefined()
    await ui.unmount()
  }
})

test('a turn opens after the delay and closes after completion', async ($, on) => {
  const clock = mock.clock(on)
  const opened = []
  const closed = []
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', ($, e) => { opened.push(e); return { value: { isPlaced: true } } })
  on('ui.close', ($, e) => { closed.push(e); return { value: undefined } })
  on('ui.log', () => ({ value: undefined }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ turnId: 'turn-1' })
  await clock.advance(999)
  expect(opened.length).toBe(0)
  await clock.advance(1)
  expect(opened.length).toBe(1)
  await $.turn.complete({ turnId: 'turn-1', answer: 'done', durationMs: 1000, isAborted: false, usage: null })
  await clock.advance(1500)
  expect(closed.length).toBe(1)
})
