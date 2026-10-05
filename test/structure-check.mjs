// Independent structural check for the current client.js shape.
// Stubs the harness loader + React, then walks the rendered element tree and
// exercises BOTH data paths: the standard `useProjection` prop and the
// injected projection object fallback.
const hooks = { slots: [], cursor: 0 }
const StubReact = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.filter((c) => c != null && c !== false) }
  },
  useRef(init) { const i = hooks.cursor++; if (!(i in hooks.slots)) hooks.slots[i] = { current: init }; return hooks.slots[i] },
  useCallback(fn, deps) {
    const i = hooks.cursor++
    const prev = hooks.slots[i]
    if (!prev || !deps || deps.some((d, k) => d !== prev.deps[k])) hooks.slots[i] = { fn, deps }
    return hooks.slots[i].fn
  },
  useEffect(fn, deps) {
    const i = hooks.cursor++
    const prev = hooks.slots[i]
    if (!prev || !deps || deps.some((d, k) => d !== prev.deps[k])) { hooks.slots[i] = { deps }; fn() }
  },
  useSyncExternalStore(_s, getSnapshot) { hooks.cursor++; return getSnapshot() },
}
globalThis.__REACT_STUB__ = StubReact
globalThis.document = { createElement: () => ({ remove() {} }), head: { appendChild() {} } }

let entry
globalThis.window = { __ModuleLoader__: { load: (def) => { entry = def } } }
await import('../lib/client.js')
if (!entry) throw new Error('client.js did not register through window.__ModuleLoader__.load')
const mod = entry.factory((id) => {
  if (id === 'react') return StubReact
  throw new Error(`unexpected require("${id}")`)
})
const Component = mod.__test_component

let failed = 0
const check = (ok, line) => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`) }

function scan(el) {
  const found = { texts: [], fill: null, dock: false, wrap: '' }
  const walk = (n) => {
    if (n == null || n === false) return
    if (typeof n === 'object' && n.type) {
      const cn = String(n.props.className ?? '')
      if (cn.includes('tw-dock')) found.dock = true
      if (cn.includes('tw-wrap')) found.wrap = cn
      if (cn.includes('tw-fill')) found.fill = n.props.style.width
      walk(n.props.children)
      for (const c of n.children) walk(c)
    } else found.texts.push(String(n))
  }
  walk(el)
  return found
}

const reset = () => { hooks.slots = []; hooks.cursor = 0 }

/** Path A: the standard slot prop, as the shipped ContextMeter uses it. */
function renderViaHook(tokens, window_) {
  reset()
  return scan(Component({
    useProjection: (name) => (name === 'contextPressure' ? { surfaceTokens: tokens, contextWindow: window_ } : undefined),
    notify: () => {},
  }))
}

/** Path B: the injected projection object fallback (hook present but empty). */
function renderViaFace(tokens, window_) {
  reset()
  const listeners = new Set()
  const face = {
    getSnapshot: () => ({ surfaceTokens: tokens, contextWindow: window_ }),
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
  }
  return scan(Component({
    useProjection: () => undefined,
    projection: face,
    notify: () => {},
  }))
}

for (const [pct, icon] of [[10, '☀️'], [45, '☁️'], [75, '🌧️'], [95, '⛈️']]) {
  const a = renderViaHook(pct * 1000, 100000)
  const okA = a.dock && a.texts.join(' ').includes(icon)
    && a.texts.join(' ').includes(`${pct.toFixed(1)}%`) && a.fill === `${pct}%`
  check(okA, `useProjection ${String(pct).padStart(3)}% -> ${a.texts.join(' ')}  fill=${a.fill}`)

  const b = renderViaFace(pct * 1000, 100000)
  const okB = b.dock && b.texts.join(' ').includes(icon) && b.fill === `${pct}%`
  check(okB, `projection  ${String(pct).padStart(3)}% -> ${b.texts.join(' ')}  fill=${b.fill}`)
}

for (const [pct, icon] of [[30, '☀️'], [60, '☁️'], [90, '🌧️'], [90.1, '⛈️']]) {
  const out = renderViaHook(pct * 1000, 100000)
  check(out.texts.join(' ').includes(icon), `边界 ${pct}% -> ${out.texts.join(' ')}`)
}

const warn = renderViaHook(95000, 100000)
check(warn.wrap.includes('tw-warn') && warn.texts.join(' ').includes('该压缩上下文了'), '95% -> 警告色 + 提示文案')

// With no data source the gauge must still render and degrade to 0.0% — it must
// NOT return early, because an early return skips the remaining hooks and that
// is exactly what made React throw "Invalid hook call" (#321).
reset()
let degraded = null
let threw = false
try {
  degraded = scan(Component({ notify: () => {} }))
} catch {
  threw = true
}
check(!threw && degraded && degraded.dock && degraded.texts.join(' ').includes('0.0%'),
  `无数据源时降级渲染 0.0% 而非提前返回 (${threw ? 'threw' : degraded.texts.join(' ')})`)

// An empty projection (before the first model step) must show 0.0% rather than NaN.
const zero = renderViaHook(0, 0)
check(zero.texts.join(' ').includes('0.0%'), `无窗口数据 -> ${zero.texts.join(' ')}`)

console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`)
