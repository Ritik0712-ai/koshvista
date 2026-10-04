import { serve } from "@hono/node-server";
import api from "./api";
serve({ fetch: api.fetch, hostname: "127.0.0.1", port: 8787 });
console.log("KoshVista API on http://127.0.0.1:8787");
