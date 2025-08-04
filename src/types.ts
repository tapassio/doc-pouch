// Common type definitions for both frontend and backend

// User related types
import type {Socket} from "socket.io";

export interface I_Client {
    socket: Socket
    userid: string | null;
    isAdmin: boolean;
    lastPingSent: number;
    lastPongReceived: number;
}
