/**
 * Order class members so a reader meets the shape, then the door, then the API, then the workings.
 *
 * This is `@typescript-eslint/member-ordering`'s own default order with one deviation: a public
 * static method comes before the constructor, because a factory (`create()`, `from()`) is how you
 * get an instance and belongs beside the constructor it stands in for - the default buries it below
 * the accessors.
 *
 * https://typescript-eslint.io/rules/member-ordering
 *
 * **Opt-in, and separate from `configPatches.ts` on purpose.** The rule has **no autofix and no
 * suggestions** - checked against its own metadata, `fixable` is unset and `hasSuggestions` is
 * false - because reordering class members can change behaviour: field initializers run in
 * declaration order, decorators and `static` blocks are position-sensitive, and overload signatures
 * have to stay adjacent. So every violation is hand-work.
 *
 * Turning it on in the shared config therefore turns an existing tree red all at once with no way
 * to clear it mechanically: measured on one repository, 52 errors across 12 files the day it was
 * enabled. Adopt it per repository, once that repository's classes have caught up.
 *
 * @example
 * import tsConfig from '@panates/eslint-config-ts';
 *
 * export default [
 *   ...tsConfig.configs.node,
 *   ...tsConfig.configPatches.memberOrdering,
 * ];
 */
export default [
  {
    name: 'panates/member-ordering',
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: [
            'public-static-field',
            'protected-static-field',
            'private-static-field',
            'public-instance-field',
            'protected-instance-field',
            'private-instance-field',
            'public-static-method',
            'public-constructor',
            'protected-constructor',
            'private-constructor',
            'public-instance-get',
            'public-instance-set',
            'public-instance-method',
            'protected-instance-method',
            'private-instance-method',
            'protected-static-method',
            'private-static-method',
          ],
        },
      ],
    },
  },
];
