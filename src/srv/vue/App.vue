<script setup lang="ts">
import UserPad from "./components/UserPad.vue";
import DocumentDisplay from "./components/DocumentDisplay.vue";
import LoginDialog from "./components/LoginDialog.vue";
import {ref, onMounted, computed, watch} from "vue";
import DbPouchClient from "docpouch-client";
import type {
  I_DocumentEntry,
  I_UserEntry,
  I_DataStructure,
  I_LoginResponse,
  I_DocumentType
} from "../../types.ts";
import UserDisplay from "./components/UserDisplay.vue";
import StructurePad from "./components/StructurePad.vue";
import DocumentPad from "./components/DocumentPad.vue";
import StructureDisplay from "./components/StructureDisplay.vue";
import docPouchLogo from './assets/docPouch.png';
import AboutDialog from "./components/AboutDialog.vue";
import type {I_EventString} from "../../../../docpouch-client/dist/types";
import TypePad from "./components/TypePad.vue";

const serverPort = 3030;
enum DisplayComponent {
  documentViewer,
  userViewer,
  structureViewer
}

const authToken = ref<string | null>(null);
const expandedPanel = ref('documents'); // Default to users panel being open
const userArray = ref(<I_UserEntry[]>[]);
const docArray = ref(<I_DocumentEntry[]>[]);
const structureArray = ref(<I_DataStructure[]>[]);
const typeArray = ref(<I_DocumentType[]>[]);
let shownComponent = ref(DisplayComponent.documentViewer);
const apiClient = new DbPouchClient(window.location.href.slice(0, window.location.href.lastIndexOf('/')), serverPort, handleNetworkEvent);
const isLoggedIn = computed(() => authToken.value !== null);
const showLoginDialog = ref(true)
const showAboutDialog = ref(false)
const realtimeUpdates = ref(false);
let loadedDocument = ref<I_DocumentEntry | undefined>(undefined);
let loadedUser = ref<I_UserEntry | undefined>(undefined);
let loadedStructure = ref<I_DataStructure | undefined>(undefined);
const isAdmin = computed(() => {
  if (authToken.value === null) {
    return false;
  }
  return localStorage.getItem('isAdmin') === 'true';
})

function setToken(token: string | null) {
  console.log("Setting token:", token ? "token present" : "null");
  authToken.value = token;
  apiClient.setToken(token);
  if (token)
    localStorage.setItem('authToken', token);
  else
    localStorage.removeItem('authToken');
}

watch(authToken, (newToken, oldToken) => {
  if (newToken !== null && realtimeUpdates.value === true) {
    fetchData();
    apiClient.setRealTimeSync(true);
    console.log("Activating realtime updates.")
  } else {
    apiClient.setRealTimeSync(false);
    console.log("De-activating realtime updates.")
  }
})

watch(realtimeUpdates, (newVal, oldVal) => {
  if (newVal && authToken.value !== null) {
    fetchData();
    apiClient.setRealTimeSync(true);
    console.log("Activating realtime updates.")
  } else {
    apiClient.setRealTimeSync(false);
    console.log("De-activating realtime updates.")
  }
})


function handleNetworkEvent(event: I_EventString, data: any) {
  switch (event) {
    case "newUser":
    case "changedUser":
    case "removedUser":
      apiClient.listUsers().then(users => {
        userArray.value = users;
      })
      break;

    case "newStructure":
    case "changedStructure":
    case "removedStructure":
      apiClient.getStructures().then(structures => {
        structureArray.value = structures;
      })
      break;

    case "newDocument":
    case "removedDocument":
      apiClient.listDocuments().then(documents => {
        docArray.value = documents;
      })
      break;

    case "changedDocument":
      break;

  }
}

async function handleUserSelected(userID: string) {
  console.log("User selected:", userID);
  shownComponent.value = DisplayComponent.userViewer;
  console.log("Changed shown component to:", shownComponent.value, "DisplayComponent.userViewer =", DisplayComponent.userViewer);
  loadedUser.value = userArray.value.find(user => user._id === userID);
  console.log("Loaded user:", loadedUser.value);
}

async function handleStructureSelected(structureID: string) {
  console.log("Structure selected:", structureID);
  shownComponent.value = DisplayComponent.structureViewer;

  loadedStructure.value = structureArray.value.find(structure => structure._id?.toString() === structureID);
  console.log("Loaded structure:", loadedStructure.value);
}

async function handleDocumentRemoved(documentID: string) {
  apiClient.removeDocument(documentID)
      .then(() => {
        if (loadedDocument.value && loadedDocument.value._id === documentID) {
          loadedDocument.value = undefined;
        }
        fetchData();
      })
      .catch(error => {
        console.error("Error removing document:", error);
        handleApiError(error, "removing document");
      });
}

