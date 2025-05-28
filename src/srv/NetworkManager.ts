import type {NextFunction, Request, Response} from 'express';
import express from 'express';
import expressWs from 'express-ws';
import path, {dirname} from 'path';
import {fileURLToPath} from 'url';
import cors from 'cors';
import type {I_UserEntry, I_UserUpdate} from "../types.ts";
import NeDbWrapper from "./NeDbWrapper.js";
import winston from "winston";
import jwt from "jsonwebtoken"
import SchemaValidator from "./SchemaValidator.js";
import IoSocketServer from "./IoSocketServer.js";
import * as http from "node:http";

const JWTOptions = {
    secret: "ThisIsMyVeryOwnAndCreativeSecret",
    algorithm: "HS512"
};

export default class NetworkManager{
    corsOptions: any;
    port: number;
    private readonly expressApp: express.Application;
    dataManager: NeDbWrapper;
    private socketServer: IoSocketServer
    webServer: http.Server
    logger: winston.Logger
    validator: SchemaValidator

    constructor(logger: winston.Logger, dataManager: NeDbWrapper, port: number, corsOptions = {origin: "*", credentials: true}) {
        this.corsOptions = corsOptions;
        this.port = port;
        this.expressApp = express();
        expressWs(this.expressApp)
        this.dataManager = dataManager;
        this.logger = logger;
        this.validator = new SchemaValidator(logger);
        this.webServer = this.expressApp.listen(this.port, () => {
            this.logger.log("info", "Server is running on http://localhost:" + this.port);
        });
        this.socketServer = new IoSocketServer(this, JWTOptions)
        this.initializeExpress();
    }

