import http from "node:http";
import React from "react";
import { renderToString, renderToPipeableStream } from "react-dom/server";
import { Page } from "./shared/tree.js";
import { concat } from "./shared/concat.js";
http
  .createServer((req, res) => {
    res.setHeader("content-type", "text/html; charset=utf-8");
    if (req.url === "/concat") res.end(concat());
    else if (req.url === "/stream") {
      const s = renderToPipeableStream(React.createElement(Page), {
        onAllReady() {
          s.pipe(res);
        },
        onError(e) {
          res.destroy(e);
        },
      });
    } else res.end(renderToString(React.createElement(Page)));
  })
  .listen(Number(process.env.PORT || 4100), "127.0.0.1");
