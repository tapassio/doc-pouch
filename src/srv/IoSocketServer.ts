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
                origin: "*",
                methods: ["GET", "POST"],
                credentials: true
            },
            allowEIO3: true
        });

        this.ioSocket.use((socket, next) => this.authMiddleware(socket, next));

        this.ioSocket.on('connection', (socket) => {
            let client = this.getClientBySocketID(socket.id);
            if (!client) {
                this.networkManager.logger.error(`Unknown client connected: ${socket.id}`);
                socket.disconnect(true);
                return;
            } else if (client.userid) {
                this.networkManager.dataManager.getUserByID(client.userid)
                    .then((userInfo) => {
                        this.networkManager.logger.info(`Client connected: ${userInfo.name} (${userInfo.email}) - ${socket.id}`);

                        socket.on('disconnect', () => {
                            this.networkManager.logger.info(`Client disconnected: ${userInfo.name} (${userInfo.email}) - ${socket.id}`);
                            this.wsClientList = this.wsClientList.filter(c => c.socket.id !== socket.id);
                        });

                        socket.on("heartbeatPong", () => {
                            client.lastPongReceived = Date.now();
                        });
                    })
                    .catch((error) => {
                        this.networkManager.logger.error(`Failed to get user info for ID ${client.userid}: ${error.message}`);
                        socket.on('disconnect', () => {
                            this.networkManager.logger.info(`Client disconnected: ${client.userid} - ${socket.id}`);
                            this.wsClientList = this.wsClientList.filter(c => c.socket.id !== socket.id);
                        });

                        socket.on("heartbeatPong", () => {
                            client.lastPongReceived = Date.now();
                        });
                    });
            } else {
                // Handle case where client exists but doesn't have a user ID
                this.networkManager.logger.warn(`Client connected without user ID: ${socket.id}`);
                socket.disconnect(true);
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

    sendEventToUser(sourceID: string | undefined, userID: string, event: string, data?: I_WsMessage) {
        this.networkManager.logger.debug(`Attempting to send event '${event}' to userID: ${userID}, sourceID: ${sourceID || 'undefined'}`);

        // Debug: Log all clients in the list
        this.networkManager.logger.debug(`Current wsClientList has ${this.wsClientList.length} clients`);
        if (this.wsClientList.length > 0) {
            const clientIDs = this.wsClientList.map(c => `${c.userid}:${c.socket.id}`);
            this.networkManager.logger.debug(`Available clients: ${clientIDs.join(', ')}`);
        }

        const clients = this.wsClientList.filter(client => client.userid === userID);

        if (clients && clients.length > 0) {
            this.networkManager.logger.debug(`Found ${clients.length} clients for userID: ${userID}`);
            for (let client of clients) {
                this.sendEventToClient(sourceID, client, event, data);
                this.sendEventToAdmins(sourceID, event, data);
            }
        } else {
            this.networkManager.logger.warn(`No clients found for userID: ${userID} when trying to send event: ${event}`);
        }
    }

    sendEventToAdmins(sourceID: string | undefined, event: string, data?: I_WsMessage) {
        for (const client of this.wsClientList) {
            if (client.isAdmin) {
                this.sendEventToClient(sourceID, client, event, data);
            }
        }
    }

    sendEventToClient(sourceID: string | undefined, client: I_Client, event: string, data?: I_WsMessage) {
        if (!sourceID || sourceID !== client.socket.id) {
            try {
                this.ioSocket.to(client.socket.id).emit(event, data);
            } catch (err) {
                this.networkManager.logger.error("Error sending event to client: ", client.socket.id, err);
            }
        }
    }

    private getClientBySocketID(socketID: string): I_Client | undefined {
        return this.wsClientList.find(client => client.socket.id === socketID);
    }

    private getClientsByUserID(userID: string): I_Client[] | undefined {
        const clients = this.wsClientList.filter(client => client.userid === userID);
        this.networkManager.logger.debug(`getClientsByUserID: Found ${clients.length} clients for userID: ${userID}`);
        return clients.length > 0 ? clients : undefined;
    }


    private authMiddleware(socket: Socket, next: Function) {
        this.networkManager.logger.debug(`Auth middleware running for socket ${socket.id}`);

        const token = socket.handshake.auth.token;
        if (!token) {
            this.networkManager.logger.warn(`Socket ${socket.id} has no auth token`);
            return next(new Error('Authentication error: No token provided'));
        }

        try {
            this.networkManager.logger.debug(`Verifying JWT token for socket ${socket.id}`);

            jwt.verify(token, this.JWTOptions.secret, (err: any, payload: any) => {
                if (err) {
                    this.networkManager.logger.error(`JWT verification failed for socket ${socket.id}: ${err.message}`);
                    return next(new Error('Authentication error: Invalid token'));
                }

                if (!payload || !payload.id) {
                    this.networkManager.logger.error(`Invalid payload in JWT token for socket ${socket.id}`);
                    return next(new Error('Authentication error: Invalid payload'));
                }

                this.networkManager.logger.debug(`JWT verified successfully for user ${payload.id}, socket ${socket.id}`);

                const client = {
                    socket: socket,
                    userid: payload.id,
                    isAdmin: payload.isAdmin || false,
                    lastPingSent: Date.now(),
                    lastPongReceived: Date.now()
                };

                // Check if this client already exists in the list (by socket ID)
                const existingClientIndex = this.wsClientList.findIndex(c => c.socket.id === socket.id);
                if (existingClientIndex >= 0) {
                    this.networkManager.logger.debug(`Replacing existing client in wsClientList at index ${existingClientIndex}`);
                    this.wsClientList[existingClientIndex] = client;
                } else {
                    this.networkManager.logger.debug(`Adding new client to wsClientList: userID=${payload.id}, socketID=${socket.id}`);
                    this.wsClientList.push(client);
                }

                // Debug: Log all clients in the list
                this.networkManager.logger.debug(`Current wsClientList has ${this.wsClientList.length} clients`);
                this.wsClientList.forEach((c, idx) => {
                    this.networkManager.logger.debug(`Client ${idx}: userID=${c.userid}, socketID=${c.socket.id}`);
                });

                next();
            });
        } catch (error) {
            this.networkManager.logger.error(`Exception in auth middleware for socket ${socket.id}: ${error}`);
            return next(new Error('Authentication error: Server error'));
        }
    }
}