    private initializeExpress(): void {
        let myDirname = dirname(fileURLToPath(import.meta.url));
        this.expressApp.use(express.static(path.join(myDirname, 'vue')));
        this.expressApp.use(express.json());
        this.expressApp.use(cors(this.corsOptions));
        this.expressApp.disable('etag'); // Disable ETag header to prevent caching of responses

        this.expressApp.get('/users/list', this.authenticateJWT.bind(this), (req, res) => {
            // Use the new getUsers method with access control
            this.dataManager.getUsers(req.userid)
                .then((users: I_UserEntry[]) => {
                    res.status(200).json(users);
                }).catch((error) => {
                    res.status(500).json({error: error.message});
                });
        });

        this.expressApp.post("/users/create", this.authenticateJWT.bind(this), (req, res) => {
            if (this.validator.validate("userCreation", req.body))
            {
                this.dataManager.isAdmin(req.userid).then((isAdmin) => {
                    if (isAdmin) {
                        this.dataManager.createUser(req.body)
                            .then((newUser) => {
                                this.socketServer.sendEventToAdmins("newUser", {newUser: newUser});
                                this.logger.info("New user created:", newUser);
                                res.status(200).json(newUser);
                            })
                            .catch((error) => {
                                res.status(500).json({error: error.message});
                            });
                    } else
                        res.status(401).json({error: "Not authorized to create users"});
                })
            }
            else
                res.status(503).json({error: "Invalid user data"});
        })

        this.expressApp.post("/users/login", (req:Request, res:Response) => {
            if (this.validator.validate("userLogin", req.body)) {
                this.dataManager.validateUser(req.body.name, req.body.password)
                    .then((user: I_UserEntry) => {
                        if (user) {
                            let token = jwt.sign({id: user._id}, JWTOptions.secret, {
                                algorithm: "HS512",
                                expiresIn: "4h",
                                issuer: "DocPouch"
                            });
                            res.json({token: token, isAdmin: user.isAdmin || false});
                        } else
                            res.status(403).json({error: "Invalid user or password"});
                    })
                    .catch((reason) => {
                        res.status(500).json({error: reason});
                    })
            }
            else
                res.status(503).json({error: "Invalid user data"});
        })

        this.expressApp.patch("/users/update/:userID", this.authenticateJWT.bind(this), (req: Request, res:Response) => {
            if (this.validator.validate("userUpdate", req.body)) {
                const userID = req.params.userID;
                const checkPermission = async () => {
                    if (req.userid === userID && !("isAdmin" in req.body)) {
                        return true; // User can update their own profile
                    }

                    return await this.dataManager.isAdmin(req.userid);
                };
                checkPermission().then((isAuthorized: boolean) => {
                    if (req.userid !== userID) {
                        if (!isAuthorized)
                            return res.status(401).json({error: "Not authorized to update this user"});
                    }

                    const updateData: I_UserUpdate = {_id: req.params.userID};
                    if (req.body.name) updateData.name = req.body.name;
                    if (req.body.password) updateData.password = req.body.password;
                    if (req.body.email) updateData.email = req.body.email;
                    if (req.body.department) updateData.department = req.body.department;
                    if (req.body.group) updateData.group = req.body.group;
                    if (req.body.isAdmin !== undefined) updateData.isAdmin = req.body.isAdmin;

                    this.dataManager.updateUser(userID, updateData)
                        .then((numUpdated: number) => {
                            if (numUpdated < 1) {
                                res.status(204).json({error: "User not found"});
                            } else if (numUpdated > 1)
                                res.status(500).json({error: "Multiple users with the same ID found"});
                            else {
                                this.socketServer.sendEventToAdmins("changedUser",{changedUser: updateData})
                                res.status(200).json({message: "User has been successfully updated"});
                            }
                        })
                        .catch((error) => {
                            if (error.message.includes("not found")) {
                                res.status(204).json({error: "User not found"});
                            } else {
                                res.status(500).json({error: error.message});
                            }
                        })
                })

            } else
                res.status(503).json({error: "Invalid user data"});
        });

        this.expressApp.delete("/users/remove/:userID", this.authenticateJWT.bind(this), (req, res) => {
            this.dataManager.isAdmin(req.userid).then((isAdmin:boolean) => {
                if (!isAdmin)
                    return res.status(401).json({ error: "Not authorized to remove this user" });
                else {
                    this.dataManager.removeUser(req.params.userID).then(() => {
                        this.socketServer.sendEventToAdmins("removedUser", {removedID: req.params.userID})
                        res.status(200).json({message: "User has been successfully removed"});
                    }).catch((error) => {
                        res.status(500).json({error: error.message});
                    });
                }
            })
        })

        // Document endpoints with access control
        this.expressApp.get("/docs/list", this.authenticateJWT.bind(this), (req, res) => {
            this.dataManager.getDocuments(req.userid)
                .then((documents) => {
                    res.status(200).json(documents);
                })
                .catch((error) => {
                    res.status(500).json({error: error.message});
                });
        });

        this.expressApp.post("/docs/fetch", this.authenticateJWT.bind(this), (req, res) => {
            let queryObject = req.body;
            this.validator.validate("documentFetch", queryObject);

            this.dataManager.fetchDocuments(req.body, req.userid)
                .then((document) => {
                    res.status(200).json(document);
                })
                .catch((error) => {
                    if (error === "Document not found") {
                        res.status(404).json({error: error});
                    } else if (error === "Not authorized to access this document") {
                        res.status(403).json({error: error});
                    } else {
                        res.status(500).json({error: error.message || error});
                    }
                });
        });

        this.expressApp.post("/docs/create", this.authenticateJWT.bind(this), (req, res) => {
            if (this.validator.validate("documentCreation", req.body)) {
                this.dataManager.createDocument(req.body, req.userid)
                    .then((document) => {
                        this.socketServer.sendEventToUser(req.userid, "newDocument", {newDocument: document});
                        this.logger.info("New document created:", document);
                        res.status(200).json(document);
                    })
                    .catch((error) => {
                        res.status(500).json({error: error.message || error});
                    });
            } else {
                res.status(400).json({error: "Invalid document data"});
            }
        });

        this.expressApp.patch("/docs/update/:documentID", this.authenticateJWT.bind(this), (req, res) => {
            if (this.validator.validate("documentUpdate", req.body)) {
                this.dataManager.updateDocument(req.params.documentID, req.body, req.userid)
                    .then((numUpdated) => {
                        if (numUpdated > 0) {
                            this.socketServer.sendEventToUser(req.userid, "changedDocument", {changedDocument: req.body});
                            res.status(200).json({message: "Document updated successfully"});
                        } else {
                            res.status(404).json({error: "Document not found"});
                        }
                    })
                    .catch((error) => {
                        if (error === "Not authorized to update this document") {
                            res.status(403).json({error: error});
                        } else {
                            res.status(500).json({error: error.message || error});
                        }
                    });
            } else {
                res.status(400).json({error: "Invalid document data"});
            }
        });

        this.expressApp.delete("/docs/remove/:documentID", this.authenticateJWT.bind(this), (req, res) => {
            this.dataManager.removeDocument(req.params.documentID, req.userid)
                .then((numRemoved) => {
                    if (numRemoved > 0) {
                        res.status(200).json({message: "Document removed successfully"});
                        this.socketServer.sendEventToUser(req.userid, "removedDocument", {removedID: req.params.documentID});
                        this.logger.info("Document removed:", req.params.documentID);
                    } else {
                        res.status(404).json({error: "Document not found"});
                    }
                })
                .catch((error) => {
                    if (error === "Not authorized to remove this document") {
                        res.status(403).json({error: error});
                    } else {
                        res.status(500).json({error: error.message || error});
                    }
                });
        });

        // Structure endpoints with access control
        this.expressApp.get("/structures/list", this.authenticateJWT.bind(this), (req, res) => {
            this.dataManager.getStructures()
                .then((structures) => {
                    res.status(200).json(structures);
                })
                .catch((error) => {
                    res.status(500).json({error: error.message || error});
                });
        });

        this.expressApp.post("/structures/create", this.authenticateJWT.bind(this), (req, res) => {
            if (this.validator.validate("structureCreation", req.body)) {
                this.dataManager.createStructure(req.body, req.userid)
                    .then((structure) => {
                        this.socketServer.sendEventToAdmins("newStructure", {newStructure: structure});
                        this.logger.info("New structure created:", structure);
                        res.status(200).json(structure);
                    })
                    .catch((error) => {
                        if (error === "Only admins can create structures") {
                            res.status(403).json({error: error});
                        } else {
                            res.status(500).json({error: error.message || error});
                        }
                    });
            } else {
                res.status(400).json({error: "Invalid structure data"});
            }
        });

        this.expressApp.patch("/structures/update/:structureID", this.authenticateJWT.bind(this), (req, res) => {
            if (this.validator.validate("structureUpdate", req.body)) {
                const structureID = parseInt(req.params.structureID);
                this.dataManager.updateStructure(structureID, req.body, req.userid)
                    .then((numUpdated) => {
                        if (numUpdated > 0) {
                            res.status(200).json({message: "Structure updated successfully"});
                            this.socketServer.sendEventToAdmins("changedStructure", {changedStructure: req.body});
                            this.logger.info("Structure updated:", req.body);
                        } else {
                            res.status(404).json({error: "Structure not found"});
                        }
                    })
                    .catch((error) => {
                        if (error === "Only admins can update structures") {
                            res.status(403).json({error: error});
                        } else {
                            res.status(500).json({error: error.message || error});
                        }
                    });
            } else {
                res.status(400).json({error: "Invalid structure data"});
            }
        });

        this.expressApp.delete("/structures/remove/:structureID", this.authenticateJWT.bind(this), (req, res) => {
            const structureID = req.params.structureID;
            this.dataManager.removeStructure(structureID, req.userid)
                .then((numRemoved) => {
                    if (numRemoved > 0) {
                        res.status(200).json({message: "Structure removed successfully"});
                        this.socketServer.sendEventToUser(req.userid, "removedStructure", {removedID: structureID})
                        this.logger.info("Structure removed:", structureID);
                    } else {
                        res.status(404).json({error: "Structure not found"});
                    }
                })
                .catch((error) => {
                    if (error === "Only admins can remove structures") {
                        res.status(403).json({error: error});
                    } else {
                        res.status(500).json({error: error.message || error});
                    }
                });
        });
    }

    private authenticateJWT(req: Request, res: Response, next: NextFunction) {
        const authHeader = req.headers['authorization']
        const token = authHeader && authHeader.split(' ')[1]
        if (token == null) {
            res.sendStatus(401);
            return;
        }

        jwt.verify(token, JWTOptions.secret, (err: any, payload: any) => {
            if (err) return res.sendStatus(403);
            req.userid = payload.id;
            next();
        });
    }
}