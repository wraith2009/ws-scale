import { WebSocketServer } from "ws";
import WebSocket from "ws";

// WebSocket servers
const wss = new WebSocketServer({ port: 8080 });
const wss2 = new WebSocketServer({ port: 8081 });
const wss3 = new WebSocketServer({ port: 8082 });
const wss4 = new WebSocketServer({ port: 8083 });

// Store connected WebSocket clients
const wssClients = new Set<BridgeWebSocket>();
const wss2Clients = new Set<BridgeWebSocket>();

// Internal bridge connection between servers
// Interface for WebSocket clients
interface BridgeWebSocket extends WebSocket {
  heartbeatTimeoutId?: NodeJS.Timeout;
  isBridgeConnection?: boolean;
}

// Bridge connection between servers
let bridgeConnection: BridgeWebSocket | null = null;

// Connection status and retry counter
let isConnected = false;
let retryCount = 0;
const maxRetries = 10;
const retryDelay = 5000; // 5 seconds

// Function to establish connection from wss to wss2
function connectBridge() {
  console.log("Attempting to connect bridge from wss to wss2...");

  try {
    // Create WebSocket connection from wss to wss2
    bridgeConnection = new WebSocket("ws://localhost:8081");

    bridgeConnection.on("open", () => {
      console.log("Bridge connection established between servers");
      isConnected = true;
      retryCount = 0;

      // Identify this connection as a bridge to distinguish from regular clients
      if (bridgeConnection) {
        bridgeConnection.send(
          JSON.stringify({
            type: "bridge-handshake",
            source: "wss-8080",
          })
        );
      }

      // Start heartbeat for connection monitoring
      startHeartbeat();
    });

    bridgeConnection.on("message", (data) => {
      try {
        const message = data.toString();
        const parsedMessage = JSON.parse(message);

        // Handle heartbeat messages
        if (parsedMessage.type === "heartbeat") {
          if (bridgeConnection) {
            bridgeConnection.send(
              JSON.stringify({
                type: "heartbeat-ack",
              })
            );
          }
          return;
        }

        if (parsedMessage.type === "bridge-message") {
          console.log(
            `Bridge received message from wss2: ${parsedMessage.content}`
          );

          // Broadcast to all clients connected to wss
          wssClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(`From wss2 (8081): ${parsedMessage.content}`);
            }
          });
        }
      } catch (err) {
        console.error("Error handling bridge message:", err);
      }
    });

    bridgeConnection.on("close", () => {
      console.log("Bridge connection closed");
      isConnected = false;
      handleReconnection();
    });

    bridgeConnection.on("error", (err) => {
      console.error("Bridge connection error:", err);
      isConnected = false;

      // The close event will also fire, which will trigger reconnection
    });
  } catch (err) {
    console.error("Failed to create bridge connection:", err);
    handleReconnection();
  }
}

// Function to handle reconnection logic
function handleReconnection() {
  if (retryCount < maxRetries) {
    retryCount++;
    console.log(
      `Reconnection attempt ${retryCount}/${maxRetries} in ${retryDelay}ms`
    );

    setTimeout(() => {
      if (!isConnected) {
        connectBridge();
      }
    }, retryDelay);
  } else {
    console.error(
      "Maximum reconnection attempts reached. Please restart the server."
    );

    // Reset and try again after a longer delay
    retryCount = 0;
    setTimeout(() => {
      if (!isConnected) {
        connectBridge();
      }
    }, retryDelay * 3);
  }
}

// Start heartbeat mechanism for the bridge connection
function startHeartbeat() {
  const heartbeatInterval = setInterval(() => {
    if (
      !isConnected ||
      !bridgeConnection ||
      bridgeConnection.readyState !== WebSocket.OPEN
    ) {
      clearInterval(heartbeatInterval);
      return;
    }

    try {
      bridgeConnection.send(
        JSON.stringify({
          type: "heartbeat",
          timestamp: Date.now(),
        })
      );

      // Set a timeout to verify response
      const heartbeatTimeout = setTimeout(() => {
        console.log("Heartbeat failed - no response received");
        if (bridgeConnection) {
          bridgeConnection.terminate();
        }
        isConnected = false;
        handleReconnection();
      }, 5000);

      // Store the timeout ID in the connection object
      bridgeConnection.heartbeatTimeoutId = heartbeatTimeout;
    } catch (err) {
      console.error("Failed to send heartbeat:", err);
      clearInterval(heartbeatInterval);
      isConnected = false;
      handleReconnection();
    }
  }, 30000); // Heartbeat every 30 seconds
}

