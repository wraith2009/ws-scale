"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
const net = __importStar(require("net"));
// WebSocket servers
const wss = new ws_1.WebSocketServer({ port: 8080 });
const wss2 = new ws_1.WebSocketServer({ port: 8081 });
// Store connected WebSocket clients
const wssClients = new Set();
const wss2Clients = new Set();
// TCP server for the bridge
const tcpServer = net.createServer();
tcpServer.listen(9090, () => {
    console.log("TCP bridge server listening on port 9090");
});
// TCP client for the bridge
let tcpClient = new net.Socket();
connectTcpClient();
// Function to establish TCP client connection with retry logic
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
        // Check if it's a heartbeat
        if (message === "HEARTBEAT") {
            tcpClient.write("HEARTBEAT_ACK");
            return;
        }
        console.log(`Message from wss2 via TCP: ${message}`);
        // Broadcast to all clients connected to wss (bidirectional communication)
        wssClients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(`From wss2 (8081): ${message}`);
            }
        });
    });
}
// Function to reconnect TCP client if connection fails
function reconnectTcpClient() {
    console.log("Attempting to reconnect TCP client...");
    // Create a new socket if the previous one had issues
    tcpClient.destroy();
    tcpClient = new net.Socket();
    connectTcpClient();
}
// Heartbeat mechanism to verify connection health
function startHeartbeat() {
    const heartbeatInterval = setInterval(() => {
        if (tcpClient.destroyed) {
            clearInterval(heartbeatInterval);
            return;
        }
        try {
            tcpClient.write("HEARTBEAT");
        }
        catch (err) {
            console.error("Failed to send heartbeat:", err);
            clearInterval(heartbeatInterval);
            reconnectTcpClient();
        }
    }, 30000); // Check every 30 seconds
}
// Handle wss connections (8080)
console.log("WebSocket server is running on ws://localhost:8080");
wss.on("connection", (socket) => {
    console.log("New client connected to wss (8080)");
    wssClients.add(socket);
    socket.send("Welcome to the WebSocket server on port 8080!");
    socket.on("message", (message) => {
        console.log(`Received message from client on wss (8080): ${message}`);
        // Echo back to the sender
        socket.send(`Echo from 8080: ${message}`);
        // Forward to TCP bridge
        try {
            if (!tcpClient.destroyed) {
                tcpClient.write(message.toString());
            }
            else {
                console.log("TCP client disconnected, attempting to reconnect");
                reconnectTcpClient();
            }
        }
        catch (err) {
            console.error("Error sending message through TCP:", err);
        }
    });
    socket.on("close", () => {
        console.log("Client disconnected from wss (8080)");
        wssClients.delete(socket);
    });
});
// Handle wss2 connections (8081)
console.log("WebSocket server is running on ws://localhost:8081");
wss2.on("connection", (socket) => {
    console.log("New client connected to wss2 (8081)");
    wss2Clients.add(socket);
    socket.send("Welcome to the WebSocket server on port 8081!");
    socket.on("message", (message) => {
        console.log(`Received message from client on wss2 (8081): ${message}`);
        // Echo back to the sender
        socket.send(`Echo from 8081: ${message}`);
        // Forward to all TCP connections (bidirectional communication)
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
// TCP server connection handling
tcpServer.on("connection", (socket) => {
    console.log("New TCP bridge connection established");
    socket.on("data", (data) => {
        const message = data.toString();
        // Check if it's a heartbeat acknowledgment
        if (message === "HEARTBEAT_ACK") {
            return;
        }
        console.log(`TCP bridge received: ${message}`);
        // Broadcast to all clients connected to wss2
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
// Custom broadcast event for TCP server
// Track connected sockets
const tcpSockets = new Set();
tcpServer.on("connection", (socket) => {
    console.log("New TCP bridge connection established");
    tcpSockets.add(socket);
    socket.on("data", (data) => {
        const message = data.toString();
        // Check if it's a heartbeat acknowledgment
        if (message === "HEARTBEAT_ACK") {
            return;
        }
        console.log(`TCP bridge received: ${message}`);
        // Broadcast to all clients connected to wss2
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
// Custom broadcast event for TCP server
tcpServer.on("broadcast", (message) => {
    // Iterate through all tracked TCP connections
    tcpSockets.forEach((socket) => {
        if (!socket.destroyed) {
            socket.write(message);
        }
    });
});
