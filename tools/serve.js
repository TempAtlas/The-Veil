// A tiny static server for previewing the site locally (the pages load data/*.json, which browsers won't do from
// file://).  node tools/serve.js [port]   then open http://localhost:8080
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const port = +process.argv[2] || 8080;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  });
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
