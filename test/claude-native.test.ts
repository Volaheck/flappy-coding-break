import { expect, mock, test } from 'claude-code/testing'

test('registers the Flappy command with a stored record', async ($, on) => {
  const commands = []
  on('store.get', () => ({ value: 7 }))
  on('ui.panes', () => ({ value: [] }))
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

test('a turn opens after the delay and leaves the result pane open after completion', async ($, on) => {
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
  expect(closed.length).toBe(0)
})

test('completed live and paused games stay locked until the next main turn on both surfaces', async ($, on) => {
  mock.clock(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('store.set', () => ({ value: undefined }))
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const paused of [false, true]) {
      const turnId = `${surface}-${paused}`
      await $.turn.start({ turnId, text: 'work' })
      const ui = await $.ui.mount({
        plugin: 'flappy-coding-break', component: 'Pane', requestId: 'flappy-coding-break', surface,
        viewport: { columns: 100, rows: 40 },
        props: { title: 'Flappy Bird', isFocused: true, bodyColumns: 44, placement: 'inline', scroll: { offset: 0, bodyRows: 29 }, view: {} }
      })
      await ui.key({ key: 'w' })
      if (paused) await ui.key({ key: 'p' })
      await $.turn.complete({ turnId, answer: 'done', durationMs: 1, isAborted: false, reason: 'answer' })
      expect(await ui.find({ type: 'Text', text: /Round complete/, in: 'flappy-game' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Play again when the agent starts working/, in: 'flappy-game' })).toBeDefined()
      expect(await ui.find({ type: 'Button', in: 'flappy-game' })).toBeUndefined()
      await ui.key({ key: 'w' })
      await ui.key({ key: 'p' })
      await ui.pointer({ type: 'down', x: 4, y: 4, button: 'left' })
      await ui.advance(3000)
      expect(await ui.find({ type: 'Text', text: /Round complete/, in: 'flappy-game' })).toBeDefined()
      await $.turn.start({ turnId: `${turnId}-next`, text: 'more work' })
      expect(await ui.find({ type: 'Button', key: 'flap', in: 'flappy-game' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Round complete/, in: 'flappy-game' })).toBeDefined()
      await ui.key({ key: 'w' })
      expect(await ui.find({ type: 'Text', text: /Round complete/, in: 'flappy-game' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: surface === 'desktop' ? /^Score: 0$/ : /Score: 0/, in: 'flappy-game' })).toBeDefined()
      await ui.unmount()
    }
  }
})

test('stored results survive a native remount and subagent completion does not finish the main game', async ($, on) => {
  mock.clock(on)
  on('store.get', ($, e) => ({ value: e.key === 'flappy.best' ? 12 : 8 }))
  on('ui.panes', () => ({ value: [] }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.turn.start({ turnId: 'main', text: 'work' })
  const ui = await $.ui.mount({
    plugin: 'flappy-coding-break', component: 'Pane', requestId: 'flappy-coding-break', surface: 'desktop',
    viewport: { columns: 100, rows: 40 },
    props: { title: 'Flappy Bird', isFocused: true, bodyColumns: 44, placement: 'inline', scroll: { offset: 0, bodyRows: 29 }, view: {} }
  })
  await $.turn.complete({ turnId: 'child', agentId: 'subagent', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
  expect(await ui.find({ type: 'Text', text: /Round complete/, in: 'flappy-game' })).toBeUndefined()
  await $.turn.complete({ turnId: 'main', answer: '', durationMs: 1, isAborted: true, reason: 'aborted' })
  const scoreboard = async (drawing: typeof ui) => {
    for (const text of [/^Round complete$/, /^8$/, /^12$/]) expect(await drawing.find({ type: 'Text', text, in: 'flappy-game' })).toBeDefined()
  }
  await scoreboard(ui)
  await ui.unmount()
  const reopened = await $.ui.mount({
    plugin: 'flappy-coding-break', component: 'Pane', requestId: 'flappy-coding-break', surface: 'desktop',
    viewport: { columns: 100, rows: 40 },
    props: { title: 'Flappy Bird', isFocused: true, bodyColumns: 44, placement: 'inline', scroll: { offset: 0, bodyRows: 29 }, view: {} }
  })
  await scoreboard(reopened)
  expect(await reopened.find({ type: 'Button', in: 'flappy-game' })).toBeUndefined()
  await reopened.unmount()
})

test('a newer pane claim closes this native pane and saves its latest reported score without a redraw', async ($, on) => {
  const clock = mock.clock(on)
  const store = new Map<string, unknown>([['flappy.best', 12]])
  const panes = new Map<string, unknown>()
  const closed: string[] = []
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('session.id', () => ({ value: 'old-session' }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('ui.panes', () => ({ value: [...panes.values()] }))
  on('ui.open', ($, e) => {
    panes.set(e.id, { id: e.id, title: e.title, isShown: true, isFocused: true, isPlaced: true })
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => { panes.delete(e.id); closed.push(e.id); return { value: undefined } })
  await $.command.run({ command: 'flappy', args: '' })
  expect(typeof store.get('flappy.pane.owner')).toBe('string')
  const ui = await $.ui.mount({
    plugin: 'flappy-coding-break', component: 'Pane', requestId: 'flappy-coding-break', surface: 'desktop',
    viewport: { columns: 100, rows: 40 },
    props: { title: 'Flappy Bird', isFocused: true, bodyColumns: 44, placement: 'inline', scroll: { offset: 0, bodyRows: 29 }, view: {} }
  })
  await ui.post({ type: 'state', phase: 'playing', animating: true, score: 9, best: 3, lastScore: 2 }, { in: 'flappy-game' })
  // Another session owns the shared store now; this surface need not render again.
  store.set('flappy.pane.owner', 'new-session:new-pane')
  await clock.advance(1000)
  expect(closed).toEqual(['flappy-coding-break'])
  expect(store.get('flappy.pane.owner')).toBe('new-session:new-pane')
  expect(store.get('flappy.lastScore')).toBe(9)
  expect(store.get('flappy.best')).toBe(12)
  await clock.advance(10000)
  expect(closed.length).toBe(1)
  await ui.unmount()
})

test('the flappy skill opens the native pane and replaces the Codex instructions', async ($, on) => {
  const opened = []
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', ($, e) => { opened.push(e); return { value: { isPlaced: true } } })
  on('skill.prompt', ($, e) => ({ text: e.text }))
  const result = await $.skill.prompt({ skill: 'flappy-coding-break:flappy', text: 'Use the open_flappy tool', pluginName: 'flappy-coding-break' })
  expect(opened.length).toBe(1)
  expect(opened[0].id).toBe('flappy-coding-break')
  expect(result.text.includes('open_flappy')).toBe(false)
  const other = await $.skill.prompt({ skill: 'commit', text: 'unchanged' })
  expect(other.text).toBe('unchanged')
  expect(opened.length).toBe(1)
})

test('desktop plays a whole round on the moving board over still Svg scenery, with the agent status in the field', async ($, on) => {
  mock.clock(on)
  on('ui.log', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.turn.start({ turnId: 'desktop-round', text: 'work' })
  const ui = await $.ui.mount({
    plugin: 'flappy-coding-break', component: 'Pane', requestId: 'flappy-coding-break', surface: 'desktop',
    viewport: { columns: 60, rows: 40 },
    props: { title: 'Flappy Bird', isFocused: true, bodyColumns: 27, placement: 'inline', scroll: { offset: 0, bodyRows: 29 }, view: {} }
  })
  await ui.resize({ columns: 27, rows: 29, in: 'flappy-game' })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  const text = (pattern: RegExp) => ui.find({ type: 'Text', text: pattern, in: 'flappy-game' })
  expect(await text(/^Click to start$/)).toBeDefined()
  expect(await text(/^Agent is working…$/)).toBeDefined()
  const board = JSON.stringify(await ui.drawn({ in: 'flappy-game' }))
  expect(board.includes('backgroundColor')).toBe(true)
  await ui.pointer({ type: 'down', x: 10, y: 10, button: 'left' })
  await ui.advance(200)
  expect(await text(/^Score: 0$/)).toBeDefined()
  await ui.advance(4000)
  expect(await text(/^Game Over$/)).toBeDefined()
  expect(await text(/Click or Space to play again$/)).toBeDefined()
  expect(await text(/^Best score$/)).toBeDefined()
  await $.turn.complete({ turnId: 'desktop-round', answer: 'done', durationMs: 1, isAborted: false, reason: 'answer' })
  expect(await text(/^Round complete$/)).toBeDefined()
  expect(await text(/^Agent is done$/)).toBeDefined()
  expect(await ui.find({ type: 'Button', in: 'flappy-game' })).toBeUndefined()
  await ui.unmount()
})
