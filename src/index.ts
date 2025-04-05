import { WebSocketServer, WebSocket } from "ws";
import * as net from "net";

const wss = new WebSocketServer({ port: 8080 });
const wss2 = new WebSocketServer({ port: 8081 });

const wssClients = new Set<WebSocket>();
const wss2Clients = new Set<WebSocket>();

const tcpServer = net.createServer();
tcpServer.listen(9090, () => {
  console.log("TCP bridge server listening on port 9090");
});

let tcpClient = new net.Socket();
connectTcpClient();

function connectTcpClient() {
  tcpClient.connect(9090, "localhost", () => {
    console.log("TCP client connected to bridge server");
    startHeartbeat();
  });

  tcpClient.on("error", (err) => {
    console.error("TCP client error:", err);
    setTimeout(reconnectTcpClient, 5000);
  });

  tcpClient.on("close", () => {
    console.log("TCP client connection closed, will attempt to reconnect");
    setTimeout(reconnectTcpClient, 5000);
  });

  tcpClient.on("data", (data) => {
    const message = data.toString();

    if (message === "HEARTBEAT") {
      tcpClient.write("HEARTBEAT_ACK");
      return;
    }

    console.log(`Message from wss2 via TCP: ${message}`);

    wssClients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(`From wss2 (8081): ${message}`);
      }
    });
  });
}

function reconnectTcpClient() {
  console.log("Attempting to reconnect TCP client...");

  tcpClient.destroy();
  tcpClient = new net.Socket();
  connectTcpClient();
}

function startHeartbeat() {
  const heartbeatInterval = setInterval(() => {
    if (tcpClient.destroyed) {
      clearInterval(heartbeatInterval);
      return;
    }

    try {
      tcpClient.write("HEARTBEAT");
    } catch (err) {
      console.error("Failed to send heartbeat:", err);
      clearInterval(heartbeatInterval);
      reconnectTcpClient();
    }
  }, 30000);
}

console.log("WebSocket server is running on ws://localhost:8080");
wss.on("connection", (socket) => {
  console.log("New client connected to wss (8080)");
  wssClients.add(socket);
  socket.send("Welcome to the WebSocket server on port 8080!");

  socket.on("message", (message) => {
    console.log(`Received message from client on wss (8080): ${message}`);

    socket.send(`Echo from 8080: ${message}`);

    try {
      if (!tcpClient.destroyed) {
        tcpClient.write(message.toString());
      } else {
        console.log("TCP client disconnected, attempting to reconnect");
        reconnectTcpClient();
      }
    } catch (err) {
      console.error("Error sending message through TCP:", err);
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected from wss (8080)");
    wssClients.delete(socket);
  });
});

console.log("WebSocket server is running on ws://localhost:8081");
wss2.on("connection", (socket) => {
  console.log("New client connected to wss2 (8081)");
  wss2Clients.add(socket);
  socket.send("Welcome to the WebSocket server on port 8081!");

  socket.on("message", (message) => {
    console.log(`Received message from client on wss2 (8081): ${message}`);

    socket.send(`Echo from 8081: ${message}`);

    tcpServer.getConnections((err, count) => {
      if (!err && count > 0) {
        tcpServer.emit("broadcast", message.toString());
      }
    });
  });

  socket.on("close", () => {
    console.log("Client disconnected from wss2 (8081)");
    wss2Clients.delete(socket);
  });
});

tcpServer.on("connection", (socket) => {
  console.log("New TCP bridge connection established");

  socket.on("data", (data) => {
    const message = data.toString();

    if (message === "HEARTBEAT_ACK") {
      return;
    }

    console.log(`TCP bridge received: ${message}`);

    wss2Clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(`From wss (8080): ${message}`);
      }
    });
  });

  socket.on("error", (err) => {
    console.error("TCP socket error:", err);
  });
});

const tcpSockets = new Set<net.Socket>();

tcpServer.on("connection", (socket) => {
  console.log("New TCP bridge connection established");
  tcpSockets.add(socket);

  socket.on("data", (data) => {
    const message = data.toString();

    if (message === "HEARTBEAT_ACK") {
      return;
    }

    console.log(`TCP bridge received: ${message}`);

    wss2Clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(`From wss (8080): ${message}`);
      }
    });
  });

  socket.on("error", (err) => {
    console.error("TCP socket error:", err);
  });

  socket.on("close", () => {
    tcpSockets.delete(socket);
  });
});

tcpServer.on("broadcast", (message) => {
  tcpSockets.forEach((socket) => {
    if (!socket.destroyed) {
      socket.write(message);
    }
  });
});
