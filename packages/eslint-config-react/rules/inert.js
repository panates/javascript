/**
 * `inert` written the way the oldest React a project supports renders it, read from
 * `settings['react-x'].version` - the setting `@eslint-react` already reads. Without the setting
 * it reports nothing.
 *
 * - Below 19: `inert={...}` and the bare `inert` shorthand are reported. React 18 drops a boolean
 *   `inert`, so the element stays focusable and readable; write `''` on 18 and `true` on 19.
 * - 19 and above: `inert=""` is reported. React 19 reads the empty string as `false` and drops it.
 */
/* Measured from panates/peacox-ui with react-dom 18.3.1 and 19.2.0, through `renderToString` and
 * `createRoot` alike: `inert={true}` - 18 writes nothing and warns "Received `true` for a non-boolean
 * attribute `inert`", 19 writes `inert=""`. `inert=""` - 18 writes `inert=""`, 19 writes nothing and
 * warns "Received an empty string for a boolean attribute `inert`". `false` and `undefined` write
 * nothing on either. A library on `react >=18` writing `inert={open}` therefore leaves closed content
 * focusable on 18 while its tests, on 19, never show it: 9 places in peacox-ui (Collapsible,
 * Dropdown, Popover, Skeleton, Table).
 *
 * Below 19 a string-valued expression is reported too, though 18 renders it: a library whose lowest
 * React is 18 also runs on 19, where the same string is dropped. Only a spread chosen by
 * `React.version` is right on both - and a spread is not a JSX attribute, so it is never reported. */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: "Write `inert` the way the oldest supported React renders it (settings['react-x'].version)",
    },
    schema: [],
    messages: {
      react18:
        'React 18 drops a boolean `inert` and React 19 drops an empty string, so this element stays focusable on one of ' +
        "them. Spread a value chosen by React.version instead: `{ inert: '' }` below 19, `{ inert: true }` from 19, `{}` when off.",
      react19:
        'React 19 reads `inert=""` as false and writes nothing, so the element stays focusable. Write `inert` or `inert={true}`.',
    },
  },
  create(context) {
    const major = reactMajor(context.settings);
    if (major === undefined) return {};
    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'inert') return;
        if (major < 19) {
          if (node.value === null || node.value.type === 'JSXExpressionContainer') {
            context.report({ node, messageId: 'react18' });
          }
        } else if (isEmptyString(node.value)) {
          context.report({ node, messageId: 'react19' });
        }
      },
    };
  },
};

/** The major of `settings['react-x'].version` - `undefined` when it is not set, or is `'detect'`. */
function reactMajor(settings) {
  const version = settings?.['react-x']?.version;
  const match = typeof version === 'string' ? /^\D*(\d+)/.exec(version) : null;
  return match ? Number(match[1]) : undefined;
}

/** `""`, `{''}` or `` {``} `` - the empty string, however it is written. */
function isEmptyString(value) {
  if (!value) return false;
  const node = value.type === 'JSXExpressionContainer' ? value.expression : value;
  if (node.type === 'Literal') return node.value === '';
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0 && node.quasis[0].value.cooked === '';
  return false;
}
