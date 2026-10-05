// Rules-of-Hooks regression check.
//
// The bug this guards against: `useProjection` is a real React hook (it ends in
// useSyncExternalStoreWithSelector -> useRef). Calling it conditionally, or after
// another hook, makes React throw "Invalid hook call" (#321) and silently pins the
// gauge at 0.0%. The previous structural check could not see that, because it only
// asserted the rendered output — so this harness records the hook-call SEQUENCE
// per render and requires it to be identical on every render.
const hooks = { cursor: 0, seq: [], slots: [] }

const StubReact = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.filter((c) => c != null && c !== false) }
  },
  useRef(init) { hooks.seq.push('useRef'); const i = hooks.cursor++; return (hooks.slots[i] ??= { current: init }) },
  useCallback(fn, deps) { hooks.seq.push('useCallback'); hooks.cursor++; return fn },
  useEffect(fn, deps) { hooks.seq.push('useEffect'); hooks.cursor++; fn() },
  useSyncExternalStore(_s, getSnapshot) { hooks.seq.push('useSyncExternalStore'); hooks.cursor++; return getSnapshot() },
  useMemo(fn) { hooks.seq.push('useMemo'); hooks.cursor++; return fn() },
  useState(init) { hooks.seq.push('useState'); hooks.cursor++; return [init, () => {}] },
}

globalThis.__REACT_STUB__ = StubReact
globalThis.document = { createElement: () => ({ remove() {} }), head: { appendChild() {} } }

let entry
globalThis.window = { __ModuleLoader__: { load: (def) => { entry = def } } }
await import('../lib/client.js')
if (!entry) throw new Error('client.js did not register through window.__ModuleLoader__.load')

let failed = 0
const check = (ok, line) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`) }

/** Minimal stand-in for the slot's standard prop: a hook that reads the projection. */
function makeUseProjection(reads) {
  return function useProjection(name) {
    // Same hook shape the shipped implementation has.
    StubReact.useSyncExternalStore(() => () => {}, () => undefined)
    reads.push(name)
    return { surfaceTokens: 400000, contextWindow: 1000000 }
  }
}

const mod = entry.factory((id) => {
  if (id === 'react') return StubReact
  throw new Error(`unexpected require("${id}")`)
})
const Component = mod.__test_component

// --- render 1
const reads = []
hooks.cursor = 0
hooks.slots = []
hooks.seq = []
Component({ useProjection: makeUseProjection(reads), notify: () => {} })
const firstSeq = hooks.seq.slice()

// --- render 2, same props: the hook sequence must be byte-identical
hooks.cursor = 0
hooks.seq = []
Component({ useProjection: makeUseProjection(reads), notify: () => {} })
const secondSeq = hooks.seq.slice()

check(reads.length === 2 && reads.every((n) => n === 'contextPressure'),
  `useProjection called once per render with "contextPressure" (got ${JSON.stringify(reads)})`)
check(JSON.stringify(firstSeq) === JSON.stringify(secondSeq),
  `hook order identical across renders: [${firstSeq.join(', ')}]`)
check(firstSeq[0] === 'useEffect' && firstSeq.includes('useSyncExternalStore'),
  'hook order starts with the styles effect and includes the projection subscription')

// --- a later render must keep the identical hook shape. The slot always hands
// the same standard props, so this asserts the real-world contract: the hook
// sequence never changes between renders.
const reads2 = []
hooks.cursor = 0
hooks.seq = []
Component({ useProjection: makeUseProjection(reads2), notify: () => {} })
const fourthSeq = hooks.seq.slice()
const countOf = (seq, h) => seq.filter((x) => x === h).length
check(JSON.stringify(fourthSeq) === JSON.stringify(firstSeq),
  `hook order identical on a later render: [${fourthSeq.join(', ')}]`)
check(countOf(firstSeq, 'useSyncExternalStore') === 2,
  `both subscriptions run every render (useProjection's + useFace's): got ${countOf(firstSeq, 'useSyncExternalStore')}`)
check(reads2.length === 1 && reads2[0] === 'contextPressure',
  `projection name is the literal "contextPressure" every render (got ${JSON.stringify(reads2)})`)

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`)
