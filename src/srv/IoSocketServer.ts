import {Server, Socket} from "socket.io";
import type {I_Client, I_WsMessage} from "../types.ts";
import type NetworkManager from "./NetworkManager.ts";
import * as http from "node:http";
import jwt from "jsonwebtoken";

export default class IoSocketServer {
    private ioSocket: Server;
    private wsClientList: I_Client[]
    private networkManager: NetworkManager;
    private JWTOptions

    constructor(networkManager: NetworkManager, JWTOptions: {secret: string, algorithm: string}) {
        this.wsClientList = [];
        this.JWTOptions = JWTOptions;
        this.networkManager = networkManager;
        this.ioSocket = new Server(this.networkManager.webServer, {
            cors: {
                origin: "*"
            }
        })

        this.ioSocket.use(this.authMiddleware);

        this.ioSocket.on('connection', (socket) => {
            let client = this.getClientBySocketID(socket.id);
            if (!client) {
                console.log("Unknown client connected: ", socket.id);
            }
            else {
                console.log('A user connected:', socket.id);

                this.ioSocket.on('disconnect', () => {
                    console.log('User disconnected:', socket.id);
                    this.wsClientList = this.wsClientList.filter(client => client.socket.id !== socket.id);
                });

                this.ioSocket.on("subscribe", (command: string) => {
                    client.isSubscribed = true;
                    this.sendEventToClient(client, "confirmSubscription")
                });

                this.ioSocket.on("unsubscribe", (command: string) => {
                    client.isSubscribed = false;
                    this.sendEventToClient(client, "confirmUnsubscription")
                });

                this.ioSocket.on("heartbeatPong", (command: string) => {
                    client.lastPongReceived = Date.now();
                })
            }
        });
    }

    sendEventToUser(userID: string, event: string, data?: I_WsMessage) {
        for (const client of this.wsClientList) {
            if (client.userid === userID) {
                this.sendEventToClient(client, event, data);
            }
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
        this.ioSocket.to(client.socket.id).emit(event, data);
        this.sendEventToAdmins(event, data);
    }

    private getClientBySocketID (socketID: string): I_Client | undefined {
        for (const client of this.wsClientList) {
            if (client.socket.id === socketID)
                return client;
        }
        return undefined;
    }
    private getClientByUserID (userID: string): I_Client | undefined {
        for (const client of this.wsClientList) {
            if (client.userid === userID)
                return client;
        }
        return undefined;
    }

    private authMiddleware (socket: Socket, next: Function) {
        const token = socket.handshake.auth.token;

        if (token) {
            jwt.verify(token, this.JWTOptions.secret, (err: any, payload: any) => {
                if (err)
                    next(new Error('Authentication error'));

                let client = this.getClientBySocketID(socket.id);
                if (!client) {
                    // unknown client
                    client = {
                        socket: socket,
                        userid: payload.id,
                        isAdmin: payload.isAdmin || false,
                        isSubscribed: false,
                        lastPingSent: 0,
                        lastPongReceived: 0
                    }
                    this.wsClientList.push(client);
                }
                next();
            });
        }
        else {
            return next(new Error('Authentication error'));
        }
    };
}