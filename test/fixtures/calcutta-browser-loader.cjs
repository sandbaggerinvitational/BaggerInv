module.exports = function (source) {
  if (this.resourcePath.endsWith(".css")) {
    const classes = Object.fromEntries(
      [...source.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => [m[1], m[1]]),
    );
    return `const s=document.createElement('style');s.textContent=${JSON.stringify(source)};document.head.append(s);export default ${JSON.stringify(classes)};`;
  }
  const done = this.async();
  require("next/dist/build/swc")
    .transform(source, {
      filename: this.resourcePath,
      jsc: {
        parser: { syntax: "ecmascript", jsx: true },
        transform: { react: { runtime: "automatic" } },
        target: "es2020",
      },
      module: { type: "es6" },
    })
    .then((r) => done(null, r.code), done);
};
