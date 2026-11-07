// Minimal stand-in for Supabase's API gateway, so supabase-js can talk to the
// local servers through one URL:  /rest/v1 -> PostgREST,  /auth/v1 -> Auth.
import http from "node:http";

const routes = [
  ["/rest/v1", Number(process.env.POSTGREST_PORT ?? 54330)],
  ["/auth/v1", Number(process.env.AUTH_PORT ?? 9999)],
];

http
  .createServer((req, res) => {
    const route = routes.find(([prefix]) => req.url.startsWith(prefix));
    if (!route) {
      res.writeHead(404);
      return res.end("no route");
    }
    const [prefix, port] = route;
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port,
        method: req.method,
        path: req.url.slice(prefix.length) || "/",
        headers: { ...req.headers, host: `127.0.0.1:${port}` },
      },
      (u) => {
        res.writeHead(u.statusCode ?? 502, u.headers);
        u.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502);
      res.end(String(e));
    });
    req.pipe(upstream);
  })
  .listen(Number(process.env.GATEWAY_PORT ?? 54321), "127.0.0.1", () => console.log("gateway ready"));
