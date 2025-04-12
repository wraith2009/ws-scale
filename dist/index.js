"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// import express from "express";
const ws_1 = require("ws");
// const app = express();
// app.get("/", (req, res) => {
//   console.log("http server listening ");
// });
// let httpServer = app.listen(8080);
// const wss = new WebSocketServer({ server: httpServer });
// wss.on("connection", function message(data, isBinary) {
//   console.log(`Received message: ${data}`);
// });
const wss = new ws_1.WebSocketServer({ port: 8080 });
wss.on("connection", (socket) => {
    console.log(`client connected`);
    socket.on("message", (message) => console.log(`Received message` + message));
});