async function handleDocumentSelected(documentID: string) {
  shownComponent.value = DisplayComponent.documentViewer;
  loadedDocument.value = docArray.value.find((document: I_DocumentEntry) => document._id === documentID)
}

async function handleStructureRemoved(structureID: string) {
  apiClient.removeStructure(structureID)
      .then(() => {
        if (loadedStructure.value && loadedStructure.value._id?.toString() === structureID) {
          loadedStructure.value = undefined;
          shownComponent.value = DisplayComponent.documentViewer;
        }
        fetchData();
      })
      .catch(error => {
        console.error("Error removing structure:", error);
        handleApiError(error, "removing structure");
      });
}

async function fetchData() {
  if (authToken.value === null) {
    console.log("Token is null, not fetching data.")
    showLoginDialog.value = true;
    return
  }
  showLoginDialog.value = false;

  // Fetch users
  try {
    userArray.value = await apiClient.listUsers();
  } catch (error) {
    handleApiError(error, "fetching users");
  }

  // Fetch document list
  console.debug("Fetching documents");
  try {
    console.log("Listing documents")
    docArray.value = await apiClient.listDocuments();
  } catch (error) {
    handleApiError(error, "fetching documents");
    docArray.value = [];
  }

  // Fetch structures
  console.debug("Fetching structures");
  try {
    structureArray.value = await apiClient.getStructures();
  } catch (error) {
    handleApiError(error, "fetching structures");
    structureArray.value = [];
  }

  // Fetch Types
  console.debug("Fetching types");
  try {
    typeArray.value = await apiClient.getTypes();
  } catch (error) {
    handleApiError(error, "fetching types");
    typeArray.value = [];
  }
}

function handleLoginSuccess(loginInformation: I_LoginResponse | null) {
  if (loginInformation !== null) {
    console.log("Login success, setting token");
    setToken(loginInformation.token);
    if (loginInformation.isAdmin !== undefined) {
      localStorage.setItem('isAdmin', String(loginInformation.isAdmin));
    }
    fetchData();
  } else {
    console.log("Login failed, token not set");
    setToken(null);
  }
}

onMounted(async () => {
  const storedToken = localStorage.getItem('authToken');
  const storedIsAdmin = localStorage.getItem('isAdmin');

  if (storedToken) {
    console.log("Found token in local storage. Setting it.");
    setToken(storedToken);
    if (storedIsAdmin !== null) {
      isAdmin.value = storedIsAdmin === 'true';
    }

    await fetchData();
  }
});

function handleDialogUpdate(isUnknown: boolean) {
  showLoginDialog.value = isUnknown;
  if (isUnknown) {
    // Clean all data from client
    userArray.value = [];
    docArray.value = [];
    structureArray.value = [];
    loadedDocument.value = undefined;
    loadedUser.value = undefined;
    loadedStructure.value = undefined;
  }
}

function handleUserUpdate(userID: string, field: string, value: any) {
  // Added safety checks
  if (userID === undefined || field === undefined) {
    console.error('Invalid parameters for user update:', {userID, field, value});
    return;
  }

  apiClient.updateUser(userID, {[field]: value})
      .then((response) => {
        console.log("User updated successfully, response:", response);
        fetchData().then(() => {
          handleUserSelected(userID);
        });
      })
      .catch(error => {
        console.error("Error updating user:", error);
        handleApiError(error, "updating user");

        if (loadedUser.value && loadedUser.value._id === userID) {
          const originalUser = userArray.value.find(u => u._id === userID);
          if (originalUser) {
            loadedUser.value = {...originalUser};
          }
        }

      });
}

function handleUserRemoved(userID: string) {
  apiClient.removeUser(userID)
      .then(() => {
        if (loadedUser.value && loadedUser.value._id === userID) {
          loadedUser.value = undefined;
          shownComponent.value = DisplayComponent.documentViewer;
        }
        fetchData();
      })
      .catch(error => {
        console.error("Error removing user:", error);
        handleApiError(error, "removing user");
      });
}

function handleLogout() {
  setToken(null);
  isAdmin.value = false;
  localStorage.removeItem('isAdmin');
  userArray.value = [];
  docArray.value = [];
  structureArray.value = [];
  loadedDocument.value = undefined;
  loadedUser.value = undefined;
  loadedStructure.value = undefined;
  shownComponent.value = DisplayComponent.documentViewer;
  showLoginDialog.value = true;
}

function handleApiError(error: unknown, context: string = "API operation") {
  console.error(`Error during ${context}:`, error);

  if (error instanceof Error) {
    if (error.message.includes('401') || error.message.includes('Unauthorized') ||
        error.message.includes('403') || error.message.includes('Forbidden')) {
      setToken(null);
      showLoginDialog.value = true;
    } else if (error.message.includes('204')) {
      if (context.includes("specific document")) {
        console.info("The requested document was not found.");
      } else {
        console.warn(`Endpoint not found during ${context}. This API feature might not be implemented yet.`);
      }
    }
  }
}
</script>

