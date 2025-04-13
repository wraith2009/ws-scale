import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "redis";

const Channel = "broadcast";

const redisPub1 = createClient();
const redisSub1 = createClient();
const redisPub2 = createClient();
const redisSub2 = createClient();

const wss = new WebSocketServer({ port: 8080 });
const wss2 = new WebSocketServer({ port: 8081 });

wss.on("connection", (socket) => {
  socket.on("message", async (msg) => {
    console.log("recieved msg on wss : ", msg.toString());

    broadcast(wss, msg.toString());

    const payload = JSON.stringify({
      sender: "wss",
      data: msg.toString(),
    });

    await redisPub1.publish(Channel, payload);
  });

  socket.send("hello from wss");
});

wss2.on("connection", (socket) => {
  socket.on("message", async (msg) => {
    console.log("recieved msg on wss2 : ", msg.toString());

    broadcast(wss2, msg.toString());

    const payload = JSON.stringify({
      sender: "wss2",
      data: msg.toString(),
    });
    await redisPub2.publish(Channel, payload);
  });

  socket.send("hello from wss2");
});

(async () => {
  await redisPub1.connect();
  await redisPub2.connect();
  await redisSub1.connect();
  await redisSub2.connect();

  redisSub1.subscribe(Channel, (msg) => {
    try {
      const msgObj = JSON.parse(msg);

      if (msgObj.sender !== "wss") {
        console.log(`wss1 received from Redis: ${msgObj.data}`);
        broadcast(wss, msgObj.data);
      }
    } catch (error) {
      console.error("Error parsing message in wss1:", error);
    }
  });

  redisSub2.subscribe(Channel, (message) => {
    try {
      const msgObj = JSON.parse(message);
      if (msgObj.sender !== "wss2") {
        console.log(`wss2 received from Redis: ${msgObj.data}`);
        broadcast(wss2, msgObj.data);
      }
    } catch (err) {
      console.error("Error parsing message in wss2:", err);
    }
  });
})();

function broadcast(server: WebSocketServer, data: any) {
  server.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
