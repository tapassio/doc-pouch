// JavaScript
// Minimal runtime mock for `docpouch-client` used in server tests.
// Keep methods that tests or server code may call at runtime.
// Keep this file CommonJS to avoid ESM parsing problems.

class DbPouchClient {
    constructor(/* baseUrl, port, networkHandler */) {
        // no-op
    }

    // runtime methods that server-side code or other modules might call in tests
    setToken(/* token */) {
        // no-op
    }

    setRealTimeSync(/* enabled */) {
        // no-op
    }

    // example API methods used in client code - return resolved promises to keep tests working
    async listUsers() {
        return [];
    }

    async listDocuments() {
        return [];
    }

    async getStructures() {
        return [];
    }

    async getTypes() {
        return [];
    }

    async updateDocument(/* id, doc */) {
        return {};
    }

    async removeDocument(/* id */) {
        return {};
    }

    async createDocument(/* doc */) {
        return {};
    }

    async updateUser(/* id, data */) {
        return {};
    }

    async removeUser(/* id */) {
        return {};
    }

    async updateType(/* type */) {
        return {};
    }

    async removeStructure(/* id */) {
        return {};
    }

    // add more no-op methods as needed by your code under test
}

// Export the default class and named exports for types (runtime doesn't need them, but exporting placeholders avoids import errors)
module.exports = {
    __esModule: true,
    default: DbPouchClient,
    // Minimal value placeholders for any named imports used at runtime (tests import types only normally)
    I_UserCreation: {},
    I_UserUpdate: {},
    I_DocumentType: {},
    I_UserEntry: {},
    I_DocumentEntry: {},
    I_DataStructure: {},
    I_LoginResponse: {},
    I_EventString: {},
};