// Handle wss connections (8080)
console.log("WebSocket server is running on ws://localhost:8080");
wss.on("connection", (socket, req) => {
  console.log("New client connected to wss (8080)");
  wssClients.add(socket);
  socket.send("Welcome to the WebSocket server on port 8080!");

  socket.on("message", (message) => {
    try {
      // Check if this is a special bridge message
      if (message.toString().includes("bridge-handshake")) {
        console.log("Received bridge handshake message");
        return;
      }

      console.log(`Received message from client on wss (8080): ${message}`);

      // Echo back to the sender
      socket.send(`Echo from 8080: ${message}`);

      // Forward to wss2 through the bridge connection
      if (
        isConnected &&
        bridgeConnection &&
        bridgeConnection.readyState === WebSocket.OPEN
      ) {
        bridgeConnection.send(
          JSON.stringify({
            type: "bridge-message",
            content: message.toString(),
            timestamp: Date.now(),
          })
        );
      } else {
        console.log("Bridge connection not available. Message not forwarded.");
        if (!isConnected) {
          connectBridge();
        }
      }
    } catch (err) {
      console.error("Error processing message on wss:", err);
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected from wss (8080)");
    wssClients.delete(socket);
  });
});

// Handle wss2 connections (8081)
console.log("WebSocket server is running on ws://localhost:8081");
wss2.on("connection", (socket, req) => {
  console.log("New client connected to wss2 (8081)");

  let isBridgeConnection = false;

  socket.on("message", (message) => {
    try {
      const messageStr = message.toString();

      // Try to parse the message as JSON
      try {
        const parsedMessage = JSON.parse(messageStr);

        // Handle bridge handshake
        if (parsedMessage.type === "bridge-handshake") {
          console.log("Received bridge connection from", parsedMessage.source);
          isBridgeConnection = true;
          return;
        }

        // Handle heartbeat messages
        if (parsedMessage.type === "heartbeat") {
          socket.send(
            JSON.stringify({
              type: "heartbeat-ack",
              timestamp: Date.now(),
            })
          );
          return;
        }

        // Handle heartbeat acknowledgment
        if (parsedMessage.type === "heartbeat-ack") {
          // Clear the timeout for the heartbeat if it exists
          if ((socket as BridgeWebSocket).heartbeatTimeoutId) {
            clearTimeout((socket as BridgeWebSocket).heartbeatTimeoutId);
            (socket as BridgeWebSocket).heartbeatTimeoutId = undefined;
          }
          return;
        }

        // Handle bridge messages
        if (parsedMessage.type === "bridge-message") {
          console.log(`Bridge message from wss: ${parsedMessage.content}`);

          // Broadcast to all clients connected to wss2 (except bridge connections)
          wss2Clients.forEach((client) => {
            if (client !== socket && client.readyState === WebSocket.OPEN) {
              client.send(`From wss (8080): ${parsedMessage.content}`);
            }
          });
          return;
        }
      } catch (e) {
        // Not a JSON message, treat as regular message
      }

      // Regular client message handling
      if (!isBridgeConnection) {
        console.log(
          `Received message from client on wss2 (8081): ${messageStr}`
        );
        socket.send(`Echo from 8081: ${messageStr}`);

        // Broadcast to wss through any available bridge connection
        wss2Clients.forEach((client) => {
          if (
            client.isBridgeConnection &&
            client.readyState === WebSocket.OPEN
          ) {
            client.send(
              JSON.stringify({
                type: "bridge-message",
                content: messageStr,
                timestamp: Date.now(),
              })
            );
          }
        });
      }
    } catch (err) {
      console.error("Error processing message on wss2:", err);
    }
  });

  // Mark this connection as a bridge if identified
  (socket as BridgeWebSocket).isBridgeConnection = isBridgeConnection;

  // Add to clients set
  wss2Clients.add(socket);

  // Only send welcome message to regular clients
  if (!isBridgeConnection) {
    socket.send("Welcome to the WebSocket server on port 8081!");
  }

  socket.on("close", () => {
    if (isBridgeConnection) {
      console.log("Bridge connection to wss2 closed");
    } else {
      console.log("Client disconnected from wss2 (8081)");
    }
    wss2Clients.delete(socket);
  });
});

// Basic implementation for the other servers
wss3.on("connection", (socket) => {
  console.log("New client connected to wss3 (8082)");
  socket.send("Welcome to the WebSocket server on port 8082!");

  socket.on("message", (message) => {
    console.log(`Received message from client on wss3 (8082): ${message}`);
    socket.send(`Echo from 8082: ${message}`);
  });
});

wss4.on("connection", (socket) => {
  console.log("New client connected to wss4 (8083)");
  socket.send("Welcome to the WebSocket server on port 8083!");

  socket.on("message", (message) => {
    console.log(`Received message from client on wss4 (8083): ${message}`);
    socket.send(`Echo from 8083: ${message}`);
  });
});

// Start the bridge connection after servers are initialized
setTimeout(connectBridge, 1000);

// Handle process termination
process.on("SIGINT", () => {
  console.log("Shutting down servers...");
  if (bridgeConnection) bridgeConnection.close();
  wss.close();
  wss2.close();
  wss3.close();
  wss4.close();
  process.exit(0);
});
