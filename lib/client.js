/**
 * Token Weather — browser half.
 *
 * Docks a weather gauge above the composer: context-window occupancy read from
 * the `contextPressure` session projection, shown as icon + percentage +
 * progress bar. Past 90% it adds a compress warning and one notice per ascent.
 *
 * Shipped as a CLASSIC script, not an ES module: the DSH web client
 * concatenates every plugin's `client.js` into one bundle, so each file must
 * self-register through the harness `window.__ModuleLoader__` (there is no
 * `import`/`export` here on purpose — ESM syntax would break the whole boot).
 */
window.__ModuleLoader__.load({
  id: 'dsh-token-weather',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');

    const ID = 'token-weather';
    // Aligns the gauge exactly with the composer card's left/right edges.
    // Mirrors the shipped QueueDock in this same slot: its strip is the card
    // width widened by the dock inset on both sides, and its own
    // `padding: 0 dock-inset` then lands the content exactly on the card edges.
    // (The card itself is `width:100%; max-width: var(--dsh-composer-card-max-width)`.)
    const CSS = `
.tw-dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));max-width:calc(var(--dsh-composer-card-max-width) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto;padding:0 var(--dsh-composer-dock-inset);flex:none}
.tw-wrap{display:flex;align-items:center;gap:8px;padding:2px 0 6px;font-size:12px;line-height:1.4;color:var(--dsw-alias-label-secondary)}
.tw-icon{font-size:13px;line-height:1;flex:none}
.tw-pct{font-variant-numeric:tabular-nums;flex:none;min-width:42px}
.tw-track{flex:1;height:5px;border-radius:999px;background:var(--dsw-alias-border-l1);overflow:hidden}
.tw-fill{height:100%;border-radius:999px;background:var(--dsw-alias-brand-primary);transition:width .45s ease}
.tw-warn{color:var(--dsw-alias-state-warn-primary)}
.tw-warn .tw-fill{background:var(--dsw-alias-state-warn-primary)}
`;
    const WEATHER = [
      { max: 30, icon: '☀️', name: '晴天' },
      { max: 60, icon: '☁️', name: '多云' },
      { max: 90, icon: '🌧️', name: '下雨' },
      { max: Number.POSITIVE_INFINITY, icon: '⛈️', name: '雷暴' },
    ];
    /** Inclusive bounds: 0-30 sunny, 30-60 cloudy, 60-90 rain, 90+ storm. */
    const pick = (pct) => WEATHER.find((w) => pct <= w.max) || WEATHER[3];

    /**
     * Subscribe to one projection face; its snapshot identity is the render input.
     *
     * Both callbacks are created unconditionally with a constant dependency list,
     * so this hook contributes the same slots on every render whether or not a
     * face was handed over.
     */
    function useFace(face) {
      const subscribe = React.useCallback(
        (onChange) => (face ? face.subscribe(onChange) : () => {}), [face]);
      const read = React.useCallback(() => (face ? face.getSnapshot() : undefined), [face]);
      return React.useSyncExternalStore(subscribe, read, read);
    }

    /** Inject the gauge stylesheet once per mounted surface. */
    function useStyles() {
      React.useEffect(() => {
        const tag = document.createElement('style');
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => tag.remove();
      }, []);
    }

    /**
     * Read the context-pressure snapshot.
     *
     * `useProjection` IS a React hook — it ends in
     * `useSyncExternalStoreWithSelector` -> `useRef`. React error #321 ("Invalid
     * hook call") is what you get otherwise, and here it silently pinned the
     * gauge at 0.0% because the throw happened on every render.
     *
     * So: one unconditional call, first, with a literal name — exactly how the
     * shipped ContextMeter reads it. `useFace` follows unconditionally too, and
     * only the RESULT is selected between them.
     */
    function usePressure(props) {
      // A missing prop must not remove a hook call from the sequence, so the
      // call site is unconditional and only the value is selected afterwards.
      const project = props.useProjection;
      const fromHook = typeof project === 'function' ? project('contextPressure') : undefined;
      const fromFace = useFace(props.projection);
      return fromHook !== undefined ? fromHook : fromFace;
    }

    function TokenWeather(props) {
      useStyles();
      const snap = usePressure(props);
      const limit = (snap && snap.contextWindow) || 0;
      // The published pressure snapshot carries `projectedTokens` (the current
      // context size the next request would send) plus `pressureTokens` (the
      // same figure including pressure estimates). Older builds exposed
      // `surfaceTokens`, so it stays as a last fallback.
      const used = (snap && (snap.projectedTokens || snap.pressureTokens || snap.surfaceTokens)) || 0;
      const pct = limit > 0 ? (used / limit) * 100 : 0;
      const weather = pick(pct);
      const alerted = React.useRef(false);
      const notify = props.notify;

      // Edge-triggered: one notice per ascent past 90%, re-armed once it drops back.
      React.useEffect(() => {
        if (pct < 90) { alerted.current = false; return; }
        if (alerted.current) return;
        alerted.current = true;
        try { notify('warn', '该压缩上下文了'); } catch { /* composer notice is best-effort */ }
      }, [pct, notify]);

      return React.createElement('div', { className: 'tw-dock' },
        React.createElement('div', {
          className: pct >= 90 ? 'tw-wrap tw-warn' : 'tw-wrap',
          title: `${weather.name} · ${used} / ${limit} tokens`,
        },
          React.createElement('span', { className: 'tw-icon' }, weather.icon),
          React.createElement('span', { className: 'tw-pct' }, `${pct.toFixed(1)}%`),
          React.createElement('div', { className: 'tw-track' },
            React.createElement('div', { className: 'tw-fill', style: { width: `${Math.min(pct, 100)}%` } })),
          pct >= 90 && React.createElement('span', null, '该压缩上下文了')));
    }

    const name = 'dsh-token-weather';

    /** Required services for the dock seat. */
    const inject = ['slots', 'sessions'];

    function apply(ctx) {
      const sessions = ctx.sessions;
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: ID,
        order: 15,
        inject: (sessionId) => {
          const binding = sessions.binding(sessionId);
          if (binding === undefined) throw new Error(`token-weather: session "${sessionId}" is unavailable`);
          const scope = sessions.scope(sessionId);
          const conversationInput = scope === undefined ? undefined : scope.get('conversation.input');
          return {
            projection: binding.session.projections.faceOf('contextPressure'),
            notify: (level, text) => conversationInput && conversationInput.for(scope).notify(level, text),
          };
        },
      }, TokenWeather));
    }

    // Exported for the offline render check in test/render-check.mjs.
    exports.__test_component = TokenWeather;
    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  },
});
