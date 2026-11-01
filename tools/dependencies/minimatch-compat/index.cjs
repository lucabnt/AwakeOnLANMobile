'use strict';

// Retain the callable CommonJS API used by glob 7 / ESLint 8 while executing
// only minimatch 11's patched implementation. No old matcher is bundled here.
const modern = require('minimatch-modern');

class CompatMinimatch extends modern.Minimatch {
  constructor(pattern, options) {
    super(pattern, options);
    // glob 7 inspects _glob and calls String.match on individual path parts.
    // Route that operation to the patched nonrecursive matcher, never a RegExp.
    for (const row of this.set) {
      for (const part of row) {
        if (part && typeof part.test === 'function') {
          part._glob = part.pattern;
          part[Symbol.match] = value => (part.test(value) ? [value] : null);
        }
      }
    }
  }

  static defaults(options) {
    const Base = this;
    return class extends Base {
      constructor(pattern, overrides) {
        super(pattern, { ...options, ...overrides });
      }
    };
  }
}

function defaults(options) {
  const matcher = modern.defaults(options);
  matcher.Minimatch = CompatMinimatch.defaults(options);
  matcher.defaults = overrides => defaults({ ...options, ...overrides });
  return matcher;
}

module.exports = Object.assign(modern.minimatch, modern);
// Explicit assignments also expose named exports to Node's ESM/CJS interop.
module.exports.minimatch = modern.minimatch;
module.exports.Minimatch = CompatMinimatch;
module.exports.GLOBSTAR = modern.GLOBSTAR;
module.exports.filter = modern.filter;
module.exports.defaults = defaults;
module.exports.match = modern.match;
module.exports.braceExpand = modern.braceExpand;
module.exports.escape = modern.escape;
module.exports.unescape = modern.unescape;
module.exports.sep = modern.sep;
