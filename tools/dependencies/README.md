# Dependency security compatibility

These reviewed local packages replace vulnerable transitive implementations while keeping React Native 0.80, Jest 29, ESLint 8, and CLI 19 compatible. They are installed as ordinary packages by the root `overrides` and `.npmrc` (`install-links=true`). They require no postinstall patching and no global loader hooks. Their actual names and sources are recorded in `package-lock.json`.

| Replacement | Implementation | Why it is needed |
| --- | --- | --- |
| `@awakeonlan/minimatch-compat` | `minimatch` 11.0.3, installed as `minimatch-modern` | Old tooling needs a callable CommonJS export. Glob 7 additionally inspects path-part metadata and uses `String.match`; the adapter adds that metadata and routes matching to v11's nonrecursive matcher through `Symbol.match`. No legacy matcher or conversion to unsafe regexes is included. The removed `makeRe`/AST APIs are not emulated; this repository's consumers do not use them. |
| `@awakeonlan/image-size-compat` | `image-size` 2.0.4, installed as `image-size-modern` | Metro passes both image buffers and filenames to a callable CommonJS export. The adapter reads at most 512 KiB from a filename, closes the descriptor in `finally`, and forwards the bytes to v2's patched parsers. It supports Metro's synchronous APIs, not the removed v1 callback/queue APIs. |
| `@awakeonlan/deepmerge-hardened` | Reviewed local patch of the MIT-licensed `deepmerge` 4.3.1 bundled source | No corrected upstream release exists for GHSA-gcqx-w48m-w2h4. All writes to the merge result now use own data properties, including the target-cloning path, so `__proto__` cannot invoke an inherited setter or change the result's prototype. Array/custom merge, symbol, and clone semantics are retained. The original license is included. |

`fast-xml-parser` is overridden to 5.11.2. CLI 19 uses its `XMLParser` API; the Android manifest parsing regression test and actual CLI configuration/build checks cover this usage. The three direct React Native CLI packages are pinned to 19.1.2, the corrected version in the series supported by React Native 0.80.

Relevant upstream advisories and compatibility information:

- [React Native CLI compatibility](https://github.com/react-native-community/cli#compatibility)
- [CLI command injection](https://github.com/advisories/GHSA-399j-vxmf-hjvr)
- [Minimatch globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249)
- [Image-size ICNS infinite loop](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
- [Deepmerge prototype poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
- [XMLBuilder delimiter injection](https://github.com/advisories/GHSA-gh4j-gqv2-49f6)

Run `npm run test:dependencies` after changing overrides or their consumers. Tests exercise legacy and named matcher APIs, glob 7 file discovery, the amplification case in a subprocess with a deadline, merge prototype poisoning and compatibility, Metro image dimensions, malformed ICNS rejection, and Android manifest parsing. Run the application tests, type check, lint, Metro bundle, Android build, and full npm audit as well.

For future dependency or local package changes, use `npm run refresh:dependencies`, then `npm ci`. npm 11 may otherwise resolve a relative directory override against a transitive consumer and fail with `ENOENT` during `npm install`/`npm update` on an existing tree. The refresh command resolves the manifests in a private temporary directory, without install scripts, and replaces the lockfile only after successful resolution. It keeps the current installation untouched until you run `npm ci`.

When upstream consumers support the corrected APIs directly, remove the corresponding adapter and override together. Replace the local deepmerge patch when upstream releases and verifies a suitable correction. Do not remove overrides merely to make installation succeed or exclude advisories from the audit.
