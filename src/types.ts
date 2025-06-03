// Common type definitions for both frontend and backend

// User related types
import type {Socket} from "socket.io";

export interface I_UserEntry extends I_UserCreation{
    _id: string;
}

export interface I_UserLogin {
    name: string;
    password: string;
}

export interface I_UserCreation {
    name: string;
    password: string;
    group: string;
    department: string;
    email?: string;
    isAdmin: boolean;
}

export interface I_UserUpdate {
    _id: string;
    name?: string;
    password?: string;
    email?: string;
    department?: string;
    group?: string;
    isAdmin?: boolean;
}

export interface I_UserDisplay {
    _id: string;
    username: string;
    department: string;
    group: string;
    email?: string;
}

export interface I_LoginResponse {
    token: string;
    isAdmin: boolean;
}

// Document-related types
export interface I_DocumentEntry extends I_DocumentCreationOwned{
    _id: string;
}

export interface I_DocumentCreationOwned extends I_DocumentCreation {
    owner: string;
}

export interface I_DocumentCreation {
    title: string;
    description?: string;
    type: number;
    subType: number;
    content: any;
}

export interface I_DocumentQuery {
    _id?: string;
    owner?: string;
    title?: string;
    type?: number;
    subType?: number;
}

export interface I_DocumentUpdate extends I_DocumentQuery{
    _id: string;
    content?: any;
    description?: string;
}

// Structure-related types
export interface I_DataStructure {
    _id?: string | undefined;
    name: string;
    description: string;
    fields: I_StructureField[];
}

export interface I_StructureEntry {
    _id?: string;
    name: string;
    description: string;
    fields: I_StructureField[];
}

export interface I_StructureUpdate {
    _id: string;
    name?: string;
    description?: string;
    fields?: I_StructureField[];
}

export interface I_StructureCreation {
    name: string;
    description?: string;
    fields: I_StructureField[];
}

export interface I_StructureField {
    name: string;
    type: string;
    items?: string;
}

// Websocket-related types
export interface I_WsMessage {
    newDocument?: I_DocumentEntry;
    newStructure?: I_StructureEntry;
    newUser?: I_UserEntry;
    removedID?: string;
    changedDocument?: I_DocumentUpdate;
    changedStructure?: I_StructureUpdate;
    changedUser?: I_UserUpdate;
    confirmSubscription?: boolean;
    confirmUnsubscription?: boolean;
    heartbeatPing?: number;
    heartbeatPong?: number;
}

export interface I_Client {
    socket: Socket
    userid: string | null;
    isAdmin: boolean;
    lastPingSent: number;
    lastPongReceived: number;
}