<template>
  <v-app>
    <v-main>
      <v-app-bar color="primary" dark>
        <v-img
            :src="docPouchLogo"
            max-height="40"
            max-width="40"
            contain
            class="mr-2 ml-3"
            @click="showAboutDialog = true"
        ></v-img>

        <v-app-bar-title>DocPouch Administration</v-app-bar-title>
        <v-spacer></v-spacer>
        <div v-if="isLoggedIn" class="d-flex align-center mr-4">
          <v-switch
              v-model="realtimeUpdates"
              color="white"
              hide-details
              density="compact"
              class="mt-0 pt-0"
          >
            <template v-slot:label>
              <span class="text-white">Realtime Updates</span>
            </template>
          </v-switch>
        </div>

        <v-btn v-if="isLoggedIn" @click="handleLogout" variant="text" color="white">
          <v-icon start>mdi-logout</v-icon>
          Logout
        </v-btn>
      </v-app-bar>
      <v-alert v-if="isLoggedIn" type="info" variant="tonal" closable class="ma-4">
        <strong>Welcome to DocPouch Administration</strong> — an open-source document management system that allows you
        to organize, edit, and share structured data. This panel lets you manage users, data structures, and documents.
      </v-alert>

      <v-container class="h-100 px-4">
        <v-row class="mx-0">
          <v-col cols="6">
            <v-expansion-panels v-model="expandedPanel">
              <v-expansion-panel value="users">
                <v-expansion-panel-title>
                  <v-icon start>mdi-account-group</v-icon>
                  Users
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <UserPad
                      @user-selected="handleUserSelected"
                      :userlist="userArray"
                      :api-client="apiClient"
                      @user-list-changed="fetchData"
                      @user-removed="handleUserRemoved"
                      :department-list="userArray.map(user => user.department)"
                      :group-list="userArray.map(user => user.group)"
                      :is-admin="isAdmin"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>

              <v-expansion-panel value="types">
                <v-expansion-panel-title>
                  <v-icon start>mdi-account-group</v-icon>
                  Document Types
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <TypePad :type-list="typeArray"
                           :structure-list="structureArray"
                           :api-client="apiClient"
                           :is-admin="isAdmin"
                           @type-list-changed="fetchData"/>
                </v-expansion-panel-text>
              </v-expansion-panel>

              <v-expansion-panel value="structures">
                <v-expansion-panel-title>
                  <v-icon start>mdi-table</v-icon>
                  Data Structures
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <StructurePad
                      @structure-selected="handleStructureSelected"
                      :structurelist="structureArray"
                      :api-client="apiClient"
                      :is-admin="isAdmin"
                      @structure-list-changed="fetchData"
                      @structure-removed="handleStructureRemoved"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>

              <v-expansion-panel value="documents">
                <v-expansion-panel-title>
                  <v-icon start>mdi-file-document-multiple</v-icon>
                  Documents
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <DocumentPad
                      @document-selected="handleDocumentSelected"
                      :userlist="userArray"
                      :documentList="docArray"
                      :api-client="apiClient"
                      @document-list-changed="fetchData"
                      @document-removed="handleDocumentRemoved"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </v-col>

          <v-col cols="6">
            <DocumentDisplay
                id="2"
                :object="loadedDocument"
                v-show="shownComponent === DisplayComponent.documentViewer"
            />
            <UserDisplay
                :user="loadedUser"
                :department-list="[...new Set(userArray.map(user => user.department))]"
                :group-list="[...new Set(userArray.map(user => user.group))]"
                @user-updated="handleUserUpdate"
                v-if="shownComponent === DisplayComponent.userViewer"
            />
            <StructureDisplay
                :displayStructure="loadedStructure"
                :structure-list="structureArray"
                :is-admin="isAdmin"
                v-if="shownComponent === DisplayComponent.structureViewer"
            />
          </v-col>
        </v-row>
      </v-container>
      <v-footer app class="bg-grey-lighten-3 px-4">
        <div class="text-center w-100">
          <div class="text-caption text-grey">
            DocPouch is provided under the MIT License. This software is provided "as is", without warranty of any kind.
            <v-btn
                variant="text"
                density="compact"
                color="primary"
                href="https://opensource.org/licenses/MIT"
                target="_blank"
            >
              View License
            </v-btn>
          </div>
        </div>
      </v-footer>
      <LoginDialog v-if="!authToken" v-model:show="showLoginDialog"
                   :api-client="apiClient" @login-success="handleLoginSuccess"
                   @update:show="handleDialogUpdate"/>
      <AboutDialog :show="showAboutDialog" @close="showAboutDialog = false"/>
    </v-main>
  </v-app>
</template>