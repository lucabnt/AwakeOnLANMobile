'use strict';

// Metro 0.82 passes both buffers and filenames to its callable image-size import.
// Keep file reads bounded like v1, then use v2's corrected parsers in both cases.
const fs = require('node:fs');
const modern = require('image-size-modern');

function imageSize(input) {
  if (typeof input !== 'string') return modern.imageSize(input);
  const descriptor = fs.openSync(input, 'r');
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new TypeError('Image path must refer to a file.');
    const bytes = Buffer.alloc(Math.min(stat.size, 512 * 1024));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (count === 0) break;
      offset += count;
    }
    return modern.imageSize(bytes.subarray(0, offset));
  } finally {
    fs.closeSync(descriptor);
  }
}

module.exports = Object.assign(imageSize, modern);
module.exports.imageSize = imageSize;
module.exports.default = imageSize;
