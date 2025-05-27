import {Server, Socket} from "socket.io";
import type {I_Client, I_WsMessage} from "../types.ts";
import type NetworkManager from "./NetworkManager.ts";
import jwt from "jsonwebtoken";

export default class IoSocketServer {
    private ioSocket: Server;
    private wsClientList: I_Client[]
    private networkManager: NetworkManager;
    private JWTOptions: {secret: string, algorithm: string};

    constructor(networkManager: NetworkManager, JWTOptions: {secret: string, algorithm: string}) {
        this.wsClientList = [];
        this.JWTOptions = JWTOptions;
        this.networkManager = networkManager;
        this.ioSocket = new Server(this.networkManager.webServer, {
            cors: {
                origin: "*"
            }
        });

        this.ioSocket.use((socket, next) => this.authMiddleware(socket, next));

        this.ioSocket.on('connection', (socket) => {
            let client = this.getClientBySocketID(socket.id);
            if (!client) {
                this.networkManager.logger.error("Unknown client connected: ", socket.id);
            }
            else {
                this.networkManager.logger.info("Client connected: ", socket.id);

                socket.on('disconnect', () => {
                    this.networkManager.logger.info("Client disconnected: ", socket.id);
                    this.wsClientList = this.wsClientList.filter(client => client.socket.id !== socket.id);
                });

                socket.on("subscribe", () => {
                    client.isSubscribed = true;
                    this.sendEventToClient(client, "confirmSubscription")
                });

                socket.on("unsubscribe", () => {
                    client.isSubscribed = false;
                    this.sendEventToClient(client, "confirmUnsubscription")
                });

                socket.on("heartbeatPong", () => {
                    client.lastPongReceived = Date.now();
                });
            }
        });

        // Heartbeat check interval
        setInterval(() => {
            let now = Date.now();
            for (let i = this.wsClientList.length - 1; i >= 0; i--) {
                const client = this.wsClientList[i];
                
                if (client.lastPingSent < now - 60000) {
                    client.lastPingSent = now;
                    try {
                        this.ioSocket.to(client.socket.id).emit("heartbeatPing");
                    } catch (err) {
                        this.networkManager.logger.error("Error sending ping to client: ", client.socket.id, err);
                    }
                }
                
                if (client.lastPongReceived < now - 120000 && client.lastPingSent > client.lastPongReceived) {
                    this.networkManager.logger.warn("Client disconnected due to inactivity:", client.socket.id);
                    try {
                        client.socket.disconnect();
                    } catch (err) {
                        this.networkManager.logger.error("Error disconnecting client: ", client.socket.id, err);
                    } finally {
                        this.wsClientList.splice(i, 1);
                    }
                }
            }
        }, 60000);
    }

    sendEventToUser(userID: string, event: string, data?: I_WsMessage) {
        const client = this.getClientByUserID(userID);
        if (client) {
            this.sendEventToClient(client, event, data);
        }
    }

    sendEventToAdmins(event: string, data?: I_WsMessage) {
        for (const client of this.wsClientList) {
            if (client.isAdmin) {
                this.sendEventToClient(client, event, data);
            }
        }
    }

    sendEventToClient(client: I_Client, event: string, data?: I_WsMessage) {
        try {
            this.ioSocket.to(client.socket.id).emit(event, data);
        } catch (err) {
            this.networkManager.logger.error("Error sending event to client: ", client.socket.id, err);
        }
    }

    private getClientBySocketID(socketID: string): I_Client | undefined {
        return this.wsClientList.find(client => client.socket.id === socketID);
    }

    private getClientByUserID(userID: string): I_Client | undefined {
        return this.wsClientList.find(client => client.userid === userID);
    }

    private authMiddleware(socket: Socket, next: Function) {
        const token = socket.handshake.auth.token;

        if (token) {
            jwt.verify(token, this.JWTOptions.secret, (err: any, payload: any) => {
                if (err)
                    return next(new Error('Authentication error'));

                let client = this.getClientBySocketID(socket.id);
                if (!client) {
                    // unknown client
                    client = {
                        socket: socket,
                        userid: payload.id,
                        isAdmin: payload.isAdmin || false,
                        isSubscribed: false,
                        lastPingSent: Date.now(),
                        lastPongReceived: Date.now()
                    };
                    this.wsClientList.push(client);
                }
                next();
            });
        }
        else {
            return next(new Error('Authentication error'));
        }
    }
}