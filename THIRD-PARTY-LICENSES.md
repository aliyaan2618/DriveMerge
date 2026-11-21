# Third-party licences

DriveMerge bundles **rclone** (https://rclone.org), used under the MIT licence:

```
Copyright (C) 2012 by Nick Craig-Wood http://www.craig-wood.com/nick/

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.


```

## Other components

DriveMerge is built with Tauri, React, Google Material Symbols (Apache-2.0) and about 550 Rust and JavaScript libraries, used unmodified. Their licences:

- MIT, Apache-2.0, BSD, ISC, Zlib or Unicode-3.0: almost all of them.
- MPL-2.0: `cssparser`, `cssparser-macros`, `selectors`, `dtoa-short`, `option-ext`. Source code: <https://crates.io>.
- SIL Open Font License 1.1: Geist, Geist Mono and Plus Jakarta Sans fonts (via `@fontsource-variable`), bundled in the app.
- CC0-1.0: `simple-icons` (service logos). The logos are trademarks of their owners and are used only to identify each service.
- CDLA-Permissive-2.0: `webpki-root-certs` (list of trusted certificate authorities).

Each library's licence text is in its source package on crates.io or npmjs.com.
