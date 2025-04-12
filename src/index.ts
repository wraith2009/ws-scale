// import express from "express";
import { WebSocket, WebSocketServer } from "ws";

/**
 * WebSocker server with http server on same port : 8080
 * @author RahulBhardwaj
 */
// const app = express();

// app.get("/", (req, res) => {
//   console.log("http server listening ");
// });

// let httpServer = app.listen(8080);

// const wss = new WebSocketServer({ server: httpServer });

// wss.on("connection", function message(data, isBinary) {
//   console.log(`Received message: ${data}`);
// });

/**
 *  ws without express
 * @author RahulBhardwaj
 */

// const wss = new WebSocketServer({ port: 8080 });

// wss.on("connection", (socket) => {
//   console.log(`client connected`);

//   socket.on("message", (message) => console.log(`Received message` + message));
// });
